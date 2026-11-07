// ══════════════════════════════════════════════
// Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
// ══════════════════════════════════════════════
module.exports.config = {
  name: "kick",
  version: "1.2.0",
  hasPermssion: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "গ্রুপ থেকে মেম্বারকে কিক করা (শুধু বট অ্যাডমিন)",
  commandCategory: "Admin",
  usages: "kick @মেনশন | kick (রিপ্লাই করে) | kick <UID>",
  cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const botID = String(api.getCurrentUserID());

  // কাকে কিক করবে: রিপ্লাই + মেনশন + UID সব একসাথে মিলিয়ে নেবে
  let targets = [];
  if (event.messageReply && event.messageReply.senderID) {
    targets.push(String(event.messageReply.senderID));
  }
  if (event.mentions && Object.keys(event.mentions).length > 0) {
    targets.push(...Object.keys(event.mentions).map(String));
  }
  targets.push(...args.filter(a => /^\d{8,}$/.test(a)).map(String));
  targets = [...new Set(targets)]; // একই জনকে দুইবার নয়

  if (targets.length === 0) {
    return api.sendMessage(
      "❌ কাকে কিক করব?\n\n📌 ব্যবহার (একসাথে অনেকজনও চলবে):\n• /kick @জন১ @জন২\n• /kick <UID১> <UID২>\n• /kick @জন১ <UID২>\n• কারো মেসেজে রিপ্লাই করে /kick",
      threadID, messageID
    );
  }

  // গ্রুপের তথ্য ও বট অ্যাডমিন কি না চেক
  let info;
  try {
    info = await api.getThreadInfo(threadID);
  } catch (e) {
    return api.sendMessage("⚠️ গ্রুপের তথ্য আনা যায়নি, পরে আবার চেষ্টা করুন।", threadID, messageID);
  }

  const groupAdmins = (info.adminIDs || []).map(a => String(a.id || a));
  if (!groupAdmins.includes(botID)) {
    return api.sendMessage("⚠️ আগে আমাকে এই গ্রুপের অ্যাডমিন বানান, তারপর কিক করতে পারব।", threadID, messageID);
  }

  const cfg = global.config || {};
  const protectedIDs = [
    botID,
    ...(cfg.ADMINBOT || []).map(String),
    ...(cfg.DEVELOPER || []).map(String)
  ];

  let done = 0, skipped = 0, failed = 0;
  for (const uid of targets) {
    // বট নিজে, বট অ্যাডমিন বা ডেভেলপারকে কিক করা যাবে না
    if (protectedIDs.includes(uid)) { skipped++; continue; }
    // গ্রুপে আছে কি না
    if (info.participantIDs && !info.participantIDs.map(String).includes(uid)) { failed++; continue; }

    try {
      await api.removeUserFromGroup(uid, threadID);
      done++;
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      failed++;
    }
  }

  let msg = `┏━━━━━━━━━━━━━━━┓\n┃ 🦵 KICK রিপোর্ট\n┣━━━━━━━━━━━━━━━┫\n┃ ✅ কিক হয়েছে: ${done}\n`;
  if (skipped) msg += `┃ 🛡️ সুরক্ষিত (বাদ): ${skipped}\n`;
  if (failed) msg += `┃ ⚠️ ব্যর্থ: ${failed}\n`;
  msg += `┗━━━━━━━━━━━━━━━┛`;
  return api.sendMessage(msg, threadID, messageID);
};
