const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const pipelineAsync = promisify(pipeline);

const downloading = new Map(); // threadID -> safety timer
const processedMessages = new Set();

// 🛡️ Cooldown + Ban system
const userCooldown = new Map();
const userWarnings = new Map();
const bannedUsers = new Map();

const COOLDOWN_MS = 5000;
const BAN_WINDOW_MS = 60000;
const MAX_USES_IN_WINDOW = 4;
const BAN_DURATION_MS = 5 * 60000;

const MAX_ATTEMPTS = 6;              // ✅ ৩ থেকে ৬ করা হয়েছে
const CONNECT_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 120000;
const SEND_TIMEOUT_MS = 90000;       // ✅ সেন্ড হ্যাং হলে আটকে থাকবে না
const LOCK_SAFETY_MS = 4 * 60000;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // ✅ Messenger লিমিট ~25MB
const DEAD_LINK_MS = 10 * 60000;     // ✅ ফেইল করা লিংক ১০ মিনিট স্কিপ

module.exports.config = {
  name: "gan",
  version: "2.0.0",
  hasPermission: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Play random song without prefix",
  commandCategory: "music",
  usages: "gan",
  cooldowns: 5,
};

const oldLinks = [
  "https://files.catbox.moe/etsdn9.mp3",
  "https://files.catbox.moe/ayepdz.mp3",
  "https://files.catbox.moe/oaecnx.mp3",
  "https://files.catbox.moe/xtpf61.mp3",
  "https://files.catbox.moe/12grz0.mp3",
  "https://files.catbox.moe/aaqddo.mp3",
  "https://files.catbox.moe/k3acvx.mp3",
  "https://files.catbox.moe/nry1qv.mp3",
  "https://files.catbox.moe/23e8u1.mp3",
  "https://files.catbox.moe/y8dzik.mp3",
  "https://files.catbox.moe/z9d2e6.mp3",
  "https://files.catbox.moe/0xscc8.mp3",
  "https://files.catbox.moe/q4m2ad.mp3",
  "https://files.catbox.moe/y8bg4r.mp3",
  "https://files.catbox.moe/q61co1.mp3",
  "https://files.catbox.moe/euq7fo.mp3",
  "https://files.catbox.moe/x5f56o.mp3",
  "https://files.catbox.moe/avlqok.mp3",
  "https://files.catbox.moe/v0twt3.mp3",
  "https://files.catbox.moe/qmpvpt.mp3",
  "https://files.catbox.moe/wrdtb0.mp3",
  "https://files.catbox.moe/s4bzr8.mp3",
  "https://files.catbox.moe/4m5z15.mp3",
  "https://files.catbox.moe/i6v5xj.mp3",
  "https://files.catbox.moe/7tz9ts.mp3",
  "https://files.catbox.moe/mdh4rg.mp3",
  "https://files.catbox.moe/aa643l.mp3",
  "https://files.catbox.moe/ih48ki.mp3",
  "https://files.catbox.moe/gvvb82.mp3",
  "https://files.catbox.moe/tht37y.mp3",
  "https://files.catbox.moe/bmk3mq.mp3",
  "https://files.catbox.moe/9i3g65.mp3",
  "https://files.catbox.moe/ap2yed.mp3",
];

const newLinks = [
  "https://files.catbox.moe/lpjun8.mp4",
  "https://files.catbox.moe/zgcevz.mp4",
  "https://files.catbox.moe/c8plgy.mp4",
  "https://files.catbox.moe/liigjx.mp4",
  "https://files.catbox.moe/2oggba.mp4",
  "https://files.catbox.moe/17j4v2.mp4",
  "https://files.catbox.moe/1a3ymf.mp4",
  "https://files.catbox.moe/gve140.mp4",
  "https://files.catbox.moe/d8jo1p.mp4",
  "https://files.catbox.moe/xhp84v.mp4",
  "https://files.catbox.moe/wc0i7v.mp4",
  "https://files.catbox.moe/gbswqn.mp4",
  "https://files.catbox.moe/i0wysc.mp4",
  "https://files.catbox.moe/b9hv3h.mp4",
  "https://files.catbox.moe/skuyvx.mp4",
  "https://files.catbox.moe/27lojj.mp4",
  "https://files.catbox.moe/eu79r2.mp4",
  "https://files.catbox.moe/b07lxv.mp4",
  "https://files.catbox.moe/54510q.mp4",
  "https://files.catbox.moe/h7fd7n.mp4",
  "https://files.catbox.moe/tp5fz7.mp4",
  "https://files.catbox.moe/gmrurc.mp4",
  "https://files.catbox.moe/4109at.mp4",
  "https://files.catbox.moe/3ck8tc.mp3",
];

const OLD_POOL = [...new Set(oldLinks)];
const NEW_POOL = [...new Set(newLinks)];
const songLinks = [...OLD_POOL, ...NEW_POOL];

let nextPool = "old";
const lastInPool = { old: null, new: null };
const deadLinks = new Map(); // url -> কখন পর্যন্ত স্কিপ হবে

/* ─── UI ─── */
function uiBanNotice(remainingSec) {
  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  return `🚫 𝐁𝐀𝐍𝐍𝐄𝐃!\n⏳ বাকি: ${timeStr}\n📌 কারণ: স্প্যাম (১ মিনিটে ৪ বার)`;
}

function uiBannedJustNow() {
  return `⛔ 𝐘𝐎𝐔 𝐀𝐑𝐄 𝐁𝐀𝐍𝐍𝐄𝐃!\n🚨 স্প্যাম ডিটেক্টেড\n⏱️ সময়: ৫ মিনিট\n🔒 Status: BANNED`;
}

function uiCooldown(waitSec) {
  return `⏱️ 𝐒𝐋𝐎𝐖 𝐃𝐎𝐖𝐍!\n⏳ অপেক্ষা: ${waitSec} সেকেন্ড\n💡 Spam করলে ব্যান খাবেন!`;
}

/* ─── Cooldown + Ban Check ─── */
function checkUserLimit(api, event) {
  const { senderID, threadID } = event;
  const now = Date.now();

  const banUntil = bannedUsers.get(senderID);
  if (banUntil && now < banUntil) {
    const remaining = Math.ceil((banUntil - now) / 1000);
    api.sendMessage(uiBanNotice(remaining), threadID);
    return false;
  } else if (banUntil && now >= banUntil) {
    bannedUsers.delete(senderID);
    userWarnings.delete(senderID);
  }

  const last = userCooldown.get(senderID) || 0;
  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    api.sendMessage(uiCooldown(wait), threadID);
    return false;
  }
  userCooldown.set(senderID, now);

  let w = userWarnings.get(senderID);
  if (!w || now - w.firstTime > BAN_WINDOW_MS) {
    w = { count: 1, firstTime: now };
    userWarnings.set(senderID, w);
  } else {
    w.count++;
    if (w.count >= MAX_USES_IN_WINDOW) {
      bannedUsers.set(senderID, now + BAN_DURATION_MS);
      userWarnings.delete(senderID);
      api.sendMessage(uiBannedJustNow(), threadID);
      return false;
    }
  }

  return true;
}

/* ─── Helpers ─── */

// ✅ প্রথমে নির্ধারিত পুল, না পেলে অন্য পুল থেকে; মরা/চেষ্টা-করা লিংক বাদ
function pickSong(preferredPool, tried) {
  const now = Date.now();
  const order = preferredPool === "old" ? ["old", "new"] : ["new", "old"];

  for (const name of order) {
    const pool = name === "old" ? OLD_POOL : NEW_POOL;
    let list = pool.filter(
      (u) => !tried.includes(u) && !(deadLinks.get(u) > now)
    );
    const fresh = list.filter((u) => u !== lastInPool[name]);
    if (fresh.length) list = fresh;
    if (list.length) {
      return { url: list[Math.floor(Math.random() * list.length)], poolName: name };
    }
  }
  return null;
}

function releaseLock(threadID) {
  const t = downloading.get(threadID);
  if (t) clearTimeout(t);
  downloading.delete(threadID);
}

function safeUnlink(p) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
}

async function downloadFile(url, filePath) {
  const res = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: CONNECT_TIMEOUT_MS,
    maxRedirects: 10,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept": "*/*",
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });

  // ✅ HTML এরর পেজ হলে বাদ
  const type = String(res.headers["content-type"] || "").toLowerCase();
  if (type.includes("text/html")) {
    res.data.destroy();
    throw new Error("Link dead (HTML response)");
  }

  // ✅ বেশি বড় ফাইল Messenger এ যায় না
  const len = parseInt(res.headers["content-length"] || "0", 10);
  if (len > MAX_FILE_BYTES) {
    res.data.destroy();
    throw new Error(`File too big (${Math.round(len / 1048576)}MB)`);
  }

  let hardTimer;
  const hardTimeout = new Promise((_, reject) => {
    hardTimer = setTimeout(() => {
      res.data.destroy();
      reject(new Error("Download timeout"));
    }, DOWNLOAD_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      pipelineAsync(res.data, fs.createWriteStream(filePath)),
      hardTimeout,
    ]);
  } finally {
    clearTimeout(hardTimer);
  }

  const size = fs.statSync(filePath).size;
  if (size < 5000) throw new Error("File too small/corrupt");
  if (size > MAX_FILE_BYTES) throw new Error("File too big");
}

// ✅ callback না এলে ৯০ সেকেন্ডে এরর দিয়ে পরের গানে যাবে
function sendFile(api, threadID, body, filePath) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Send timeout"));
    }, SEND_TIMEOUT_MS);

    try {
      api.sendMessage(
        { body, attachment: fs.createReadStream(filePath) },
        threadID,
        (err) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          err ? reject(err) : resolve();
        }
      );
    } catch (e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    }
  });
}

/* ─── Play Song ─── */
async function playSong(api, event) {
  const { threadID, messageID } = event;

  if (downloading.has(threadID)) {
    return api.sendMessage("⏳ আগের গান এখনো পাঠানো হচ্ছে, অপেক্ষা করুন...", threadID);
  }

  downloading.set(
    threadID,
    setTimeout(() => downloading.delete(threadID), LOCK_SAFETY_MS)
  );

  try { api.setMessageReaction("🎶", messageID, () => {}, true); } catch (_) {}

  const cacheDir = path.join(__dirname, "cache");
  fs.ensureDirSync(cacheDir);

  const tried = [];
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const pick = pickSong(nextPool, tried);
    if (!pick) break;

    const { url, poolName } = pick;
    tried.push(url);

    const index = songLinks.indexOf(url);
    const ext = path.extname(url.split("?")[0]) || ".mp3";
    const isVideo = ext.toLowerCase() === ".mp4";
    const filePath = path.join(cacheDir, `gan_${index + 1}_${Date.now()}${ext}`);

    try {
      await downloadFile(url, filePath);

      const body = `🎧𝐉𝐔𝐖𝐄𝐋🔊

${isVideo ? "🎬" : "🎵"} Song No: ${index + 1}/${songLinks.length}
🔀 Mode: No Prefix

Enjoy 🎶`;

      await sendFile(api, threadID, body, filePath);

      safeUnlink(filePath);
      lastInPool[poolName] = url;
      nextPool = poolName === "old" ? "new" : "old";
      releaseLock(threadID);
      return;
    } catch (e) {
      lastError = e;
      deadLinks.set(url, Date.now() + DEAD_LINK_MS);
      console.error(`[GAN] Attempt ${attempt}/${MAX_ATTEMPTS} failed (song ${index + 1}, ${url}):`, e.message);
      safeUnlink(filePath);
    }
  }

  releaseLock(threadID);
  api.sendMessage(
    `❌ গান পাঠাতে সমস্যা হয়েছে, একটু পরে আবার চেষ্টা করুন।\nReason: ${lastError ? lastError.message : "No available song"}`,
    threadID
  );
}

/* ─── No-prefix trigger ─── */
module.exports.handleEvent = async function ({ api, event }) {
  if (!event.body || !event.messageID) return;
  if (processedMessages.has(event.messageID)) return;
  processedMessages.add(event.messageID);
  setTimeout(() => processedMessages.delete(event.messageID), 60000);

  const msg = event.body.trim().toLowerCase();
  if (msg === "gan") {
    if (!checkUserLimit(api, event)) return;
    return playSong(api, event);
  }
};

module.exports.run = async function () {
  return;
};
