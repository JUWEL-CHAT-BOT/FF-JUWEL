module.exports.config = {
  name: "fbkick",
  version: "13.0.1",
  hasPermission: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Premium FB User Cleaner",
  commandCategory: "group",
  usages: "fbkick",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {

  const { threadID, messageID, senderID } = event;

  // ✅ ADMIN CHECK
  if (!global.config.ADMINBOT.includes(senderID)) {
    return api.sendMessage(
`╔━━❖ ❌ ACCESS DENIED ❖━━╗
┃
┃ শুধুমাত্র BOT ADMIN
┃ এই কমান্ড ব্যবহার করতে পারবে।
┃
╚━━━━━━━━━━━━━━━━━━╝`,
      threadID, messageID
    );
  }

  // ✅ THREAD INFO
  const threadInfo = await api.getThreadInfo(threadID);
  const botID = api.getCurrentUserID();

  // ✅ FIX: adminIDs কে সবসময় id string array তে কনভার্ট করো
  const adminIDList = (threadInfo.adminIDs || []).map(a =>
    typeof a === "string" ? a : a.id
  );

  // ✅ DETECT BAD USERS
  const badUsers = threadInfo.userInfo.filter(user => {
    if (user.id == senderID) return false;
    if (user.id == botID) return false;
    if (adminIDList.includes(user.id)) return false;   // FIXED

    const noGender = user.gender === undefined || user.gender === null;
    const noThumb = !user.thumbSrc || user.thumbSrc.includes("defaultUser");
    const noName = !user.name || user.name.trim() === "";

    return noGender || (noThumb && noName);
  });

  // ✅ BOT ADMIN CHECK (FIXED)
  const botAdmin = adminIDList.includes(botID);

  // ✅ NO BAD USER
  if (badUsers.length === 0) {
    return api.sendMessage(
`╔━━❖ ✅ GROUP CLEAN ❖━━╗
┃
┃ গ্রুপে কোনো নষ্ট আইডি নেই 🌸
┃ গ্রুপ সম্পূর্ণ পরিষ্কার আছে।
┃
╚━━━━━━━━━━━━━━━━━━╝`,
      threadID, messageID
    );
  }

  // ✅ যদি বট এডমিন না থাকে
  if (!botAdmin) {
    return api.sendMessage(
`╔━━❖ 🔍 SCAN COMPLETE ❖━━╗
┃
┃ গ্রুপে মোট ${badUsers.length} জন
┃ নষ্ট আইডি পাওয়া গেছে! 😈
┃
┣━━━━━━━━━━━━━━━━━━
┃ ⚠️ কিন্তু আমাকে গ্রুপে
┃    এডমিন বানাননি!
┃
┃ 📌 দয়া করে আগে আমাকে
┃    এডমিন বানান।
┃
╚━━━━━━━━━━━━━━━━━━╝`,
      threadID, messageID
    );
  }

  // ✅ SCAN RESULT — ১০ সেকেন্ড কাউন্টডাউন
  await api.sendMessage(
`╔━━❖ 🔍 SCAN COMPLETE ❖━━╗
┃
┃ গ্রুপে মোট ${badUsers.length} জন
┃ নষ্ট আইডি পাওয়া গেছে! 😈
┃
┣━━━━━━━━━━━━━━━━━━
┃ ⏳ ১০ সেকেন্ড পর অটো কিক
┃    শুরু হবে...
┃
╚━━━━━━━━━━━━━━━━━━╝`,
    threadID, messageID
  );

  await new Promise(r => setTimeout(r, 10000));

  await api.sendMessage(
`╔━━❖  FB CLEANER ❖━━╗
┃
┃ 👥 নষ্ট আইডি : ${badUsers.length} জন
┃
┃ ⚡ কিক শুরু হচ্ছে...
┃ 🛡️ একটু অপেক্ষা করুন...
┃
╚━━━━━━━━━━━━━━━━━━╝`,
    threadID
  );

  let success = 0;
  let failed = 0;
  const failedList = [];

  for (const user of badUsers) {
    try {
      await api.removeUserFromGroup(user.id, threadID);
      success++;
    } catch (err) {
      failed++;
      failedList.push(user.name || user.id);
      console.log(`❌ Kick failed [${user.id}]:`, err);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  let failedNames = failedList.length > 0
    ? `┃\n┃ ⚠️ ফেল হওয়া আইডি:\n${failedList.map(n => `┃   • ${n}`).join("\n")}\n`
    : "";

  return api.sendMessage(
`╔━━❖ ✅ KICK COMPLETE ❖━━╗
┃
┣━━━━━━━━━━━━━━━━━━
┃ 👥 মোট নষ্ট আইডি  : ${badUsers.length} জন
┃ ✅ সফলভাবে কিক    : ${success} জন
┃ ❌ কিক ফেল        : ${failed} জন
┃
${failedNames}┣━━━━━━━━━━━━━━━━━━
┃ 🔥 ${success} জন ফেসবুক ইউজার
┃    নষ্ট আইডি কিক দেওয়া হয়েছে!
┃
┃ 🛡️ গ্রুপ পরিষ্কার হয়ে গেছে
┃
╚━━❖ POWERED BY BOT ❖━━╝`,
    threadID, messageID
  );
};
