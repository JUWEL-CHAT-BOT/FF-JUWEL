// ══════════════════════════════════════════════
// Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
// Script/commands/bot.js — bot on / bot off (শুধু ADMINBOT)
// ══════════════════════════════════════════════
module.exports.config = {
  name: "bot",
  version: "3.2.0",
  hasPermssion: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Bot ON/OFF — only works with 'bot on' / 'bot off' / 'bot status'",
  commandCategory: "system",
  usages: "bot on | bot off | bot off 30m | bot status",
  cooldowns: 0
};

let power;
try {
  power = require("../../includes/power");
} catch (e) {
  console.log("[BOT CMD] includes/power.js failed to load:", e.message);
}

module.exports.run = ({ api, event, args }) => {
  const sub = String((args && args[0]) || "").toLowerCase();

  // Only on / off / status work. Plain "bot" stays silent (baby command replies).
  if (sub !== "on" && sub !== "off" && sub !== "status") return;

  if (!power) return api.sendMessage("❌ includes/power.js not found.", event.threadID, event.messageID);
  if (!power.creditOk()) return api.sendMessage("❌ Credit mismatch, system disabled.\n👑 Credit: 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐", event.threadID, event.messageID);
  if (!power.isAdmin(event.senderID))
    return api.sendMessage(power.notice("⛔ Only bot admins can use this command."), event.threadID, event.messageID);

  if (sub === "status") return power.status(api, event);
  if (sub === "off") return power.isOn() ? power.turnOff(api, event, power.parseDuration(args.slice(1).join(" "))) : api.sendMessage(power.notice("💤 Bot is already OFF."), event.threadID, event.messageID);
  return power.isOn() ? power.status(api, event) : power.turnOn(api, event);
};
