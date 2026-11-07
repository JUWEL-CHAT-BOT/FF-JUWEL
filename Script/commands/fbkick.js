module.exports.config = {
  name: "fbkick",
  version: "14.0.0",
  hasPermission: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Disabled/Suspended FB ID Cleaner",
  commandCategory: "group",
  usages: "fbkick",
  cooldowns: 5
};

// ---------- Promise wrappers (fca callback style) ----------
const call = (fn, ...args) =>
  new Promise((resolve, reject) => {
    fn(...args, (err, data) => (err ? reject(err) : resolve(data)));
  });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Disabled / suspended / deleted অ্যাকাউন্টের ডিফল্ট নাম
const DEAD_NAMES = [
  "facebook user",
  "facebook ব্যবহারকারী",
  "ফেসবুক ইউজার",
  "ফেসবুক ব্যবহারকারী",
  "usuario de facebook",
  "utilisateur facebook"
];

function isDeadName(name) {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return n === "" || DEAD_NAMES.includes(n);
}

function isDefaultThumb(src) {
  return !src || src.includes("defaultUser") || src.includes("silhouette");
}

function isBadAccount(info) {
  if (!info) return true; // getUserInfo কোনো তথ্যই দেয়নি

  const noGender = info.gender === undefined || info.gender === null;
  const noThumb = isDefaultThumb(info.thumbSrc);
  const noProfile = !info.vanity && !info.profileUrl;

  // ১) নাম "Facebook User" / ফাঁকা
  if (isDeadName(info.name)) return true;

  // ২) নাম আছে, কিন্তু gender + ছবি + প্রোফাইল সব ফাঁকা
  return noGender && noThumb && noProfile;
}

async function fetchUserInfoBatch(api, ids) {
  const result = {};
  const CHUNK = 40;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const data = await call(api.getUserInfo, chunk);
      Object.assign(result, data || {});
    } catch (e) {
      console.log("getUserInfo chunk failed:", e);
    }
    await sleep(800);
  }
  return result;
}

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID } = event;
  const send = (msg, reply = true) =>
    api.sendMessage(msg, threadID, reply ? messageID : undefined);

  // ---------- ADMIN CHECK ----------
  if (!global.config.ADMINBOT.includes(senderID)) {
    return send(
`╔━━❖ ❌ ACCESS DENIED ❖━━╗
┃ শুধুমাত্র BOT ADMIN
┃ এই কমান্ড ব্যবহার করতে পারবে।
╚━━━━━━━━━━━━━━━━━━╝`);
  }

  // ---------- THREAD INFO ----------
  let threadInfo;
  try {
    threadInfo = await call(api.getThreadInfo, threadID);
  } catch (e) {
    return send("❌ গ্রুপের তথ্য আনা যায়নি, আবার চেষ্টা করুন।");
  }

  const botID = api.getCurrentUserID();
  const adminIDList = (threadInfo.adminIDs || []).map(a =>
    String(typeof a === "string" ? a : a.id)
  );
  const botAdmin = adminIDList.includes(String(botID));
  const botOwners = (global.config.ADMINBOT || []).map(String);

  // ---------- সব মেম্বারের ID (userInfo + participantIDs মিলিয়ে) ----------
  const allIDs = new Set([
    ...(threadInfo.participantIDs || []).map(String),
    ...(threadInfo.userInfo || []).map(u => String(u.id))
  ]);

  // থ্রেডের userInfo ম্যাপ
  const threadUserMap = {};
  (threadInfo.userInfo || []).forEach(u => (threadUserMap[String(u.id)] = u));

  const candidates = [...allIDs].filter(
    id =>
      id !== String(senderID) &&
      id !== String(botID) &&
      !adminIDList.includes(id) &&
      !botOwners.includes(id)
  );

  await send(`🔍 ${candidates.length} জন মেম্বার স্ক্যান করা হচ্ছে...`);

  // ---------- ডাবল চেক: getUserInfo দিয়ে ফ্রেশ ডেটা ----------
  const freshInfo = await fetchUserInfoBatch(api, candidates);

  const badUsers = [];
  for (const id of candidates) {
    const fresh = freshInfo[id];
    const old = threadUserMap[id];

    // fresh ও thread — দুই সোর্সেই খারাপ হলে তবেই bad (ভুল কিক কমাতে)
    const badFresh = isBadAccount(fresh);
    const badOld = old ? isBadAccount(old) : true;

    if (badFresh && badOld) {
      badUsers.push({
        id,
        name: (fresh && fresh.name) || (old && old.name) || id
      });
    }
  }

  if (badUsers.length === 0) {
    return send(
`╔━━❖ ✅ GROUP CLEAN ❖━━╗
┃ কোনো disabled/suspended
┃ আইডি পাওয়া যায়নি 🌸
╚━━━━━━━━━━━━━━━━━━╝`);
  }

  if (!botAdmin) {
    return send(
`╔━━❖ 🔍 SCAN COMPLETE ❖━━╗
┃ ${badUsers.length} জন নষ্ট আইডি পাওয়া গেছে!
┃
┃ ⚠️ কিন্তু আমি এই গ্রুপে
┃ এডমিন নই। আগে এডমিন বানান।
╚━━━━━━━━━━━━━━━━━━╝`);
  }

  await send(
`╔━━❖ 🔍 SCAN COMPLETE ❖━━╗
┃ নষ্ট আইডি : ${badUsers.length} জন
┃ ⏳ ১০ সেকেন্ড পর কিক শুরু...
╚━━━━━━━━━━━━━━━━━━╝`);

  await sleep(10000);

  // ---------- KICK (retry সহ) ----------
  let success = 0;
  const failedList = [];

  for (const user of badUsers) {
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      try {
        await call(api.removeUserFromGroup, user.id, threadID);
        done = true;
      } catch (err) {
        console.log(`❌ Kick failed [${user.id}] attempt ${attempt}:`, err);
        await sleep(2500);
      }
    }
    if (done) success++;
    else failedList.push(user.name);
    await sleep(1800);
  }

  const failed = failedList.length;
  const failedNames = failed
    ? `\n⚠️ ফেল হওয়া আইডি:\n${failedList.slice(0, 20).map(n => `  • ${n}`).join("\n")}\n`
    : "";

  return send(
`╔━━❖ ✅ KICK COMPLETE ❖━━╗
┃ 👥 মোট নষ্ট আইডি : ${badUsers.length} জন
┃ ✅ সফল কিক       : ${success} জন
┃ ❌ ফেল           : ${failed} জন
╚━━━━━━━━━━━━━━━━━━╝${failedNames}`);
};
