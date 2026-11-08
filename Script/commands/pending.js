const fs = require("fs-extra");
const path = require("path");
const approval = require("../../includes/approval");

const ADDER_CACHE_FILE = path.join(__dirname, "adderCache.json");

module.exports.config = {
  name: "pending",
  version: "1.6.0",
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
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
┃ ✅ APPROVED     ┃
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
  return global.config.ADMINBOT.includes(senderID);
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

// 📜 গ্রুপের হিস্ট্রি আনা (Promise হিসেবে)
function getHistory(api, threadID, amount) {
  return new Promise(resolve => {
    try {
      api.getThreadHistory(threadID, amount, undefined, (err, history) => {
        resolve(err ? [] : history || []);
      });
    } catch (e) {
      resolve([]);
    }
  });
}

// ===================================================
// কে অ্যাড করেছে সেটা বের করার ফাংশন
// ক্রম: cache -> log:subscribe হিস্ট্রি -> snippetSender (শেষ উপায়)
// ===================================================
async function resolveAdder(api, group, adderCache) {
  const botID = String(api.getCurrentUserID());
  let id = null;
  let name = null;

  // 1) cache
  const cached = adderCache[group.threadID];
  if (cached && cached.id) {
    id = String(cached.id);
    name = cached.name || null;
  }

  // 2) হিস্ট্রি থেকে "বটকে অ্যাড করা" লগ খোঁজা (সবচেয়ে নির্ভরযোগ্য)
  if (!id) {
    const history = await getHistory(api, group.threadID, 50);
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (m.type !== "event" || m.logMessageType !== "log:subscribe") continue;

      const added = (m.logMessageData && m.logMessageData.addedParticipants) || [];
      const botAdded = added.some(p => String(p.userFbId || p.userId || p.id) === botID);

      if (botAdded && m.author && String(m.author) !== botID) {
        id = String(m.author);
        break;
      }
    }
  }

  // 3) শেষ উপায়
  if (!id && group.snippetSender && String(group.snippetSender) !== botID) {
    id = String(group.snippetSender);
  }

  // নাম আনা (ফেইল করলেও আইডি/লিংক থাকবে)
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

// ===================================================
// handleReply : approve / reject
// ===================================================
module.exports.handleReply = async function ({ api, event, handleReply, getText }) {
  if (String(event.senderID) !== String(handleReply.author)) return;

  if (!isAdmin(event.senderID)) {
    return api.sendMessage(getText("noPermission"), event.threadID, event.messageID);
  }

  const { body, threadID, messageID } = event;
  let count = 0;

  // ❌ REJECT
  if ((isNaN(body) && body.toLowerCase().startsWith("c")) || body.toLowerCase().startsWith("cancel")) {
    const indexes = body.match(/\d+/g) || [];

    for (const num of indexes) {
      const index = parseInt(num);
      if (isNaN(index) || index <= 0 || index > handleReply.pending.length) {
        return api.sendMessage(getText("invaildNumber", num), threadID, messageID);
      }

      try {
        approval.remove(handleReply.pending[index - 1].threadID);
        await api.removeUserFromGroup(api.getCurrentUserID(), handleReply.pending[index - 1].threadID);
        count++;
      } catch (e) {}
    }

    return api.sendMessage(getText("cancelSuccess", count), threadID, messageID);
  }

  // ✅ APPROVE
  else {
    const indexes = body.match(/\d+/g) || [];

    for (const num of indexes) {
      const index = parseInt(num);
      if (isNaN(index) || index <= 0 || index > handleReply.pending.length) {
        return api.sendMessage(getText("invaildNumber", num), threadID, messageID);
      }

      const groupID = handleReply.pending[index - 1].threadID;
      approval.approve(groupID, event.senderID);
      count++;

      try {
        // 🔥 বটের নিকনেম সেট (config.json এর BOTNAME থেকে)
        try {
          const botName = global.config.BOTNAME;
          if (botName) {
            await api.changeNickname(botName, groupID, api.getCurrentUserID());
          }
        } catch (e) {}

        await new Promise(r => setTimeout(r, 800));

        // 🔥 NOTI BOX 2
        // config.json এর ADMINBOT এর ১ নাম্বার UID থেকে প্রোফাইল ও ইনবক্স লিংক
        const ownerUID = String((global.config.ADMINBOT || [])[0] || "");
        const fbLink = ownerUID ? `https://www.facebook.com/${ownerUID}` : "N/A";
        const inboxLink = ownerUID ? `https://m.me/${ownerUID}` : "N/A";
        const prefix = global.config.PREFIX;
        const botName = global.config.BOTNAME || "Bot";

        await api.sendMessage(
          `┏━━━━━━━━━━━━━━━━━━━┓
┃  👑 𝐁𝐎𝐓 𝐒𝐔𝐂𝐂𝐄𝐒𝐒𝐅𝐔𝐋𝐋𝐘 𝐀𝐃𝐃𝐄𝐃 👑
┗━━━━━━━━━━━━━━━━━━━┛

আসসালামু আলাইকুম সবাইকে 💚

📢 𝗔𝘁𝘁𝗲𝗻𝘁𝗶𝗼𝗻 𝗘𝘃𝗲𝗿𝘆𝗼𝗻𝗲!
এই গ্রুপে ${botName} বট সফলভাবে
যুক্ত ও সক্রিয় করা হয়েছে ✅
এখন থেকে সবাই বটের সব কমান্ড
ব্যবহার করতে পারবেন 🎉

┏━━━━━━━━━━━━━━━━━━━┓
┃ 🤖 Bot Status : ✅ Online
┃ 🎯 Prefix     : ${prefix}
┃ 📦 Commands   : ${prefix}help
┗━━━━━━━━━━━━━━━━━━━┛

📌 কীভাবে ব্যবহার করবেন?
📜 ${prefix}help  ➜ সব কমান্ডের লিস্ট
ℹ️ ${prefix}info  ➜ বটের তথ্য
👑 ${prefix}admin ➜ অ্যাডমিনের তথ্য

⚠️ নিয়ম: বটকে স্প্যাম করবেন না।
কোনো সমস্যা হলে অ্যাডমিনকে জানান 🌸

━━━━━━━━━━━━━━━━━━━━
👑 𝐎𝐰𝐧𝐞𝐫 ➢ 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐

💬 Profile : ${fbLink}
📥 Inbox   : ${inboxLink}
📱 WhatsApp: +8801943488192
━━━━━━━━━━━━━━━━━━━━
💚 ধন্যবাদ, ভালো থাকবেন সবাই 💚`,
          groupID
        );
      } catch (e) {}

      await new Promise(r => setTimeout(r, 1000));
    }

    return api.sendMessage(getText("approveSuccess", count), threadID, messageID);
  }
};

// ===================================================
// run : pending লিস্ট দেখানো
// ===================================================
module.exports.run = async function ({ api, event, args, getText }) {
  const { threadID, messageID, senderID } = event;

  if (!isAdmin(senderID)) {
    return api.sendMessage(getText("noPermission"), threadID, messageID);
  }

  // /pending <গ্রুপ আইডি> দিলে সরাসরি অনুমোদন
  if (args && /^\d{8,}$/.test(args[0] || "")) {
    const ok = await approval.approveById(api, args[0], senderID);
    return api.sendMessage(
      ok ? `✅ ${args[0]} গ্রুপ অনুমোদিত হয়েছে।` : `⚠️ ${args[0]} অনুমোদিত হয়েছে, কিন্তু গ্রুপে মেসেজ পাঠানো যায়নি।`,
      threadID, messageID
    );
  }

  try {
    const [spam, pending] = await Promise.all([
      api.getThreadList(100, null, ["OTHER"]),
      api.getThreadList(100, null, ["PENDING"])
    ]);

    const list = [...(spam || []), ...(pending || [])]
      .filter(group => group.isSubscribed && group.isGroup);

    if (list.length === 0) {
      return api.sendMessage(getText("returnListClean"), threadID, messageID);
    }

    const adderCache = loadAdderCache();

    // 🔥 GROUP INFO + ADDER + PROFILE LINK
    const msgArr = await Promise.all(list.map(async (group, index) => {
      const members = group.participantIDs?.length || 0;
      const adder = await resolveAdder(api, group, adderCache);

      return `┃ ${index + 1}. ${group.name || 'Unnamed'}
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
    console.error(e);
    return api.sendMessage(getText("cantGetPendingList"), threadID, messageID);
  }
};
