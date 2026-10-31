const axios = require("axios");

// ================= CONFIG =================
const APIS = [
  "https://www.noobs-api.rf.gd/dipto",
  "BACKUP_API_URL_HERE" // ব্যাকআপ API বসান (না থাকলে এই লাইন রেখে দিলেও চলবে)
].filter(u => u.startsWith("http"));

const ONLY_VIP = true;          // true = শুধু নিচের লিস্টের ইউজার ব্যবহার করতে পারবে
const VIP_IDS = [               // অ্যাডমিন/VIP এর Facebook ID
  "100000000000000"
];
const BLOCKED_NUMBERS = [       // এই নম্বরগুলো সার্চ করা যাবে না (01XXXXXXXXX ফরম্যাটে)
  "01000000000"
];
const DAILY_LIMIT = 10;         // সাধারণ ইউজারের দৈনিক লিমিট (VIP আনলিমিটেড)
const MAX_NUMBERS = 3;          // একবারে সর্বোচ্চ কয়টা নম্বর
const CACHE_TTL = 10 * 60 * 1000; // ক্যাশ ১০ মিনিট
// ==========================================

const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
const cache = new Map();
const usage = new Map();
let totalUsed = 0;

const operators = {
  "013": "Grameenphone", "017": "Grameenphone",
  "014": "Banglalink", "019": "Banglalink",
  "015": "Teletalk",
  "016": "Airtel/Robi", "018": "Robi"
};

const box = lines => `╭──────────────◆\n${lines.map(l => `│ ${l}`).join("\n")}\n╰──────────────◆`;
const today = () => new Date().toISOString().slice(0, 10);

function normalize(raw) {
  let n = String(raw).replace(/\D/g, "");
  if (n.startsWith("880")) n = n.slice(2);
  else if (n.startsWith("88")) n = n.slice(2);
  // এখন n = 01XXXXXXXXX হওয়ার কথা
  if (!/^01[3-9]\d{8}$/.test(n)) return null;
  return { local: n, full: "88" + n };
}

async function fetchInfo(full) {
  const hit = cache.get(full);
  if (hit && Date.now() - hit.time < CACHE_TTL) return { ...hit.data, cached: true };

  for (const base of APIS) {
    try {
      const { data } = await axios.get(`${base}/numinfo`, {
        params: { number: full },
        timeout: 15000
      });
      if (data && Array.isArray(data.info) && data.info.length) {
        cache.set(full, { time: Date.now(), data });
        return data;
      }
    } catch (_) {}
  }
  return null;
}

function buildBody(local, full, data) {
  const operator = operators[local.slice(0, 3)] || "Unknown";
  const list = data.info
    .map((i, n) =>
      `│\n│ ✦ ʀᴇsᴜʟᴛ ${n + 1}\n│ 👤 নাম: ${i.name || "Not found"}\n│ 🏷️ টাইপ: ${i.type || "Not found"}`
    )
    .join("\n");

  return (
    `╔═══════════════════╗\n` +
    `   📱 𝐍𝐔𝐌𝐁𝐄𝐑 𝐈𝐍𝐅𝐎 📱\n` +
    `╚═══════════════════╝\n` +
    `╭──────────────◆\n` +
    `│ 📞 নম্বর: +${full}\n` +
    `│ 📡 অপারেটর: ${operator}\n` +
    `${list}\n` +
    `│\n` +
    `│ ⚡ সোর্স: ${data.cached ? "Cache" : "Live"}\n` +
    `╰──────────────◆\n` +
    `╭──────────────◆\n` +
    `│ 👑 Credit: ${CREDIT}\n` +
    `╰──────────────◆`
  );
}

module.exports = {
  config: {
    name: "numinfo",
    version: "1.1.0",
    credits: CREDIT,
    hasPermssion: 0,
    description: "নম্বরের তথ্য দেখুন",
    commandCategory: "Information",
    usages: "numinfo <number> [number2] [number3]",
    cooldowns: 5
  },

  run: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const send = (msg) => api.sendMessage(msg, threadID, messageID);
    const isVip = VIP_IDS.includes(String(senderID));

    // পারমিশন চেক
    if (ONLY_VIP && !isVip)
      return send(box(["🔒 এই কমান্ড শুধু অ্যাডমিন/VIP দের জন্য!"]));

    if (!args[0])
      return send(box(["⚠️ দয়া করে একটি নম্বর দিন!", "📌 ব্যবহার: numinfo 01XXXXXXXXX"]));

    // দৈনিক লিমিট চেক
    let u = usage.get(senderID);
    if (!u || u.date !== today()) u = { date: today(), count: 0 };
    if (!isVip && u.count >= DAILY_LIMIT)
      return send(box([`⛔ আজকের লিমিট (${DAILY_LIMIT}) শেষ!`, "আগামীকাল আবার চেষ্টা করুন।"]));

    // একাধিক নম্বর
    const inputs = args.slice(0, MAX_NUMBERS);
    const extra = args.length > MAX_NUMBERS;

    api.setMessageReaction("⌛", messageID, () => {}, true);
    let okCount = 0;

    for (const raw of inputs) {
      const num = normalize(raw);

      if (!num) {
        await send(box([`❌ ভুল নম্বর: ${raw}`, "সঠিক ফরম্যাট: 01XXXXXXXXX (11 ডিজিট)"]));
        continue;
      }

      if (BLOCKED_NUMBERS.includes(num.local)) {
        await send(box([`🚫 ${num.local}`, "এই নম্বর সার্চ করা নিষিদ্ধ!"]));
        continue;
      }

      if (!isVip && u.count >= DAILY_LIMIT) {
        await send(box([`⛔ লিমিট শেষ, ${num.local} সার্চ হয়নি।`]));
        continue;
      }

      try {
        const data = await fetchInfo(num.full);
        if (!data) {
          await send(box([`❌ ${num.local}`, "কোনো তথ্য পাওয়া যায়নি!"]));
          continue;
        }

        const msg = { body: buildBody(num.local, num.full, data) };
        if (data.image) {
          try {
            msg.attachment = (await axios.get(data.image, { responseType: "stream" })).data;
          } catch (_) {}
        }

        await send(msg);
        okCount++;
        u.count++;
        totalUsed++;
      } catch (e) {
        await send(box([`❌ Error: ${e.message}`]));
      }
    }

    usage.set(senderID, u);

    if (extra)
      await send(box([`ℹ️ একবারে সর্বোচ্চ ${MAX_NUMBERS}টি নম্বর চেক করা যায়।`]));

    if (!isVip)
      await send(box([`📊 আজকের ব্যবহার: ${u.count}/${DAILY_LIMIT}`, `🌐 মোট ব্যবহার: ${totalUsed}`]));

    api.setMessageReaction(okCount ? "✅" : "❌", messageID, () => {}, true);
  }
};
