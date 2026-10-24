module.exports.config = {
    name: "listadmin",
    version: "3.3.0",
    hasPermssion: 0,
    credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
    description: "Group & Bot Admin List with Full Features",
    commandCategory: "Box Chat",
    usages: "listadmin [পেজ নম্বর]",
    cooldowns: 5
};

// ───── CACHE SYSTEM ─────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key) {
    const data = cache.get(key);
    if (!data) return null;
    if (Date.now() - data.time > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return data.value;
}

function setCache(key, value) {
    cache.set(key, { value, time: Date.now() });
}

// ───── UID বের করার helper (যেকোনো ফরম্যাট সাপোর্ট) ─────
function getUID(ad) {
    if (ad === null || ad === undefined) return null;
    if (typeof ad === "string" || typeof ad === "number") return String(ad);
    const id = ad.id || ad.userID || ad.uid || ad.userFbId || ad.userId || "";
    return id ? String(id) : null;
}

// ───── USER NAME FETCH (Facebook নাম) ─────
async function fetchUserName(api, uid) {
    uid = String(uid);
    const cached = getCache(`user_${uid}`);
    if (cached) return cached;

    // প্রথম চেষ্টা: getUserInfo
    try {
        const info = await api.getUserInfo(uid);
        const user = info && (info[uid] || info[Number(uid)]);

        if (user) {
            const name =
                user.name ||
                (user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : null) ||
                user.firstName ||
                user.vanity ||
                null;

            if (name) {
                setCache(`user_${uid}`, name);
                return name;
            }
        }
    } catch {}

    // দ্বিতীয় চেষ্টা: getUserProfile (থাকলে)
    try {
        if (typeof api.getUserProfile === "function") {
            const profile = await api.getUserProfile(uid);
            if (profile) {
                const name =
                    profile.name ||
                    profile.fullName ||
                    (profile.firstName && profile.lastName
                        ? `${profile.firstName} ${profile.lastName}`
                        : null) ||
                    profile.firstName ||
                    null;

                if (name) {
                    setCache(`user_${uid}`, name);
                    return name;
                }
            }
        }
    } catch {}

    // তৃতীয় চেষ্টা: Users ডাটাবেস (থাকলে)
    try {
        if (global.data?.userName?.has(uid)) {
            const name = global.data.userName.get(uid);
            if (name) {
                setCache(`user_${uid}`, name);
                return name;
            }
        }
    } catch {}

    return `Unknown (${uid})`;
}

// ───── PERMISSION CHECK ─────
function getBotAdmins() {
    const list = global.config?.ADMINBOT || global.config?.adminBot || [];
    return [...new Set(list.map(String))];
}

function isGroupAdmin(userID, adminUIDs) {
    return adminUIDs.includes(String(userID));
}

function isBotAdmin(userID) {
    return getBotAdmins().includes(String(userID));
}

// ───── PAGINATION ─────
function paginate(arr, page, perPage = 5) {
    const total = Math.ceil(arr.length / perPage) || 1;
    const current = Math.min(Math.max(page, 1), total);
    const start = (current - 1) * perPage;
    return {
        items: arr.slice(start, start + perPage),
        total,
        current,
        perPage
    };
}

// ───── GROUP তৈরির তারিখ ─────
function getCreatedTime(threadInfo) {
    try {
        const raw =
            threadInfo.formed ||
            threadInfo.createdTime ||
            threadInfo.snippet?.timestamp ||
            threadInfo.threadProperties?.formed ||
            threadInfo.timestamp ||
            null;

        if (!raw) return "অজানা";

        const num = Number(raw);
        if (isNaN(num)) return "অজানা";

        const ms = num > 1e12 ? num : num * 1000;
        const date = new Date(ms);
        if (isNaN(date.getTime())) return "অজানা";

        return date.toLocaleDateString("bn-BD", {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    } catch {
        return "অজানা";
    }
}

// ───── MAIN RUN ─────
module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const requestedPage = parseInt(args?.[0]) || 1;

    let threadInfo;
    try {
        threadInfo = await api.getThreadInfo(threadID);
    } catch {
        return api.sendMessage(
            "❌ গ্রুপের তথ্য লোড করতে সমস্যা হয়েছে!",
            threadID, messageID
        );
    }

    // ───── গ্রুপ অ্যাডমিন (UID অ্যারে, ডুপ্লিকেট মুক্ত) ─────
    const groupAdmins = [...new Set(
        (threadInfo.adminIDs || []).map(getUID).filter(Boolean)
    )];

    // ───── বট অ্যাডমিন (ডুপ্লিকেট মুক্ত) ─────
    const botAdmins = getBotAdmins();

    // ───── PERMISSION CHECK ─────
    if (!isGroupAdmin(senderID, groupAdmins) && !isBotAdmin(senderID)) {
        return api.sendMessage(
            "⛔ শুধুমাত্র অ্যাডমিনরা এই কমান্ড ব্যবহার করতে পারবে!",
            threadID, messageID
        );
    }

    // ───── LOADING MESSAGE ─────
    const loadMsg = await api.sendMessage(
        "⏳ Facebook থেকে অ্যাডমিনদের নাম লোড হচ্ছে...",
        threadID
    );

    try {
        // ───── GROUP INFO ─────
        const groupName    = threadInfo.threadName || "Unknown Group";
        const totalMembers = threadInfo.participantIDs?.length || 0;
        const createdTime  = getCreatedTime(threadInfo);
        const groupID      = threadID;

        // ───── সব নাম একসাথে লোড (দ্রুত) ─────
        const uniqueUIDs = [...new Set([...groupAdmins, ...botAdmins])];
        await Promise.all(uniqueUIDs.map(uid => fetchUserName(api, uid)));

        // ───── GROUP ADMIN LIST (পেজিং সহ) ─────
        const groupPaged = paginate(groupAdmins, requestedPage);
        const groupList = groupPaged.items.length
            ? (await Promise.all(
                groupPaged.items.map(async (uid, idx) => {
                    const name  = await fetchUserName(api, uid);
                    const isBot = isBotAdmin(uid);
                    const tag   = isBot ? "\n     ┗👑 বট অ্যাডমিনও" : "";
                    return (
                        `  ${(groupPaged.current - 1) * groupPaged.perPage + idx + 1}. 👤 ${name}` +
                        `\n     ┗🆔 ${uid}` +
                        `\n     ┗🔗 fb.com/${uid}` +
                        tag
                    );
                })
            )).join("\n\n")
            : "  কোনো গ্রুপ অ্যাডমিন নেই";

        // ───── BOT ADMIN LIST (সব একসাথে, পেজিং ছাড়া) ─────
        const botList = botAdmins.length
            ? (await Promise.all(
                botAdmins.map(async (uid, idx) => {
                    const name = await fetchUserName(api, uid);
                    const isGA = isGroupAdmin(uid, groupAdmins);
                    const tag  = isGA ? "\n     ┗🛡️ গ্রুপ অ্যাডমিনও" : "";
                    return (
                        `  ${idx + 1}. 🤖 ${name}` +
                        `\n     ┗🆔 ${uid}` +
                        `\n     ┗🔗 fb.com/${uid}` +
                        tag
                    );
                })
            )).join("\n\n")
            : "  কোনো বট অ্যাডমিন নেই";

        // ───── PAGINATION INFO ─────
        let groupPageInfo = "";
        if (groupAdmins.length > groupPaged.perPage) {
            groupPageInfo = `\n\n  📄 পেজ ${groupPaged.current}/${groupPaged.total}`;
            if (groupPaged.current < groupPaged.total) {
                groupPageInfo += ` | পরের পেজ: listadmin ${groupPaged.current + 1}`;
            }
        }

        // ───── FINAL MESSAGE ─────
        const msg = `
╔══════════════════╗
║👑 অ্যাডমিন প্যানেল v3   ║
╚══════════════════╝

🏠 গ্রুপ   : ${groupName}
🆔 ID      : ${groupID}
👥 মেম্বার  : ${totalMembers} জন
📅 তারিখ   : ${createdTime}

┌──────────────────┐
  🛡️ গ্রুপ অ্যাডমিন [${groupAdmins.length} জন]
└──────────────────┘
${groupList}${groupPageInfo}

┌──────────────────┐
  ⚙️ বট অ্যাডমিন [${botAdmins.length} জন]
└──────────────────┘
${botList}

🔄 রিফ্রেশ করতে 👍 রিঅ্যাক্ট করুন
✦ ${module.exports.config.credits}`.trim();

        await api.editMessage(msg, loadMsg.messageID);

    } catch (err) {
        console.error("[listadmin error]", err);
        await api.editMessage(
            "❌ লোড করতে সমস্যা হয়েছে! আবার চেষ্টা করুন।",
            loadMsg.messageID
        );
    }
};

// ───── 👍 REACTION = REFRESH ─────
module.exports.handleReaction = async function ({ api, event }) {
    if (event.reaction !== "👍") return;

    return module.exports.run({
        api,
        event: {
            threadID: event.threadID,
            messageID: event.messageID,
            senderID: event.userID
        },
        args: []
    });
};
