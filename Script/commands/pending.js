const fs = require("fs-extra");
const path = require("path");

const ADDER_CACHE_FILE = path.join(__dirname, "adderCache.json");

module.exports.config = {
  name: "pending",
  version: "1.3.0",
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

// ===================================================
// কে অ্যাড করেছে সেটা বের করার ফাংশন
// ক্রম: cache -> snippetSender -> approvalQueue -> adminIDs
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

  // 2) thread list এর snippetSender (শেষ লগ মেসেজের প্রেরক)
  if (!id && group.snippetSender && String(group.snippetSender) !== botID) {
    id = String(group.snippetSender);
  }

  // 3) threadInfo: approvalQueue -> adminIDs
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
      count++;

      try {
        // 🔥 NOTI BOX 1
        await api.sendMessage(
          `চ্ঁলে্ঁ এ্ঁসে্ঁছি্ঁ ⎯꯭𓆩꯭𝆺𝅥😻⃞𝐑⃞𝐈⃞𝐘⃞𝐀⃞༢࿐ এঁখঁনঁ তোঁমাঁদেঁরঁ সাঁথেঁ আঁড্ডাঁ দিঁবঁ..!😘`,
          groupID
        );

        // 🔥 বটের নিকনেম সেট
        try {
          await api.changeNickname(
            "⎯꯭𓆩꯭𝆺𝅥😻⃞𝐑⃞𝐈⃞𝐘⃞𝐀⃞༢࿐",
            groupID,
            api.getCurrentUserID()
          );
        } catch (e) {}

        await new Promise(r => setTimeout(r, 800));

        // 🔥 NOTI BOX 2
        await api.sendMessage(
          `╭•┄┅═══❁🌺❁═══┅┄•╮
আ্ঁস্ঁসা্ঁলা্ঁমু্ঁ💚আ্ঁলা্ঁই্ঁকু্ঁম্ঁ
╰•┄┅═══❁🌺❁═══┅┄•╯

𝐓𝐡𝐚𝐧𝐤 𝐲𝐨𝐮 𝐬𝐨 𝐦𝐮𝐜𝐡 𝐟𝐨𝐫 𝐚𝐝𝐝𝐢𝐧𝐠 𝐦𝐞 𝐭𝐨 𝐲𝐨𝐮𝐫 𝐠𝐫𝐨𝐮𝐩! 🖤🤗
𝐈 𝐰𝐢𝐥𝐥 𝐚𝐥𝐰𝐚𝐲𝐬 𝐬𝐞𝐫𝐯𝐞 𝐲𝐨𝐮 𝐢𝐧𝐬𝐡𝐚𝐀𝐥𝐥𝐚𝐡 🌺❤️

𝐂𝐨𝐦𝐦𝐚𝐧𝐝 𝐋𝐢𝐬𝐭:
${global.config.PREFIX}help
${global.config.PREFIX}info
${global.config.PREFIX}admin

➤ Messenger: mrjuwel444
➤ WhatsApp: +8801943488192

❖⋆══════════════⋆❖
𝐎𝐰𝐧𝐞𝐫➢乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐`,
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
module.exports.run = async function ({ api, event, getText }) {
  const { threadID, messageID, senderID } = event;

  if (!isAdmin(senderID)) {
    return api.sendMessage(getText("noPermission"), threadID, messageID);
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
