/**
 * ╔══════════════════════════════════════════════════════════╗
 *  JUWEL ALERT  —  Session Alert + Bot Start/Stop Notice
 *  Credit : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
 * ╚══════════════════════════════════════════════════════════╝
 *
 *  v1.5.0 — ফেসবুক আইডি লক/লগআউট হয়ে বট বন্ধ হলেও নোটিশ যাবে।
 *
 *  ⚠️ সবচেয়ে জরুরি (একবারের কাজ):
 *  আপনার বটের যে মূল ফাইলে login চলে (যেমন Priyansh.js / main.js / index.js),
 *  তার একদম উপরে এই লাইন বসান (পাথ নিজের ফোল্ডার অনুযায়ী):
 *
 *      require("./modules/commands/juwelalert.js");
 *
 *  কেন? কমান্ড ফাইল লোড হয় লগইন সফল হওয়ার পরে। আইডি লক হলে লগইনেই বট
 *  মরে যায়, তখন এই ফাইল লোডই হয় না — তাই কোনো নোটিশ যেত না।
 *  উপরের লাইন দিলে ফাইল লগইনের আগেই চালু হয়, ওয়াচডগও আগেই চালু হয়।
 *
 *  (বিকল্প: `node -r ./modules/commands/juwelalert.js Priyansh.js` দিয়ে চালান।)
 *
 *  কী করে:
 *   ১) বট চালু (এবং লগইন সফল) হলে Telegram/Discord + মেসেঞ্জার অ্যাডমিনদের "চালু" নোটিশ।
 *   ২) সেশন মরলে / লক হলে / লগইন ব্যর্থ হলে সাথে সাথে সতর্কতা (লগ দেখে তাৎক্ষণিক)।
 *   ৩) লগইন ৩ মিনিটের মধ্যে সম্পন্ন না হলে সতর্কতা।
 *   ৪) সেশন ফিরলে "আবার অনলাইন" নোটিশ।
 *   ৫) বট যেকোনো কারণে বন্ধ হলে "STOPPED" নোটিশ — কত সময় চালু ছিল সহ:
 *        • স্তর ১: বট নিজে (process.exit, Ctrl+C, SIGTERM, SIGHUP, ইভেন্ট লুপ খালি হওয়া)
 *        • স্তর ২: আলাদা WATCHDOG প্রসেস — ক্র্যাশ / kill -9 / OOM হলেও ~১-২ সেকেন্ডে নোটিশ।
 *        • স্তর ৩ (ঐচ্ছিক): বাইরের হার্টবিট (healthchecks.io) — পুরো কন্টেইনার মরলেও।
 *            env: JUWEL_HEARTBEAT_URL=https://hc-ping.com/xxxx-xxxx
 *   ওয়াচডগ বন্ধ রাখতে env: JUWEL_WATCHDOG=off
 *
 *  env: JUWEL_TG_TOKEN, JUWEL_TG_CHAT (Telegram) | JUWEL_DISCORD_WEBHOOK (Discord)
 *
 *  কমান্ড:  #juwelalert        (অবস্থা দেখায়, শুধু বট-অ্যাডমিন)
 *           #juwelalert test   (টেস্ট নোটিশ পাঠায়)
 */

// এই ফাইলকে `node juwelalert.js --juwel-watch` দিয়ে চালালে এটা ওয়াচডগ হিসেবে চলে
const IS_WATCHER = require.main === module && process.argv.includes("--juwel-watch");

if (!IS_WATCHER) { try { console.log("[JuwelAlert] ফাইল লোড হয়েছে (juwelalert.js)"); } catch (_) {} }

const axios = require("axios");

const PROBE_EVERY_MS = Number(process.env.JUWEL_PROBE_MS) || 2 * 60 * 1000;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const PROBE_FAILS_BEFORE_ALERT = 2;
const BOOT_NOTICE_DELAY_MS = Number(process.env.JUWEL_BOOT_MS) || 20 * 1000;
const LOGIN_GRACE_MS = Number(process.env.JUWEL_LOGIN_GRACE_MS) || 3 * 60 * 1000; // এর মধ্যে লগইন না হলে সতর্কতা
const STOP_NOTICE_WAIT_MS = 6000; // বন্ধ হওয়ার আগে নোটিশ পাঠাতে সর্বোচ্চ এত সময় অপেক্ষা

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
  down: false,
  downSince: 0,
  bootNoticeSent: false
});

/* ───────────── helpers ───────────── */
const dhakaTime = () => {
  try { return new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { return new Date().toISOString(); }
};
const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "d " : "") + h + "h " + m + "m";
};
const pad2 = (n) => String(n).padStart(2, "0");
// সেকেন্ড থেকে দিন/ঘণ্টা/মিনিট/সেকেন্ড
const uptimeParts = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
};

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

// সাম্প্রতিক লক/লগইন সমস্যা ধরা পড়ে থাকলে কারণের আগে বসানো হয়
function withLock(reason) {
  if (state.lockAt && Date.now() - state.lockAt < 15 * 60 * 1000) {
    return "🔒 ফেসবুক আইডি লক/লগইন সমস্যা (" + state.lockReason + ") — " + reason;
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

/* ───────────── alerts ───────────── */
const HEAD = (title) => "╔══════════════════╗\n   " + title + "\n╚══════════════════╝";
const LINE = "━━━━━━━━━━━━━━━━━━━━";

async function raiseAlert(reason) {
  const now = Date.now();
  if (!state.down) { state.down = true; state.downSince = now; }
  if (now - state.lastAlertAt < ALERT_COOLDOWN_MS) return;
  state.lastAlertAt = now;
  const text =
    HEAD("🚨 JUWEL BOT • ALERT") + "\n\n" +
    "🔴 STATUS ➤ SESSION PROBLEM\n" + LINE + "\n" +
    "📛 কারণ ➤ " + reason + "\n" +
    "🕒 TIME ➤ " + dhakaTime() + "\n" + LINE + "\n" +
    "🛠 করণীয়: নতুন appstate.json (কুকি) বসিয়ে বট রিস্টার্ট দিন।";
  log("সতর্কতা: " + reason, "error");
  await sendExternal(text);
}

async function raiseRecovery() {
  if (!state.down) return;
  const downFor = Date.now() - state.downSince;
  state.down = false; state.downSince = 0; state.probeFails = 0; state.lastAlertAt = 0;
  state.lockAt = 0; state.lockReason = "";
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
  const start = startMs || (end - process.uptime() * 1000);
  const up = uptimeParts((end - start) / 1000);
  let started;
  try { started = new Date(start).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { started = new Date(start).toISOString(); }
  let stopped;
  try { stopped = new Date(end).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { stopped = new Date(end).toISOString(); }

  return (
    HEAD("🔴 JUWEL BOT • STOPPED") + "\n\n" +
    "🔴 STATUS ➤ OFFLINE\n" + LINE + "\n" +
    "📛 কারণ ➤ " + reason + "\n" + LINE + "\n" +
    "⏱ চালু ছিল\n" +
    " ┌ 📆 DAYS ➤ " + pad2(up.d) + "\n" +
    " ├ 🕐 HOURS ➤ " + pad2(up.h) + "\n" +
    " ├ ⏰ MINUTES ➤ " + pad2(up.m) + "\n" +
    " └ ⏳ SECONDS ➤ " + pad2(up.s) + "\n" +
    " ✦ " + up.d + "d " + pad2(up.h) + "h " + pad2(up.m) + "m " + pad2(up.s) + "s\n" + LINE + "\n" +
    "📅 STARTED ➤ " + started + "\n" +
    "🕒 STOPPED ➤ " + stopped
  );
}

// ওয়াচডগকে লাইন পাঠায় (SENT / REASON:... / CRASH:... / EXIT:...)
//   REASON = বট নিজে নোটিশ পাঠাচ্ছে (ব্যর্থ হলে ওয়াচডগ এই কারণসহ আবার পাঠাবে)
//   CRASH  = শুধু সম্ভাব্য কারণ জানিয়ে রাখা (বট হঠাৎ মরলে ওয়াচডগ এটা ব্যবহার করবে)
function watchSend(line) {
  try {
    const w = global.__juwelAlertWatcher;
    if (w && w.stdin && w.stdin.writable) w.stdin.write(line + "\n");
  } catch (_) {}
}

// বাইরের হার্টবিট সার্ভিসকে সাথে সাথে "ফেল" জানায়
function heartbeatFail() {
  const HB = process.env.JUWEL_HEARTBEAT_URL;
  if (!HB) return;
  try { axios.get(HB.replace(/\/$/, "") + "/fail", { timeout: 5000 }).catch(() => {}); } catch (_) {}
}

// একবারই পাঠায়; একই promise ফেরত দেয় যাতে exit তার জন্য অপেক্ষা করতে পারে
function sendStopNotice(reason) {
  if (stopPromise) return stopPromise;
  reason = withLock(reason);
  log("বট বন্ধ হচ্ছে: " + reason, "warn");
  watchSend("REASON:" + reason);
  heartbeatFail();
  stopPromise = Promise.race([
    sendExternal(stopText(reason)).then((ok) => { if (ok) watchSend("SENT"); return ok; }).catch(() => false),
    new Promise((res) => setTimeout(res, STOP_NOTICE_WAIT_MS))
  ]);
  return stopPromise;
}

function installShutdownHook() {
  if (global.__juwelAlertShutdownHooked) return;
  global.__juwelAlertShutdownHooked = true;

  const origExit = process.exit.bind(process);

  // কমান্ড/কোড/লগইন-এরর হ্যান্ডলার থেকে process.exit() ডাকলে — আগে নোটিশ, তারপর বন্ধ
  process.exit = function (code) {
    const c = code === undefined ? 0 : code;
    sendStopNotice("process.exit(" + c + ") — কোড দিয়ে বন্ধ করা হয়েছে").then(
      () => origExit(c),
      () => origExit(c)
    );
  };

  // Ctrl+C, systemd/pm2/docker stop, টার্মিনাল বন্ধ
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
  // তখন এই ইভেন্টে নোটিশ পাঠানো হয়; পাঠানোর কাজ থাকায় প্রসেস নোটিশ শেষ হওয়া পর্যন্ত বাঁচে।
  try {
    process.on("beforeExit", () => {
      sendStopNotice("বট নিজে থেকেই থেমে গেছে (কোনো কাজ বাকি নেই — লগইন ব্যর্থ/আইডি লক হতে পারে)");
    });
  } catch (_) {}

  // ক্র্যাশ হলে কারণটা ওয়াচডগকে জানিয়ে রাখে (আচরণ বদলায় না, শুধু নজর রাখে)
  try {
    process.on("uncaughtExceptionMonitor", (err) => {
      const r = "ক্র্যাশ — " + String((err && (err.stack || err.message)) || err).split("\n")[0].slice(0, 200);
      watchSend("CRASH:" + withLock(r));
      heartbeatFail();
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
        JW_START: String(Date.now() - Math.round(process.uptime() * 1000))
      })
    });
    child.on("error", () => {});
    if (child.stdin) child.stdin.on("error", () => {});
    child.unref();
    try { child.stdin.unref(); } catch (_) {}
    global.__juwelAlertWatcher = child;
    log("watchdog চালু (pid " + child.pid + ") — ক্র্যাশ/kill/লক হলেও বন্ধ-নোটিশ যাবে।", "success");
  } catch (e) { log("watchdog চালু করা যায়নি: " + e.message, "warn"); }
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
    // বট মরে গেছে, তাই আর কোনো SENT আসবে না; পাইপের বাকি ডাটা পড়ার জন্য অল্প অপেক্ষা
    await new Promise((r) => setTimeout(r, 300));
    if (!handled) {
      const why = reason || crash ||
        (exitCode !== null && exitCode !== "undefined"
          ? "বট বন্ধ হয়েছে (exit code " + exitCode + ")"
          : "হঠাৎ বন্ধ — kill -9 / মেমরি শেষ / হোস্ট জোর করে বন্ধ করেছে");
      const msg = stopText(why + " [watchdog]", startMs, Date.now());
      // একবার ব্যর্থ হলে আরও ২ বার চেষ্টা
      for (let i = 0; i < 3; i++) {
        let ok = false;
        try { ok = await sendExternal(msg); } catch (_) {}
        if (ok) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
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

// এগুলো লগে দেখলেই সাথে সাথে সতর্কতা + ওয়াচডগকে কারণ জানানো হয় (বট মরার অপেক্ষা না করে)
const LOCK_PATTERNS = [
  /Error retrieving userID/i,
  /login[_ ]?blocked/i,
  /checkpoint/i,
  /account.{0,40}(locked|disabled|suspended|restricted)/i,
  /(locked|disabled|suspended).{0,40}account/i,
  /(Fresh )?login failed/i,
  /login (approval|error)/i,
  /FATAL: Session/i,
  /Session looks dead/i,
  /not logged in/i,
  /appstate.{0,40}(die|dead|invalid|expired)/i
];

function installLogWatcher() {
  if (global.__juwelAlertLogHooked) return;
  global.__juwelAlertLogHooked = true;
  ["log", "warn", "error"].forEach((method) => {
    const orig = console[method];
    console[method] = function () {
      try {
        const line = stripAnsi(Array.prototype.map.call(arguments, (a) => (typeof a === "string" ? a : "")).join(" "));
        if (line && line.length < 2000 && !/JuwelAlert/.test(line)) {
          if (LOCK_PATTERNS.some((r) => r.test(line))) {
            const short = line.trim().slice(0, 160);
            state.lockAt = Date.now();
            state.lockReason = short;
            // বট এরপর মরলে ওয়াচডগ এই কারণটাই জানাবে
            watchSend("CRASH:🔒 ফেসবুক আইডি লক/লগইন সমস্যা — " + short);
            // বট মরুক বা না মরুক, এখনই সতর্কতা
            raiseAlert("🔒 লক/লগইন সমস্যা ধরা পড়েছে | লগ: " + short);
          }
          if (BAD_PATTERNS.some((r) => r.test(line))) {
            state.lastLoginIssueAt = Date.now();
            state.logHits.push({ t: Date.now(), line: line.trim().slice(0, 160) });
            if (state.logHits.length > 20) state.logHits.shift();
          } else if (GOOD_PATTERNS.some((r) => r.test(line))) {
            state.lastLoginIssueAt = 0; state.logHits = []; state.probeFails = 0;
            raiseRecovery();
          }
        }
      } catch (_) {}
      return orig.apply(console, arguments);
    };
  });
}

/* ───────────── active probe ───────────── */
function evaluate(reason) {
  const recent = state.lastLoginIssueAt && (Date.now() - state.lastLoginIssueAt < 15 * 60 * 1000);
  if (state.probeFails >= PROBE_FAILS_BEFORE_ALERT || (state.probeFails >= 1 && recent)) {
    const extra = recent && state.logHits.length ? " | লগ: " + state.logHits[state.logHits.length - 1].line : "";
    raiseAlert(reason + extra);
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
    return raiseAlert(withLock("লগইন সম্পন্ন হয়নি (" + fmtDur(Date.now() - state.bootAt) + " ধরে api নেই) — আইডি লক/কুকি নষ্ট হতে পারে"));
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
        if (state.down) raiseRecovery();
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
  if (state.started) return;
  state.started = true;
  installLogWatcher();
  installShutdownHook();
  startWatchdog();
  startHeartbeat();
  const t = setInterval(probe, PROBE_EVERY_MS);
  if (t.unref) t.unref();

  // চালু-নোটিশ: লগইন সফল হওয়ার পর (api পাওয়া গেলে) পাঠায়।
  // লগইন না হলে "চালু" নোটিশ যাবে না; সেক্ষেত্রে probe() সতর্কতা দেবে।
  const sendBoot = async () => {
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
  const up = uptimeParts(process.uptime());
  const startedAt = new Date(Date.now() - process.uptime() * 1000);
  const probeTxt = state.lastProbeOk === null ? "PENDING" : state.lastProbeOk ? "✅ OK" : "❌ FAILED";
  const probeAgo = state.lastProbeAt ? " (" + fmtDur(Date.now() - state.lastProbeAt) + " ago)" : "";
  const tg = process.env.JUWEL_TG_TOKEN && process.env.JUWEL_TG_CHAT ? "ON ✅" : "OFF ❌";
  const dc = process.env.JUWEL_DISCORD_WEBHOOK ? "ON ✅" : "OFF ❌";
  const wd = global.__juwelAlertWatcher ? "ON ✅" : "OFF ❌";
  const hb = process.env.JUWEL_HEARTBEAT_URL ? "ON ✅" : "OFF ❌";
  const ram = Math.round(process.memoryUsage().rss / 1048576);
  const cmds = global.client && global.client.commands ? global.client.commands.size : "?";
  let started;
  try { started = startedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { started = startedAt.toISOString(); }

  return (
    HEAD("🤖 JUWEL BOT • STATUS") + "\n\n" +
    (state.down ? "🔴 STATUS ➤ PROBLEM" : "🟢 STATUS ➤ ONLINE") + "\n" + LINE + "\n" +
    "⏱ UPTIME\n" +
    " ┌ 📆 DAYS ➤ " + pad2(up.d) + "\n" +
    " ├ 🕐 HOURS ➤ " + pad2(up.h) + "\n" +
    " ├ ⏰ MINUTES ➤ " + pad2(up.m) + "\n" +
    " └ ⏳ SECONDS ➤ " + pad2(up.s) + "\n" +
    " ✦ " + up.d + "d " + pad2(up.h) + "h " + pad2(up.m) + "m " + pad2(up.s) + "s\n" + LINE + "\n" +
    "📅 STARTED ➤ " + started + "\n" +
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
  const up = uptimeParts(process.uptime());
  const startedAt = new Date(Date.now() - process.uptime() * 1000);
  let started;
  try { started = startedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { started = startedAt.toISOString(); }
  return (
    "⏱ UPTIME\n" +
    " ┌ 📆 DAYS ➤ " + pad2(up.d) + "\n" +
    " ├ 🕐 HOURS ➤ " + pad2(up.h) + "\n" +
    " ├ ⏰ MINUTES ➤ " + pad2(up.m) + "\n" +
    " └ ⏳ SECONDS ➤ " + pad2(up.s) + "\n" +
    " ✦ " + up.d + "d " + pad2(up.h) + "h " + pad2(up.m) + "m " + pad2(up.s) + "s\n" + LINE + "\n" +
    "📅 STARTED ➤ " + started
  );
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
    " ├ 🔴 বট বন্ধ হলে (ক্র্যাশ/আইডি লক সহ)\n" +
    " ├ 🚨 সেশন/লগইন সমস্যা হলে\n" +
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

// কার্ড = ফন্ট-রূপান্তরিত টেক্সট + (রূপান্তরহীন) ক্রেডিট লাইন
const withCredit = (t) => fx(t) + "\n" + LINE + "\n✨ Credit ➤ " + CREDIT;

/* ───────────── command ───────────── */
module.exports.config = {
  name: "juwelalert",
  aliases: ["jalert"],
  version: "1.5.0",
  hasPermssion: 2,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "সেশন সতর্কতা ও বট চালু/বন্ধ নোটিশ",
  commandCategory: "system",
  usages: "juwelalert [test]",
  cooldowns: 5
};

module.exports.onLoad = function () {
  try { start(); } catch (e) { log("start ত্রুটি: " + e.message, "error"); }
};

// onLoad না চললেও (কিছু লোডারে) প্রথম ইভেন্টেই চালু হয়ে যাবে
module.exports.handleEvent = function () {
  if (!state.started) { try { start(); } catch (_) {} }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  if (!state.started) start();
  if ((args[0] || "").toLowerCase() === "test") {
    const ok = await sendExternal(testText());
    return api.sendMessage(withCredit(testResultText(ok)), threadID, messageID);
  }
  return api.sendMessage(withCredit(healthText()), threadID, messageID);
};

// ওয়াচডগ মোডে শুধু নজরদারি চলে; নইলে স্বাভাবিকভাবে চালু
if (IS_WATCHER) {
  try { runWatcher(); } catch (_) { process.exit(1); }
} else {
  // ফাইল লোড হওয়ার সাথে সাথেই চালু — onLoad/handleEvent না চললেও নজরদারি কাজ করবে
  try { start(); } catch (e) { log("start ত্রুটি: " + e.message, "error"); }
}
