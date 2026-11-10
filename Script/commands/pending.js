const fs = require("fs");
const path = require("path");

// ✅ approval মডিউল সেফ লোড
let approval = null;
try {
  approval = require("../../includes/approval");
} catch (e) {
  console.error("[pending] approval module missing:", e.message);
}

const ADDER_CACHE_FILE = path.join(__dirname, "adderCache.json");

/* ========== callback + promise দুই স্টাইলের API-ই সাপোর্ট করে ========== */
function callApi(api, method, ...args) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cb = (err, data) => {
      if (done) return;
      done = true;
      err ? reject(err) : resolve(data);
    };
    try {
      if (typeof api[method] !== "function") return cb(new Error(`api.${method} is not a function`));
      const r = api[method](...args, cb);
      if (r && typeof r.then === "function") r.then(d => cb(null, d), e => cb(e || new Error("unknown error")));
    } catch (e) { cb(e); }
  });
}

/* ========== Safe wrappers for approval API ========== */
function _isApproved(tid) {
  try { return approval && typeof approval.isApproved === "function" ? !!approval.isApproved(tid) : false; } catch { return false; }
}

function _isAdmin(uid) {
  const uidStr = String(uid || "").trim();
  if (!uidStr) return false;

  try {
    const cfg = global.config || {};
    const adminList = [
      ...(Array.isArray(cfg.ADMINBOT)   ? cfg.ADMINBOT   : []),
      ...(Array.isArray(cfg.SUPERADMIN) ? cfg.SUPERADMIN : []),
      ...(Array.isArray(cfg.ADMIN)      ? cfg.ADMIN      : [])
    ];
    if (adminList.some(a => String(a).trim() === uidStr)) return true;
  } catch (e) {
    console.log("[pending] config admin check err:", e.message);
  }

  try {
    if (approval && typeof approval.isAdmin === "function") {
      return !!approval.isAdmin(uid);
    }
  } catch {}

  return false;
}

function _approve(tid, by) {
  try { approval && approval.approve && approval.approve(tid, by); } catch (e) { console.error("[pending] approve err:", e.message); }
}
function _remove(tid) {
  try { approval && approval.remove && approval.remove(tid); } catch (e) { console.error("[pending] remove err:", e.message); }
}
function _getPendingInfo(tid) {
  try { return approval && approval.getPendingInfo ? approval.getPendingInfo(tid) : null; } catch { return null; }
}
function _pendingList() {
  try {
    if (!approval || typeof approval.pendingList !== "function") return [];
    const r = approval.pendingList();
    let arr = [];
    if (Array.isArray(r)) arr = r;
    else if (r && typeof r === "object") arr = Object.keys(r);
    return arr
      .map(x => String(x && typeof x === "object" ? (x.threadID || x.tid || x.id) : x))
      .filter(x => /^\d+$/.test(x));
  } catch { return []; }
}

/* ========== Module exports ========== */
module.exports.config = {
  name: "pending",
  version: "3.2.0",
  credits: "𝐌𝐑 𝐉𝐔𝐖𝐄𝐋",
  hasPermssion: 2,
  description: "Manage bot's pending group requests (config ADMINBOT users allowed)",
  commandCategory: "system",
  cooldowns: 5
};

module.exports.languages = {
  en: {
    invaildNumber: "❌ %1 is not a valid number",
    noPermission: `┏━━━━━━━━━━━━━━━┓\n┃ ❌ ONLY ADMIN   ┃\n┗━━━━━━━━━━━━━━━┛`,
    cancelSuccess: `┏━━━━━━━━━━━━━━━┓\n┃ ❌ REJECT DONE  ┃\n┣━━━━━━━━━━━━━━━┫\n┃ %1 group rejected\n┗━━━━━━━━━━━━━━━┛`,
    approveSuccess: `┏━━━━━━━━━━━━━━━┓\n┃ ✅ SUCCESS      ┃\n┣━━━━━━━━━━━━━━━┫\n┃ %1 group approved\n┗━━━━━━━━━━━━━━━┛`,
    cantGetPendingList: "❌ Failed to retrieve pending list!",
    returnListClean: `┏━━━━━━━━━━━━━━━┓\n┃ ✅ NO PENDING   ┃\n┗━━━━━━━━━━━━━━━┛`,
    returnListPending: `┏━━━━━━━━━━━━━━━┓\n┃ 📜 PENDING LIST\n┣━━━━━━━━━━━━━━━┫\n┃ Total: %1 group(s)\n┣━━━━━━━━━━━━━━━┫\n%2\n┣━━━━━━━━━━━━━━━┫\n┃ ✔ 1 2 3 = approve\n┃ ❌ c1 c2 = reject\n┗━━━━━━━━━━━━━━━┛`
  }
};

/* ========== Helpers ========== */
function loadAdderCache() {
  try {
    if (fs.existsSync(ADDER_CACHE_FILE))
      return JSON.parse(fs.readFileSync(ADDER_CACHE_FILE, "utf8"));
  } catch (e) {}
  return {};
}

function leaveThread(api, botID, tid) {
  return callApi(api, "removeUserFromGroup", botID, tid);
}

async function resolveAdder(api, group, adderCache) {
  const botID = String(api.getCurrentUserID());
  let id = null, name = null;

  const p = _getPendingInfo(group.threadID);
  if (p && p.by && p.by !== "seed") id = String(p.by);

  const cached = adderCache[group.threadID];
  if (!id && cached && cached.id) {
    id = String(cached.id);
    name = cached.name || null;
  }

  if (!id && group.snippetSender && String(group.snippetSender) !== botID)
    id = String(group.snippetSender);

  if (!id) {
    try {
      const info = await callApi(api, "getThreadInfo", group.threadID);
      if (info.approvalQueue?.length > 0) id = String(info.approvalQueue[0].requesterID);
      else if (info.adminIDs?.length > 0) id = String(info.adminIDs[0].id || info.adminIDs[0]);
    } catch (e) {
      console.log("[pending] getThreadInfo failed:", group.threadID, e && e.message ? e.message : e);
    }
  }

  if (id && !name) {
    try {
      const u = await callApi(api, "getUserInfo", id);
      name = u?.[id]?.name || null;
    } catch (e) {
      console.log("[pending] getUserInfo failed:", id, e && e.message ? e.message : e);
    }
  }

  return {
    id,
    name: name || "Unknown",
    link: id ? `https://www.facebook.com/${id}` : "Not Available"
  };
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

async function welcomeGroup(api, groupID) {
  const cfg = global.config || {};
  const prefix = cfg.PREFIX || "/";
  const botName = cfg.BOTNAME || "BOT";
  const ownerUID = String((cfg.ADMINBOT || [])[0] || "").trim();
  const msgLink = ownerUID ? `https://m.me/${ownerUID}` : "N/A";

  let totalCmds = "N/A";
  try { if (global.client?.commands) totalCmds = global.client.commands.size; } catch {}

  const uptime = formatUptime(process.uptime());

  if (cfg.BOTNAME) {
    try { await callApi(api, "changeNickname", cfg.BOTNAME, groupID, api.getCurrentUserID()); }
    catch (e) { console.log("[pending] nickname err:", groupID, e && e.message ? e.message : e); }
  }

  await new Promise(r => setTimeout(r, 800));

  try {
    await callApi(api, "sendMessage",
`╭─━━━━━━━━━━━━━━━━─╮
   🌸 আসসালামু আলাইকুম 🌸
╰─━━━━━━━━━━━━━━━━─╯

🥰 চলে এসেছি তোমাদের মাঝে!
এখন থেকে তোমাদের সাথে আড্ডা দিব,
মজা করব আর সব কাজে পাশে থাকব ✨

┏━━━━━━━━━━━━━━━━━━┓
┃ 🏷️ Name : ${botName}
┃ ⚙️ Prefix : ${prefix}
┃ 🔰 Mode : Active
┃ 📦 Commands : ${totalCmds}
┃ ⏱️ Uptime : ${uptime}
┃ 🟢 Status : Online
┗━━━━━━━━━━━━━━━━━━┛

📖 Menu  ➜ ${prefix}help
ℹ️ Info  ➜ ${prefix}info
👑 Admin ➜ ${prefix}admin

💬 Message Admin: ${msgLink}

💖 আমাকে অ্যাড করার জন্য ধন্যবাদ!`,
      groupID
    );
  } catch (e) {
    console.log("[pending] welcome msg err:", groupID, e && e.message ? e.message : e);
  }
}

/* ========== Pending list builder (FIXED) ========== */
async function buildPendingList(api) {
  const map = new Map();

  for (const type of ["PENDING", "OTHER"]) {
    try {
      const list = (await callApi(api, "getThreadList", 100, null, [type])) || [];
      console.log(`[pending] ${type}: ${list.length} thread(s) found`);

      for (const g of list) {
        if (!g || !g.threadID) continue;
        const tid = String(g.threadID);

        // isGroup ঠিকমতো না এলে participant সংখ্যা দিয়ে চেক
        const isGroup =
          g.isGroup === true ||
          (Array.isArray(g.participantIDs) && g.participantIDs.length > 2);

        const approved = _isApproved(tid);
        console.log(`[pending] ${tid} isGroup=${g.isGroup} approved=${approved}`);

        if (isGroup && !approved) map.set(tid, g);
      }
    } catch (e) {
      console.log(`[pending] getThreadList ${type} err:`, e && e.message ? e.message : e);
    }
  }

  // approval মডিউলের নিজস্ব pending লিস্ট থেকেও যোগ করো
  for (const tid of _pendingList()) {
    if (!map.has(tid) && !_isApproved(tid)) {
      const g = { threadID: tid, name: null, participantIDs: null };
      try {
        const info = await callApi(api, "getThreadInfo", tid);
        g.name = info.threadName || info.name || null;
        g.participantIDs = info.participantIDs || [];
      } catch {}
      map.set(tid, g);
    }
  }

  return [...map.values()];
}

/* ========== handleReply ========== */
module.exports.handleReply = async function ({ api, event, handleReply, getText }) {
  const { body, threadID, messageID, senderID } = event;

  if (String(senderID) !== String(handleReply.author)) return;

  if (!_isAdmin(senderID)) {
    return api.sendMessage(getText("noPermission"), threadID, messageID);
  }

  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return;

  const botID = api.getCurrentUserID();
  const lower = text.toLowerCase();
  const indexes = text.match(/\d+/g) || [];
  if (indexes.length === 0) {
    return api.sendMessage("❌ No valid number found.", threadID, messageID);
  }

  // ❌ REJECT
  if (lower.startsWith("c")) {
    let count = 0;
    for (const num of indexes) {
      const idx = parseInt(num);
      if (isNaN(idx) || idx <= 0 || idx > handleReply.pending.length) {
        api.sendMessage(getText("invaildNumber", num), threadID);
        continue;
      }
      const gid = handleReply.pending[idx - 1].threadID;
      try {
        await leaveThread(api, botID, gid);
        _remove(gid);
        count++;
      } catch (e) {
        console.log("[pending] reject err:", gid, e && e.message ? e.message : e);
      }
    }
    return api.sendMessage(getText("cancelSuccess", count), threadID, messageID);
  }

  // ✅ APPROVE
  let count = 0;
  for (const num of indexes) {
    const idx = parseInt(num);
    if (isNaN(idx) || idx <= 0 || idx > handleReply.pending.length) {
      api.sendMessage(getText("invaildNumber", num), threadID);
      continue;
    }
    const gid = handleReply.pending[idx - 1].threadID;

    _approve(gid, senderID);
    count++;

    try { await welcomeGroup(api, gid); }
    catch (e) { console.log("[pending] welcome err:", gid, e && e.message ? e.message : e); }

    await new Promise(r => setTimeout(r, 1000));
  }

  return api.sendMessage(getText("approveSuccess", count), threadID, messageID);
};

/* ========== run ========== */
module.exports.run = async function ({ api, event, args, getText }) {
  const { threadID, messageID, senderID } = event;

  if (!_isAdmin(senderID)) {
    return api.sendMessage(getText("noPermission"), threadID, messageID);
  }

  // pending <groupID> — সরাসরি অ্যাপ্রুভ
  if (args && /^\d{8,}$/.test(args[0] || "")) {
    _approve(args[0], senderID);
    try { await welcomeGroup(api, args[0]); }
    catch (e) { console.log("[pending] welcome err:", args[0], e && e.message ? e.message : e); }
    return api.sendMessage(getText("approveSuccess", 1), threadID, messageID);
  }

  try {
    const list = await buildPendingList(api);

    if (list.length === 0) {
      return api.sendMessage(getText("returnListClean"), threadID, messageID);
    }

    const adderCache = loadAdderCache();
    const msgArr = await Promise.all(list.map(async (group, index) => {
      const members = group.participantIDs ? group.participantIDs.length : 0;
      const adder = await resolveAdder(api, group, adderCache);
      return `┃ ${index + 1}. ${group.name || "Unnamed"}
┃ 🆔 ${group.threadID}
┃ 👥 ${members} members
┃ 👤 ${adder.name}
┃ 🔗 ${adder.link}`;
    }));

    const msg = msgArr.join("\n┣━━━━━━━━━━━━━━━┫\n");

    return api.sendMessage(
      getText("returnListPending", list.length, msg),
      threadID,
      (error, info) => {
        if (!error && global.client?.handleReply && Array.isArray(global.client.handleReply)) {
          global.client.handleReply.push({
            name: module.exports.config.name,
            messageID: info.messageID,
            author: senderID,
            pending: list
          });
        }
      },
      messageID
    );
  } catch (e) {
    console.error("[pending] list error:", e);
    return api.sendMessage(getText("cantGetPendingList"), threadID, messageID);
  }
};
