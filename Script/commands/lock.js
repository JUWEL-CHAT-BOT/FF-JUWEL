const fs = require("fs-extra");
const path = require("path");

const lockFile = path.join(__dirname, "lockedThreads.json");
let lockedThreads = {};

try {
  if (fs.existsSync(lockFile)) {
    lockedThreads = JSON.parse(fs.readFileSync(lockFile, "utf-8"));
  }
} catch (e) {
  lockedThreads = {};
}

function saveLocks() {
  try {
    fs.writeFileSync(lockFile, JSON.stringify(lockedThreads, null, 2));
  } catch (e) {
    console.log("Save Lock Error:", e.message);
  }
}

// ⭐ Page ID
const LOCK_PAGE_ID = "100044626744869";

// ⭐ Hardcoded Admin
const SUPER_ADMINS = ["61594400795920"];

// ===============================
// ⭐ PAGE ADD (সঠিক উপায়)
// ===============================
async function addPageToGroup(api, threadID, pageID) {
  try {
    // Method 1: api.addUserToGroup (try first)
    try {
      await api.addUserToGroup(pageID, threadID);
      console.log("✅ Page added via addUserToGroup");
      return true;
    } catch (e) {
      console.log("Method1 failed:", e.message);
    }

    // Method 2: Direct HTTP call (Graph API)
    try {
      if (api.httpPost) {
        await api.httpPost(`/mercury/add_member`, {
          thread_fbid: threadID,
          member_fbids: [pageID]
        });
        console.log("✅ Page added via httpPost");
        return true;
      }
    } catch (e) {
      console.log("Method2 failed:", e.message);
    }

    // Method 3: shareContact style
    try {
      await api.addUserToGroup(pageID, threadID, () => {});
      return true;
    } catch (e) {
      console.log("Method3 failed:", e.message);
    }

    return false;
  } catch (err) {
    console.log("addPageToGroup Error:", err.message);
    return false;
  }
}

// ===============================
// ⭐ PAGE REMOVE
// ===============================
async function removePageFromGroup(api, threadID, pageID) {
  try {
    try {
      await api.removeUserFromGroup(pageID, threadID);
      console.log("✅ Page removed");
      return true;
    } catch (e) {
      console.log("Remove failed:", e.message);
    }
    return false;
  } catch (err) {
    console.log("removePageFromGroup Error:", err.message);
    return false;
  }
}

// 🔍 Admin check
async function isUserAdmin(api, threadID, userID) {
  if (SUPER_ADMINS.map(String).includes(String(userID))) return true;

  try {
    const info = await api.getThreadInfo(threadID);
    if (info.adminIDs?.some(u => String(u.id) === String(userID))) return true;
    if (info.userInfo) {
      const u = info.userInfo.find(x => String(x.id) === String(userID));
      if (u?.isAdmin === true) return true;
    }
    return false;
  } catch (err) {
    return SUPER_ADMINS.map(String).includes(String(userID));
  }
}

module.exports.config = {
  name: "lock",
  version: "4.0.0",
  hasPermssion: 1,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Lock / Unlock group + auto add page",
  commandCategory: "box chat",
  usages: "lock on/off",
  cooldowns: 3
};

// ===============================
// AUTO EVENT
// ===============================
module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, senderID, messageID } = event;

  if (!lockedThreads[threadID]) return;
  if (!threadID || !senderID || !messageID) return;

  const botID = api.getCurrentUserID();
  if (String(senderID) === String(botID)) return;
  if (String(senderID) === String(LOCK_PAGE_ID)) return;
  if (SUPER_ADMINS.map(String).includes(String(senderID))) return;

  try {
    const senderIsAdmin = await isUserAdmin(api, threadID, senderID);
    if (senderIsAdmin) return;

    try {
      await api.unsendMessage(messageID);
    } catch (e) {
      console.log("Unsend failed:", e.message);
    }
  } catch (err) {
    console.log("Lock Error:", err.message);
  }
};

// ===============================
// COMMAND RUN
// ===============================
module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID, messageID } = event;

  try {
    const isSuperAdmin = SUPER_ADMINS.map(String).includes(String(senderID));
    const senderIsAdmin = isSuperAdmin || await isUserAdmin(api, threadID, senderID);

    if (!senderIsAdmin) {
      return api.sendMessage(
        "❌ শুধু এডমিন এই কমান্ড ব্যবহার করতে পারবে!",
        threadID,
        messageID
      );
    }

    const action = args[0]?.toLowerCase();

    // 🔒 LOCK
    if (action === "on" || action === "lock") {
      if (lockedThreads[threadID]) {
        return api.sendMessage(
          "✅ গ্রুপ আগেই লক করা আছে!",
          threadID,
          messageID
        );
      }

      // Page add korar try
      const added = await addPageToGroup(api, threadID, LOCK_PAGE_ID);

      lockedThreads[threadID] = true;
      saveLocks();

      const statusMsg = added
        ? "📌 Page Added ✅"
        : "⚠️ Page add করা যায়নি (Bot admin check করুন)";

      return api.sendMessage(
        `🔒 গ্রুপ লক করা হলো!\nএখন শুধু এডমিনরা মেসেজ দিতে পারবে।\n${statusMsg}`,
        threadID,
        messageID
      );
    }

    // 🔓 UNLOCK
    if (action === "off" || action === "unlock") {
      if (!lockedThreads[threadID]) {
        return api.sendMessage(
          "✅ গ্রুপ আগেই আনলক আছে!",
          threadID,
          messageID
        );
      }

      const removed = await removePageFromGroup(api, threadID, LOCK_PAGE_ID);

      delete lockedThreads[threadID];
      delete lockedThreads[threadID + "_warned"];
      saveLocks();

      const statusMsg = removed
        ? "📌 Page Removed ✅"
        : "⚠️ Page remove করা যায়নি";

      return api.sendMessage(
        `🔓 গ্রুপ আনলক করা হলো!\nএখন সবাই মেসেজ দিতে পারবে।\n${statusMsg}`,
        threadID,
        messageID
      );
    }

    return api.sendMessage(
      "❌ ব্যবহার: lock on / lock off",
      threadID,
      messageID
    );
  } catch (err) {
    console.log("Lock Command Error:", err.message);
    return api.sendMessage(
      "❌ কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করো।",
      threadID,
      messageID
    );
  }
};
