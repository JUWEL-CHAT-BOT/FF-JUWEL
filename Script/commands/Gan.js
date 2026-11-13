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

const COOLDOWN_MS = 5000;           // ৫ সেকেন্ড cooldown
const BAN_WINDOW_MS = 60000;        // ১ মিনিট window
const MAX_USES_IN_WINDOW = 4;       // ১ মিনিটে সর্বোচ্চ ৪ বার
const BAN_DURATION_MS = 5 * 60000;  // ৫ মিনিট ban

const MAX_ATTEMPTS = 3;             // ফেইল করলে সর্বোচ্চ ৩ বার অন্য গান try করবে
const CONNECT_TIMEOUT_MS = 15000;   // লিংক সাড়া না দিলে ১৫ সেকেন্ডে পরের গানে যাবে
const DOWNLOAD_TIMEOUT_MS = 120000; // পুরো ডাউনলোডের সর্বোচ্চ সময় ১২০ সেকেন্ড
const LOCK_SAFETY_MS = 4 * 60000;   // লক আটকে গেলে ৪ মিনিট পর নিজে থেকে ছাড়বে

module.exports.config = {
  name: "gan",
  version: "1.9.0",
  hasPermission: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Play random song without prefix",
  commandCategory: "music",
  usages: "gan",
  cooldowns: 5,
};

// ─── পুরোনো লিংক ───
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

// ─── নতুন লিংক ───
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

// ডুপ্লিকেট বাদ
const OLD_POOL = [...new Set(oldLinks)];
const NEW_POOL = [...new Set(newLinks)];
const songLinks = [...OLD_POOL, ...NEW_POOL]; // মোট গানের সংখ্যা দেখানোর জন্য

// একবার পুরোনো, একবার নতুন — এভাবে পালা করে আসবে
let nextPool = "old";
const lastInPool = { old: -1, new: -1 };

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
function pickFromPool(poolName, exclude = []) {
  const pool = poolName === "old" ? OLD_POOL : NEW_POOL;
  let url;
  let guard = 0;
  do {
    url = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  } while (
    (url === lastInPool[poolName] || exclude.includes(url)) &&
    pool.length > exclude.length + 1 &&
    guard < 50
  );
  return url;
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
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept": "*/*",
      "Referer": "https://catbox.moe/",
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });

  // পুরো ডাউনলোডের জন্য hard timeout (হ্যাং হলে যেন আটকে না থাকে)
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
}

function sendFile(api, threadID, body, filePath) {
  return new Promise((resolve, reject) => {
    try {
      api.sendMessage(
        { body, attachment: fs.createReadStream(filePath) },
        threadID,
        (err) => (err ? reject(err) : resolve())
      );
    } catch (e) {
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

  // লক + safety timer
  downloading.set(
    threadID,
    setTimeout(() => downloading.delete(threadID), LOCK_SAFETY_MS)
  );

  try { api.setMessageReaction("🎶", messageID, () => {}, true); } catch (_) {}

  const cacheDir = path.join(__dirname, "cache");
  fs.ensureDirSync(cacheDir);

  const poolName = nextPool; // এই কমান্ডের পালা
  const tried = [];
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const url = pickFromPool(poolName, tried);
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
      nextPool = poolName === "old" ? "new" : "old"; // সফল হলে পরের বার অন্য পুল
      releaseLock(threadID);
      return; // সফল
    } catch (e) {
      lastError = e;
      console.error(`[GAN] Attempt ${attempt}/${MAX_ATTEMPTS} failed (song ${index + 1}):`, e.message);
      safeUnlink(filePath);
      // পরের attempt এ অন্য গান try করবে, ইউজারকে কিছু দেখাবে না
    }
  }

  // ৩ বারই ফেইল করলে তবেই এরর দেখাবে
  releaseLock(threadID);
  api.sendMessage(
    `❌ গান পাঠাতে সমস্যা হয়েছে, একটু পরে আবার চেষ্টা করুন।\nReason: ${lastError ? lastError.message : "Unknown"}`,
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

/* ─── Prefix trigger এ কিছুই করবে না (double trigger fix) ─── */
module.exports.run = async function () {
  return;
};
