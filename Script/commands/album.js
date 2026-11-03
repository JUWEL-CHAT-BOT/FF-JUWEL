module.exports.config = {
  name: "album",
  version: "1.0.0",
  hasPermission: 0,
  credits: "MR JUWEL",
  description: "Send a trending TikTok video",
  commandCategory: "video",
  usages: "",
  cooldowns: 5,
};

// === Rate limit storage ===
if (!global.albumRateLimit) global.albumRateLimit = {};

// === Bot Admin Check ===
function isBotAdmin(senderID) {
  try {
    const config = require(global.client.dirConfig || "./config.json");
    const adminList = config.ADMINBOT || [];
    return adminList.map(String).includes(String(senderID));
  } catch (e) {
    console.error("Admin check error:", e);
    return false;
  }
}

module.exports.run = async function ({ event: e, api: a, args: n }) {
  if (!n[0]) {
    const menu =
`╭───•𝙼𝚁 𝙹𝚄𝚆𝙴𝙻•───╮

━━💛𝚅𝙸𝙳𝙴𝙾🎀𝙰𝙻𝙱𝚄𝙼💛━━
!
!➤1 𝙸𝚂𝙻𝙰𝙼 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤2 𝙰𝙽𝙸𝙼𝙴 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤3 𝚂𝙷𝙰𝙸𝚁𝙸 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤4 𝚂𝙷𝙾𝚁𝚃 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤5 𝚂𝙰𝙳 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤6 𝚂𝚃𝙰𝚃𝚄𝚂 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤7 𝙵𝙾𝙾𝚃𝙱𝙰𝙻𝙻 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤8 𝙵𝚄𝙽𝙽𝚈 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤9 𝙻𝙾𝚅𝙴 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤10 𝙲𝙿𝙻 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤11 𝙱𝙰𝙱𝚈 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤12 𝙵𝚁𝙴𝙴 𝙵𝙸𝚁𝙴 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤13 𝙻𝙾𝙵𝙸 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤14 𝙷𝙰𝙿𝙿𝚈 𝚅𝙸𝙳𝙴𝙾◄┈╯
!
!➤15 𝙷𝚄𝙼𝙰𝙸𝚈𝚄𝙽 𝚂𝙸𝚁 𝚅𝙸𝙳𝙴𝙾◄┈╯
━━━━━━━━━━━━━━
𝙾𝚆𝙽𝙴𝚁: 𝙼𝚁 𝙹𝚄𝚆𝙴𝙻
𝙵𝙱: facebook.com/mrjuwel444
━━━━━━━━━━━━━━
𝙰 𝙿 𝙸 // 𝙹𝚄𝚆𝙴𝙻
╰──𝙼𝚁 𝙹𝚄𝚆𝙴𝙻 𝙿𝚁𝙾𝙹𝙴𝙲𝚃──╯

⚠️ 𝙽𝚘𝚝𝚎: 𝟸 𝚖𝚒𝚗𝚞𝚝𝚎𝚛 𝚖𝚘𝚍𝚍𝚑𝚎 𝚜𝚘𝚛𝚋𝚘𝚌𝚌𝚑𝚘 𝟻𝚝𝚒 𝚟𝚒𝚍𝚎𝚘 𝚗𝚒𝚝𝚎 𝚙𝚊𝚛𝚋𝚎𝚗।
(𝙱𝚘𝚝 𝙰𝚍𝚖𝚒𝚗 = 𝚄𝚗𝚕𝚒𝚖𝚒𝚝𝚎𝚍)

𝚃𝚎𝚕𝚕 𝚖𝚎 𝚑𝚘𝚠 𝚖𝚊𝚗𝚢 𝚟𝚒𝚍𝚎𝚘 𝚗𝚞𝚖𝚋𝚎𝚛𝚜 𝚢𝚘𝚞 𝚠𝚊𝚗𝚝 𝚝𝚘 𝚜𝚎𝚎 𝚋𝚢 𝚛𝚎𝚙𝚕𝚢𝚒𝚗𝚐 𝚝𝚑𝚒𝚜 𝚖𝚎𝚜𝚜𝚊𝚐𝚎`;

    return a.sendMessage(menu, e.threadID, (err, info) => {
      if (err) return;
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: e.senderID,
        type: "create"
      });
    }, e.messageID);
  }
};

module.exports.handleReply = async function ({ api: e, event: a, handleReply: t }) {
  try {
    if (t.author !== a.senderID) return;
    if (t.type !== "create") return;

    const senderID = a.senderID;
    const now = Date.now();
    const TIME_LIMIT = 2 * 60 * 1000; // ২ মিনিট
    const MAX_VIDEOS = 5;              // সাধারণ ইউজারের জন্য সর্বোচ্চ ৫টি

    // ✅ Bot Admin কিনা চেক
    const isAdmin = isBotAdmin(senderID);

    // === Rate limit check (শুধু non-admin এর জন্য) ===
    if (!isAdmin) {
      if (!global.albumRateLimit[senderID]) {
        global.albumRateLimit[senderID] = { count: 0, firstTime: now };
      }

      const userData = global.albumRateLimit[senderID];

      // ২ মিনিট পার হলে reset
      if (now - userData.firstTime >= TIME_LIMIT) {
        userData.count = 0;
        userData.firstTime = now;
      }

      // ৫টির বেশি হলে ব্লক
      if (userData.count >= MAX_VIDEOS) {
        const remaining = Math.ceil((TIME_LIMIT - (now - userData.firstTime)) / 1000);
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        return e.sendMessage(
          `⚠️ 𝙰𝚙𝚗𝚒 𝟸 𝚖𝚒𝚗𝚞𝚝𝚎𝚛 𝚖𝚘𝚍𝚍𝚑𝚎 𝚜𝚘𝚛𝚋𝚘𝚌𝚌𝚘 𝟻𝚝𝚒 𝚟𝚒𝚍𝚎𝚘 𝚗𝚒𝚢𝚎𝚌𝚑𝚎𝚗!\n\n⏳ 𝙰𝚋𝚊𝚛 𝚌𝚑𝚎𝚜𝚝𝚊 𝚔𝚘𝚛𝚞𝚗: ${min}𝚖 ${sec}𝚜 𝚙𝚘𝚛𝚎`,
          a.threadID,
          a.messageID
        );
      }
    }

    const choice = a.body.trim();
    const axios = require("axios");

    const apis = await axios.get('https://raw.githubusercontent.com/shaonproject/Shaon/main/api.json');
    const baseURL = apis.data.api;

    const options = {
      "1": "/video/islam",
      "2": "/video/anime",
      "3": "/video/shairi",
      "4": "/video/short",
      "5": "/video/sad",
      "6": "/video/status",
      "7": "/video/football",
      "8": "/video/funny",
      "9": "/video/love",
      "10": "/video/cpl",
      "11": "/video/baby",
      "12": "/video/kosto",
      "13": "/video/lofi",
      "14": "/video/happy",
      "15": "/video/humaiyun",
    };

    if (!options[choice]) {
      return e.sendMessage(
        "❌ 𝙸𝚗𝚟𝚊𝚕𝚒𝚍 𝚗𝚞𝚖𝚋𝚎𝚛! 𝟷 𝚝𝚑𝚎𝚔𝚎 𝟷𝟻 𝚙𝚘𝚛𝚓𝚘𝚗𝚝𝚘 𝚜𝚘𝚗𝚐𝚔𝚑𝚊 𝚍𝚒𝚗।",
        a.threadID,
        a.messageID
      );
    }

    const url = `${baseURL}${options[choice]}`;

    const response = await axios.get(url);
    const videoURL = response.data.data?.url || response.data.url || response.data.video || response.data.data;
    const title = response.data.title || response.data.shaon || "𝚅𝙸𝙳𝙴𝙾";
    const count = response.data.count || "1";

    if (!videoURL) {
      return e.sendMessage(
        "❌ 𝚅𝚒𝚍𝚎𝚘 𝚙𝚊𝚠𝚊 𝚑𝚘𝚢 𝚗𝚒! 𝙰𝚋𝚊𝚛 𝚌𝚑𝚎𝚜𝚝𝚊 𝚔𝚘𝚛𝚞𝚗।",
        a.threadID,
        a.messageID
      );
    }

    // Non-admin হলে count বাড়াও
    let limitText = "";
    if (!isAdmin) {
      global.albumRateLimit[senderID].count += 1;
      const remainingCount = MAX_VIDEOS - global.albumRateLimit[senderID].count;
      limitText = `\n📊 𝙰𝚙𝚗𝚊𝚛 𝚋𝚊𝚔𝚒 𝚕𝚒𝚖𝚒𝚝: ${remainingCount}/${MAX_VIDEOS}`;
    } else {
      limitText = `\n👑 𝙰𝚍𝚖𝚒𝚗: 𝚄𝚗𝚕𝚒𝚖𝚒𝚝𝚎𝚍`;
    }

    const videoStream = (await axios.get(videoURL, { responseType: "stream" })).data;

    return e.sendMessage({
      body:
`🟡 ${title}
𝚃𝙾𝚃𝙰𝙻 𝚅𝙸𝙳𝙴𝙾: ${count}${limitText}

𝙰 𝙿 𝙸 乛 𝙼𝚁 𝙹𝚄𝚆𝙴𝙻 ꜛ࿐`,
      attachment: videoStream
    }, a.threadID, a.messageID);

  } catch (err) {
    console.error(err);
    return e.sendMessage(`❌ 𝙴𝚛𝚛𝚘𝚛: ${err.message}`, a.threadID, a.messageID);
  }
};
