const axios = require("axios");
const fs = require("fs");
const path = require("path");

/* ───────────── সেটিংস ───────────── */
const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
const CREDIT_HASH =
  "8f74924e81a157abaf089d90717e48a4949617a7379d20a2df567cb0ab0dad81";
const creditOK = () => {
  try {
    const h = c =>
      require("crypto").createHash("sha256").update(String(c), "utf8").digest("hex");
    return h(CREDIT) === CREDIT_HASH && h(module.exports.config.credits) === CREDIT_HASH;
  } catch (e) {
    return false;
  }
};
const CREDIT_MSG = "⛔ ক্রেডিট পরিবর্তন করা হয়েছে, তাই এই কমান্ড বন্ধ।\nআসল ক্রেডিট ফিরিয়ে দিন।";

const DL_API = "https://eryxenx.agi.bd/api/song"; // ?url=<youtube link>
const API_TIMEOUT = 90 * 1000;
const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 60 * 1000;

const usage = new Map();
function checkRate(uid) {
  const now = Date.now();
  const list = (usage.get(uid) || []).filter(t => now - t < RATE_WINDOW);
  usage.set(uid, list);
  if (list.length >= RATE_LIMIT)
    return { ok: false, wait: RATE_WINDOW - (now - list[0]) };
  list.push(now);
  return { ok: true, stamp: now };
}
function refundRate(uid, stamp) {
  const list = usage.get(uid) || [];
  const i = list.indexOf(stamp);
  if (i !== -1) list.splice(i, 1);
}

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

module.exports.config = {
  name: "sing",
  aliases: ["sing"],
  version: "4.0.0",
  credits: CREDIT,
  countDown: 0,
  hasPermssion: 0,
  description: "YouTube থেকে গান সার্চ করে সরাসরি দেয়",
  category: "media",
  commandCategory: "media",
  usePrefix: true,
  usages: "{pn} গানের নাম"
};

/* ───────────── হেল্পার ───────────── */
const safeUnsend = (api, id) => {
  if (!id) return;
  try {
    const p = api.unsendMessage(id);
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
};
const cleanup = files =>
  setTimeout(() => {
    files.forEach(f => {
      try {
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {}
    });
  }, 15000);

function formatLeft(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} ঘন্টা ${m} মিনিট`;
  return m > 0 ? `${m} মিনিট ${sec} সেকেন্ড` : `${sec} সেকেন্ড`;
}

/* ───────────── সার্চ (npm i yt-search) ───────────── */
async function searchSong(query) {
  let yts;
  try {
    yts = require("yt-search");
  } catch (e) {
    throw new Error("yt-search প্যাকেজ নেই। টার্মিনালে চালান: npm i yt-search");
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await yts(query);
      const video = (r.videos || [])[0];
      if (video) return video;
      throw new Error("কোনো গান পাওয়া যায়নি");
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr || new Error("সার্চ ব্যর্থ");
}

/* ───────────── API রেসপন্স থেকে লিংক বের করা ───────────── */
const LINK_KEYS = [
  "download_url", "downloadUrl", "download", "file_url", "fileUrl",
  "audio_url", "audioUrl", "audio", "mp3", "link", "url"
];
function pickLink(obj, ytUrl, depth = 0) {
  if (!obj || depth > 4) return null;
  if (typeof obj === "string")
    return /^https?:\/\//.test(obj) && obj !== ytUrl ? obj : null;
  if (typeof obj !== "object") return null;
  for (const k of LINK_KEYS) {
    const v = obj[k];
    if (typeof v === "string" && /^https?:\/\//.test(v) && v !== ytUrl) return v;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = pickLink(v, ytUrl, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function fetchSong(song) {
  const ytUrl =
    song.url ||
    (song.videoId ? `https://www.youtube.com/watch?v=${song.videoId}` : null);
  if (!ytUrl) throw new Error("গানের লিংক পাওয়া যায়নি");

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await axios.get(DL_API, {
        params: { url: ytUrl },
        responseType: "arraybuffer",
        timeout: API_TIMEOUT,
        validateStatus: () => true
      });
      const type = String(res.headers["content-type"] || "").toLowerCase();
      const buf = Buffer.from(res.data);

      if (/audio|octet-stream/.test(type) && buf.length > 10000)
        return { buffer: buf, title: song.title };

      let json = null;
      try {
        json = JSON.parse(buf.toString("utf8"));
      } catch (e) {}

      if (!json) throw new Error(`API থেকে বোধগম্য উত্তর আসেনি (HTTP ${res.status})`);
      if (json.success === false || json.error)
        throw new Error(typeof json.error === "string" ? json.error : "API এরর দিয়েছে");

      const link = pickLink(json, ytUrl);
      if (!link) throw new Error("API রেসপন্সে ডাউনলোড লিংক পাওয়া যায়নি");
      return { link, title: json.title || json.data?.title || song.title };
    } catch (e) {
      lastErr = e;
      console.log(`[sing] API চেষ্টা ${attempt} ব্যর্থ: ${e.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr || new Error("ডাউনলোড ব্যর্থ");
}

async function saveToFile(url, file, timeout = 120000) {
  const res = await axios.get(url, { responseType: "stream", timeout });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(file);
    const timer = setTimeout(() => {
      res.data.destroy();
      w.destroy();
      reject(new Error("ফাইল ডাউনলোডে অনেক সময় লাগছে"));
    }, timeout);
    const fail = e => {
      clearTimeout(timer);
      reject(e);
    };
    res.data.pipe(w);
    w.on("finish", () => {
      clearTimeout(timer);
      resolve();
    });
    w.on("error", fail);
    res.data.on("error", fail);
  });
}

async function downloadSong(event, song) {
  const data = await fetchSong(song);
  const file = path.join(cacheDir, `sing_${Date.now()}_${event.senderID}.mp3`);
  if (data.buffer) fs.writeFileSync(file, data.buffer);
  else await saveToFile(data.link, file, 120000);

  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
    try { fs.unlinkSync(file); } catch (e) {}
    throw new Error("ফাইল ঠিকমতো ডাউনলোড হয়নি");
  }
  return { file, title: data.title || song.title || "Unknown" };
}

/* ───────────── কমান্ড রান ───────────── */
module.exports.run = async ({ api, event, args }) => {
  const { threadID, messageID, senderID } = event;

  if (!creditOK()) return api.sendMessage(CREDIT_MSG, threadID, messageID);

  if (!args.length)
    return api.sendMessage(
      "🎵 গানের নাম লিখুন!\n\n📌 উদাহরণ: sing tum hi ho",
      threadID,
      messageID
    );

  const rate = checkRate(senderID);
  if (!rate.ok)
    return api.sendMessage(
      `⏳ লিমিট শেষ!\n\n১ ঘন্টায় সর্বোচ্চ ${RATE_LIMIT} বার কমান্ড দেওয়া যায়।\nআবার দিতে পারবেন: ${formatLeft(rate.wait)} পর`,
      threadID,
      messageID
    );

  const query = args.join(" ");

  // নোটিশ মেসেজ
  const waitMsg = await api.sendMessage(
    `⏳ বেবি ওয়েট করো, তোমার ইউটিউব থেকে এই গান সার্চ করা হচ্ছে...\n\n🎶 "${query}"`,
    threadID,
    messageID
  );

  let file = null;
  try {
    const song = await searchSong(query);
    const res = await downloadSong(event, song);
    file = res.file;

    const body = `🎼 ${res.title}\n━━━━━━━━━━━━━━━━━━\n👑 ${CREDIT}`;

    // কমান্ড মেসেজে রিপ্লাই করে গান পাঠানো
    api.sendMessage(
      { body, attachment: fs.createReadStream(file) },
      threadID,
      err => {
        safeUnsend(api, waitMsg?.messageID);
        cleanup([file]);
        if (err) {
          refundRate(senderID, rate.stamp);
          console.log("[sing] পাঠাতে সমস্যা:", err);
          api.sendMessage(
            `❌ গান পাঠানো যায়নি\n\n${err.message || err.error || "অজানা সমস্যা"}`,
            threadID,
            messageID
          );
        }
      },
      messageID
    );
  } catch (error) {
    console.log("[sing] এরর:", error.message);
    refundRate(senderID, rate.stamp);
    safeUnsend(api, waitMsg?.messageID);
    cleanup([file]);
    const reason = /timeout/i.test(error.message)
      ? "সার্ভার সাড়া দিচ্ছে না, একটু পরে আবার চেষ্টা করুন।"
      : error.message;
    return api.sendMessage(`⚠️ গান আনা যায়নি\n${reason}`, threadID, messageID);
  }
};
