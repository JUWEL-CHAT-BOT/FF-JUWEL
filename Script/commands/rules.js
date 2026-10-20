const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "rules_data.json");

// 🔰 LOAD DATA
let lastSent = {};
try {
  if (fs.existsSync(dataPath)) {
    lastSent = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  }
} catch (e) {
  lastSent = {};
}

// 🔰 SAVE DATA
function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(lastSent, null, 2));
  } catch (e) {
    console.log("RULES SAVE ERROR:", e);
  }
}

module.exports.config = {
  name: "rules",
  version: "9.0.0",
  hasPermssion: 0,
  credits: "𝐌𝐑 𝐉𝐔𝐖𝐄𝐋",
  description: "Auto + Command rules with all admins (name + FB link)",
  commandCategory: "information",
  usages: "rules",
  cooldowns: 5
};

// 🔰 MESSAGE BUILDER
async function buildMessage(api, event, Users) {
  const threadInfo = await api.getThreadInfo(event.threadID);
  const threadName = threadInfo.threadName || "Unknown Group";
  const adminIDs = threadInfo.adminIDs || [];

  // 🔰 সব গ্রুপ এডমিনের নাম + ফেসবুক লিংক
  const names = await Promise.all(
    adminIDs.map(a =>
      Users.getNameUser(a.id).catch(() => "Facebook User")
    )
  );

  let adminText = "";
  let mentions = [];

  adminIDs.forEach((admin, i) => {
    adminText += `➤ ${names[i]}\n🔗 https://www.facebook.com/${admin.id}\n\n`;
    mentions.push({
      tag: names[i],
      id: admin.id
    });
  });

  if (!adminText) adminText = "কোনো এডমিন পাওয়া যায়নি\n";

  // 🔰 BOT ADMIN (config.json এর প্রথম ADMINBOT UID)
  const botAdminUID = String((global.config.ADMINBOT || [])[0] || "");
  const botAdminName = botAdminUID
    ? await Users.getNameUser(botAdminUID).catch(() => "Facebook User")
    : "Not Found";
  const botAdminLink = botAdminUID
    ? `https://www.facebook.com/${botAdminUID}`
    : "লিংক পাওয়া যায়নি";

  const msg = `
╔══════════════════════╗

😊আসসালামু আলাইকুম আমাদের 🙌🫂

 ${threadName}

 🎀🌷গুপের কিছু রুল্স আছে🫂♻️
╚══════════════════════╝

০১) আজেবাজে খারাপ কথা বলা যাবে না ⚠️  
০২) কাউকে অপমান কিংবা গালাগালি করা যাবে না ⚠️🚫  
০৩) অপ্রয়োজনীয় ট্যাগ / বারবার mention করা যাবে না 🚫  
০৪) SEX নিয়ে কোনো কথা বলা যাবে না ⚠️🚫  
০৫) অশ্লীল ছবি / ভিডিও / মিম দিলে সরাসরি কিক ⚡🚫  
০৬) নিজের ইউটিউব / পেজ লিংক দিয়ে স্প্যাম করলে কিক 🚫  
০৭) অ্যাডমিনদের সম্মান করতে হবে 🛡🌷  
০৮) কোনো ধর্ম বা জাতি নিয়ে কটাক্ষ করা যাবে না 🚫  
০৯) ভুয়া নিউজ / গুজব দিলে রিপোর্ট + ব্লক 🚫  
১০) রাত ১২টার পর শুধু ভদ্র মজা, অশ্লীলতা নয় 🚫  
১১) Meta AI এর সাথে গ্রুপে কথা বলা যাবে না 🚫  
১২) অপরিচিত কাউকে ইনবক্সে ডাকবেন না 🚫  
১৩) অপরিচিত কাউকে ফ্রেন্ড রিকুয়েস্ট দিবেন না 🚫  
১৪) অন্য গ্রুপের লিংক দিলে কিক 🚫  
১৫) আমাদের মেম্বারদের অন্য গ্রুপে এড করবেন না 🚫  
১৬) ৩টার বেশি ইমোজি ব্যবহার করবেন না 🚫  
১৭) গ্রুপের নাম / ফটো চেঞ্জ করলে কিক 🚫  
১৮) বারবার থিম / গ্রুপ ইমোজি চেঞ্জ করলে কিক 🚫  
১৯) ক্যাপশন বা ভিডিও পোস্ট করা যাবে না 🚫  
২০) 18+ কোনো ইমোজি দেওয়া যাবে না 🚫  
২১) আড্ডার সময় বটের সাথে কথা বলা যাবে না 🚫  
২২) গালি দিলে অ্যাডমিনের ইনবক্সে জানাবেন 🚫  
২৩) অন্য গ্রুপের বিষয় আলোচনা করবেন না 🚫  
২৪) গ্রুপ ভালো না লাগলে লিভ নিতে পারবেন 🚫  
২৫) 18+ নিকনেম ব্যবহার করা যাবে না 🚫  
২৬) 18+ নামের আইডি এড করা যাবে না 🚫  
২৭) কাউকে এড করলে তাকে নিয়ম জানাবেন 🚫  
২৮) যারা নিয়ম মানে না তাদের এড করবেন না 🚫  
২৯) কাউকে বিরক্ত করবেন না 🚫  
৩০) অন্যের নিকনেম চেঞ্জ করবেন না 🚫  
৩১) অন্যের নামে নিকনেম দিবেন না 🚫  
৩২) SPAM করবেন না 🚫  
৩৩) সমস্যা হলে অ্যাডমিনকে বলবেন 🚫  
৩৪) গ্রুপে ঝগড়া করবেন না 🚫  
৩৫) সবাই মিলেমিশে আড্ডা দিবেন 🌷😻
╚══════════════════════╝

 👑 BOT ADMIN:
 ${botAdminName}
 🔗 ${botAdminLink}

╔══════════════════════╗
👥 GROUP ADMINS:

${adminText}╚══════════════════════╝
╔══════════════════════╗
     🧾গুপ রুল্স না মানলে 
     ওয়ার্নিং ছারা কিক😒🤌
╚══════════════════════╝
`;

  return { msg, mentions };
}

// 🔰 COMMAND
module.exports.run = async ({ api, event, Users }) => {
  try {
    const { msg, mentions } = await buildMessage(api, event, Users);

    return api.sendMessage(
      { body: msg, mentions: mentions },
      event.threadID,
      event.messageID
    );
  } catch (e) {
    console.log("RULES RUN ERROR:", e);
    return api.sendMessage("❌ রুলস লোড করতে সমস্যা হয়েছে!", event.threadID, event.messageID);
  }
};

// 🔰 AUTO SYSTEM (বিকাল ৪:০০ - ৪:০৫, বাংলাদেশ সময়)
module.exports.handleEvent = async ({ api, event, Users }) => {
  try {
    if (!event.body) return;

    const bdTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })
    );

    const hour = bdTime.getHours();
    const minute = bdTime.getMinutes();

    const threadID = event.threadID;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
    const key = `${threadID}_${today}_rules`;

    if (hour === 16 && minute <= 5 && !lastSent[key]) {
      // আগে সেট করা, যাতে ডাবল সেন্ড না হয়
      lastSent[key] = true;

      // পুরনো দিনের ডাটা মুছে ফেলা
      for (const k of Object.keys(lastSent)) {
        if (!k.includes(`_${today}_`)) delete lastSent[k];
      }
      saveData();

      const { msg, mentions } = await buildMessage(api, event, Users);

      api.sendMessage({ body: msg, mentions: mentions }, threadID);
    }
  } catch (e) {
    console.log("RULES AUTO ERROR:", e);
  }
};
