// ══════════════════════════════════════════════
// Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
// ══════════════════════════════════════════════
// গ্রুপ অ্যাপ্রুভাল গেট — অনুমোদন ছাড়া বট কোনো গ্রুপে সাড়া দেবে না
// ফলে গ্রুপটা ফেসবুকের পেন্ডিং/মেসেজ-রিকোয়েস্টেই থেকে যায়
// ══════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const CREDITS = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";

const FILE = path.join(__dirname, "..", "Script", "commands", "cache", "approvedThreads.json");
let state = { seeded: false, threads: {} };

try {
  if (fs.existsSync(FILE)) {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (s && typeof s.threads === "object") state = { seeded: !!s.seeded, threads: s.threads };
  }
} catch (_) {}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.log("[APPROVAL] save error:", e.message);
  }
}

const isApproved = id => !!state.threads[String(id)];
function approve(id, by) {
  state.threads[String(id)] = { by: by ? String(by) : null, at: new Date().toISOString() };
  save();
}
function remove(id) {
  if (state.threads[String(id)]) { delete state.threads[String(id)]; save(); }
}
const list = () => Object.keys(state.threads);

// config.json থেকে প্রতিবার সরাসরি ADMINBOT পড়া হয় (এডিট করলে রিস্টার্ট ছাড়াই কাজ করবে)
function getAdminBots() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8");
    const cfg = JSON.parse(raw);
    if (Array.isArray(cfg.ADMINBOT)) return cfg.ADMINBOT.map(String);
  } catch (_) {}
  return ((global.config && global.config.ADMINBOT) || []).map(String);
}

// ID দিয়ে অনুমোদন + গ্রুপে মেসেজ
async function approveById(api, tid, by) {
  approve(tid, by);
  try {
    await api.sendMessage("✅ এই গ্রুপ অনুমোদিত হয়েছে। বট এখন সক্রিয়।", String(tid));
    return true;
  } catch (_) {
    return false;
  }
}

// বটকে গ্রুপে অ্যাড করলে সব বট-অ্যাডমিনের ইনবক্সে নোটিশ
async function notifyAdmins(api, event, tid, adderID, byAdmin) {
  try {
    let groupName = "অজানা";
    let members = "?";
    try {
      const info = await api.getThreadInfo(tid);
      groupName = info.threadName || info.name || "নামহীন গ্রুপ";
      members = (info.participantIDs || []).length || "?";
    } catch (_) {}

    let adderName = "অজানা";
    try {
      const u = await api.getUserInfo(adderID);
      adderName = (u && u[adderID] && u[adderID].name) || "অজানা";
    } catch (_) {}

    let time;
    try {
      time = require("moment-timezone").tz("Asia/Dhaka").format("DD/MM/YYYY hh:mm:ss A");
    } catch (_) {
      time = new Date().toLocaleString();
    }

    const status = byAdmin
      ? "✅ অনুমোদিত (অ্যাডমিন নিজে অ্যাড করেছে)"
      : "⏳ পেন্ডিং (অ্যাপ্রুভের অপেক্ষায়, বট চুপ আছে)";

    const msg =
`🔔 বটকে নতুন গ্রুপে অ্যাড করা হয়েছে

🏠 গ্রুপ: ${groupName}
🆔 গ্রুপ আইডি: ${tid}
👥 মেম্বার: ${members}

👤 অ্যাড করেছে: ${adderName}
🆔 ইউজার আইডি: ${adderID}
🔗 প্রোফাইল: https://www.facebook.com/${adderID}

🕒 সময়: ${time}
📌 অবস্থা: ${status}

👉 অনুমোদন: /approve ${tid}
👉 অথবা /pending দিয়ে লিস্ট খুলুন`;

    for (const adminID of getAdminBots()) {
      try { await api.sendMessage(msg, adminID); } catch (e) {
        console.log("[APPROVAL] অ্যাডমিনকে নোটিশ পাঠানো যায়নি:", adminID);
      }
    }
  } catch (e) {
    console.log("[APPROVAL] notify error:", e.message);
  }
}

function isAdmin(id) {
  const c = global.config || {};
  return [...(c.ADMINBOT || []), ...(c.DEVELOPER || [])].map(String).includes(String(id));
}

// প্রথমবার চালুর সময় আগে থেকে ডাটাবেসে থাকা সব থ্রেডকে অনুমোদিত ধরা হয়
function seedOnce() {
  if (state.seeded) return true;
  const ids = (global.data && global.data.allThreadID) || [];
  if (ids.length === 0 && process.uptime() < 120) return false; // ডাটাবেস লোড হয়নি, এখনই গেট চালু নয়
  ids.forEach(id => { state.threads[String(id)] = { by: "seed", at: new Date().toISOString() }; });
  state.seeded = true;
  save();
  console.log(`[APPROVAL] ${ids.length} টি আগের থ্রেড অনুমোদিত তালিকায় ঢোকানো হলো`);
  return true;
}

const warned = new Map();
function warnOnce(tid) {
  const now = Date.now();
  if (now - (warned.get(tid) || 0) > 10 * 60 * 1000) {
    warned.set(tid, now);
    console.log(`[APPROVAL] ${tid} অনুমোদিত নয় — ইভেন্ট ইগনোর (পেন্ডিংয়ে থাকবে)`);
  }
}

// true = ইভেন্ট চলতে দাও, false = সম্পূর্ণ ইগনোর
function allow(event, api) {
  const tid = String(event.threadID || "");
  if (!tid) return true;
  if (!seedOnce()) return true;

  const actor = String(
    event.type === "message_reaction" ? event.userID
      : event.type === "event" ? (event.author || event.senderID)
      : event.senderID
  );

  // ইনবক্স (১-টু-১) গেটের আওতায় নয়
  const isGroup = event.isGroup === true || (event.isGroup === undefined && actor !== tid);
  if (!isGroup) return true;

  let botID = "";
  try { botID = String(api.getCurrentUserID()); } catch (_) {}

  // বট কিক/লিভ হলে অনুমোদন মুছে ফেলা
  if (event.type === "event" && event.logMessageType === "log:unsubscribe" &&
      String(event.logMessageData && event.logMessageData.leftParticipantFbId) === botID) {
    const was = isApproved(tid);
    remove(tid);
    return was;
  }

  // বটকে গ্রুপে অ্যাড করা হলে: অ্যাডমিনদের নোটিশ (অনুমোদন থাকুক বা না থাকুক)
  if (event.type === "event" && event.logMessageType === "log:subscribe") {
    const d = event.logMessageData || {};
    const added = (d.addedParticipants || []).map(p => String(p.userFbId));
    if (added.includes(botID)) {
      const byAdmin = isAdmin(actor);
      if (byAdmin) approve(tid, actor); // অ্যাডমিন নিজে অ্যাড করলে সরাসরি অনুমোদিত
      notifyAdmins(api, event, tid, actor, byAdmin);
      if (byAdmin) return true;
    }
  }

  if (isApproved(tid)) return true;

  // অনুমোদনহীন গ্রুপে শুধু অ্যাডমিনের approve / out কমান্ড চলবে
  if (event.type === "message" && isAdmin(actor) && typeof event.body === "string") {
    const prefix = (global.config && global.config.PREFIX) || "/";
    const re = new RegExp("^\\s*" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "?\\s*(approve|out)\\b", "i");
    if (re.test(event.body)) return true;
  }

  warnOnce(tid);
  return false;
}

module.exports = { allow, approve, approveById, remove, isApproved, list, credits: CREDITS };
