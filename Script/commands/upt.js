const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "upt",
  version: "3.7.0",
  hasPermssion: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Stylish Uptime Text Notice",
  commandCategory: "system",
  usages: "upt",
  cooldowns: 5
};

// কাউন্ট ফাইলে সেভ হবে, রিস্টার্টেও হারাবে না
const COUNT_FILE = path.join(__dirname, "cache", "totalCommands.json");

function loadCount() {
  try {
    return JSON.parse(fs.readFileSync(COUNT_FILE, "utf8")).total || 0;
  } catch (e) {
    return 0;
  }
}

function saveCount() {
  try {
    fs.mkdirSync(path.dirname(COUNT_FILE), { recursive: true });
    fs.writeFileSync(COUNT_FILE, JSON.stringify({ total: global.totalCommands }));
  } catch (e) {}
}

if (typeof global.totalCommands !== "number") global.totalCommands = loadCount();

function addCount() {
  global.totalCommands++;
  saveCount();
}

// আগের Bold font (বাকি সব জায়গায়)
function toBold(str) {
  const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bold = Array.from(
    "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙" +
    "𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳" +
    "𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗"
  );
  return Array.from(str).map(ch => {
    const i = normal.indexOf(ch);
    return i === -1 ? ch : bold[i];
  }).join("");
}

// নতুন ফন্ট 𝗔𝗕𝗖𝗗 (শুধু uptime এর জন্য)
function toSans(str) {
  return Array.from(str).map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D5D4 + (c - 65));
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D5EE + (c - 97));
    if (c >= 48 && c <= 57) return String.fromCodePoint(0x1D7EC + (c - 48));
    return ch;
  }).join("");
}

module.exports.handleEvent = async function ({ api, event }) {
  if (!event.body) return;

  // বটের নিজের মেসেজ গুনবে না
  try {
    if (event.senderID === api.getCurrentUserID()) return;
  } catch (e) {}

  const body = event.body.trim();
  if (!body) return;

  // prefix থাকলে বাদ দাও (না থাকলেও সমস্যা নেই)
  let prefix = (global.config && global.config.PREFIX) || "";
  try {
    const td = global.data && global.data.threadData && global.data.threadData.get(String(event.threadID));
    if (td && td.PREFIX) prefix = td.PREFIX;
  } catch (e) {}

  const text = (prefix && body.startsWith(prefix))
    ? body.slice(prefix.length).trim()
    : body;

  const cmdName = text.split(/\s+/)[0].toLowerCase();
  if (!cmdName) return;

  const commands = global.client && global.client.commands;
  if (!commands) return;

  // "upt" লিখলে নিজেই চালাবে ও গুনবে
  if (cmdName === "upt" && text.toLowerCase() === "upt") {
    addCount();
    return module.exports.run({ api, event });
  }

  // বটের কমান্ড লিস্টে নাম মিললে গুনবে (prefix থাকুক বা না থাকুক)
  if (commands.has(cmdName)) {
    addCount();
  }
};

module.exports.run = async function ({ api, event }) {
  try {
    const total = Math.floor(process.uptime());

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    // শুধু এই লাইন 𝗔𝗕𝗖𝗗 ফন্টে
    const uptime = toSans(`${days}d ${hours}h ${minutes}m ${seconds}s`);

    const now = new Date();

    const time = now.toLocaleTimeString("en-US", {
      timeZone: "Asia/Dhaka",
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    const date = now.toLocaleDateString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    const day = now.toLocaleDateString("en-US", {
      timeZone: "Asia/Dhaka",
      weekday: "long"
    });

    const notice =
      `╔═══ ${toBold("SYSTEM NOTICE")} ═══╗\n` +
      `┃ ⏳ ${toBold("UPTIME")}\n` +
      `┃\n` +
      `┃ ➜ ${uptime}\n` +
      `┃\n` +
      `┃ ⚙️ ${toBold("TOTAL COMMANDS")} ➜ ${toBold(String(global.totalCommands))}\n` +
      `┃\n` +
      `┃ 🕒 ${toBold("TIME")} ➜ ${toBold(time)}\n` +
      `┃ 🌏 ${toBold("ZONE")} ➜ ${toBold("DHAKA, BANGLADESH")}\n` +
      `┃ 📅 ${toBold("DATE")} ➜ ${toBold(date)}\n` +
      `┃ 📆 ${toBold("DAY")} ➜ ${toBold(day)}\n` +
      `┃\n` +
      `╠════════════════════╣`;

    return api.sendMessage(notice, event.threadID, undefined, event.messageID);
  } catch (error) {
    console.error("UPT Error:", error);
    return api.sendMessage(
      "UPT notice error: " + error.message,
      event.threadID,
      undefined,
      event.messageID
    );
  }
};
