module.exports.config = {
  name: "catboxall",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "কমান্ড মেসেজ থেকে উপরের দিকে গ্রুপের শেষ N টি মিডিয়া (ছবি/ভিডিও/অডিও) Catbox লিংক বানাবে (admin only). Usage: catboxall 10 | catboxall 5 audio",
  commandCategory: "other",
  usages: "catboxall [count] [all|audio|photo|video]",
  cooldowns: 30,
};

// true = পুরোনো মিডিয়া আগে, নতুন পরে | false = কমান্ডের সবচেয়ে কাছের মিডিয়া আগে
const OLDEST_FIRST = false;
const MAX_LIMIT = 30;
const PAGE_SIZE = 50;
const MAX_PAGES = 20; // সর্বোচ্চ ১০০০ মেসেজ পর্যন্ত পেছনে খুঁজবে
const CATBOX_API = "https://catbox.moe/user/api.php";

// ===== বট এডমিন লিস্ট বের করার হেল্পার =====
function getBotAdmins() {
  const fs = global.nodemodule["fs-extra"];
  const path = global.nodemodule["path"];
  const possiblePaths = [];

  if (global.client && global.client.dirConfig) {
    possiblePaths.push(global.client.dirConfig);
  }
  try {
    possiblePaths.push(path.join(__dirname, "..", "..", "config.json"));
    possiblePaths.push(path.join(__dirname, "..", "..", "..", "config.json"));
    possiblePaths.push(path.join(process.cwd(), "config.json"));
  } catch (e) {}

  if (global.config && typeof global.config === "object") {
    const direct =
      global.config.ADMINBOT ||
      global.config.adminBot ||
      global.config.ADMIN ||
      global.config.admin;
    if (Array.isArray(direct) && direct.length > 0) {
      return direct.map(String);
    }
  }

  for (const p of possiblePaths) {
    try {
      if (p && fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
        const list =
          raw.ADMINBOT || raw.adminBot || raw.ADMIN || raw.admin || raw.adminIds || [];
        if (Array.isArray(list) && list.length > 0) {
          return list.map(String);
        }
      }
    } catch (e) {}
  }
  return [];
}

// callback ও promise দুই ধরনের fca-তেই কাজ করবে
function getHistory(api, threadID, amount, timestamp) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, data) => {
      if (done) return;
      done = true;
      err ? reject(err) : resolve(data || []);
    };
    try {
      const r = api.getThreadHistory(threadID, amount, timestamp, (err, h) =>
        finish(err, h)
      );
      if (r && typeof r.then === "function") {
        r.then((h) => finish(null, h)).catch((e) => finish(e));
      }
    } catch (e) {
      finish(e);
    }
  });
}

function getMediaUrl(att) {
  return (
    att.url ||
    att.playableUrl ||
    att.hiresUrl ||
    att.largePreviewUrl ||
    att.previewUrl ||
    null
  );
}

// filter: all | audio | photo | video
function isMedia(att, filter) {
  const t = att.type;
  if (filter === "audio") return t === "audio";
  if (filter === "photo") return t === "photo" || t === "animated_image";
  if (filter === "video") return t === "video";
  return (
    t === "photo" ||
    t === "video" ||
    t === "animated_image" ||
    t === "audio"
  );
}

// কমান্ড মেসেজের উপর থেকে শুরু করে পেছনের দিকে count টি মিডিয়া খুঁজে আনে
async function collectMedia(api, threadID, commandMessageID, anchorTs, count, filter) {
  const media = [];
  const seen = new Set();
  let cursor = anchorTs;

  for (let page = 0; page < MAX_PAGES && media.length < count; page++) {
    let history;
    try {
      history = await getHistory(api, threadID, PAGE_SIZE, cursor);
    } catch (e) {
      console.log("[catboxall] History fetch error:", e);
      break;
    }
    if (!history || history.length === 0) break;

    // নতুন → পুরোনো
    const sorted = [...history].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );

    for (const msg of sorted) {
      if (media.length >= count) break;
      if (msg.messageID === commandMessageID) continue;
      if (anchorTs && msg.timestamp && Number(msg.timestamp) >= Number(anchorTs)) continue;
      if (!msg.attachments || msg.attachments.length === 0) continue;

      for (const att of msg.attachments) {
        if (media.length >= count) break;
        if (!isMedia(att, filter)) continue;
        const url = getMediaUrl(att);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        media.push({ url, type: att.type, timestamp: msg.timestamp });
      }
    }

    // পরের পেজের জন্য সবচেয়ে পুরোনো মেসেজের সময় থেকে আবার পেছনে যাবে
    const oldestTs = Number(sorted[sorted.length - 1].timestamp);
    if (!oldestTs || oldestTs >= Number(cursor)) break;
    cursor = oldestTs;
  }

  return media;
}

// ফাইলটা আগে বটের মেমোরিতে নামিয়ে, তারপর Catbox-এ ফাইল হিসেবে আপলোড
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function guessExt(url, type) {
  try {
    const m = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,4})$/);
    if (m) return m[1].toLowerCase();
  } catch (e) {}
  if (type === "audio") return "mp3";
  if (type === "video") return "mp4";
  if (type === "animated_image") return "gif";
  return "jpg";
}

function errInfo(e) {
  const st = e.response && e.response.status ? `[${e.response.status}] ` : "";
  let body = "";
  if (e.response && e.response.data) {
    try {
      body = Buffer.isBuffer(e.response.data)
        ? e.response.data.toString("utf-8")
        : typeof e.response.data === "string"
        ? e.response.data
        : JSON.stringify(e.response.data);
    } catch (x) {}
  }
  return `${st}${(body || e.message || "").toString().slice(0, 150)}`;
}

async function uploadToCatbox(axios, url, type) {
  const FormData = require("form-data");

  // ধাপ ১: Facebook থেকে ফাইল নামাও
  let buf;
  try {
    const file = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      headers: { "User-Agent": UA },
    });
    buf = Buffer.from(file.data);
  } catch (e) {
    throw new Error("ডাউনলোড ধাপ: " + errInfo(e));
  }

  // ধাপ ২: Catbox-এ ফাইল আপলোড
  let err1 = "";
  try {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("userhash", "");
    form.append("fileToUpload", buf, {
      filename: `file_${Date.now()}.${guessExt(url, type)}`,
    });
    const res = await axios.post(CATBOX_API, form, {
      headers: { ...form.getHeaders(), "User-Agent": UA },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
    });
    const link = String(res.data || "").trim();
    if (link.startsWith("http")) return link;
    err1 = "উত্তর: " + link.slice(0, 150);
  } catch (e) {
    err1 = errInfo(e);
  }

  // ধাপ ৩ (ব্যাকআপ): Catbox-কে সরাসরি URL দিয়ে
  try {
    const params = new URLSearchParams();
    params.append("reqtype", "urlupload");
    params.append("userhash", "");
    params.append("url", url);
    const res = await axios.post(CATBOX_API, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      timeout: 60000,
    });
    const link = String(res.data || "").trim();
    if (link.startsWith("http")) return link;
    throw new Error("উত্তর: " + link.slice(0, 150));
  } catch (e) {
    throw new Error(`Catbox আপলোড ধাপ: ফাইল-মোড(${err1}) | URL-মোড(${errInfo(e)})`);
  }
}

module.exports.run = async ({ api, event, args }) => {
  const axios = global.nodemodule["axios"];
  const { threadID, messageID, senderID } = event;

  // ===== বট এডমিন চেক =====
  const botAdminList = getBotAdmins();
  const isBotAdmin =
    botAdminList.length > 0 && botAdminList.includes(String(senderID));

  if (!isBotAdmin) {
    return api.sendMessage(
      "⛔ এই কমান্ডটি শুধুমাত্র বট এডমিন চালাতে পারবে!",
      threadID,
      messageID
    );
  }

  // ===== সংখ্যা ও ফিল্টার পার্স =====
  let requestedCount = MAX_LIMIT;
  let filter = "all";

  for (const a of args || []) {
    const low = String(a).toLowerCase();
    if (["all", "audio", "photo", "video"].includes(low)) {
      filter = low;
      continue;
    }
    const parsed = parseInt(a, 10);
    if (!isNaN(parsed) && parsed > 0) requestedCount = parsed;
  }
  if (requestedCount > MAX_LIMIT) requestedCount = MAX_LIMIT;

  api.sendMessage(
    `⏳ ${requestedCount} টি মিডিয়া খুঁজছি...`,
    threadID,
    messageID
  );

  // ===== কমান্ড মেসেজ থেকে উপরে (পেছনে) মিডিয়া সংগ্রহ =====
  const anchorTs = Number(event.timestamp) || Date.now();
  let finalMedia = await collectMedia(
    api,
    threadID,
    messageID,
    anchorTs,
    requestedCount,
    filter
  );

  if (finalMedia.length === 0) {
    return api.sendMessage(
      "❌ গ্রুপে কোনো মিডিয়া পাওয়া যায়নি!",
      threadID,
      messageID
    );
  }

  if (OLDEST_FIRST) finalMedia = finalMedia.reverse();

  // ===== Catbox-এ আপলোড =====
  const uploadedLinks = [];
  let lastError = "";
  for (const m of finalMedia) {
    try {
      const link = await uploadToCatbox(axios, m.url, m.type);
      if (link) uploadedLinks.push(`"${link}"`);
    } catch (e) {
      lastError = e.message || String(e);
      console.log("[catboxall] Upload error:", lastError);
      // ফেইল হলে স্কিপ
    }
  }

  if (uploadedLinks.length === 0) {
    return api.sendMessage(
      `❌ কোনো মিডিয়া আপলোড করা যায়নি!\n🔎 কারণ: ${lastError || "অজানা"}`,
      threadID,
      messageID
    );
  }

  // ===== লিংক পাঠানো =====
  await new Promise((resolve) => {
    api.sendMessage(uploadedLinks.join(",\n"), threadID, () => resolve(), messageID);
  });

  // ===== আলাদা রিসেট নোটিশ =====
  return api.sendMessage(
    `♻️ রিসেট হয়েছে! (${uploadedLinks.length} টি লিংক তৈরি হয়েছে)\nনতুন মিডিয়া দিয়ে আবার কমান্ড দিন।`,
    threadID
  );
};
