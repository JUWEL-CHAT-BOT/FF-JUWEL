const axios = require("axios");

const triggers = [
  "i love you", "i love u", "i luv you", "iloveyou",
  "আই লাভ ইউ", "ভালোবাসি", "ভালবাসি", "ভালবাসী"
];

const audioUrls = [
  "https://files.catbox.moe/z96wll.mp3"
];

const blockTriggers = [
  "juwel ahamed'z",
  "juwel ahmed'z",
  "juwel ahame dz",
  "juwel ahamedz",
  "জুয়েল আহামেদ'জ"
];

module.exports.config = {
  name: "auto_voice",
  version: "1.0.0",
  hasPermission: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Auto voice reply",
  commandCategory: "no prefix",
  usages: "",
  cooldowns: 0
};

module.exports.handleEvent = async function ({ api, event }) {
  try {
    if (!event.body) return;

    const msg = event.body.toLowerCase().trim();
    
    // 🚫 ব্লক চেক
    const isBlocked = blockTriggers.some(b => msg.includes(b.toLowerCase()));
    if (isBlocked) return;
    
    // ✅ ট্রিগার চেক
    const isTriggered = triggers.some(t => {
      const triggerLower = t.toLowerCase();
      return msg === triggerLower || msg.includes(triggerLower);
    });
    
    if (!isTriggered) return;

    const url = audioUrls[Math.floor(Math.random() * audioUrls.length)];

    const voice = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: 15000
    });

    return api.sendMessage(
      {
        body: "🅙𝐔🅦𝐄🅛",
        attachment: voice.data
      },
      event.threadID,
      event.messageID
    );

  } catch (err) {
    console.log("[AUTO_VOICE ERROR]", err.message || err);
  }
};

module.exports.run = async function () {};
