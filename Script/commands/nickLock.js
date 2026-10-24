/**
 * NICK LOCK — গ্রুপের নিকনেম লক (Script/events/nickLock.js)
 * সবসময় চালু (অন/অফ নেই)।
 * • নিজের নিকনেম নিজে বদলালে → কিছু হবে না (নতুনটা সেভ হবে)
 * • গ্রুপ অ্যাডমিন / বট অ্যাডমিন যে কারো বদলালে → কিছু হবে না
 * • সাধারণ ইউজার অন্যের নিকনেম বদলালে → আগেরটা ফিরবে + ওয়ার্নিং
 */
const fs = require("fs-extra");
const path = require("path");

const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";

module.exports.config = {
  name: "nickLock",
  version: "1.1.0",
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Nickname lock with auto restore",
  eventType: ["log:user-nickname", "log:subscribe"],
  cooldowns: 0
};

const DIR = path.join(__dirname, "..", "..", "cache", "nickLock");
fs.ensureDirSync(DIR);
const file = (t) => path.join(DIR, `${t}.json`);
const read = (t) => { try { return fs.readJsonSync(file(t)); } catch (_) { return null; } };
const write = (t, d) => { try { fs.writeJsonSync(file(t), d); } catch (_) {} };

const call = (fn, ...a) => new Promise((res, rej) => {
  try {
    const r = fn(...a, (e, x) => (e ? rej(e) : res(x)));
    if (r && typeof r.then === "function") r.then(res, rej);
  } catch (e) { rej(e); }
});

const creditOK = () => module.exports.config.credits === CREDIT && CREDIT.includes("JU");
function creditWarn(api, tid) {
  const msg =
`╔━━━━━━━━━━━━━━━━━━━━━━╗
   ⛔  𝗖𝗥𝗘𝗗𝗜𝗧 𝗘𝗥𝗥𝗢𝗥
╚━━━━━━━━━━━━━━━━━━━━━━╝

⚠️ এই কোডের ক্রেডিট চেঞ্জ করা হয়েছে!
🚫 তাই এই ফিচারটি কাজ করবে না।
✅ ঠিক ক্রেডিট ফিরিয়ে দিন।

✦ 𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗕𝘆 ➤ ${CREDIT} ✦`;
  console.log("[nickLock] ⛔ Credit changed — feature disabled.");
  if (tid) api.sendMessage(msg, tid);
}

async function snapshot(api, tid) {
  const info = await call(api.getThreadInfo.bind(api), tid);
  write(tid, { nicks: info.nicknames || {} });
  return info;
}

module.exports.onLoad = function ({ api }) {
  if (!creditOK()) return creditWarn(api);
  setTimeout(async () => {
    try {
      const list = await call(api.getThreadList.bind(api), 100, null, ["INBOX"]);
      for (const t of (list || []).filter((x) => x.isGroup)) {
        if (!read(String(t.threadID))) { try { await snapshot(api, String(t.threadID)); } catch (_) {} }
        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (_) {}
  }, 20000);
};

const busy = new Map();

module.exports.run = async function ({ api, event }) {
  try {
    const tid = String(event.threadID);
    if (!creditOK()) return creditWarn(api, tid);

    const botID = String(api.getCurrentUserID());
    const data = event.logMessageData || {};

    if (event.logMessageType === "log:subscribe") {
      const added = (data.addedParticipants || []).map((p) => String(p.userFbId));
      if (added.includes(botID) && !read(tid)) setTimeout(() => snapshot(api, tid).catch(() => {}), 5000);
      return;
    }

    const author = String(event.author || "");
    const uid = String(data.participant_id || "");
    const newNick = data.nickname || "";
    if (!uid) return;

    // বটের নিজের রিস্টোর থেকে আসা ইভেন্ট ইগনোর
    if (author === botID && busy.get(`${tid}:${uid}`) > Date.now()) return;

    let snap = read(tid);
    if (!snap) { await snapshot(api, tid).catch(() => {}); return; }

    const info = await call(api.getThreadInfo.bind(api), tid);
    const admins = (info.adminIDs || []).map((a) => String(a.id || a));
    const cfg = global.config || {};
    const botAdmins = [].concat(cfg.ADMINBOT || [], cfg.DEVELOPER || []).map(String);

    // ছাড়: বট নিজে / নিজের নিকনেম নিজে / গ্রুপ অ্যাডমিন / বট অ্যাডমিন
    const exempt = author === botID || author === uid || admins.includes(author) || botAdmins.includes(author);

    if (exempt) { snap.nicks[uid] = newNick; write(tid, snap); return; }

    const oldNick = snap.nicks[uid] || "";
    busy.set(`${tid}:${uid}`, Date.now() + 20000);
    await call(api.changeNickname.bind(api), oldNick, tid, uid).catch(() => {});

    let name = "User", who = "User";
    try { const u = await call(api.getUserInfo.bind(api), [author]); who = (u[author] || {}).name || who; } catch (_) {}
    try { const u = await call(api.getUserInfo.bind(api), [uid]); name = (u[uid] || {}).name || name; } catch (_) {}

    const msg =
`╔━━━━━━━━━━━━━━━━━━━━━━╗
   🏷️  𝗪𝗔𝗥𝗡𝗜𝗡𝗚 • 𝗡𝗜𝗖𝗞𝗡𝗔𝗠𝗘 𝗟𝗢𝗖𝗞𝗘𝗗
╚━━━━━━━━━━━━━━━━━━━━━━╝

👤 চেঞ্জকারী : ${who}
🎯 টার্গেট : ${name}
♻️ আগের নিকনেম ফিরিয়ে আনা হয়েছে : ${oldNick || "Original Name"}

⚠️ নিজের নিকনেম শুধু নিজে বদলাতে পারবে।
অন্যের নিকনেম বদলাতে পারবে শুধু
𝗚𝗥𝗢𝗨𝗣 𝗔𝗗𝗠𝗜𝗡 ও 𝗕𝗢𝗧 𝗔𝗗𝗠𝗜𝗡!

🛡️ 𝗔𝘂𝘁𝗼 𝗕𝗮𝗰𝗸𝘂𝗽 & 𝗥𝗲𝘀𝘁𝗼𝗿𝗲 𝗔𝗰𝘁𝗶𝘃𝗲
━━━━━━━━━━━━━━━━━━━━━━
✦ 𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗕𝘆 ➤ ${CREDIT} ✦`;
    api.sendMessage(msg, tid);
  } catch (e) { console.log("[nickLock] Error:", e && e.message ? e.message : e); }
};
