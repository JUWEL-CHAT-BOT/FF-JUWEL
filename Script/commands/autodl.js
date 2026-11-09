const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { execFile } = require("child_process");

module.exports = {
  config: {
    name: "autodl",
    version: "4.1.0",
    hasPermssion: 0,
    credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
    description: "Auto Video/MP3 Downloader (multi-link)",
    commandCategory: "media",
    usages: "link দিন | link + mp3 লিখলে অডিও",
    cooldowns: 5
  },

  run: async function () {},

  handleEvent: async function ({ api, event }) {
    const { threadID, messageID, senderID, body } = event;
    if (!body || !body.startsWith("https://")) return;

    //━━━━━━━━━━ SETTINGS ━━━━━━━━━━//
    const COOLDOWN_TIME = 5 * 60 * 1000;
    const MAX_LINKS = 3;                 // এক মেসেজে সর্বোচ্চ কয়টা লিংক
    const MAX_SIZE_MB = 25;              // Messenger লিমিট

    //━━━━━━━━━━ HELPERS ━━━━━━━━━━//
    const react = (emoji) => api.setMessageReaction(emoji, messageID, () => {}, true);
    const send = (msg, reply = true) =>
      new Promise((resolve) =>
        api.sendMessage(msg, threadID, (err, info) => resolve(info), reply ? messageID : undefined)
      );

    const detectPlatform = (url) => {
      if (/facebook\.com|fb\.watch|fb\.me/.test(url)) return "Facebook";
      if (/tiktok\.com/.test(url)) return "TikTok";
      if (/youtube\.com|youtu\.be/.test(url)) return "YouTube";
      if (/instagram\.com/.test(url)) return "Instagram";
      if (/likee\.video/.test(url)) return "Likee";
      if (/pinterest\.com|pin\.it/.test(url)) return "Pinterest";
      if (/twitter\.com|x\.com/.test(url)) return "Twitter";
      if (/capcut\.com/.test(url)) return "CapCut";
      return null;
    };

    const cleanTitle = (t) =>
      String(t || "").replace(/\s+/g, " ").trim().slice(0, 60);

    //━━━━━━━━━━ STATS HELPERS ━━━━━━━━━━//
    // "1.2K", "3,400", 5000, "5000" সব সংখ্যায় রূপান্তর
    const parseNum = (v) => {
      if (v === undefined || v === null || v === "" || typeof v === "object") return null;
      if (typeof v === "number") return isFinite(v) ? v : null;
      const s = String(v).trim().replace(/,/g, "").toUpperCase();
      const m = s.match(/^([\d.]+)\s*([KMB])?$/);
      if (!m) return null;
      const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1;
      const n = Math.round(parseFloat(m[1]) * mult);
      return isFinite(n) ? n : null;
    };

    // যেকোনো নেস্টেড জায়গা থেকে key খুঁজে বের করে
    const deepPick = (obj, keys, depth = 0) => {
      if (!obj || typeof obj !== "object" || depth > 5) return null;
      const lower = keys.map((k) => k.toLowerCase());
      for (const k of Object.keys(obj)) {
        if (lower.includes(k.toLowerCase())) {
          const n = parseNum(obj[k]);
          if (n !== null) return n;
        }
      }
      for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k] === "object") {
          const n = deepPick(obj[k], keys, depth + 1);
          if (n !== null) return n;
        }
      }
      return null;
    };

    const KEYS = {
      views: ["views", "view", "view_count", "viewCount", "play_count", "playCount", "plays", "video_view_count"],
      likes: ["likes", "like", "like_count", "likeCount", "digg_count", "diggCount", "favorite_count"],
      comments: ["comments", "comment", "comment_count", "commentCount", "reply_count"],
      shares: ["shares", "share", "share_count", "shareCount", "forward_count"]
    };

    const extractStats = (data) => ({
      views: deepPick(data, KEYS.views),
      likes: deepPick(data, KEYS.likes),
      comments: deepPick(data, KEYS.comments),
      shares: deepPick(data, KEYS.shares)
    });

    const STAT_KEYS = ["views", "likes", "comments", "shares"];

    const mergeStats = (base, extra) => {
      const out = { ...base };
      for (const k of STAT_KEYS) {
        if (out[k] === null || out[k] === undefined) out[k] = extra ? extra[k] : null;
      }
      return out;
    };

    const statsComplete = (s) =>
      STAT_KEYS.every((k) => s[k] !== null && s[k] !== undefined);

    //━━━━━━━━━━ FETCH INFO ━━━━━━━━━━//
    const fetchInfo = async (link, platform) => {
      const apis = [
        `https://api.samirthakuri10.workers.dev/alldl?url=${encodeURIComponent(link)}`,
        `https://nayan-video-downloader.vercel.app/alldown?url=${encodeURIComponent(link)}`,
        `https://api.azadx69x.workers.dev/alldl?url=${encodeURIComponent(link)}`
      ];

      let result = null;
      let stats = { views: null, likes: null, comments: null, shares: null };

      // TikTok হলে আগে tikwm (এখানে সব স্ট্যাটস পাওয়া যায়)
      if (platform === "TikTok") {
        try {
          const { data } = await axios.get(
            `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`,
            { timeout: 15000 }
          );
          if (data && data.data) {
            const d = data.data;
            stats = mergeStats(stats, {
              views: parseNum(d.play_count),
              likes: parseNum(d.digg_count),
              comments: parseNum(d.comment_count),
              shares: parseNum(d.share_count)
            });
            const v = d.hdplay || d.play;
            if (v) {
              result = {
                videoUrl: String(v).startsWith("http") ? v : "https://www.tikwm.com" + v,
                audioUrl: d.music || null,
                title: cleanTitle(d.title || "TikTok Video")
              };
            }
          }
        } catch (err) {
          console.log("[autodl] tikwm failed:", err.message);
        }
      }

      for (const apiUrl of apis) {
        // ভিডিও + সব স্ট্যাটস পেয়ে গেলে আর দরকার নেই
        if (result && statsComplete(stats)) break;
        try {
          const { data } = await axios.get(apiUrl, { timeout: 15000 });
          if (!data) continue;
          const d = data.data || {};

          stats = mergeStats(stats, extractStats(data));

          if (!result) {
            const videoUrl =
              data.url || data.video_url || data.download_url ||
              d.url || d.high || d.video || d.hd ||
              (data.links && (data.links.hd || data.links.sd)) ||
              data.high || data.hd || data.video || null;

            const audioUrl =
              data.audio || data.audio_url || data.music ||
              d.audio || d.music || d.audio_url || null;

            if (videoUrl || audioUrl) {
              const title = data.title || data.caption || data.desc || d.title || `${platform} Video`;
              result = { videoUrl, audioUrl, title: cleanTitle(title) };
            }
          }
        } catch (err) {
          console.log("[autodl] API failed:", err.message);
        }
      }

      if (!result) return null;
      return { ...result, stats };
    };

    const downloadFile = async (url, dest) => {
      const res = await axios({
        url,
        method: "GET",
        responseType: "stream",
        timeout: 60000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*"
        }
      });

      const len = Number(res.headers["content-length"] || 0);
      if (len && len > MAX_SIZE_MB * 1024 * 1024) {
        res.data.destroy();
        throw new Error(`SIZE_LIMIT:${(len / 1024 / 1024).toFixed(1)}`);
      }

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(dest);
        res.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
        res.data.on("error", reject);
      });

      const size = fs.statSync(dest).size;
      if (size < 1000) throw new Error("Downloaded file is too small or corrupted");
      if (size > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(`SIZE_LIMIT:${(size / 1024 / 1024).toFixed(1)}`);
      }
      return size;
    };

    // ভিডিও থেকে MP3 বের করা (সার্ভারে ffmpeg থাকলে)
    const extractAudio = (videoPath, audioPath) =>
      new Promise((resolve, reject) => {
        execFile(
          "ffmpeg",
          ["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", audioPath],
          { timeout: 60000 },
          (err) => (err ? reject(new Error("NO_FFMPEG")) : resolve())
        );
      });

    const safeDelete = (...files) =>
      setTimeout(() => {
        for (const f of files) {
          try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
        }
      }, 5000);

    //━━━━━━━━━ UI ━━━━━━━━━//
    const ui = {
      success: ({ platform, title, user, time, size, audio, index, total, stats }) => {
        const fmt = (n) =>
          n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
        const has = (v) => v !== undefined && v !== null;
        const lines = [
          `┃ 🌐 Platform  ➜  ${platform}${total > 1 ? `  ( ${index}/${total} )` : ""}`,
          `┃ 🎞️ Type  ➜  ${audio ? "MP3 Audio" : "Video"}`,
          `┃ 📝 Title  ➜  ${title}`,
          `┃ 👤 User  ➜  ${user}`
        ];
        if (stats) {
          lines.push(`┣━━━━━━━━━━━━━━━━━┫`);
          const show = (v) => (has(v) ? fmt(v) : "N/A");
          lines.push(`┃ 👁️ Views  ➜  ${show(stats.views)}`);
          lines.push(`┃ ❤️ Likes  ➜  ${show(stats.likes)}`);
          lines.push(`┃ 💬 Comments  ➜  ${show(stats.comments)}`);
          lines.push(`┃ 🔁 Shares  ➜  ${show(stats.shares)}`);
        }
        lines.push(`┣━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ ⚡ Speed  ➜  ${time} sec`);
        lines.push(`┃ 📦 Size  ➜  ${size}`);
        return (
          `┏━━AUTO DOWNLOADER━━┓\n` +
          lines.join("\n") +
          `\n┗━━━━━━━━━━━━━━━━┛\n` +
          `   乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐`
        );
      },
      cooldown: (user, m, s) =>
        `┏━━━━━ ⏰ COOLDOWN ⏰ ━━━━━┓\n` +
        `┃ 👤 ${user}\n` +
        `┃ ⌛ বাকি: ${m} মিনিট ${s} সেকেন্ড\n` +
        `┗━━━━━━━━━━━━━━━━━━┛\n` +
        `   🙏 একটু অপেক্ষা করো`,
      fail: (reason) =>
        `┏━━━━━ ❌ ERROR ❌ ━━━━━┓\n` +
        `┃ ${reason}\n` +
        `┗━━━━━━━━━━━━━━━━━━┛\n` +
        `   🔁 আবার চেষ্টা করো`,
      unsupported:
        `┏━━━━ ⚠️ UNSUPPORTED ⚠️ ━━━━┓\n` +
        `┃ Facebook • TikTok • YouTube\n` +
        `┃ Instagram • Likee • Pinterest\n` +
        `┃ Twitter • CapCut\n` +
        `┗━━━━━━━━━━━━━━━━━━┛`
    };

    //━━━━━━━━━━ PARSE LINKS ━━━━━━━━━━//
    const allLinks = [...new Set(body.match(/https?:\/\/[^\s]+/g) || [])];
    const links = allLinks.filter((l) => detectPlatform(l)).slice(0, MAX_LINKS);
    if (!links.length) return; // সাপোর্টেড লিংক না থাকলে চুপ (স্প্যাম/কুলডাউন নয়)

    const wantAudio = /\b(mp3|audio|music|গান)\b/i.test(body.replace(/https?:\/\/[^\s]+/g, ""));

    //━━━━━━━━━━ USER + DB ━━━━━━━━━━//
    const userName = (global.data.userName && global.data.userName.get(senderID)) || "Unknown User";
    const mention = [{ tag: userName, id: senderID }];

    const adminIDs = Array.isArray(global.config.ADMINBOT)
      ? global.config.ADMINBOT.map(String)
      : [];
    const isAdmin = adminIDs.includes(String(senderID));

    const cacheDir = path.join(__dirname, "cache");
    fs.ensureDirSync(cacheDir);

    const dbPath = path.join(cacheDir, "autodl-count.json");
    let db = { total: 0, users: {} };
    try {
      if (fs.existsSync(dbPath)) db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    } catch (e) {
      db = { total: 0, users: {} };
    }
    if (!db.users[senderID]) {
      db.users[senderID] = {
        name: userName,
        totalDownload: 0,
        totalTime: 0,
        lastDownload: null,
        cooldownUntil: 0
      };
    }

    //━━━━━━━━━━ COOLDOWN ━━━━━━━━━━//
    if (!isAdmin) {
      const now = Date.now();
      const until = db.users[senderID].cooldownUntil || 0;
      if (now < until) {
        const remaining = until - now;
        react("⏰");
        return send(
          ui.cooldown(userName, Math.floor(remaining / 60000), Math.floor((remaining % 60000) / 1000))
        );
      }
    }

    //━━━━━━━━━━ PROCESS ━━━━━━━━━━//
    react("⏳");
    let successCount = 0;
    let totalTimeSum = 0;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const platform = detectPlatform(link);
      const startTime = Date.now();
      const stamp = `${senderID}_${Date.now()}_${i}`;
      const videoPath = path.join(cacheDir, `autodl_${stamp}.mp4`);
      const audioPath = path.join(cacheDir, `autodl_${stamp}.mp3`);

      try {
        const info = await fetchInfo(link, platform);
        if (!info) {
          await send(ui.fail(`${platform} ভিডিও ডাউনলোড করা যায়নি`));
          continue;
        }

        let sendPath;
        let size;
        let isAudio = false;

        if (wantAudio) {
          if (info.audioUrl) {
            size = await downloadFile(info.audioUrl, audioPath);
            sendPath = audioPath;
            isAudio = true;
          } else if (info.videoUrl) {
            await downloadFile(info.videoUrl, videoPath);
            try {
              await extractAudio(videoPath, audioPath);
              size = fs.statSync(audioPath).size;
              sendPath = audioPath;
              isAudio = true;
            } catch (e) {
              // ffmpeg নেই → ভিডিও পাঠানো হবে
              await send("ℹ️ MP3 বানানো যায়নি, ভিডিও পাঠাচ্ছি…");
              size = fs.statSync(videoPath).size;
              sendPath = videoPath;
            }
          }
          if (!sendPath) {
            await send(ui.fail("অডিও/ভিডিও লিংক পাওয়া যায়নি"));
            continue;
          }
        } else {
          if (!info.videoUrl) {
            await send(ui.fail("ভিডিও লিংক পাওয়া যায়নি"));
            continue;
          }
          size = await downloadFile(info.videoUrl, videoPath);
          sendPath = videoPath;
        }

        const time = ((Date.now() - startTime) / 1000).toFixed(1);
        totalTimeSum += Number(time);

        await send({
          body: ui.success({
            platform,
            title: info.title || `${platform} Video`,
            user: userName,
            time,
            size: (size / 1024 / 1024).toFixed(2) + " MB",
            audio: isAudio,
            stats: info.stats,
            index: i + 1,
            total: links.length
          }),
          mentions: mention,
          attachment: fs.createReadStream(sendPath)
        });

        successCount++;
      } catch (e) {
        console.log("[autodl] Error:", e);
        let msg = e.message || "Unknown error";
        if (msg.startsWith("SIZE_LIMIT:")) {
          msg = `ফাইল অনেক বড় (${msg.split(":")[1]} MB)। সর্বোচ্চ ${MAX_SIZE_MB} MB`;
        } else if (/timeout|ETIMEDOUT/.test(msg)) {
          msg = "টাইমআউট! ভিডিও বড় বা সার্ভার স্লো";
        } else if (/ENOTFOUND|ECONNREFUSED/.test(msg)) {
          msg = "সার্ভারে কানেক্ট হচ্ছে না";
        }
        await send(ui.fail(msg));
      } finally {
        safeDelete(videoPath, audioPath);
      }
    }

    //━━━━━━━━━━ UPDATE DB ━━━━━━━━━━//
    if (successCount > 0) {
      db.total += successCount;
      db.users[senderID].name = userName;
      db.users[senderID].totalDownload += successCount;
      db.users[senderID].totalTime += totalTimeSum;
      db.users[senderID].lastDownload = new Date().toLocaleString("en-BD", { timeZone: "Asia/Dhaka" });
      if (!isAdmin) db.users[senderID].cooldownUntil = Date.now() + COOLDOWN_TIME;
      try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      } catch (e) {
        console.log("[autodl] DB write error:", e.message);
      }
      react("✅");
    } else {
      react("❌");
    }
  }
};
