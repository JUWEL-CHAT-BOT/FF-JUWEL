// ══════════════════════════════════════════════
// Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
// Script/commands/boxlist.js — Box List (শুধু ADMINBOT)
//
//  Trigger (prefix ছাড়া বা prefix সহ, দুইভাবেই):
//    boxlist | box list | list box | বক্স লিস্ট | বক্সলিস্ট | লিস্ট বক্স
//
//  লিস্টে রিপ্লাই দিয়ে:
//    out 1 3      → ওই গ্রুপ(গুলো) থেকে বট লিভ নেবে
//    ban 2        → ওই গ্রুপ ব্যান (বট থাকবে, কিন্তু রেসপন্স করবে না)
//    banout 4     → ব্যান + লিভ একসাথে
//    unban 2      → ব্যান তুলে নেবে
//    next / prev  → পরের / আগের পেজ
//    page 3       → নির্দিষ্ট পেজ
//
//  অ্যাডমিন না হলে বট একদম চুপ থাকবে।
// ══════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
const CREDIT_HASH = "8f74924e81a157abaf089d90717e48a4949617a7379d20a2df567cb0ab0dad81";
const sha = s => crypto.createHash("sha256").update(String(s == null ? "" : s).normalize("NFC")).digest("hex");

module.exports.config = {
  name: "boxlist",
  version: "1.0.0",
  // 0 রাখতে হবে, নইলে ফ্রেমওয়ার্ক নিজেই ACCESS DENIED পাঠাবে।
  // অ্যাডমিন চেক নিচে কোডের ভেতরেই আছে।
  hasPermssion: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Bot-এর সব গ্রুপ দেখাবে, রিপ্লাই দিয়ে লিভ/ব্যান করা যাবে (শুধু বট অ্যাডমিন)",
  commandCategory: "Admin",
  usages: "boxlist | box list | বক্স লিস্ট",
  cooldowns: 3
};

const PER_PAGE = 8;
const TRIGGERS = /^(box ?list|list ?box|বক্স ?লিস্ট|লিস্ট ?বক্স)$/;

/* ───────────── Checks ───────────── */
function creditOk() {
  try {
    return sha(CREDIT) === CREDIT_HASH && sha(module.exports.config.credits) === CREDIT_HASH;
  } catch (_) { return false; }
}

function adminList() {
  return ((global.config && global.config.ADMINBOT) || []).map(String);
}
function isAdmin(id) { return adminList().includes(String(id)); }

// configuration check: config.json-এ অন্তত একজন ADMINBOT থাকতে হবে
function configOk() { return adminList().length > 0; }

/* ───────────── Formatting ───────────── */
function bold(str) {
  return String(str).replace(/[A-Za-z0-9]/g, c => {
    const k = c.charCodeAt(0);
    if (k >= 65 && k <= 90) return String.fromCodePoint(0x1D5D4 + k - 65);
    if (k >= 97 && k <= 122) return String.fromCodePoint(0x1D5EE + k - 97);
    return String.fromCodePoint(0x1D7EC + k - 48);
  });
}

function box(title, rows) {
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

/* ───────────── Approval (অ্যাপ্রুভাল) ─────────────
   আপনার বটের approval সিস্টেম যেভাবে আছে সেভাবে এখানে মেলাতে হতে পারে।
   নিচের ফাংশনগুলো কয়েকটা সাধারণ জায়গা চেক করে। না পেলে "unknown" দেখাবে। */
function approvalSystemOn() {
  const c = global.config || {};
  const keys = ["APPROVAL", "approval", "APPROVALSYSTEM", "approvalSystem", "APPROVAL_SYSTEM", "approvalMode", "APPROVALMODE"];
  for (const k of keys) {
    if (c[k] !== undefined) {
      const v = c[k];
      if (typeof v === "string") return !["false", "off", "0", "no"].includes(v.toLowerCase());
      if (v && typeof v === "object" && v.enable !== undefined) return !!v.enable;
      return !!v;
    }
  }
  return null; // unknown
}

let _approvedCache = { t: 0, set: null };
function approvedSet() {
  const now = Date.now();
  if (_approvedCache.set && now - _approvedCache.t < 15000) return _approvedCache.set;
  let set = null;
  try {
    const d = global.data || {};
    const src = d.approvedThreads || d.approvedThreadID || d.APPROVED || null;
    if (src) {
      if (src instanceof Set) set = new Set([...src].map(String));
      else if (src instanceof Map) set = new Set([...src.keys()].map(String));
      else if (Array.isArray(src)) set = new Set(src.map(String));
      else if (typeof src === "object") set = new Set(Object.keys(src));
    }
  } catch (_) {}
  if (!set) {
    const root = path.join(__dirname, "..", "..");
    const files = [
      path.join(root, "data", "approvedThreads.json"),
      path.join(root, "includes", "database", "approvedThreads.json"),
      path.join(root, "includes", "database", "approved.json"),
      path.join(__dirname, "cache", "approvedThreads.json"),
      path.join(__dirname, "cache", "approved.json")
    ];
    for (const f of files) {
      try {
        if (!fs.existsSync(f)) continue;
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        if (Array.isArray(j)) set = new Set(j.map(String));
        else if (j && typeof j === "object") set = new Set(Object.keys(j));
        if (set) break;
      } catch (_) {}
    }
  }
  _approvedCache = { t: now, set };
  return set;
}

function approvalText(tid) {
  const sys = approvalSystemOn();
  if (sys === false) return "⚪ Approval system OFF";
  const set = approvedSet();
  if (!set) return sys === true ? "❔ Approval ON (status unknown)" : "❔ Approval: unknown";
  return set.has(String(tid)) ? "✅ Approved" : "⏳ Not approved";
}

/* ───────────── Ban helpers ───────────── */
function isBanned(tid) {
  try { return !!(global.data && global.data.threadBanned && global.data.threadBanned.has(String(tid))); }
  catch (_) { return false; }
}

async function banThread(Threads, tid, by) {
  const dateAdded = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true });
  const reason = "Banned by admin " + by + " (boxlist)";
  try {
    const row = await Threads.getData(tid);
    const data = (row && row.data) || {};
    data.banned = 1; data.reason = reason; data.dateAdded = dateAdded;
    await Threads.setData(tid, { data });
  } catch (e) { console.log("[BOXLIST] ban save error:", e && e.message); }
  try {
    if (global.data && global.data.threadBanned) global.data.threadBanned.set(String(tid), { reason, dateAdded });
  } catch (_) {}
}

async function unbanThread(Threads, tid) {
  try {
    const row = await Threads.getData(tid);
    const data = (row && row.data) || {};
    delete data.banned; delete data.reason; delete data.dateAdded;
    await Threads.setData(tid, { data });
  } catch (e) { console.log("[BOXLIST] unban save error:", e && e.message); }
  try {
    if (global.data && global.data.threadBanned) global.data.threadBanned.delete(String(tid));
  } catch (_) {}
}

/* ───────────── API helpers ───────────── */
const send = (api, msg, tid, replyTo) => new Promise(res => {
  try { api.sendMessage(msg, tid, (err, info) => res(err ? null : info), replyTo); }
  catch (_) { res(null); }
});

const getThreadList = (api, limit) => new Promise(res => {
  try { api.getThreadList(limit, null, ["INBOX"], (err, list) => res(err ? [] : (list || []))); }
  catch (_) { res([]); }
});

const getInfo = (api, id) => new Promise(res => {
  try { api.getThreadInfo(id, (err, info) => res(err ? null : info)); }
  catch (_) { res(null); }
});

async function collectGroups(api) {
  const botID = String(api.getCurrentUserID ? api.getCurrentUserID() : "");
  const ids = new Set();

  const list = await getThreadList(api, 100);
  for (const t of list) if (t && t.isGroup && t.threadID) ids.add(String(t.threadID));
  try {
    const all = (global.data && global.data.allThreadID) || [];
    for (const id of all) ids.add(String(id));
  } catch (_) {}

  const arr = [...ids];
  const groups = [];
  for (let i = 0; i < arr.length; i += 6) {
    const part = await Promise.all(arr.slice(i, i + 6).map(id => getInfo(api, id)));
    part.forEach((info, k) => {
      if (!info || info.isGroup === false) return;
      const members = (info.participantIDs || []).map(String);
      if (botID && members.length && !members.includes(botID)) return; // বট আর নেই
      groups.push({
        id: String(arr[i + k]),
        name: info.threadName || info.name || "Unnamed group",
        members: members.length,
        admins: (info.adminIDs || []).length,
        left: false
      });
    });
  }
  groups.sort((a, b) => b.members - a.members);
  return groups;
}

/* ───────────── Rendering ───────────── */
function renderPage(groups, page) {
  const pages = Math.max(1, Math.ceil(groups.length / PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * PER_PAGE;
  const slice = groups.slice(start, start + PER_PAGE);

  const rows = [
    "┃ 📊 " + bold("Total groups") + ": " + groups.length,
    "┃ 📄 " + bold("Page") + ": " + p + "/" + pages,
    "┣━━━━━━━━━━━━━━━━━━━━━━┫"
  ];

  if (!slice.length) rows.push("┃ 😶 কোনো গ্রুপ পাওয়া যায়নি।");

  slice.forEach((g, i) => {
    const n = start + i + 1;
    rows.push("┃ " + bold(String(n) + ".") + " " + g.name);
    rows.push("┃   🆔 " + g.id);
    rows.push("┃   👥 " + bold("Members") + ": " + g.members + "   🛡️ " + bold("Admins") + ": " + g.admins);
    rows.push("┃   " + approvalText(g.id));
    rows.push("┃   " + (g.left ? "🚪 Left" : (isBanned(g.id) ? "🚫 Banned" : "🟢 Active")));
    if (i < slice.length - 1) rows.push("┃ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈");
  });

  rows.push("┣━━━━━━━━━━━━━━━━━━━━━━┫");
  rows.push("┃ ↩️ " + bold("Reply") + ":");
  rows.push("┃  out 1 3   → লিভ নেবে");
  rows.push("┃  ban 2     → ব্যান");
  rows.push("┃  banout 4  → ব্যান + লিভ");
  rows.push("┃  unban 2   → ব্যান তুলবে");
  rows.push("┃  next / prev / page 2");

  return { text: box("📦 BOX LIST", rows), page: p, pages };
}

async function sendList(api, event, groups, page, author) {
  const r = renderPage(groups, page);
  const info = await send(api, r.text, event.threadID, event.messageID);
  if (info && info.messageID) {
    try {
      global.client.handleReply = (global.client.handleReply || []).filter(h => !(h.name === module.exports.config.name && h.author === String(author) && h.threadID === event.threadID));
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: String(author),
        threadID: event.threadID,
        groups,
        page: r.page
      });
    } catch (e) { console.log("[BOXLIST] handleReply push error:", e && e.message); }
  }
}

/* ───────────── Trigger (prefix ছাড়া / সহ) ───────────── */
module.exports.handleEvent = async function ({ api, event }) {
  try {
    if (!event || (event.type !== "message" && event.type !== "message_reply")) return;
    let t = String(event.body || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!t) return;
    const prefix = String((global.config && global.config.PREFIX) || ".").toLowerCase();
    if (prefix && t.startsWith(prefix)) t = t.slice(prefix.length).trim();
    if (!TRIGGERS.test(t)) return;

    // অ্যাডমিন না হলে একদম চুপ
    if (!isAdmin(event.senderID)) return;

    if (!creditOk()) {
      return api.sendMessage("⛔ BoxList নিষ্ক্রিয়: ক্রেডিট পরিবর্তন করা হয়েছে।\nআসল ক্রেডিট ফিরিয়ে দিন।", event.threadID, event.messageID);
    }
    if (!configOk()) {
      return api.sendMessage("⚠️ config.json-এ ADMINBOT পাওয়া যায়নি।", event.threadID, event.messageID);
    }

    api.sendMessage("⏳ গ্রুপ লিস্ট লোড হচ্ছে...", event.threadID, event.messageID);
    const groups = await collectGroups(api);
    await sendList(api, event, groups, 1, event.senderID);
  } catch (e) {
    console.log("[BOXLIST] handleEvent error:", e && e.message);
  }
};

// run ফাঁকা: ট্রিগার সব handleEvent-এ, যাতে দুইবার কাজ না করে
module.exports.run = function () {};

/* ───────────── Reply actions ───────────── */
module.exports.handleReply = async function ({ api, event, handleReply, Threads }) {
  try {
    if (String(event.senderID) !== String(handleReply.author)) return;
    if (!isAdmin(event.senderID)) return;
    if (!creditOk() || !configOk()) return;

    const text = String(event.body || "").trim().toLowerCase().replace(/[,،]/g, " ").replace(/\s+/g, " ");
    const parts = text.split(" ");
    const cmd = parts[0];
    const groups = handleReply.groups || [];

    // পেজ বদল
    if (cmd === "next" || cmd === "prev" || cmd === "page") {
      let page = handleReply.page || 1;
      if (cmd === "next") page++;
      else if (cmd === "prev") page--;
      else page = parseInt(parts[1], 10) || page;
      return sendList(api, event, groups, page, event.senderID);
    }

    if (!["out", "ban", "banout", "unban"].includes(cmd)) return;

    const nums = [...new Set(parts.slice(1).map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= groups.length))];
    if (!nums.length) {
      return api.sendMessage("❌ সঠিক নম্বর দিন। যেমন: " + cmd + " 1 3", event.threadID, event.messageID);
    }

    const botID = String(api.getCurrentUserID());
    const lines = [];

    for (const n of nums) {
      const g = groups[n - 1];
      let ok = true;

      try {
        if (cmd === "ban" || cmd === "banout") {
          await banThread(Threads, g.id, event.senderID);
          if (cmd === "ban") await send(api, "🚫 এই গ্রুপটি বট অ্যাডমিন ব্যান করেছেন।", g.id);
        }
        if (cmd === "unban") {
          await unbanThread(Threads, g.id);
          await send(api, "✅ এই গ্রুপের ব্যান তুলে নেওয়া হয়েছে।", g.id);
        }
        if (cmd === "out" || cmd === "banout") {
          await send(api, "👋 বট অ্যাডমিনের নির্দেশে বট এই গ্রুপ ছেড়ে যাচ্ছে।", g.id);
          await new Promise((res, rej) => {
            try { api.removeUserFromGroup(botID, g.id, err => (err ? rej(err) : res())); }
            catch (e) { rej(e); }
          });
          g.left = true;
        }
      } catch (e) {
        ok = false;
        console.log("[BOXLIST] action error:", e && (e.message || e.error || e));
      }

      lines.push("┃ " + (ok ? "✅" : "❌") + " " + n + ". " + g.name);
    }

    const label = { out: "লিভ নেওয়া হয়েছে", ban: "ব্যান করা হয়েছে", banout: "ব্যান + লিভ করা হয়েছে", unban: "আনব্যান করা হয়েছে" }[cmd];
    return api.sendMessage(
      box("✅ DONE", [...lines, "┃ ℹ️ " + label]),
      event.threadID,
      event.messageID
    );
  } catch (e) {
    console.log("[BOXLIST] handleReply error:", e && e.message);
  }
};
