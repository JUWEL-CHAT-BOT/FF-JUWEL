// ══════════════════════════════════════════════
// Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
// Script/commands/adminlist.js — Admin List
//
//  Trigger (prefix ছাড়া বা prefix সহ):
//    adminlist | admin list | admins | অ্যাডমিন লিস্ট | এডমিন লিস্ট | অ্যাডমিনলিস্ট
//
//  দেখাবে:
//    👑 এই গ্রুপের অ্যাডমিন (Facebook group admin)
//    🤖 বটের অ্যাডমিন (config.json → ADMINBOT)
// ══════════════════════════════════════════════
const crypto = require("crypto");

const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
const CREDIT_HASH = "8f74924e81a157abaf089d90717e48a4949617a7379d20a2df567cb0ab0dad81";
const sha = s => crypto.createHash("sha256").update(String(s == null ? "" : s).normalize("NFC")).digest("hex");

// true করলে শুধু বট অ্যাডমিন এই কমান্ড চালাতে পারবে (অন্যরা পেলে বট চুপ থাকবে)
// false (ডিফল্ট) হলে সবাই দেখতে পারবে
const ONLY_BOT_ADMIN = false;

module.exports.config = {
  name: "adminlist",
  version: "1.0.0",
  // 0 রাখতে হবে, নইলে ফ্রেমওয়ার্ক নিজেই ACCESS DENIED পাঠাবে
  hasPermssion: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "গ্রুপের অ্যাডমিন আর বটের অ্যাডমিনদের লিস্ট দেখাবে",
  commandCategory: "Group",
  usages: "adminlist | admin list | অ্যাডমিন লিস্ট",
  cooldowns: 5
};

const TRIGGERS = /^(admin ?list|admins|অ্যাডমিন ?লিস্ট|এডমিন ?লিস্ট|অ্যাডমিনলিস্ট|এডমিনলিস্ট)$/;

/* ───────────── Checks ───────────── */
function creditOk() {
  try {
    return sha(CREDIT) === CREDIT_HASH && sha(module.exports.config.credits) === CREDIT_HASH;
  } catch (_) { return false; }
}
function botAdminIDs() {
  const raw = (global.config && global.config.ADMINBOT) || [];
  return [...new Set(raw.map(String))];
}
function isBotAdmin(id) { return botAdminIDs().includes(String(id)); }

// প্রোফাইল লিঙ্ক (UID দিয়ে)
const profileLink = id => "https://www.facebook.com/" + id;

/* ───────────── Formatting ───────────── */
function bold(str) {
  return String(str).replace(/[A-Za-z0-9]/g, c => {
    const k = c.charCodeAt(0);
    if (k >= 65 && k <= 90) return String.fromCodePoint(0x1D5D4 + k - 65);
    if (k >= 97 && k <= 122) return String.fromCodePoint(0x1D5EE + k - 97);
    return String.fromCodePoint(0x1D7EC + k - 48);
  });
}

function frame(title, rows) {
  const botName = (global.config && global.config.BOTNAME) || "Bot";
  return [
    "╭━━━━━━━━━━━━━━━━━━━━━━╮",
    "┃  " + bold(title),
    "┣━━━━━━━━━━━━━━━━━━━━━━┫",
    "┃ 🤖 " + bold("Bot") + ": " + botName,
    ...rows,
    "┣━━━━━━━━━━━━━━━━━━━━━━┫",
    "┃ 👑 " + bold("Credit") + ": " + CREDIT,
    "╰━━━━━━━━━━━━━━━━━━━━━━╯"
  ].join("\n");
}

/* ───────────── API helpers ───────────── */
const getInfo = (api, id) => new Promise(res => {
  try { api.getThreadInfo(id, (err, info) => res(err ? null : info)); }
  catch (_) { res(null); }
});

const getUsers = (api, ids) => new Promise(res => {
  if (!ids.length) return res({});
  try { api.getUserInfo(ids, (err, data) => res(err ? {} : (data || {}))); }
  catch (_) { res({}); }
});

async function nameMap(api, Users, ids) {
  const map = {};
  const missing = [];
  for (const id of ids) {
    let n = null;
    try { if (Users && Users.getNameUser) n = await Users.getNameUser(id); } catch (_) {}
    // Users.getNameUser কখনো "Facebook User" ফেরত দেয়, সেটা বাদ
    if (n && !/^facebook user$/i.test(n)) map[id] = n; else missing.push(id);
  }
  if (missing.length) {
    const data = await getUsers(api, missing);
    for (const id of missing) map[id] = (data[id] && data[id].name) || "Unknown";
  }
  return map;
}

/* ───────────── Trigger ───────────── */
module.exports.handleEvent = async function ({ api, event, Users }) {
  try {
    if (!event || (event.type !== "message" && event.type !== "message_reply")) return;
    let t = String(event.body || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!t) return;
    const prefix = String((global.config && global.config.PREFIX) || ".").toLowerCase();
    if (prefix && t.startsWith(prefix)) t = t.slice(prefix.length).trim();
    if (!TRIGGERS.test(t)) return;

    if (ONLY_BOT_ADMIN && !isBotAdmin(event.senderID)) return;

    if (!creditOk()) {
      return api.sendMessage("⛔ AdminList নিষ্ক্রিয়: ক্রেডিট পরিবর্তন করা হয়েছে।\nআসল ক্রেডিট ফিরিয়ে দিন।", event.threadID, event.messageID);
    }

    const info = await getInfo(api, event.threadID);
    const isGroup = !!(info && info.isGroup);
    const groupAdmins = isGroup
      ? [...new Set((info.adminIDs || []).map(a => String(a && typeof a === "object" ? a.id : a)))]
      : [];
    const botAdmins = botAdminIDs();

    const names = await nameMap(api, Users, [...new Set([...groupAdmins, ...botAdmins])]);

    const rows = [];

    // ── গ্রুপ অ্যাডমিন ──
    rows.push("┣━━━━━━━━━━━━━━━━━━━━━━┫");
    if (isGroup) {
      rows.push("┃ 👑 " + bold("Group Admins") + " (" + groupAdmins.length + ")");
      if (!groupAdmins.length) rows.push("┃   — কোনো অ্যাডমিন পাওয়া যায়নি");
      groupAdmins.forEach((id, i) => {
        rows.push("┃ " + bold(String(i + 1) + ".") + " " + names[id]);
        rows.push("┃    🆔 " + id + (isBotAdmin(id) ? "  ⭐ Bot Admin" : ""));
        rows.push("┃    🔗 " + profileLink(id));
      });
    } else {
      rows.push("┃ 👑 " + bold("Group Admins"));
      rows.push("┃   এটা গ্রুপ না, তাই গ্রুপ অ্যাডমিন নেই।");
    }

    // ── বট অ্যাডমিন ──
    rows.push("┣━━━━━━━━━━━━━━━━━━━━━━┫");
    rows.push("┃ 🤖 " + bold("Bot Admins") + " (" + botAdmins.length + ")");
    if (!botAdmins.length) rows.push("┃   — config.json-এ ADMINBOT নেই");
    botAdmins.forEach((id, i) => {
      rows.push("┃ " + bold(String(i + 1) + ".") + " " + names[id]);
      rows.push("┃    🆔 " + id);
      rows.push("┃    🔗 " + profileLink(id));
    });

    return api.sendMessage(frame("🛡️ ADMIN LIST", rows), event.threadID, event.messageID);
  } catch (e) {
    console.log("[ADMINLIST] error:", e && e.message);
  }
};

// run ফাঁকা: ট্রিগার সব handleEvent-এ, যাতে দুইবার কাজ না করে
module.exports.run = function () {};
