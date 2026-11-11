const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "prefix",
  version: "3.4.0",
  hasPermssion: 0,
  credits: "MR JUWEL",
  description: "Show bot prefix and basic stats",
  commandCategory: "Information",
  usages: "[help]",
  cooldowns: 5
};

const DELETE_AFTER = 20000; // 20 seconds
const spamMap = new Map();
const SPAM_COOLDOWN = 10000;

// Duplicate guard: one card per message
const handled = new Set();
function once(messageID) {
  if (handled.has(messageID)) return false;
  handled.add(messageID);
  setTimeout(() => handled.delete(messageID), 30000);
  return true;
}

function f(str) {
  return String(str).replace(/[A-Za-z0-9]/g, (ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + (c - 65));
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + (c - 97));
    return String.fromCodePoint(0x1d7ec + (c - 48));
  });
}

function getConfigPrefix() {
  try {
    const configPath = path.join(__dirname, "..", "..", "config.json");
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (configData.PREFIX && configData.PREFIX.trim() !== "") {
        return configData.PREFIX;
      }
    }
  } catch (e) {
    console.log("⚠️ config.json read error:", e.message);
  }
  return null;
}

function getPrefix(threadID) {
  const configPrefix = getConfigPrefix();
  const threadSetting = global.data.threadData.get(parseInt(threadID)) || {};
  return configPrefix || threadSetting.PREFIX || global.config.PREFIX;
}

function getUptime() {
  const sec = process.uptime();
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

async function sendBigCard({ api, event, prefix }) {
  const { threadID, messageID } = event;

  if (!once(messageID)) return; // already sent for this message

  const totalThreads = global.data.allThreadID?.length || 0;
  const totalCmds = global.client?.commands?.size || 0;

  const msg =
`╭─────────────⭓
│  ✨ ${f("PREFIX")} ✨
│  ➤ 『 ${prefix} 』
├─────────────⭓
│  ⏱️ ${f("Uptime:")} ${f(getUptime())}
│  💬 ${f("Groups:")} ${f(totalThreads)}
│  📦 ${f("Total Commands:")} ${f(totalCmds)}
╰─────────────⭓`;

  return api.sendMessage(
    msg,
    threadID,
    (err, info) => {
      if (err || !info) return;
      setTimeout(() => {
        try { api.unsendMessage(info.messageID); } catch (e) {}
      }, DELETE_AFTER);
    },
    messageID
  );
}

// Trigger words (no prefix needed)
module.exports.handleEvent = async ({ event, api }) => {
  const { threadID, messageID, body, senderID } = event;
  if (!body) return;

  const prefix = getPrefix(threadID);

  // If message starts with the prefix, run() will handle it
  if (prefix && body.trim().startsWith(prefix)) return;

  const now = Date.now();
  if (spamMap.has(senderID) && now - spamMap.get(senderID) < SPAM_COOLDOWN) return;

  const triggerWords = [
    "prefix", "mprefix", "mpre", "bot prefix", "what is the prefix", "bot name",
    "how to use bot", "bot not working", "bot is offline", "prefx", "prfix",
    "perfix", "bot not talking", "where is bot", "bot dead", "bots dead",
    "what prefix", "freefix", "what is bot", "what prefix bot",
    "how use bot", "where are the bots", "where prefix",
    "প্রিফিক্স", "বট প্রিফিক্স", "পিন", "বটের নাম", "বট কি",
    "বট কাজ করছে না", "বট অফলাইন", "প্রিফিক্স কি",
    "प्रीफिक्स", "बॉट प्रीफिक्स", "बॉट का नाम", "बॉट क्या है",
    "dấu lệnh", "daulenh", "tiền tố"
  ];

  if (!triggerWords.includes(body.toLowerCase().trim())) return;
  spamMap.set(senderID, now);

  const reactions = ["💖", "✨", "🌸", "💫", "❤️", "🦋", "🌟"];
  api.setMessageReaction(
    reactions[Math.floor(Math.random() * reactions.length)],
    messageID, () => {}, true
  );

  if (!prefix || String(prefix).trim() === "") {
    return api.sendMessage(f("Prefix cannot be blank"), threadID, messageID);
  }

  return sendBigCard({ api, event, prefix });
};

// {prefix}prefix  or  {prefix}prefix help
module.exports.run = async ({ event, api, args }) => {
  const { threadID, messageID } = event;

  const prefix = getPrefix(threadID);
  if (!prefix || String(prefix).trim() === "") {
    return api.sendMessage(f("Prefix cannot be blank"), threadID, messageID);
  }

  if (args[0] && args[0].toLowerCase() === "help") {
    const cmds = global.client && global.client.commands
      ? Array.from(global.client.commands.keys()).sort()
      : [];
    const list = cmds.length
      ? cmds.map((c) => `• ${prefix}${c}`).join("\n")
      : f("No commands found");
    return api.sendMessage(
`╭─────────────⭓
│  📜 ${f("Command List")} (${f(cmds.length)})
├─────────────⭓
${list}
╰─────────────⭓
💡 ${f("Details:")} ${prefix}help <command>`,
      threadID,
      messageID
    );
  }

  return sendBigCard({ api, event, prefix });
};
