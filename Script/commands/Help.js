const fs = require("fs-extra");
const axios = require("axios");

module.exports.config = {
  name: "help",
  version: "5.0.0",
  hasPermssion: 0,
  credits: "乛 MR ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "All commands in one serial list + command info",
  commandCategory: "system",
  usages: "[command name]",
  cooldowns: 5
};

// ── 𝐁𝐨𝐥𝐝 𝐒𝐞𝐫𝐢𝐟 𝐅𝐨𝐧𝐭 ──
function toBold(text) {
  const map = {
    'A':'𝐀','B':'𝐁','C':'𝐂','D':'𝐃','E':'𝐄','F':'𝐅','G':'𝐆','H':'𝐇','I':'𝐈','J':'𝐉',
    'K':'𝐊','L':'𝐋','M':'𝐌','N':'𝐍','O':'𝐎','P':'𝐏','Q':'𝐐','R':'𝐑','S':'𝐒','T':'𝐓',
    'U':'𝐔','V':'𝐕','W':'𝐖','X':'𝐗','Y':'𝐘','Z':'𝐙',
    'a':'𝐚','b':'𝐛','c':'𝐜','d':'𝐝','e':'𝐞','f':'𝐟','g':'𝐠','h':'𝐡','i':'𝐢','j':'𝐣',
    'k':'𝐤','l':'𝐥','m':'𝐦','n':'𝐧','o':'𝐨','p':'𝐩','q':'𝐪','r':'𝐫','s':'𝐬','t':'𝐭',
    'u':'𝐮','v':'𝐯','w':'𝐰','x':'𝐱','y':'𝐲','z':'𝐳'
  };
  return String(text).split('').map(c => map[c] || c).join('');
}

// ── 𝐁𝐨𝐥𝐝 𝐍𝐮𝐦𝐛𝐞𝐫 ──
function toBoldNumber(num) {
  const b = {'0':'𝟎','1':'𝟏','2':'𝟐','3':'𝟑','4':'𝟒','5':'𝟓','6':'𝟔','7':'𝟕','8':'𝟖','9':'𝟗'};
  return num.toString().split('').map(d => b[d] || d).join('');
}

// ── ⏳ সেটিংস: ৫ মিনিট (মিলিসেকেন্ডে) ──
const USER_COOLDOWN = 5 * 60 * 1000;   // একই ইউজার ৫ মিনিটের আগে আবার help দিতে পারবে না
const AUTO_DELETE   = 5 * 60 * 1000;   // ৫ মিনিট পর মেসেজ অটো ডিলিট
const userCooldowns = new Map();       // senderID => শেষবার help দেওয়ার সময়

// ── 🗑️ ৫ মিনিট পর মেসেজ ডিলিট করার ফাংশন ──
function scheduleDelete(api, info) {
  if (!info || !info.messageID) return;
  setTimeout(() => {
    try { api.unsendMessage(info.messageID); } catch (e) {}
  }, AUTO_DELETE);
}

// ── মেসেজ পাঠিয়ে ৫ মিনিট পর অটো ডিলিট ──
function sendAutoDelete(api, msg, threadID, replyID) {
  return api.sendMessage(msg, threadID, (err, info) => {
    if (!err) scheduleDelete(api, info);
  }, replyID);
}

// ── Prefix নেওয়ার ফাংশন ──
function getPrefix() {
  let prefix = global.config?.PREFIX || "!";
  try {
    const configPath = __dirname + "/../../config.json";
    if (fs.existsSync(configPath)) {
      const cfgJson = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (cfgJson.PREFIX) prefix = cfgJson.PREFIX;
    }
  } catch (e) {}
  return prefix;
}

// ── 📋 নির্দিষ্ট কমান্ডের তথ্য ──
async function sendCommandInfo(api, event, commandName) {
  const { threadID, messageID } = event;
  const { commands } = global.client;
  const prefix = getPrefix();

  const cmd = commands.get(commandName.toLowerCase());
  if (!cmd) {
    return sendAutoDelete(api,
      `╔══════════════════════╗\n║  ❌ 𝐍𝐎𝐓 𝐅𝐎𝐔𝐍𝐃 ❌  ║\n╚══════════════════════╝\n\n` +
      `「 ${toBold(commandName)} 」 নামে কোনো কমান্ড নেই!\n\n` +
      `📌 সব কমান্ড দেখতে লিখুন: ${prefix}help`,
      threadID, messageID
    );
  }

  const cfg = cmd.config || {};

  let botName = "⎯꯭𓆩꯭𝆺𝅥😻⃞𝐑⃞𝐈⃞𝐘⃞𝐀⃞༢࿐";
  let ownerName = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
  try {
    const configPath = __dirname + "/../../config.json";
    if (fs.existsSync(configPath)) {
      const cfgJson = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (cfgJson.BOTNAME) botName = cfgJson.BOTNAME;
      if (cfgJson.OWNER_NAME) ownerName = cfgJson.OWNER_NAME;
    }
  } catch (e) {}

  const permMap = { 0: "👤 𝐀𝐥𝐥 𝐔𝐬𝐞𝐫", 1: "🛡️ 𝐆𝐫𝐨𝐮𝐩 𝐀𝐝𝐦𝐢𝐧", 2: "👑 𝐁𝐨𝐭 𝐀𝐝𝐦𝐢𝐧", 3: "🔱 𝐎𝐰𝐧𝐞𝐫" };
  const perm = permMap[cfg.hasPermssion] || "👤 𝐀𝐥𝐥 𝐔𝐬𝐞𝐫";

  const infoText = `╔══════════════════════╗
║   ✨ 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐈𝐍𝐅𝐎 ✨   ║
╠══════════════════════╣
║
║ 🔖 𝐍𝐚𝐦𝐞 ⇢ ${toBold(cfg.name || commandName)}
║ 📄 𝐔𝐬𝐚𝐠𝐞 ⇢ ${toBold(cfg.usages || "No usage")}
║ 📜 𝐃𝐞𝐬𝐜 ⇢ ${toBold(cfg.description || "No description")}
║ 🔑 𝐏𝐞𝐫𝐦 ⇢ ${perm}
║ 👨‍💻 𝐂𝐫𝐞𝐝𝐢𝐭 ⇢ ${cfg.credits || "Unknown"}
║ 📂 𝐂𝐚𝐭𝐞𝐠𝐨𝐫𝐲 ⇢ ${toBold(cfg.commandCategory || "system")}
║ ⏳ 𝐂𝐨𝐨𝐥𝐝𝐨𝐰𝐧 ⇢ ${toBoldNumber(cfg.cooldowns || 0)}s
║
╠══════════════════════╣
║ ⚙ 𝐏𝐫𝐞𝐟𝐢𝐱 ⇢ ${prefix}
║ 🤖 𝐁𝐨𝐭 ⇢ ${botName}
║ 👑 𝐎𝐰𝐧𝐞𝐫 ⇢ ${ownerName}
╚══════════════════════╝`;

  return sendAutoDelete(api, infoText, threadID, messageID);
}

// ── 🔥 Main Help Function ──
async function sendHelp(api, event, args) {
  if (args && args.length > 0) {
    return sendCommandInfo(api, event, args[0].trim());
  }

  const { commands } = global.client;
  const { threadID, messageID } = event;
  const prefix = getPrefix();

  // সব কমান্ড এক লিস্টে (A-Z), এক সিরিয়ালে
  const allCmds = [...new Set(
    [...commands.keys()].map(n => (n || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  let commandList = "";
  allCmds.forEach((cmd, i) => {
    commandList += `│ ${toBoldNumber(i + 1)} ཐི༏ཋྀ ${toBold(cmd)}\n`;
  });

  const finalText = `
╔══════════════════════╗
║    ✿ 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐋𝐈𝐒𝐓 ✿
╚══════════════════════╝

╭──────────────────────╮
${commandList}╰──────────────────────╯

╔══════════════════════╗
║  ✦ 𝐓𝐨𝐭𝐚𝐥: ${toBoldNumber(allCmds.length)} 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 ✦
║  📌 𝐈𝐧𝐟𝐨: ${prefix}help <cmd>
╚══════════════════════╝
`;

  const cacheDir = __dirname + "/cache";
  const imgPath = cacheDir + "/helpallbg.jpg";
  const bg = "https://i.imgur.com/MZOc4a3.jpeg";

  try {
    fs.ensureDirSync(cacheDir);

    const res = await axios({
      url: encodeURI(bg),
      method: "GET",
      responseType: "stream",
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const writer = fs.createWriteStream(imgPath);
    res.data.pipe(writer);

    writer.on("finish", () => {
      api.sendMessage(
        { body: finalText, attachment: fs.createReadStream(imgPath) },
        threadID,
        (err, info) => {
          try { fs.unlinkSync(imgPath); } catch (e) {}
          if (!err) scheduleDelete(api, info);
        },
        messageID
      );
    });

    writer.on("error", () => {
      sendAutoDelete(api, finalText, threadID, messageID);
    });

  } catch (error) {
    console.error("Error:", error);
    sendAutoDelete(api, finalText, threadID, messageID);
  }
}

// ── শুধু prefix দিয়ে চলবে (noprefix বন্ধ) ──
module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const now = Date.now();
  const last = userCooldowns.get(senderID);

  if (last && now - last < USER_COOLDOWN) {
    const remain = Math.ceil((USER_COOLDOWN - (now - last)) / 1000);
    const min = Math.floor(remain / 60);
    const sec = remain % 60;
    return sendAutoDelete(
      api,
      `⏳ ${toBold("Cooldown")}!\n\n` +
      `আপনি এইমাত্র help কমান্ড ব্যবহার করেছেন।\n` +
      `আবার ব্যবহার করতে অপেক্ষা করুন: ${min} মিনিট ${sec} সেকেন্ড`,
      threadID, messageID
    );
  }

  userCooldowns.set(senderID, now);
  return sendHelp(api, event, args);
};
