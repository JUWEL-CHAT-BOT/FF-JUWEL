const fs = require("fs-extra");
const path = require("path");

const cachePath = path.join(__dirname, "cache", "restart.json");

function formatUptime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h} ঘন্টা ${m} মিনিট ${s} সেকেন্ড`;
}

module.exports.config = {
  name: "restart",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "𝐌𝐑 𝐉𝐔𝐖𝐄𝐋",
  description: "Fast restart system ⚡",
  commandCategory: "Admin",
  usages: "restart",
  cooldowns: 5
};

// বট চালু হওয়ার পর রিস্টার্ট সম্পন্ন মেসেজ
module.exports.onLoad = async function ({ api }) {
  try {
    if (!fs.existsSync(cachePath)) return;

    const data = fs.readJsonSync(cachePath);
    fs.removeSync(cachePath);

    const tookSec = Math.max(0, Math.round((Date.now() - data.time) / 1000));

    setTimeout(() => {
      api.sendMessage(
`╔════════════════════╗
   ✅ 𝗥𝗘𝗦𝗧𝗔𝗥𝗧 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘
╚════════════════════╝

🤖 বট সফলভাবে রিস্টার্ট হয়েছে!
⏱️ আগে চালু ছিল: ${data.uptime}
⚡ রিস্টার্টে সময় লেগেছে: ${tookSec} সেকেন্ড

━━━━━━━━━━━━━━━━━━`,
        data.threadID
      );
    }, 3000);
  } catch (e) {
    console.log("Restart onLoad error:", e);
  }
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID } = event;

  // কনফিগারেশনের বট অ্যাডমিন লিস্ট
  const adminBot = (global.config && global.config.ADMINBOT) || [];

  if (!adminBot.includes(String(senderID))) {
    return api.sendMessage(
      "❌ আপনাকে এই কমান্ড ব্যবহার করার অনুমতি দেওয়া হয়নি! শুধুমাত্র বট অ্যাডমিনরা এই কমান্ড চালাতে পারবেন।",
      threadID,
      messageID
    );
  }

  const uptime = formatUptime(process.uptime());

  await api.sendMessage(
`╔════════════════════╗
   🔄 𝗦𝗬𝗦𝗧𝗘𝗠 𝗥𝗘𝗦𝗧𝗔𝗥𝗧
╚════════════════════╝

⏳ 𝗕𝗢𝗧 𝗜𝗦 𝗥𝗘𝗦𝗧𝗔𝗥𝗧𝗜𝗡𝗚...
🕒 এতক্ষণ চালু ছিল: ${uptime}
⚡ 𝗣𝗟𝗘𝗔𝗦𝗘 𝗪𝗔𝗜𝗧 𝗔 𝗠𝗢𝗠𝗘𝗡𝗧

━━━━━━━━━━━━━━━━━━`,
    threadID,
    messageID
  );

  // রিস্টার্টের পর মেসেজ পাঠানোর জন্য তথ্য সেভ
  fs.ensureDirSync(path.dirname(cachePath));
  fs.writeJsonSync(cachePath, { threadID, uptime, time: Date.now() });

  setTimeout(() => process.exit(2), 1000);
};
