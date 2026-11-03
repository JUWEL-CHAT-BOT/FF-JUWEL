module.exports.config = {
    name: "ckbot",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
    description: "User, Box ও Admin এর তথ্য দেখায়",
    commandCategory: "Media",
    usages: "[user | box | admin]",
    cooldowns: 4,
    dependencies: {
        "request": "",
        "fs-extra": ""
    }
};

// ================= সেটিংস =================
const ADMIN_NAME = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
const ADMIN_UID = "YOUR_FACEBOOK_UID"; // <-- এখানে নিজের Facebook UID বসান
const FB_TOKEN = process.env.FB_TOKEN || "6628568379|c1e620fa708a1d5696fb991c1bde5662";

// ================= UI হেল্পার =================
const LINE = "━━━━━━━━━━━━━━━━━━━━━━";
const box = (title, rows) =>
    `╔${LINE}╗\n   ✦ ${title} ✦\n╚${LINE}╝\n\n${rows.map(r => `  ❯ ${r}`).join("\n")}\n\n╭${LINE}╮\n   ${ADMIN_NAME}\n╰${LINE}╯`;

const picUrl = id =>
    encodeURI(`https://graph.facebook.com/${id}/picture?height=720&width=720&access_token=${FB_TOKEN}`);

module.exports.run = async ({ api, event, args }) => {
    const fs = global.nodemodule["fs-extra"];
    const request = global.nodemodule["request"];
    const { threadID, messageID, senderID } = event;

    const threadSetting = global.data.threadData.get(parseInt(threadID)) || {};
    const prefix = threadSetting.hasOwnProperty("PREFIX") ? threadSetting.PREFIX : global.config.PREFIX;
    const cmd = `${prefix}${this.config.name}`;

    const cacheDir = __dirname + "/cache";
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // প্রতিবার আলাদা ফাইল, যাতে একসাথে কমান্ড চললে ফাইল গোলমাল না হয়
    const makePath = () => `${cacheDir}/ckbot_${Date.now()}_${Math.floor(Math.random() * 9999)}.png`;

    // ছবি নামিয়ে মেসেজসহ পাঠায়; ছবি না এলে শুধু টেক্সট পাঠায়
    const sendWithImage = (body, url) => new Promise(resolve => {
        const path = makePath();
        const cleanup = () => { try { fs.unlinkSync(path); } catch (e) {} };

        const sendTextOnly = () => api.sendMessage(body, threadID, () => resolve(), messageID);

        if (!url) return sendTextOnly();

        request(url)
            .on("error", sendTextOnly)
            .pipe(fs.createWriteStream(path))
            .on("error", sendTextOnly)
            .on("close", () => {
                api.sendMessage(
                    { body, attachment: fs.createReadStream(path) },
                    threadID,
                    () => { cleanup(); resolve(); },
                    messageID
                );
            });
    });

    try {
        // ===== Help =====
        if (args.length === 0) {
            return api.sendMessage(
                box("𝐂𝐊𝐁𝐎𝐓 𝐇𝐄𝐋𝐏", [
                    `${cmd} user ⇝ নিজের তথ্য`,
                    `${cmd} user @tag ⇝ ট্যাগ করা ইউজারের তথ্য`,
                    `${cmd} box ⇝ গ্রুপের তথ্য`,
                    `${cmd} admin ⇝ বট অ্যাডমিনের তথ্য`
                ]),
                threadID,
                messageID
            );
        }

        const type = args[0].toLowerCase();

        // ===== Box Info =====
        if (type === "box") {
            const targetThreadID = args[1] || threadID;
            const info = await api.getThreadInfo(targetThreadID);

            const users = info.userInfo || [];
            const male = users.filter(u => u.gender === "MALE").length;
            const female = users.filter(u => u.gender === "FEMALE").length;
            const approval = info.approvalMode ? "✅ চালু" : "❌ বন্ধ";

            const body = box("𝐆𝐑𝐎𝐔𝐏 𝐈𝐍𝐅𝐎", [
                `নাম: ${info.threadName || "নাম নেই"}`,
                `TID: ${targetThreadID}`,
                `Approval: ${approval}`,
                `Emoji: ${info.emoji || "👍"}`,
                `সদস্য: ${(info.participantIDs || []).length} জন`,
                `অ্যাডমিন: ${(info.adminIDs || []).length} জন`,
                `ছেলে: ${male} | মেয়ে: ${female}`,
                `মোট মেসেজ: ${info.messageCount || 0}`
            ]);

            return sendWithImage(body, info.imageSrc ? encodeURI(info.imageSrc) : null);
        }

        // ===== Admin Info =====
        if (type === "admin") {
            const body = box("𝐀𝐃𝐌𝐈𝐍 𝐈𝐍𝐅𝐎", [
                `নাম: ${ADMIN_NAME}`,
                `Facebook: https://facebook.com/${ADMIN_UID}`,
                `ধন্যবাদ ${global.config.BOTNAME || "এই"} বট ব্যবহার করার জন্য 💖`
            ]);

            return sendWithImage(body, picUrl(ADMIN_UID));
        }

        // ===== User Info =====
        if (type === "user") {
            let id;
            const mentionIDs = Object.keys(event.mentions || {});

            if (!args[1]) {
                id = event.type === "message_reply" ? event.messageReply.senderID : senderID;
            } else if (mentionIDs.length > 0) {
                id = mentionIDs[0];
            } else if (/^\d+$/.test(args[1])) {
                id = args[1];
            } else {
                return api.sendMessage("⚠️ সঠিক UID দিন অথবা কাউকে ট্যাগ করুন।", threadID, messageID);
            }

            const data = await api.getUserInfo(id);
            const u = data && data[id];
            if (!u) return api.sendMessage("❌ ইউজারের তথ্য পাওয়া যায়নি।", threadID, messageID);

            const profileUrl = u.vanity
                ? `https://facebook.com/${u.vanity}`
                : `https://facebook.com/profile.php?id=${id}`;
            const gender = u.gender == 2 ? "👨 ছেলে" : u.gender == 1 ? "👩 মেয়ে" : "❓ উল্লেখ নেই";
            const isFriend = u.isFriend ? "✅ হ্যাঁ" : "❌ না";

            const body = box("𝐔𝐒𝐄𝐑 𝐈𝐍𝐅𝐎", [
                `নাম: ${u.name}`,
                `UID: ${id}`,
                `লিংক: ${profileUrl}`,
                `জেন্ডার: ${gender}`,
                `বটের ফ্রেন্ড: ${isFriend}`
            ]);

            return sendWithImage(body, picUrl(id));
        }

        // ===== ভুল কমান্ড =====
        return api.sendMessage(`⚠️ ভুল অপশন! দেখুন: ${cmd}`, threadID, messageID);

    } catch (err) {
        console.error("[ckbot]", err);
        return api.sendMessage("❌ কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।", threadID, messageID);
    }
};
