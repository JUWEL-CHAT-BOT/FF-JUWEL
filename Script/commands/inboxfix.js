/**
 * inboxfix.js — ইনবক্সে বট যাতে কাজ করে (আগের কোনো ফাইল বদলাতে হয় না)
 * বসান: Script/commands/inboxfix.js
 * Credit: 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
 *
 * সমস্যাটা কী ছিল:
 *   গ্রুপের তথ্য বট আগে থেকে ডেটাবেসে জমিয়ে রাখে। ইনবক্সের তথ্য জমানো হয় না, তাই ইনবক্সের প্রতিটা মেসেজে
 *   বট Facebook থেকে thread info আনে (এক মেসেজে ২–৩ বার) এবং সরাসরি `.adminIDs.find(...)` চালায়।
 *   Facebook/FCA ইনবক্সের জন্য ফাঁকা বা ভুল উত্তর দিলে বা এরর দিলে handleCommand চুপচাপ ভেঙে যায়, কোনো লগও আসে না।
 *
 * এই ফাইল যা করে:
 *   1. api.getThreadInfo-কে নিরাপদ করে: ইনবক্সে এরর বা ফাঁকা উত্তর এলে একটা নিরাপদ ডিফল্ট দেয় (adminIDs: [])।
 *      গ্রুপে এরর হলে আগের মতোই এরর যায়, লুকানো হয় না।
 *   2. ইনবক্সের উত্তর ৫ মিনিট মনে রাখে, ফলে Facebook-এ অযথা অনুরোধ কমে।
 *   3. ইনবক্সে মেসেজ এলে লগে একটা লাইন দেখায় (বোঝা যায় মেসেজ বটে পৌঁছাচ্ছে)।
 *   4. /inboxfix কমান্ড (শুধু বট অ্যাডমিন) অবস্থা দেখায়।
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const LOG_EVERY_MS = 30 * 1000;

const state = {
  patchedAt: null,
  inboxSeen: 0,
  lastInboxAt: null,
  lastInboxFrom: null,
  fallbackUsed: 0,
  lastFallbackAt: null,
  lastFallbackReason: null,
  normalized: 0
};

const groupsSeen = new Set();
const infoCache = new Map(); // threadID -> { at, info }
const lastLogAt = new Map();
const warned = new Set();

function log(message) {
  try {
    const logger = require("../../utils/log.js");
    logger(message, "[ INBOXFIX ]");
  } catch (_) {
    console.log("[ INBOXFIX ] " + message);
  }
}

function errText(err) {
  if (!err) return "unknown";
  return String((err && err.message) || err).slice(0, 160);
}

function isKnownGroup(id) {
  if (groupsSeen.has(id)) return true;
  const list = global.data && global.data.allThreadID;
  return Array.isArray(list) && list.includes(id);
}

function fallbackInfo(id) {
  return {
    threadID: id,
    threadName: "",
    participantIDs: [id],
    userInfo: [],
    nicknames: {},
    adminIDs: [],
    isGroup: false,
    emoji: null,
    color: null,
    approvalMode: false,
    __inboxfix: true
  };
}

function normalize(info) {
  let changed = false;
  if (!Array.isArray(info.adminIDs)) { info.adminIDs = []; changed = true; }
  if (!Array.isArray(info.userInfo)) { info.userInfo = []; changed = true; }
  if (!Array.isArray(info.participantIDs)) { info.participantIDs = []; changed = true; }
  if (!info.nicknames || typeof info.nicknames !== "object") { info.nicknames = {}; changed = true; }
  if (changed) state.normalized += 1;
  return info;
}

function patchApi(api) {
  if (!api || typeof api.getThreadInfo !== "function" || api.getThreadInfo.__inboxfix) return false;

  const original = api.getThreadInfo;

  const wrapped = function getThreadInfoSafe(threadID, callback) {
    // একসাথে অনেক thread চাইলে আগের মতোই ছেড়ে দিই
    if (Array.isArray(threadID)) return original.apply(api, arguments);

    const id = String(threadID);
    const known = isKnownGroup(id);

    const cached = !known ? infoCache.get(id) : null;
    const fresh = cached && Date.now() - cached.at < CACHE_TTL_MS;

    const promise = fresh
      ? Promise.resolve(Object.assign({}, cached.info))
      : new Promise((resolve, reject) => {
          let done = false;
          const finish = (err, data) => {
            if (done) return;
            done = true;

            if (err || !data || typeof data !== "object") {
              if (known) return reject(err || new Error("empty thread info"));

              state.fallbackUsed += 1;
              state.lastFallbackAt = Date.now();
              state.lastFallbackReason = errText(err) || "empty response";
              if (!warned.has(id)) {
                warned.add(id);
                log(`getThreadInfo(${id}) ব্যর্থ (${state.lastFallbackReason}) — নিরাপদ ডিফল্ট ব্যবহার হচ্ছে।`);
              }
              const info = fallbackInfo(id);
              infoCache.set(id, { at: Date.now(), info });
              return resolve(Object.assign({}, info));
            }

            normalize(data);
            if (data.isGroup === false) infoCache.set(id, { at: Date.now(), info: data });
            return resolve(data);
          };

          try {
            const ret = original.call(api, threadID, (err, data) => finish(err, data));
            if (ret && typeof ret.then === "function") ret.then((d) => finish(null, d), (e) => finish(e));
          } catch (e) {
            finish(e);
          }
        });

    if (typeof callback === "function") {
      promise.then(
        (d) => { try { callback(null, d); } catch (_) {} },
        (e) => { try { callback(e); } catch (_) {} }
      );
    }
    return promise;
  };

  wrapped.__inboxfix = true;
  api.getThreadInfo = wrapped;
  if (!state.patchedAt) state.patchedAt = Date.now();
  return true;
}

module.exports.config = {
  name: "inboxfix",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "ইনবক্সে বট চালু রাখার সুরক্ষা ও অবস্থা দেখা",
  commandCategory: "system",
  usages: "inboxfix",
  cooldowns: 3
};

module.exports.languages = { en: {}, vi: {} };

module.exports.onLoad = function ({ api }) {
  try {
    patchApi(api);
    if (global.client && global.client.api) patchApi(global.client.api);

    // লগইন নতুন করে হলে নতুন api অবজেক্টেও প্যাচ বসাবে
    const timer = setInterval(() => {
      try {
        if (global.client && global.client.api) patchApi(global.client.api);
      } catch (_) {}
    }, 60 * 1000);
    if (timer && typeof timer.unref === "function") timer.unref();

    log("ইনবক্স সুরক্ষা চালু হয়েছে।");
  } catch (e) {
    log("চালু করতে সমস্যা: " + errText(e));
  }
};

module.exports.handleEvent = function ({ event, api }) {
  try {
    patchApi(api);
    if (!event || !["message", "message_reply"].includes(event.type)) return;

    const threadID = String(event.threadID);
    if (event.isGroup) {
      groupsSeen.add(threadID);
      return;
    }

    state.inboxSeen += 1;
    state.lastInboxAt = Date.now();
    state.lastInboxFrom = String(event.senderID);

    const last = lastLogAt.get(threadID) || 0;
    if (Date.now() - last >= LOG_EVERY_MS) {
      lastLogAt.set(threadID, Date.now());
      log(`ইনবক্স মেসেজ এসেছে (পাঠানো: ${event.senderID})`);
    }
  } catch (_) {}
};

function ago(ts) {
  if (!ts) return "এখনো না";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} সেকেন্ড আগে`;
  if (s < 3600) return `${Math.floor(s / 60)} মিনিট আগে`;
  return `${Math.floor(s / 3600)} ঘণ্টা আগে`;
}

module.exports.run = function ({ api, event }) {
  const cfg = global.config || {};
  const text =
    "📥 ইনবক্স অবস্থা\n" +
    "━━━━━━━━━━━━━━\n" +
    `• allowInbox: ${cfg.allowInbox}\n` +
    `• adminOnly: ${cfg.adminOnly}\n` +
    `• সুরক্ষা চালু: ${state.patchedAt ? "হ্যাঁ (" + ago(state.patchedAt) + ")" : "না"}\n` +
    `• ইনবক্স মেসেজ দেখা গেছে: ${state.inboxSeen} টি\n` +
    `• শেষ ইনবক্স মেসেজ: ${ago(state.lastInboxAt)}${state.lastInboxFrom ? " (" + state.lastInboxFrom + ")" : ""}\n` +
    `• নিরাপদ ডিফল্ট লেগেছে: ${state.fallbackUsed} বার\n` +
    `• শেষ কারণ: ${state.lastFallbackReason || "—"}`;
  return api.sendMessage(text, event.threadID, event.messageID);
};
