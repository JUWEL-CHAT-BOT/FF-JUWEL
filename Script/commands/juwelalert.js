/**
 * ╔══════════════════════════════════════════════════════════╗
 *  JUWEL ALERT  —  Session Alert + Bot Start/Stop Notice
 *  Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
 * ╚══════════════════════════════════════════════════════════╝
 *
 *  v2.0.1 — "Account blocked … automated behavior (Code: 1357001)" WARN লাইন আর সন্দেহ/ALERT-এর কারণ নয়
 *           (বট চালু থাকলেও এটা আসে)। স্ট্যাটাসে VERSION দেখায়।
 *  v2.0.0 — ভুল (false) নোটিশ বন্ধ: এখন নোটিশ যাবে শুধু তখনই যখন সত্যিই আইডি লগআউট/বট বন্ধ।
 *           ① লগে "checkpoint/login failed" ইত্যাদি লাইন দেখলেই আর সাথে সাথে ALERT নয় —
 *             শুধু সন্দেহ ধরা হয়, ৩ মিনিট পর ফেসবুকে সরাসরি যাচাই করে (৩ বার), সত্যি মৃত হলে তবেই ALERT।
 *           ② টানা ৩ বার probe ব্যর্থ + পাঠানোর ঠিক আগে আবার যাচাই। ১০ মিনিটের মধ্যে কোনো ইভেন্ট
 *             (মেসেজ ইত্যাদি) এলে বট বেঁচে আছে ধরা হয়।
 *           ③ রিস্টার্ট ≠ বন্ধ: process.exit / ক্র্যাশ / নিজে থেমে যাওয়ার পর ওয়াচডগ ২ মিনিট দেখে —
 *             বট আবার চালু হয়ে গেলে "STOPPED" নোটিশ যায় না। না ফিরলে (বা ১৫ মিনিটে ৩+ বার ক্র্যাশ-লুপ হলে) যায়।
 *           ④ ৫ মিনিটের মধ্যে রিস্টার্ট হলে বারবার "STARTED" নোটিশও যায় না।
 *           ⑤ Ctrl+C / stop সিগন্যাল (SIGTERM ইত্যাদি) এ আগের মতোই সাথে সাথে STOPPED যায়।
 *  v1.9.0 — একসাথে ৫-৬টা "STOPPED" নোটিশ আসার সমস্যা ঠিক: পাঠানোর আগেই ফাইল-লক দিয়ে
 *           দখল (claim) নেওয়া হয়, তাই রিস্টার্ট/ওয়াচডগ একসাথে পাঠাতে পারে না।
 *           ALERT নোটিশেও চালু থাকার সময় + STARTED যোগ। রিস্টার্ট লুপে সময় ০ থেকে শুরু হয় না
 *           (৫ মিনিটের মধ্যে রিস্টার্ট হলে আগের সময় থেকেই গোনা চলে)।
 *  v1.8.0 — সব নোটিশে (লক/সেশন ALERT সহ) বট কতক্ষণ চালু ছিল তা দেখায়।
 *           সময়ের ক্রম: সেকেন্ড → মিনিট → ঘণ্টা → দিন।
 *  v1.7.0 — আইডি লক/সেশন সমস্যার নোটিশ একবারই, বট বন্ধের নোটিশও একবারই (রিস্টার্টেও বারবার যাবে না)।
 *           টানা ৫ মিনিট সুস্থ থাকলে তবেই লক খোলে এবং একবার "BACK ONLINE" যায়।
 *  v1.6.0 — প্রতিটি নোটিশে বটের নাম, অ্যাডমিনের নাম ও প্রথম অ্যাডমিন UID (config.json থেকে)।
 *  v1.5.0 — ফেসবুক আইডি লক/লগআউট হয়ে বট বন্ধ হলেও নোটিশ যাবে।
 *
 *  সেটিংস: config.json-এর "JUWEL_ALERT" অংশ (TG_TOKEN, TG_CHAT, DISCORD_WEBHOOK, HEARTBEAT_URL)
 *  অথবা env: JUWEL_TG_TOKEN, JUWEL_TG_CHAT (Telegram) | JUWEL_DISCORD_WEBHOOK (Discord) — env আগে
 *
 *  কমান্ড:  #juwelalert        (অবস্থা দেখায়, শুধু বট-অ্যাডমিন)
 *           #juwelalert test   (টেস্ট নোটিশ পাঠায়)
 */

// এই ফাইলকে `node juwelalert.js --juwel-watch` দিয়ে চালালে এটা ওয়াচডগ হিসেবে চলে
const IS_WATCHER = require.main === module && process.argv.includes("--juwel-watch");

if (!IS_WATCHER) { try { console.log("[JuwelAlert] ফাইল লোড হয়েছে (juwelalert.js)"); } catch (_) {} }

const axios = require("axios");
const FS = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────── config.json থেকে সেটিংস ───────────── */
(function loadAlertSettings() {
  try {
    const fs = require("fs"), path = require("path");
    const file = path.join(__dirname, "..", "..", "config.json");
    if (!fs.existsSync(file)) return;
    const cfg = JSON.parse(fs.readFileSync(file, "utf8")).JUWEL_ALERT || {};
    const map = { TG_TOKEN: "JUWEL_TG_TOKEN", TG_CHAT: "JUWEL_TG_CHAT", DISCORD_WEBHOOK: "JUWEL_DISCORD_WEBHOOK", HEARTBEAT_URL: "JUWEL_HEARTBEAT_URL" };
    Object.keys(map).forEach((k) => {
      const v = cfg[k] === undefined || cfg[k] === null ? "" : String(cfg[k]).trim();
      if (v && !process.env[map[k]]) process.env[map[k]] = v;
    });
  } catch (_) {}
})();

const PROBE_EVERY_MS = Number(process.env.JUWEL_PROBE_MS) || 2 * 60 * 1000;
const PROBE_FAILS_BEFORE_ALERT = 3; // টানা এতবার ব্যর্থ হলে তবেই যাচাই-প্রক্রিয়া শুরু
const BOOT_NOTICE_DELAY_MS = Number(process.env.JUWEL_BOOT_MS) || 20 * 1000;
const LOGIN_GRACE_MS = Number(process.env.JUWEL_LOGIN_GRACE_MS) || 5 * 60 * 1000; // এর মধ্যে লগইন না হলে সতর্কতা
const STOP_NOTICE_WAIT_MS = 6000; // বন্ধ হওয়ার আগে নোটিশ পাঠাতে সর্বোচ্চ এত সময় অপেক্ষা
const RECOVER_STABLE_MS = Number(process.env.JUWEL_RECOVER_MS) || 5 * 60 * 1000; // এতক্ষণ টানা সুস্থ থাকলে তবেই "ফিরে এসেছে"
const EPISODE_MAX_MS = 6 * 60 * 60 * 1000; // নিরাপত্তা: ৬ ঘণ্টা পর লক নিজে খুলে যাবে
const EVENT_ALIVE_MS = 10 * 60 * 1000; // এর মধ্যে কোনো ইভেন্ট এলে বট বেঁচে আছে ধরা হয়
const SUSPECT_DELAY_MS = 3 * 60 * 1000; // লগে সন্দেহজনক লাইন দেখার পর এতক্ষণ অপেক্ষা করে তারপর যাচাই
const RESTART_GRACE_MS = Number(process.env.JUWEL_RESTART_GRACE_MS) || 2 * 60 * 1000; // রিস্টার্টের জন্য ওয়াচডগের অপেক্ষা
const LOOP_EXITS = 3; // এই সময়ের মধ্যে এতবার বন্ধ হলে ক্র্যাশ-লুপ ধরা হয়
const LOOP_WINDOW_MS = 15 * 60 * 1000;

/* ───────────── একবারই-পাঠানো লক (ফাইলে, প্রসেস-নিরাপদ) ───────────── */
const LATCH_FILE = require("path").join(__dirname, "..", "..", "juwelalert.latch.json");
const LOCK_FILE = LATCH_FILE + ".lock";
const RUN_FILE = require("path").join(__dirname, "..", "..", "juwelalert.run.json");
const PENDING_MS = 20 * 1000; // "পাঠানো চলছে" ধরে নেওয়ার সর্বোচ্চ সময়

function latchRead() {
  try { return JSON.parse(require("fs").readFileSync(LATCH_FILE, "utf8")) || {}; }
  catch (_) { return {}; }
}
function latchWrite(o) {
  try { require("fs").writeFileSync(LATCH_FILE, JSON.stringify(o)); } catch (_) {}
}
// একসাথে একাধিক প্রসেস ভেতরে ঢুকতে পারবে না
function withFileLock(fn) {
  const fs = require("fs");
  const t0 = Date.now();
  while (true) {
    try { fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" }); break; }
    catch (_) {
      try { if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > 5000) fs.unlinkSync(LOCK_FILE); } catch (__) {}
      if (Date.now() - t0 > 3000) break;
      const end = Date.now() + 25; while (Date.now() < end) {}
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch (_) {} }
}
// key: "alert" (লক/সেশন সমস্যা) | "stop" (বট বন্ধ)
// পাঠানো হয়ে গেছে বা কেউ এখন পাঠাচ্ছে → false
function canSend(key) {
  const o = latchRead();
  const t = o[key], p = o[key + "_p"];
  if (t && Date.now() - t < EPISODE_MAX_MS) return false;
  if (p && Date.now() - p < PENDING_MS) return false;
  return true;
}
// পাঠানোর আগে দখল নেয়; সফল হলে true
function claim(key) {
  return withFileLock(() => {
    if (!canSend(key)) return false;
    const o = latchRead(); o[key + "_p"] = Date.now(); latchWrite(o);
    return true;
  });
}
function markSent(key) {
  withFileLock(() => { const o = latchRead(); o[key] = Date.now(); delete o[key + "_p"]; latchWrite(o); });
}
function release(key) {
  withFileLock(() => { const o = latchRead(); delete o[key + "_p"]; latchWrite(o); });
}
function clearLatch() { withFileLock(() => latchWrite({})); }

/* ───────────── চালু থাকার সময় (রিস্টার্টেও টিকে থাকে) ───────────── */
// run ফাইল: since (শুরুর সময়), seen (শেষ লগইন-সুস্থ সময়), pid, alive (প্রসেস বেঁচে থাকার সময়), exits (সাম্প্রতিক বন্ধের তালিকা)
function runRead() {
  try { return JSON.parse(FS.readFileSync(RUN_FILE, "utf8")) || {}; }
  catch (_) { return {}; }
}
function runWrite(o) {
  try { FS.writeFileSync(RUN_FILE, JSON.stringify(o)); } catch (_) {}
}
const PROC_START = Date.now() - Math.round(process.uptime() * 1000);
const RUN_START = (function () {
  try {
    const r = runRead();
    // ৫ মিনিটের মধ্যে রিস্টার্ট হলে আগের সময় থেকেই গোনা চলবে
    if (r && r.since && r.seen && PROC_START - r.seen < 5 * 60 * 1000) return r.since;
  } catch (_) {}
  return PROC_START;
})();
const IS_QUICK_RESTART = RUN_START < PROC_START - 5000; // ৫ মিনিটের মধ্যে রিস্টার্ট হয়েছে
function saveRunInfo() {
  try {
    const prev = runRead();
    const loggedIn = !!(global.client && global.client.api);
    runWrite({
      since: RUN_START,
      seen: loggedIn ? Date.now() : (prev.seen || 0),
      pid: process.pid,
      alive: Date.now(),
      exits: Array.isArray(prev.exits) ? prev.exits : []
    });
  } catch (_) {}
}
const fmtDate = (ms) => {
  try { return new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { return new Date(ms).toISOString(); }
};

const state = global.__juwelAlert || (global.__juwelAlert = {
  started: false,
  bootAt: Date.now(),
  logHits: [],
  lastLoginIssueAt: 0,
  lockAt: 0,
  lockReason: "",
  probeFails: 0,
  lastProbeOk: null,
  lastProbeAt: 0,
  lastAlertAt: 0,
  alertSending: false,
  confirming: false,
  confirmedDeadAt: 0,
  suspectTimer: null,
  lastEventAt: 0,
  okSince: 0,
  down: false,
  downSince: 0,
  bootNoticeSent: false
});

/* ───────────── helpers ───────────── */
const dhakaTime = () => fmtDate(Date.now());
const pad2 = (n) => String(n).padStart(2, "0");
// সেকেন্ড থেকে দিন/ঘণ্টা/মিনিট/সেকেন্ড
const uptimeParts = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
};
// সময় সবসময় এই ক্রমে: সেকেন্ড → মিনিট → ঘণ্টা → দিন
const fmtDur = (ms) => {
  const u = uptimeParts(ms / 1000);
  return u.s + "s " + u.m + "m " + u.h + "h " + u.d + "d";
};
// সব নোটিশে একই সাজানো সময়-ব্লক (সেকেন্ড → মিনিট → ঘণ্টা → দিন)
const uptimeLines = (up) =>
  " ┌ ⏳ SECONDS ➤ " + pad2(up.s) + "\n" +
  " ├ ⏰ MINUTES ➤ " + pad2(up.m) + "\n" +
  " ├ 🕐 HOURS ➤ " + pad2(up.h) + "\n" +
  " └ 📆 DAYS ➤ " + pad2(up.d) + "\n" +
  " ✦ " + pad2(up.s) + "s " + pad2(up.m) + "m " + pad2(up.h) + "h " + up.d + "d";

// ইংরেজি অক্ষর ও সংখ্যা → 𝗔𝗕𝗖𝗗 𝟭𝟮𝟯 (Sans-Serif Bold). বাংলা/ইমোজি অপরিবর্তিত থাকে।
const fx = (str) => String(str).replace(/[A-Za-z0-9]/g, (c) => {
  const n = c.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D5D4 + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D5EE + n - 97);
  return String.fromCodePoint(0x1D7EC + n - 48);
});
const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐"; // ফন্ট-রূপান্তর হয় না, যেমন আছে তেমন

const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

function log(msg, level) {
  try { require("../../utils/log.js")("[JuwelAlert] " + msg, level || "info"); }
  catch (_) { try { process.stdout.write("[JuwelAlert] " + msg + "\n"); } catch (__) {} }
}

function adminIDs() {
  const c = global.config || {};
  return [...new Set([...(c.ADMINBOT || []), ...(c.DEVELOPER || [])].map(String))];
}

// শুধু যাচাই করে সত্যিই মৃত প্রমাণ হলে (গত ১৫ মিনিটে) কারণের আগে বসানো হয়
function withLock(reason) {
  if (state.confirmedDeadAt && Date.now() - state.confirmedDeadAt < 15 * 60 * 1000) {
    return "🔒 ফেসবুক আইডি লক/লগইন সমস্যা (যাচাই করা) — " + reason;
  }
  return reason;
}
// লগে সন্দেহজনক লাইন দেখা গেলে শুধু "তথ্য" হিসেবে যোগ হয় (দাবি হিসেবে নয়)
function withHint(reason) {
  if (state.lockAt && state.lockReason && Date.now() - state.lockAt < 5 * 60 * 1000) {
    return reason + " | শেষ লগ: " + state.lockReason;
  }
  return reason;
}

async function sendExternal(text) {
  text = withCredit(text); // ফন্ট + ক্রেডিট সব বার্তায়
  const tgToken = process.env.JUWEL_TG_TOKEN, tgChat = process.env.JUWEL_TG_CHAT;
  const dc = process.env.JUWEL_DISCORD_WEBHOOK;
  let sent = false;
  // প্রতিটি মাধ্যমের ফলাফল: null = সেট করা নেই, true = গেছে, false = ব্যর্থ
  const res = (state.lastSend = { tg: null, dc: null, tgErr: "", dcErr: "" });
  const jobs = [];
  if (tgToken && tgChat) {
    jobs.push((async () => {
      try {
        await axios.post("https://api.telegram.org/bot" + tgToken + "/sendMessage", { chat_id: tgChat, text }, { timeout: 15000 });
        sent = true; res.tg = true;
      } catch (e) {
        res.tg = false;
        res.tgErr = String((e.response && e.response.data && e.response.data.description) || e.message || e).slice(0, 80);
        log("Telegram পাঠানো যায়নি: " + (e.message || e), "warn");
      }
    })());
  }
  if (dc) {
    jobs.push((async () => {
      try { await axios.post(dc, { content: text.slice(0, 1900) }, { timeout: 15000 }); sent = true; res.dc = true; }
      catch (e) {
        res.dc = false;
        res.dcErr = String(e.message || e).slice(0, 80);
        log("Discord পাঠানো যায়নি: " + (e.message || e), "warn");
      }
    })());
  }
  // Telegram ও Discord একসাথে (parallel) যায় — দ্রুত পৌঁছানোর জন্য
  await Promise.all(jobs);
  if (!tgToken && !tgChat && !dc) log("JUWEL_TG_TOKEN/JUWEL_TG_CHAT বা JUWEL_DISCORD_WEBHOOK সেট করা নেই — শুধু লগে লেখা হলো।", "warn");
  return sent;
}

async function sendMessengerToAdmins(text) {
  text = withCredit(text); // ফন্ট + ক্রেডিট সব বার্তায়
  const api = global.client && global.client.api;
  if (!api) return;
  for (const id of adminIDs()) {
    try { await new Promise((res) => api.sendMessage(text, id, () => res())); } catch (_) {}
  }
}

/* ───────────── সেশন সত্যিই বেঁচে আছে কি না — সরাসরি যাচাই ───────────── */
const eventRecent = () => !!state.lastEventAt && Date.now() - state.lastEventAt < EVENT_ALIVE_MS;

// ফেসবুক থেকে নিজের তথ্য আনার চেষ্টা; সফল হলে true
function checkAlive(timeoutMs) {
  return new Promise((resolve) => {
    const api = global.client && global.client.api;
    if (!api || typeof api.getCurrentUserID !== "function" || typeof api.getUserInfo !== "function") return resolve(false);
    let uid; try { uid = api.getCurrentUserID(); } catch (_) {}
    if (!uid) return resolve(false);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeoutMs || 20000);
    try {
      api.getUserInfo(uid, (err) => { if (done) return; done = true; clearTimeout(t); resolve(!err); });
    } catch (_) { done = true; clearTimeout(t); resolve(false); }
  });
}

// ৩ বার (১৫ সেকেন্ড ফাঁকে) যাচাই করে; একবারও সুস্থ পেলে বা সম্প্রতি ইভেন্ট এলে "মৃত নয়"
async function confirmDead() {
  if (eventRecent()) return false;
  for (let i = 0; i < 3; i++) {
    if (await checkAlive(20000)) return false;
    if (eventRecent()) return false;
    if (i < 2) await sleep(15000);
  }
  return true;
}

/* ───────────── alerts ───────────── */
const HEAD = (title) => "╔══════════════════╗\n   " + title + "\n╚══════════════════╝";
const LINE = "━━━━━━━━━━━━━━━━━━━━";

// লক/সেশন সমস্যার নোটিশ — যাচাইয়ে সত্যিই মৃত প্রমাণ হলে, একটা সমস্যায় মাত্র একবার (রিস্টার্ট হলেও)
async function raiseAlert(reason) {
  const now = Date.now();
  if (!canSend("alert")) return; // আগেই একবার গেছে বা কেউ পাঠাচ্ছে
  // যাচাই/পাঠানো চলছে, বা আগের চেষ্টা ব্যর্থ হয়ে থাকলে ১ মিনিটের আগে আবার নয়
  if (state.alertSending || state.confirming || now - state.lastAlertAt < 60 * 1000) return;

  // পাঠানোর ঠিক আগে শেষবার যাচাই — সুস্থ থাকলে কোনো নোটিশ নয়
  state.confirming = true;
  let dead = false;
  try { dead = await confirmDead(); } catch (_) {}
  state.confirming = false;
  if (!dead) {
    state.probeFails = 0; state.lockAt = 0; state.lockReason = "";
    log("সন্দেহ হয়েছিল, কিন্তু যাচাইয়ে সেশন সুস্থ — নোটিশ পাঠানো হয়নি।", "info");
    return;
  }

  state.confirmedDeadAt = Date.now();
  if (!state.down) { state.down = true; state.downSince = state.confirmedDeadAt; }
  if (!canSend("alert")) return;
  if (!claim("alert")) return; // অন্য প্রসেস আগেই দখল নিয়েছে
  state.alertSending = true;
  state.lastAlertAt = Date.now();
  const upA = uptimeParts((Date.now() - RUN_START) / 1000);
  const text =
    HEAD("🚨 JUWEL BOT • ALERT") + "\n\n" +
    "🔴 STATUS ➤ SESSION PROBLEM\n" + LINE + "\n" +
    "📛 কারণ ➤ " + reason + "\n" + LINE + "\n" +
    "⏱ চালু ছিল\n" + uptimeLines(upA) + "\n" + LINE + "\n" +
    "📅 STARTED ➤ " + fmtDate(RUN_START) + "\n" +
    "🕒 TIME ➤ " + dhakaTime() + "\n" + LINE + "\n" +
    "🛠 করণীয়: নতুন appstate.json (কুকি) বসিয়ে বট রিস্টার্ট দিন।";
  log("সতর্কতা (যাচাই করা): " + reason, "error");
  try {
    const ok = await sendExternal(text);
    if (ok) markSent("alert"); else release("alert");
  } catch (_) { release("alert"); }
  finally { state.alertSending = false; }
}

// সমস্যা মিটে টানা ৫ মিনিট সুস্থ থাকলে একবার "BACK ONLINE" + লক খুলে দেয়
async function raiseRecovery() {
  const o = latchRead();
  const hadAlert = state.down || !!o.alert || !!o.stop;
  const ts = [o.alert, o.stop].filter(Boolean);
  const since = state.downSince || (ts.length ? Math.min.apply(null, ts) : Date.now());
  const downFor = Date.now() - since;
  clearLatch(); // নতুন সমস্যা হলে আবার একবার নোটিশ যাবে
  state.down = false; state.downSince = 0; state.probeFails = 0; state.lastAlertAt = 0;
  state.lockAt = 0; state.lockReason = ""; state.okSince = 0; state.confirmedDeadAt = 0;
  if (!hadAlert) return; // শুধু সাধারণ বন্ধ/চালু হলে আলাদা "ফিরে এসেছে" নোটিশ নয়
  const text =
    HEAD("✅ JUWEL BOT • BACK ONLINE") + "\n\n" +
    "🟢 STATUS ➤ ONLINE\n" + LINE + "\n" +
    "⏳ অফলাইন ছিল ➤ " + fmtDur(downFor) + "\n" +
    "🕒 TIME ➤ " + dhakaTime();
  log("সেশন ফিরে এসেছে।", "success");
  await sendExternal(text);
  await sendMessengerToAdmins(text);
}

/* ───────────── stop notice (বট বন্ধ হলে) ───────────── */
let stopPromise = null;

// startMs/endMs দিলে সেটা দিয়ে uptime হিসাব হয় (watchdog ব্যবহার করে)
function stopText(reason, startMs, endMs) {
  const end = endMs || Date.now();
  const start = startMs || RUN_START;
  const up = uptimeParts((end - start) / 1000);

  return (
    HEAD("🔴 JUWEL BOT • STOPPED") + "\n\n" +
    "🔴 STATUS ➤ OFFLINE\n" + LINE + "\n" +
    "📛 কারণ ➤ " + reason + "\n" + LINE + "\n" +
    "⏱ চালু ছিল\n" + uptimeLines(up) + "\n" + LINE + "\n" +
    "📅 STARTED ➤ " + fmtDate(start) + "\n" +
    "🕒 STOPPED ➤ " + fmtDate(end)
  );
}

// ওয়াচডগকে লাইন পাঠায় (SENT / REASON:... / CRASH:... / EXIT:...)
//   SENT   = বট নিজে নোটিশ পাঠিয়ে ফেলেছে
//   REASON = বন্ধ হওয়ার কারণ (ওয়াচডগ রিস্টার্ট না হলে এই কারণসহ নোটিশ পাঠাবে)
//   CRASH  = সম্ভাব্য ক্র্যাশ-কারণ
//   EXIT   = প্রসেসের exit code
function watchSend(line) {
  try {
    const w = global.__juwelAlertWatcher;
    if (w && w.stdin && w.stdin.writable) w.stdin.write(line + "\n");
  } catch (_) {}
}
const hasWatchdog = () => {
  const w = global.__juwelAlertWatcher;
  return !!(w && w.stdin && w.stdin.writable);
};

// বাইরের হার্টবিট সার্ভিসকে সাথে সাথে "ফেল" জানায়
function heartbeatFail() {
  const HB = process.env.JUWEL_HEARTBEAT_URL;
  if (!HB) return;
  try { axios.get(HB.replace(/\/$/, "") + "/fail", { timeout: 5000 }).catch(() => {}); } catch (_) {}
}

// সাথে সাথে পাঠায় (stop সিগন্যাল বা ওয়াচডগ না থাকলে); একই promise ফেরত দেয় যাতে exit তার জন্য অপেক্ষা করতে পারে
function sendStopNotice(reason) {
  if (stopPromise) return stopPromise;
  reason = withHint(withLock(reason));
  log("বট বন্ধ হচ্ছে: " + reason, "warn");
  watchSend("REASON:" + reason);
  heartbeatFail();
  // আগেই গেছে বা অন্য প্রসেস পাঠাচ্ছে → আর নয় (ওয়াচডগকেও জানিয়ে দেয়)
  if (!claim("stop")) {
    watchSend("SENT");
    stopPromise = Promise.resolve(false);
    return stopPromise;
  }
  stopPromise = Promise.race([
    sendExternal(stopText(reason))
      .then((ok) => { if (ok) { markSent("stop"); watchSend("SENT"); } else release("stop"); return ok; })
      .catch(() => { release("stop"); return false; }),
    new Promise((res) => setTimeout(res, STOP_NOTICE_WAIT_MS))
  ]);
  return stopPromise;
}

function installShutdownHook() {
  if (global.__juwelAlertShutdownHooked) return;
  global.__juwelAlertShutdownHooked = true;

  const origExit = process.exit.bind(process);

  // কমান্ড/কোড/লগইন-এরর হ্যান্ডলার থেকে process.exit() ডাকলে:
  //   ওয়াচডগ থাকলে → কারণ জানিয়ে বন্ধ; ওয়াচডগ ২ মিনিট দেখবে বট ফিরল কি না (ফিরলে নোটিশ নয়)
  //   ওয়াচডগ না থাকলে → আগের মতো আগে নোটিশ, তারপর বন্ধ
  process.exit = function (code) {
    const c = code === undefined ? 0 : code;
    const why = "process.exit(" + c + ") — কোড দিয়ে বন্ধ/রিস্টার্ট করা হয়েছে";
    if (hasWatchdog()) {
      watchSend("REASON:" + withHint(why));
      setTimeout(() => origExit(c), 150);
      return;
    }
    sendStopNotice(why).then(
      () => origExit(c),
      () => origExit(c)
    );
  };

  // Ctrl+C, systemd/pm2/docker stop, টার্মিনাল বন্ধ — এগুলো স্পষ্ট বন্ধ, তাই সাথে সাথে নোটিশ
  const names = {
    SIGINT: "Ctrl+C (SIGINT)",
    SIGTERM: "stop সিগন্যাল (SIGTERM)",
    SIGHUP: "টার্মিনাল বন্ধ (SIGHUP)",
    SIGQUIT: "quit সিগন্যাল (SIGQUIT)",
    SIGBREAK: "Ctrl+Break (SIGBREAK)"
  };
  Object.keys(names).forEach((sig) => {
    try {
      process.on(sig, () => {
        sendStopNotice(names[sig] + " — ম্যানুয়ালি বন্ধ").then(() => origExit(0), () => origExit(0));
      });
    } catch (_) {}
  });

  // লগইন ব্যর্থ হওয়ার পর কিছু চালু না থাকলে Node নিজে থেকেই থামে (process.exit ছাড়াই)।
  // ওয়াচডগ থাকলে সে-ই দেখবে বট ফিরল কি না; না থাকলে সাথে সাথে নোটিশ।
  try {
    process.on("beforeExit", () => {
      const why = "বট নিজে থেকেই থেমে গেছে (কোনো কাজ বাকি নেই — লগইন ব্যর্থ/আইডি লক হতে পারে)";
      if (hasWatchdog()) { watchSend("REASON:" + withHint(why)); return; }
      sendStopNotice(why);
    });
  } catch (_) {}

  // ক্র্যাশ হলে কারণটা ওয়াচডগকে জানিয়ে রাখে (আচরণ বদলায় না, শুধু নজর রাখে)
  try {
    process.on("uncaughtExceptionMonitor", (err) => {
      const r = "ক্র্যাশ — " + String((err && (err.stack || err.message)) || err).split("\n")[0].slice(0, 200);
      watchSend("CRASH:" + withHint(withLock(r)));
    });
  } catch (_) {}

  // যেকোনো উপায়ে প্রসেস শেষ হলে exit code জানিয়ে রাখে (শুধু sync লেখা চলে)
  process.on("exit", (code) => { watchSend("EXIT:" + code); });
}

/* ───────────── watchdog (আলাদা প্রসেস) ───────────── */
function startWatchdog() {
  if (global.__juwelAlertWatcher) return;
  if (String(process.env.JUWEL_WATCHDOG || "").toLowerCase() === "off") return;
  try {
    const cp = require("child_process");
    const child = cp.spawn(process.execPath, [__filename, "--juwel-watch"], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      windowsHide: true,
      env: Object.assign({}, process.env, {
        JW_PID: String(process.pid),
        JW_START: String(RUN_START)
      })
    });
    child.on("error", () => {});
    if (child.stdin) child.stdin.on("error", () => {});
    child.unref();
    try { child.stdin.unref(); } catch (_) {}
    global.__juwelAlertWatcher = child;
    log("watchdog চালু (pid " + child.pid + ") — সত্যিই বন্ধ হলে (রিস্টার্ট ছাড়া) নোটিশ যাবে।", "success");
  } catch (e) { log("watchdog চালু করা যায়নি: " + e.message, "warn"); }
}

// নতুন বট-প্রসেস চালু হয়ে গেছে কি না (run ফাইল দেখে)
async function waitForRestart(parentPid, diedAt, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = runRead();
    if (r.pid && r.pid !== parentPid && r.alive && r.alive >= diedAt - 5000) {
      try { process.kill(r.pid, 0); return true; }
      catch (e) { if (e.code === "EPERM") return true; }
    }
    await sleep(2000);
  }
  return false;
}

// ওয়াচডগ প্রসেসের ভেতরের কাজ
function runWatcher() {
  // pm2/systemd/Docker stop-এ পুরো প্রসেস-ট্রি-তে সিগন্যাল যায়।
  // ওয়াচডগ সেগুলো উপেক্ষা করে বেঁচে থাকে, যাতে বট মরার পর নোটিশ পাঠাতে পারে।
  ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT", "SIGBREAK"].forEach((s) => { try { process.on(s, () => {}); } catch (_) {} });
  try { process.on("uncaughtException", () => {}); } catch (_) {}
  try { process.on("unhandledRejection", () => {}); } catch (_) {}

  const parentPid = Number(process.env.JW_PID) || 0;
  const startMs = Number(process.env.JW_START) || Date.now();
  let reason = "", crash = "", exitCode = null, handled = false, finishing = false, buf = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line === "SENT") handled = true;
      else if (line.indexOf("REASON:") === 0) reason = line.slice(7);
      else if (line.indexOf("CRASH:") === 0) crash = line.slice(6);
      else if (line.indexOf("EXIT:") === 0) exitCode = line.slice(5);
    }
  });

  const finish = async () => {
    if (finishing) return;
    finishing = true;
    const diedAt = Date.now();
    // বট মরে গেছে, তাই আর কোনো SENT আসবে না; পাইপের বাকি ডাটা পড়ার জন্য অল্প অপেক্ষা
    await sleep(300);
    if (handled) return process.exit(0); // বট নিজেই নোটিশ পাঠিয়ে গেছে

    // বট নিজে পাঠানোর মাঝখানে মারা গেলে, তার দখলের মেয়াদ শেষ হওয়া পর্যন্ত অপেক্ষা
    for (let i = 0; i < 25; i++) {
      const p = latchRead().stop_p;
      if (!p || Date.now() - p >= PENDING_MS) break;
      await sleep(1000);
    }

    // এই বন্ধ হওয়াটা তালিকায় লিখি; ১৫ মিনিটে ৩+ বার হলে ক্র্যাশ-লুপ
    const r0 = runRead();
    const exits = (Array.isArray(r0.exits) ? r0.exits : []).filter((t) => diedAt - t < LOOP_WINDOW_MS);
    exits.push(diedAt);
    r0.exits = exits;
    runWrite(r0);
    const loop = exits.length >= LOOP_EXITS;

    // রিস্টার্ট ≠ বন্ধ: বট নিজে আবার চালু হয়ে গেলে কোনো নোটিশ নয়
    if (!loop) {
      const back = await waitForRestart(parentPid, diedAt, RESTART_GRACE_MS);
      if (back) return process.exit(0);
    }

    // বট ফেরেনি (বা বারবার ক্র্যাশ করছে) — এই সমস্যায় আগে STOPPED না গিয়ে থাকলে ওয়াচডগ পাঠাবে
    if (claim("stop")) {
      let why = reason || crash ||
        (exitCode !== null && exitCode !== "undefined"
          ? "বট বন্ধ হয়েছে (exit code " + exitCode + ")"
          : "হঠাৎ বন্ধ — kill -9 / মেমরি শেষ / হোস্ট জোর করে বন্ধ করেছে");
      if (loop) why = "বট ১৫ মিনিটে " + exits.length + " বার বন্ধ/রিস্টার্ট হয়েছে (ক্র্যাশ-লুপ) — " + why;
      else why += " — " + Math.round(RESTART_GRACE_MS / 1000) + " সেকেন্ডেও বট আবার চালু হয়নি";
      heartbeatFail();
      const msg = stopText(why + " [watchdog]", startMs, diedAt);
      // একবার ব্যর্থ হলে আরও ২ বার চেষ্টা
      let sentOk = false;
      for (let i = 0; i < 3 && !sentOk; i++) {
        try { sentOk = await sendExternal(msg); } catch (_) {}
        if (!sentOk) await sleep(1500);
      }
      if (sentOk) markSent("stop"); else release("stop");
    }
    process.exit(0);
  };

  process.stdin.on("end", finish);
  process.stdin.on("close", finish);
  process.stdin.on("error", finish);

  // stdin বন্ধ না হলেও PID দিয়ে বট মরেছে কি না দেখে (প্রতি ১ সেকেন্ডে)
  setInterval(() => {
    if (!parentPid) return;
    try { process.kill(parentPid, 0); }
    catch (e) { if (e.code !== "EPERM") finish(); }
  }, 1000);

  process.stdin.resume();
}

/* ───────────── log watcher ───────────── */
const BAD_PATTERNS = [
  /FATAL: Session/i, /Session looks dead/i, /Login failed \[/i,
  /Fresh login failed/i, /re-login required/i, /checkpoint/i, /not logged in/i
];
const GOOD_PATTERNS = [/recovered after \d+ attempt/i, /traffic resumed/i, /session established/i];

// এগুলো লগে দেখলে শুধু "সন্দেহ" ধরা হয় — সরাসরি নোটিশ নয়।
// ৩ মিনিট পর ফেসবুকে নিজে যাচাই করে সত্যিই মৃত পেলে তবেই ALERT যায়।
const LOCK_PATTERNS = [
  /Error retrieving userID/i,
  /login[_ ]?blocked/i,
  /(Fresh )?login failed/i,
  /FATAL: Session/i,
  /Session looks dead/i,
  /not logged in/i,
  /appstate.{0,40}(die|dead|invalid|expired)/i
];

// সন্দেহ ধরা: একবারই টাইমার বসে; সময় হলে raiseAlert (যা নিজেই যাচাই করে) ডাকে
function suspect(why) {
  if (state.suspectTimer) return;
  state.suspectTimer = setTimeout(() => {
    state.suspectTimer = null;
    raiseAlert("লগে লগইন/লক সমস্যার ইঙ্গিত ছিল, যাচাইয়ে সেশন মৃত | লগ: " + why).catch(() => {});
  }, SUSPECT_DELAY_MS);
  if (state.suspectTimer.unref) state.suspectTimer.unref();
}
function clearSuspect() {
  if (state.suspectTimer) { clearTimeout(state.suspectTimer); state.suspectTimer = null; }
}

// ফেসবুকের "Account blocked / automated behavior (1357001)" একটা সাধারণ WARN — বট চালু থাকলেও আসে।
// এটা লগআউট নয়, তাই এই লাইন দেখে সন্দেহও ধরা হয় না।
const IGNORE_LOCK = /1357001|Account Status|detected automated behavio/i;

function installLogWatcher() {
  if (global.__juwelAlertLogHooked) return;
  global.__juwelAlertLogHooked = true;
  ["log", "warn", "error"].forEach((method) => {
    const orig = console[method];
    console[method] = function () {
      try {
        const line = stripAnsi(Array.prototype.map.call(arguments, (a) => (typeof a === "string" ? a : "")).join(" "));
        if (line && line.length < 2000 && !/JuwelAlert/.test(line) && line.indexOf("📩") === -1) {
          if (!IGNORE_LOCK.test(line) && LOCK_PATTERNS.some((r) => r.test(line))) {
            const short = line.trim().slice(0, 160);
            state.lockAt = Date.now();
            state.lockReason = short;
            state.okSince = 0; // সন্দেহ দেখা গেলে "সুস্থ থাকার" গণনা আবার শুরু
            suspect(short);    // শুধু সন্দেহ; যাচাই না করে নোটিশ নয়
          }
          if (BAD_PATTERNS.some((r) => r.test(line))) {
            state.lastLoginIssueAt = Date.now();
            state.logHits.push({ t: Date.now(), line: line.trim().slice(0, 160) });
            if (state.logHits.length > 20) state.logHits.shift();
          } else if (GOOD_PATTERNS.some((r) => r.test(line))) {
            // বট নিজেই ঠিক হয়ে গেছে — সন্দেহ বাতিল
            state.lastLoginIssueAt = 0; state.logHits = []; state.probeFails = 0;
            state.lockAt = 0; state.lockReason = "";
            clearSuspect();
          }
        }
      } catch (_) {}
      return orig.apply(console, arguments);
    };
  });
}

/* ───────────── active probe ───────────── */
function evaluate(reason) {
  state.okSince = 0;
  // সম্প্রতি ইভেন্ট (মেসেজ ইত্যাদি) এসেছে মানে বট বেঁচে আছে — ব্যর্থতা গোনা হবে না
  if (eventRecent()) { state.probeFails = 0; return; }
  if (state.probeFails >= PROBE_FAILS_BEFORE_ALERT) {
    const extra = state.logHits.length ? " | লগ: " + state.logHits[state.logHits.length - 1].line : "";
    raiseAlert(reason + extra).catch(() => {}); // raiseAlert পাঠানোর আগে নিজে আবার যাচাই করে
  }
}

function probe() {
  const api = global.client && global.client.api;
  state.lastProbeAt = Date.now();
  if (!api || typeof api.getCurrentUserID !== "function") {
    state.lastProbeOk = false;
    // লগইন চলছে — কিছুক্ষণ অপেক্ষা
    if (Date.now() - state.bootAt < LOGIN_GRACE_MS) return;
    state.probeFails++;
    state.okSince = 0;
    if (state.probeFails >= PROBE_FAILS_BEFORE_ALERT) {
      raiseAlert("লগইন সম্পন্ন হয়নি (" + fmtDur(Date.now() - state.bootAt) + " ধরে api নেই) — আইডি লক/কুকি নষ্ট হতে পারে").catch(() => {});
    }
    return;
  }
  let uid;
  try { uid = api.getCurrentUserID(); } catch (_) {}
  if (!uid) { state.probeFails++; state.lastProbeOk = false; return evaluate("api থেকে UID পাওয়া যাচ্ছে না"); }

  let done = false;
  const timer = setTimeout(() => {
    if (done) return; done = true;
    state.probeFails++; state.lastProbeOk = false;
    evaluate("ফেসবুক সার্ভার থেকে সাড়া নেই (timeout)");
  }, 25000);
  try {
    api.getUserInfo(uid, (err) => {
      if (done) return; done = true; clearTimeout(timer);
      if (err) {
        state.probeFails++; state.lastProbeOk = false;
        evaluate("সেশন পরীক্ষা ব্যর্থ: " + String((err && (err.error || err.message)) || err).slice(0, 120));
      } else {
        state.probeFails = 0; state.lastProbeOk = true;
        // সমস্যার পর টানা RECOVER_STABLE_MS সুস্থ থাকলে তবেই রিকভারি (বারবার ওঠানামায় নোটিশ যাবে না)
        const o = latchRead();
        if (state.down || o.alert || o.stop) {
          if (!state.okSince) state.okSince = Date.now();
          const stable = Date.now() - state.okSince >= RECOVER_STABLE_MS;
          const noRecentLock = Date.now() - (state.lockAt || 0) >= RECOVER_STABLE_MS;
          if (stable && noRecentLock) raiseRecovery();
        }
      }
    });
  } catch (e) {
    done = true; clearTimeout(timer);
    state.probeFails++; state.lastProbeOk = false;
    evaluate("পরীক্ষা চালাতে ত্রুটি: " + e.message);
  }
}

/* ───────────── heartbeat (ঐচ্ছিক, বাইরের মনিটর) ───────────── */
function startHeartbeat() {
  const HB = process.env.JUWEL_HEARTBEAT_URL;
  if (!HB || global.__juwelAlertHeartbeat) return;
  global.__juwelAlertHeartbeat = true;
  const ping = () => { try { axios.get(HB, { timeout: 10000 }).catch(() => {}); } catch (_) {} };
  ping();
  const h = setInterval(ping, 60 * 1000);
  if (h.unref) h.unref();
  log("heartbeat চালু — বাইরের মনিটরে প্রতি ৬০ সেকেন্ডে ping যাবে।", "success");
}

/* ───────────── boot ───────────── */
function start() {
  if (!creditOk) return; // Credit বদলানো হলে কিছুই চালু হবে না
  if (state.started) return;
  state.started = true;
  installLogWatcher();
  installShutdownHook();
  startWatchdog();
  startHeartbeat();
  saveRunInfo();
  const rs = setInterval(saveRunInfo, 30 * 1000);
  if (rs.unref) rs.unref();
  const t = setInterval(probe, PROBE_EVERY_MS);
  if (t.unref) t.unref();

  // চালু-নোটিশ: লগইন সফল হওয়ার পর (api পাওয়া গেলে) পাঠায়।
  // লগইন না হলে "চালু" নোটিশ যাবে না; সেক্ষেত্রে probe() সতর্কতা দেবে।
  const sendBoot = async () => {
    const o = latchRead();
    if (o.alert || o.stop || o.alert_p || o.stop_p) return; // আইডি লক/সেশন সমস্যা চলছে — "STARTED" নোটিশ নয়
    if (IS_QUICK_RESTART) return; // ৫ মিনিটের মধ্যে রিস্টার্ট — বারবার "STARTED" নয়
    const text =
      HEAD("🟢 JUWEL BOT • STARTED") + "\n\n" +
      "🟢 STATUS ➤ ONLINE\n" + LINE + "\n" +
      uptimeBlock() + "\n" + LINE + "\n" +
      "🕒 TIME ➤ " + dhakaTime() + "\n" +
      "⚙️ COMMANDS ➤ " + (global.client && global.client.commands ? global.client.commands.size : "?");
    // Telegram/Discord-এও যায় (বন্ধ করতে env: JUWEL_TG_BOOT=off)
    if (String(process.env.JUWEL_TG_BOOT || "").toLowerCase() !== "off") await sendExternal(text);
    await sendMessengerToAdmins(text);
  };
  const waitLogin = () => {
    if (state.bootNoticeSent) return;
    const api = global.client && global.client.api;
    if (!api) {
      if (Date.now() - state.bootAt < 10 * 60 * 1000) {
        const r = setTimeout(waitLogin, 5000);
        if (r.unref) r.unref();
      }
      return;
    }
    state.bootNoticeSent = true;
    sendBoot();
  };
  const b = setTimeout(waitLogin, BOOT_NOTICE_DELAY_MS);
  if (b.unref) b.unref();
  log("চালু হয়েছে — সেশন নজরদারি শুরু।", "success");
}

function healthText() {
  const up = uptimeParts((Date.now() - RUN_START) / 1000);
  const probeTxt = state.lastProbeOk === null ? "PENDING" : state.lastProbeOk ? "✅ OK" : "❌ FAILED";
  const probeAgo = state.lastProbeAt ? " (" + fmtDur(Date.now() - state.lastProbeAt) + " ago)" : "";
  const tg = process.env.JUWEL_TG_TOKEN && process.env.JUWEL_TG_CHAT ? "ON ✅" : "OFF ❌";
  const dc = process.env.JUWEL_DISCORD_WEBHOOK ? "ON ✅" : "OFF ❌";
  const wd = global.__juwelAlertWatcher ? "ON ✅" : "OFF ❌";
  const hb = process.env.JUWEL_HEARTBEAT_URL ? "ON ✅" : "OFF ❌";
  const ram = Math.round(process.memoryUsage().rss / 1048576);
  const cmds = global.client && global.client.commands ? global.client.commands.size : "?";

  return (
    HEAD("🤖 JUWEL BOT • STATUS") + "\n\n" +
    (state.down ? "🔴 STATUS ➤ PROBLEM" : "🟢 STATUS ➤ ONLINE") + "\n" + LINE + "\n" +
    "🧩 VERSION ➤ 2.0.1\n" + LINE + "\n" +
    "⏱ UPTIME\n" + uptimeLines(up) + "\n" + LINE + "\n" +
    "📅 STARTED ➤ " + fmtDate(RUN_START) + "\n" +
    "🕒 NOW ➤ " + dhakaTime() + "\n" + LINE + "\n" +
    "🩺 HEALTH CHECK\n" +
    " ┌ RESULT ➤ " + probeTxt + probeAgo + "\n" +
    " ├ FAILS IN ROW ➤ " + state.probeFails + "\n" +
    " └ LOGIN WARNINGS ➤ " + state.logHits.length + "\n" + LINE + "\n" +
    "📡 ALERT CHANNELS\n" +
    " ┌ TELEGRAM ➤ " + tg + "\n" +
    " ├ DISCORD ➤ " + dc + "\n" +
    " ├ WATCHDOG ➤ " + wd + "\n" +
    " └ HEARTBEAT ➤ " + hb + "\n" + LINE + "\n" +
    "💾 RAM ➤ " + ram + " MB\n" +
    "⚙️ COMMANDS ➤ " + cmds
  );
}

/* ───────────── uptime ব্লক (test ও চালু-নোটিশে ব্যবহার হয়) ───────────── */
function uptimeBlock() {
  const up = uptimeParts((Date.now() - RUN_START) / 1000);
  return "⏱ UPTIME\n" + uptimeLines(up) + "\n" + LINE + "\n" + "📅 STARTED ➤ " + fmtDate(RUN_START);
}

/* ───────────── test notice (সাজানো) ───────────── */
function testText() {
  const tg = process.env.JUWEL_TG_TOKEN && process.env.JUWEL_TG_CHAT ? "CONNECTED ✅" : "NOT SET ❌";
  const dc = process.env.JUWEL_DISCORD_WEBHOOK ? "CONNECTED ✅" : "NOT SET ❌";
  const wd = global.__juwelAlertWatcher ? "ACTIVE ✅" : "OFF ❌";
  const hb = process.env.JUWEL_HEARTBEAT_URL ? "ACTIVE ✅" : "NOT SET ⚪";
  const cmds = global.client && global.client.commands ? global.client.commands.size : "?";
  return (
    HEAD("🧪 JUWEL ALERT • TEST") + "\n\n" +
    "🎉 অভিনন্দন! এই বার্তা পেয়েছেন মানে\n" +
    "আপনার সতর্কতা ব্যবস্থা ১০০% ঠিক আছে।\n" + LINE + "\n" +
    "📡 ALERT CHANNELS\n" +
    " ┌ ✈️ TELEGRAM ➤ " + tg + "\n" +
    " ├ 💬 DISCORD ➤ " + dc + "\n" +
    " ├ 🐕 WATCHDOG ➤ " + wd + "\n" +
    " └ 💓 HEARTBEAT ➤ " + hb + "\n" + LINE + "\n" +
    "🔔 আপনি যা যা জানতে পারবেন\n" +
    " ┌ 🟢 বট চালু হলে\n" +
    " ├ 🔴 বট সত্যিই বন্ধ হলে (ক্র্যাশ/আইডি লক সহ) — একবার\n" +
    " ├ 🚨 যাচাই-করা সেশন/লগইন সমস্যা হলে — একবার\n" +
    " └ ✅ সেশন ফিরে এলে\n" + LINE + "\n" +
    uptimeBlock() + "\n" + LINE + "\n" +
    "⚙️ COMMANDS ➤ " + cmds + "\n" +
    "🕒 TIME ➤ " + dhakaTime()
  );
}

function testResultText(ok) {
  const r = state.lastSend || { tg: null, dc: null, tgErr: "", dcErr: "" };
  const st = (v, err) => v === true ? "✅ SENT" : v === false ? "❌ FAILED" + (err ? " (" + err + ")" : "") : "⚪ NOT SET";
  return (
    HEAD(ok ? "✅ TEST • SUCCESS" : "❌ TEST • FAILED") + "\n\n" +
    "📬 DELIVERY REPORT\n" +
    " ┌ ✈️ TELEGRAM ➤ " + st(r.tg, r.tgErr) + "\n" +
    " └ 💬 DISCORD ➤ " + st(r.dc, r.dcErr) + "\n" + LINE + "\n" +
    (ok
      ? "🎯 টেস্ট বার্তা পাঠানো হয়েছে।\nTelegram/Discord ইনবক্স চেক করুন।"
      : "🛠 পাঠানো যায়নি। এগুলো দেখুন:\n" +
        " ┌ JUWEL_TG_TOKEN সঠিক কি না\n" +
        " ├ JUWEL_TG_CHAT (chat id) সঠিক কি না\n" +
        " ├ টেলিগ্রামে বটকে আগে /start দিয়েছেন কি না\n" +
        " └ JUWEL_DISCORD_WEBHOOK সঠিক কি না") + "\n" + LINE + "\n" +
    "🕒 TIME ➤ " + dhakaTime()
  );
}

// বটের নাম / অ্যাডমিনের নাম / প্রথম অ্যাডমিন UID — config.json থেকে (লগইনের আগে ও ওয়াচডগেও কাজ করে)
//   BOTNAME, BOTADMINNAME, ADMINBOT[0]
let _botInfo = null;
function botInfo() {
  if (_botInfo) return _botInfo;
  let c = {};
  try {
    const fs = require("fs"), path = require("path");
    const file = path.join(__dirname, "..", "..", "config.json");
    if (fs.existsSync(file)) c = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {}
  const g = global.config || {};
  const pick = (k) => String(c[k] !== undefined && c[k] !== "" ? c[k] : (g[k] !== undefined ? g[k] : "")).trim();
  const admins = (Array.isArray(c.ADMINBOT) && c.ADMINBOT.length ? c.ADMINBOT : g.ADMINBOT) || [];
  const info = { name: pick("BOTNAME") || "—", admin: pick("BOTADMINNAME") || "—", uid: admins.length ? String(admins[0]) : "—" };
  // config সম্পূর্ণ পাওয়া গেলে মনে রাখি; না পেলে পরের বার আবার চেষ্টা
  if (c.BOTNAME || g.BOTNAME) _botInfo = info;
  return info;
}
const infoBlock = () => {
  const b = botInfo();
  return "🤖 " + fx("BOT") + " ➤ " + b.name + "\n👑 " + fx("ADMIN") + " ➤ " + b.admin + "\n🆔 " + fx("UID") + " ➤ " + b.uid;
};

// কার্ড = ফন্ট-রূপান্তরিত টেক্সট + বট/অ্যাডমিন/UID + (রূপান্তরহীন) ক্রেডিট লাইন
const withCredit = (t) => fx(t) + "\n" + LINE + "\n" + infoBlock() + "\n" + LINE + "\n✨ Credit ➤ " + CREDIT;

/* ───────────── command ───────────── */
module.exports.config = {
  name: "juwelalert",
  aliases: ["jalert"],
  version: "2.0.1",
  hasPermssion: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "সেশন সতর্কতা ও বট চালু/বন্ধ নোটিশ",
  commandCategory: "system",
  usages: "juwelalert [test]",
  cooldowns: 5
};

/* ───────────── Credit সুরক্ষা ───────────── */
// Credit (ফাইলের হেডার, CREDIT ধ্রুবক, config.credits) বদলালে বা মুছলে পুরো কোড বন্ধ হয়ে যাবে।
const CREDIT_HASH = "8f74924e81a157abaf089d90717e48a4949617a7379d20a2df567cb0ab0dad81";
const creditOk = (function () {
  try {
    const h = (x) => require("crypto").createHash("sha256").update(String(x)).digest("hex");
    let src = "";
    try { src = FS.readFileSync(__filename, "utf8"); } catch (_) {}
    return h(CREDIT) === CREDIT_HASH &&
      h(module.exports.config.credits) === CREDIT_HASH &&
      src.split(CREDIT).length - 1 >= 3;
  } catch (_) { return false; }
})();
const CREDIT_WARN = "⚠️ Credit পরিবর্তন করা হয়েছে — তাই এই কোড কাজ করবে না।\nআসল Credit ফিরিয়ে দিন।";
if (!creditOk && !IS_WATCHER) { try { console.error("[JuwelAlert] " + CREDIT_WARN.replace(/\n/g, " ")); } catch (_) {} }

module.exports.onLoad = function () {
  if (!creditOk) throw new Error("Credit পরিবর্তন করা হয়েছে — juwelalert কাজ করবে না।");
  try { start(); } catch (e) { log("start ত্রুটি: " + e.message, "error"); }
};

// প্রতিটি ইভেন্ট = বট বেঁচে আছে (ভুল ALERT ঠেকানোর সংকেত)।
// onLoad না চললেও (কিছু লোডারে) প্রথম ইভেন্টেই চালু হয়ে যাবে
module.exports.handleEvent = function () {
  if (!creditOk) return;
  state.lastEventAt = Date.now();
  if (!state.started) { try { start(); } catch (_) {} }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  if (!creditOk) return api.sendMessage(CREDIT_WARN, threadID, messageID);
  if (!state.started) start();
  if ((args[0] || "").toLowerCase() === "test") {
    const ok = await sendExternal(testText());
    return api.sendMessage(withCredit(testResultText(ok)), threadID, messageID);
  }
  return api.sendMessage(withCredit(healthText()), threadID, messageID);
};

// ওয়াচডগ মোডে শুধু নজরদারি চলে; নইলে স্বাভাবিকভাবে চালু
if (IS_WATCHER) {
  if (!creditOk) process.exit(0);
  try { runWatcher(); } catch (_) { process.exit(1); }
} else {
  // ফাইল লোড হওয়ার সাথে সাথেই চালু — onLoad/handleEvent না চললেও নজরদারি কাজ করবে
  try { start(); } catch (e) { log("start ত্রুটি: " + e.message, "error"); }
  }
