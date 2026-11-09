const fs = require("fs-extra");
const path = require("path");
const approval = require("../../includes/approval");

const ADDER_CACHE_FILE = path.join(__dirname, "adderCache.json");

module.exports.config = {
  name: "pending",
  version: "3.0.0",
  credits: "𝐌𝐑 𝐉𝐔𝐖𝐄𝐋",
  hasPermssion: 2,
  description: "Manage bot's pending group requests",
  commandCategory: "system",
  cooldowns: 5
};

module.exports.languages = {
  "en": {
    "invaildNumber": "❌ %1 is not a valid number",

    "noPermission": `┏━━━━━━━━━━━━━━━┓
┃ ❌ ONLY ADMIN   ┃
┗━━━━━━━━━━━━━━━┛`,

    "cancelSuccess": `┏━━━━━━━━━━━━━━━┓
┃ ❌ REJECT DONE  ┃
┣━━━━━━━━━━━━━━━┫
┃ %1 group rejected
┗━━━━━━━━━━━━━━━┛`,

    "approveSuccess": `┏━━━━━━━━━━━━━━━┓
┃ ✅ SUCCESS      ┃
┣━━━━━━━━━━━━━━━┫
┃ %1 group approved
┗━━━━━━━━━━━━━━━┛`,

    "cantGetPendingList": "❌ Failed to retrieve pending list!",

    "returnListClean": `┏━━━━━━━━━━━━━━━┓
┃ ✅ NO PENDING   ┃
┗━━━━━━━━━━━━━━━┛`,

    "returnListPending": `┏━━━━━━━━━━━━━━━┓
┃ 📜 PENDING LIST
┣━━━━━━━━━━━━━━━┫
┃ Total: %1 group(s)
┣━━━━━━━━━━━━━━━┫
%2
┣━━━━━━━━━━━━━━━┫
┃ ✔ 1 2 3 = approve
┃ ❌ c1 c2 = reject
┗━━━━━━━━━━━━━━━┛`
  }
};

// 🔒 ADMIN CHECK
function isAdmin(senderID) {
  return approval.isAdmin(senderID);
}

// 📂 cache লোড
function loadAdderCache() {
  try {
    if (fs.existsSync(ADDER_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ADDER_CACHE_FILE, "utf8"));
    }
  } catch (e) {}
  return {};
}

// callback ও promise দুই স্টাইলে গ্রুপ থেকে বের হওয়া
function leaveThread(api, botID, tid) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cb = err => {
      if (done) return;
      done = true;
      err ? reject(err) : resolve();
    };
    try {
      const r = api.removeUserFromGroup(botID, tid, cb);
      if (r && typeof r.then === "function") r.then(() => cb(), cb);
    } catch (e) {
      cb(e);
    }
  });
}

// ===================================================
// কে অ্যাড করেছে বের করা
// ক্রম: approval -> cache -> snippetSender -> approvalQueue -> adminIDs
// ===================================================
async function resolveAdder(api, group, adderCache) {
  const botID = String(api.getCurrentUserID());
  let id = null;
  let name = null;

  try {
    const p = approval.getPendingInfo(group.threadID);
    if (p && p.by && p.by !== "seed") id = String(p.by);
  } catch (_) {}

  const cached = adderCache[group.threadID];
  if (!id && cached && cached.id) {
    id = String(cached.id);
    name = cached.name || null;
  }

  if (!id && group.snippetSender && String(group.snippetSender) !== botID) {
    id = String(group.snippetSender);
  }

  if (!id) {
    try {
      const info = await api.getThreadInfo(group.threadID);
      if (info.approvalQueue && info.approvalQueue.length > 0) {
        id = String(info.approvalQueue[0].requesterID);
      } else if (info.adminIDs && info.adminIDs.length > 0) {
        const a = info.adminIDs[0];
        id = String(a.id || a);
      }
    } catch (e) {
      console.log("[pending] getThreadInfo failed:", group.threadID, e.message || e);
    }
  }

  if (id && !name) {
    try {
      const u = await api.getUserInfo(id);
      name = (u && u[id] && u[id].name) || null;
    } catch (e) {
      console.log("[pending] getUserInfo failed:", id, e.message || e);
    }
  }

  return {
    id,
    name: name || "Unknown",
    link: id ? `https://www.facebook.com/${id}` : "Not Available"
  };
}

// ⏱️ আপটাইম
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

// ===================================================
// অনুমোদনের পর গ্রুপে নিকনেম (BOTNAME) + জয়েন মেসেজ
// ===================================================
async function welcomeGroup(api, groupID) {
  const cfg = global.config || {};
  const prefix = cfg.PREFIX || "/";
  const botName = cfg.BOTNAME || "BOT";

  const ownerUID = String((cfg.ADMINBOT || [])[0] || "").trim();
  const msgLink = ownerUID ? `https://m.me/${ownerUID}` : "N/A";

  let totalCmds = "N/A";
  try {
    if (global.client && global.client.commands) totalCmds = global.client.commands.size;
  } catch (_) {}

  const uptime = formatUptime(process.uptime());

  // নিকনেম সেট (config.json এর BOTNAME)
  if (cfg.BOTNAME) {
    try {
      await api.changeNickname(cfg.BOTNAME, groupID, api.getCurrentUserID());
    } catch (e) {
      console.log("[pending] nickname error:", groupID, e && e.message ? e.message : e);
    }
  }

  await new Promise(r => setTimeout(r, 800));

  await api.sendMessage(
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
}

// ===================================================
// পেন্ডিং লিস্ট: ফেসবুক PENDING/OTHER + approval.js পেন্ডিং
// ===================================================
async function buildPendingList(api) {
  const [spam, pending] = await Promise.all([
    api.getThreadList(100, null, ["OTHER"]).catch(() => []),
    api.getThreadList(100, null, ["PENDING"]).catch(() => [])
  ]);

  const map = new Map();

  for (const g of [...(spam || []), ...(pending || [])]) {
    if (g && g.isGroup && g.isSubscribed && !approval.isApproved(g.threadID)) {
      map.set(String(g.threadID), g);
    }
  }

  for (const tid of approval.pendingList()) {
    if (!map.has(String(tid)) && !approval.isApproved(tid)) {
      let g = { threadID: String(tid), name: null, participantIDs: null };
      try {
        const info = await api.getThreadInfo(tid);
        g.name = info.threadName || info.name || null;
        g.participantIDs = info.participantIDs || [];
      } catch (_) {}
      map.set(String(tid), g);
    }
  }

  return [...map.values()];
}

// ===================================================
// handleReply : approve / reject
// ===================================================
module.exports.handleReply = async function ({ api, event, handleReply, getText }) {
  if (String(event.senderID) !== String(handleReply.author)) return;

  if (!isAdmin(event.senderID)) {
    return api.sendMessage(getText("noPermission"), event.threadID, event.messageID);
  }

  const { body, threadID, messageID } = event;
  const botID = api.getCurrentUserID();
  let count = 0;

  // ❌ REJECT
  if ((isNaN(body) && body.toLowerCase().startsWith("c")) || body.toLowerCase().startsWith("cancel")) {
    const indexes = body.match(/\d+/g) || [];

    for (const num of indexes) {
      const index = parseInt(num);
      if (isNaN(index) || index <= 0 || index > handleReply.pending.length) {
        return api.sendMessage(getText("invaildNumber", num), threadID, messageID);
      }

      const gid = handleReply.pending[index - 1].threadID;
      try {
        await leaveThread(api, botID, gid);
        approval.remove(gid);
        count++;
      } catch (e) {
        console.log("[pending] reject error:", gid, e && e.message ? e.message : e);
      }
    }

    return api.sendMessage(getText("cancelSuccess", count), threadID, messageID);
  }

  // ✅ APPROVE
  const indexes = body.match(/\d+/g) || [];

  for (const num of indexes) {
    const index = parseInt(num);
    if (isNaN(index) || index <= 0 || index > handleReply.pending.length) {
      return api.sendMessage(getText("invaildNumber", num), threadID, messageID);
    }

    const groupID = handleReply.pending[index - 1].threadID;

    // আগে অনুমোদন, তারপর মেসেজ
    approval.approve(groupID, event.senderID);
    count++;

    try {
      await welcomeGroup(api, groupID);
    } catch (e) {
      console.log("[pending] welcome error:", groupID, e && e.message ? e.message : e);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  return api.sendMessage(getText("approveSuccess", count), threadID, messageID);
};

// ===================================================
// run : pending লিস্ট দেখানো
// ===================================================
module.exports.run = async function ({ api, event, args, getText }) {
  const { threadID, messageID, senderID } = event;

  if (!isAdmin(senderID)) {
    return api.sendMessage(getText("noPermission"), threadID, messageID);
  }

  // pending <গ্রুপ আইডি> → সরাসরি অ্যাপ্রুভ
  if (args && /^\d{8,}$/.test(args[0] || "")) {
    approval.approve(args[0], senderID);
    try {
      await welcomeGroup(api, args[0]);
    } catch (e) {
      console.log("[pending] welcome error:", args[0], e && e.message ? e.message : e);
    }
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
        if (!error) {
          global.client.handleReply.push({
            name: this.config.name,
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
