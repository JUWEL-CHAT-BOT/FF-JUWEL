/**
 * Juwel.js — Bot launcher / supervisor (npm start এটাই চালায়, এটা Main.js চালু রাখে)
 * Credit: 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = __dirname;
const MAIN_FILE = path.join(ROOT, "Main.js");
const PACKAGE_FILE = path.join(ROOT, "package.json");
const ENV_FILE = path.join(ROOT, ".env");
const LOG_DIR = path.join(ROOT, "logs");
const STATUS_FILE = path.join(ROOT, "status.json");

// ---------------------------------------------------------------------------
// কনফিগারেশন (দরকার মতো বদলান)
// ---------------------------------------------------------------------------
const CONFIG = {
  requiredEnv: [],                   // .env বা Railway Variables-এ যেগুলো থাকতেই হবে (যেমন ["TOKEN"]); খালি রাখলে কিছু চেক হবে না
  minNodeMajor: 18,                  // সর্বনিম্ন Node.js ভার্সন
  restartBaseDelayMs: 1000,          // প্রথম রিস্টার্ট delay: 1s
  restartMaxDelayMs: 60000,          // সর্বোচ্চ delay: 60s
  stableUptimeMs: 10 * 60 * 1000,    // এতক্ষণ চললে backoff রিসেট
  crashWindowMs: 60 * 1000,          // crash loop ধরার সময়সীমা
  crashWindowMax: 5,                 // ওই সময়ে এর বেশি crash হলে রিস্টার্ট বন্ধ
  logRetentionDays: 7,               // পুরনো লগ কত দিন রাখবেন
  statusIntervalMs: 30 * 1000,       // status.json আপডেটের ব্যবধান
  outputTailLines: 15,               // alert-এ শেষ কত লাইন আউটপুট যাবে

  // Facebook cookie চেক
  cookieFile: "appstate.json",       // আপনার cookie/appstate ফাইলের নাম
  cookieRequiredKeys: ["c_user", "xs"],
  cookieCheckIntervalMs: 30 * 60 * 1000,        // কত পর পর ফাইল চেক হবে
  cookieWarnBeforeMs: 24 * 60 * 60 * 1000,      // মেয়াদ শেষের কত আগে সতর্ক করবে
  cookieAlertCooldownMs: 3 * 60 * 60 * 1000,    // একই alert বারবার না পাঠানোর বিরতি
  // Main.js-এর আউটপুটে এসব লেখা এলে ধরে নেবে লগইন/cookie সমস্যা
  cookieErrorPatterns: [
    /checkpoint/i,
    /not logged in/i,
    /login (failed|error|approval)/i,
    /appstate.*(invalid|expired|error)/i,
    /error retrieving userid/i,
    /session (expired|invalid)/i,
    /FATAL:/,                          // এই বটের নিজের "FATAL: Session ..." বার্তা
    /missing session cookie/i,
    /AppState (load failed|file not found)/i
  ],

  // ব্যানার
  bannerText: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  bannerIntervalMs: 30 * 60 * 1000,  // মাঝে মাঝে কত পর পর দেখাবে

  // ২৪/৭ চালু রাখার সেটিং
  projectName: "juwel",
  restartOnCleanExit: true,                     // Main.js exit code 0 দিয়ে বন্ধ হলেও আবার চালু করবে
  crashLoopCooldownMs: 10 * 60 * 1000,          // crash loop হলে থেমে না গিয়ে এতক্ষণ অপেক্ষা করে আবার চেষ্টা
  dailyRestartEnabled: false,                   // true করলে প্রতিদিন নির্দিষ্ট ঘণ্টায় রিস্টার্ট (নিচের নোট দেখুন)
  dailyRestartHour: 4,                          // স্থানীয় সময়ে রাত ৪টা

  // নিজে থেকে সামলানোর সেটিং (কিছু বদলাতে হবে না)
  autoDetach: true,                             // টার্মিনালে চালালে ব্যাকগ্রাউন্ডে চলে যাবে, টার্মিনাল বন্ধ করলেও চলবে
  maxMemoryMb: 800,                             // বট এর চেয়ে বেশি RAM নিলে নিজে থেকে রিস্টার্ট
  memoryCheckIntervalMs: 60 * 1000,
  memoryStrikes: 3,                              // টানা এতবার বেশি পেলে তবেই রিস্টার্ট
  quickExitMs: 60 * 1000,                       // এর আগে exit 0 হলেও সেটা সমস্যা ধরা হবে (যেমন config/cookie ভুল)
  loginWaitMs: 10 * 60 * 1000,                  // এতক্ষণে লগইন (MQTT listener) না হলে আটকে গেছে ধরবে
  maxStuckRestarts: 2                           // আটকে গেলে টানা সর্বোচ্চ এতবার রিস্টার্ট (এরপর শুধু alert)
};

// ---------------------------------------------------------------------------
// একসাথে দুইবার চালানো ঠেকানো + ব্যাকগ্রাউন্ডে চালানো + stop/status কমান্ড
//   চালু করুন:  node juwel.js
//   বন্ধ করুন:  node juwel.js stop
//   অবস্থা দেখুন: node juwel.js status
// ---------------------------------------------------------------------------
const PID_FILE = path.join(ROOT, ".juwel.pid"); // Main.js নিজে ".bot.pid" ব্যবহার করে, তাই এটা আলাদা নাম

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function readPid() {
  try {
    const n = parseInt(fs.readFileSync(PID_FILE, "utf8"), 10);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

const cliCommand = process.argv[2];

if (cliCommand === "stop") {
  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    console.log("juwel এখন চলছে না।");
  } else {
    process.kill(pid, "SIGTERM");
    console.log(`juwel বন্ধ করার সিগন্যাল পাঠানো হয়েছে (PID ${pid})।`);
  }
  process.exit(0);
}

if (cliCommand === "status") {
  try {
    console.log(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch (_) {
    console.log("status.json এখনো তৈরি হয়নি।");
  }
  const pid = readPid();
  console.log(pid && isAlive(pid) ? `juwel চলছে (PID ${pid})` : "juwel চলছে না");
  process.exit(0);
}

{
  const existing = readPid();
  if (existing && existing !== process.pid && isAlive(existing)) {
    console.log(`juwel আগে থেকেই চলছে (PID ${existing})। বন্ধ করতে: node juwel.js stop`);
    process.exit(0);
  }
}

// টার্মিনালে হাতে চালালে ব্যাকগ্রাউন্ডে পাঠিয়ে দেয়। হোস্টিং প্যানেল/pm2 হলে এটা কাজ করে না (দরকারও নেই)।
if (CONFIG.autoDetach && process.stdout.isTTY && !process.env.JUWEL_CHILD && !process.env.pm_id) {
  const child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, JUWEL_CHILD: "1" }
  });
  child.unref();
  console.log("juwel ব্যাকগ্রাউন্ডে চালু হয়েছে — টার্মিনাল বন্ধ করলেও চলবে।");
  console.log("লগ দেখুন: logs/ ফোল্ডারে | বন্ধ করতে: node juwel.js stop");
  process.exit(0);
}

try {
  fs.writeFileSync(PID_FILE, String(process.pid));
} catch (_) {}

// ---------------------------------------------------------------------------
// ছোট helper
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");

function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStr(d = new Date()) {
  return `${dateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// ২. লগিং (তারিখ অনুযায়ী ফাইল, প্রতি লাইনে timestamp, পুরনো লগ ডিলিট)
// ---------------------------------------------------------------------------
fs.mkdirSync(LOG_DIR, { recursive: true });

// স্থায়ী ডেটা ফোল্ডার (data.sqlite এখানে থাকে)। Railway Volume যোগ করা থাকলে ./data সেই Volume-এর সাথে জুড়ে দেয়,
// ফলে নতুন deploy-এও ডেটা মুছে যায় না। Volume না থাকলে শুধু সাধারণ ফোল্ডার বানায়।
try {
  const dataDir = path.join(ROOT, "data");
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  let exists = true;
  try {
    fs.lstatSync(dataDir);
  } catch (_) {
    exists = false;
  }
  if (!exists) {
    if (volume && fs.existsSync(volume) && path.resolve(volume) !== path.resolve(dataDir)) {
      fs.symlinkSync(volume, dataDir, "dir");
    } else {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }
} catch (_) {}

let logStream = null;
let logDate = null;

function getLogStream() {
  const today = dateStr();
  if (today !== logDate) {
    if (logStream) logStream.end();
    logDate = today;
    logStream = fs.createWriteStream(path.join(LOG_DIR, `bot-${today}.log`), { flags: "a" });
  }
  return logStream;
}

function writeLog(tag, line) {
  try {
    getLogStream().write(`[${timeStr()}] [${tag}] ${line}\n`);
  } catch (_) {}
}

function info(message) {
  console.log(`[Launcher] ${message}`);
  writeLog("launcher", message);
}

function warn(message) {
  console.error(`[Launcher] ${message}`);
  writeLog("launcher", message);
}

function cleanOldLogs() {
  try {
    const cutoff = Date.now() - CONFIG.logRetentionDays * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(LOG_DIR)) {
      if (!/^bot-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
      const full = path.join(LOG_DIR, file);
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        info(`Old log deleted: ${file}`);
      }
    }
  } catch (error) {
    warn(`Log cleanup failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// .env পার্সার (dotenv ছাড়াই; শুধু চেক ও webhook কনফিগের জন্য)
// ---------------------------------------------------------------------------
function parseEnvFile(file) {
  const result = {};
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    }
  } catch (_) {}
  return result;
}

const fileEnv = parseEnvFile(ENV_FILE);
const mergedEnv = { ...fileEnv, ...process.env };

// ---------------------------------------------------------------------------
// ৩. নোটিফিকেশন (Discord / Telegram webhook)
//    .env-এ দিন: DISCORD_WEBHOOK_URL, অথবা TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
// ---------------------------------------------------------------------------
async function notify(text) {
  const message = `**[${CONFIG.projectName}]** ${text}`;
  const tasks = [];

  if (mergedEnv.DISCORD_WEBHOOK_URL) {
    tasks.push(
      fetch(mergedEnv.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.slice(0, 1900) }),
        signal: AbortSignal.timeout(10000)
      })
    );
  }

  if (mergedEnv.TELEGRAM_BOT_TOKEN && mergedEnv.TELEGRAM_CHAT_ID) {
    tasks.push(
      fetch(`https://api.telegram.org/bot${mergedEnv.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: mergedEnv.TELEGRAM_CHAT_ID,
          text: message.replace(/\*\*/g, "").slice(0, 3900)
        }),
        signal: AbortSignal.timeout(10000)
      })
    );
  }

  if (!tasks.length) return;

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") warn(`Notification failed: ${r.reason && r.reason.message}`);
    else if (r.value && !r.value.ok) warn(`Notification failed: HTTP ${r.value.status}`);
  }
}

// ---------------------------------------------------------------------------
// ৮. স্টার্টআপ চেক
// ---------------------------------------------------------------------------
let packageInfo = null;

function runStartupChecks() {
  // .env ঠিক করার পর আবার চেক করলে নতুন মান যেন পাওয়া যায়
  for (const k of Object.keys(mergedEnv)) delete mergedEnv[k];
  Object.assign(mergedEnv, parseEnvFile(ENV_FILE), process.env);

  const errors = [];
  const warnings = [];

  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < CONFIG.minNodeMajor) {
    errors.push(`Node.js ${CONFIG.minNodeMajor}+ দরকার, আপনার ভার্সন: ${process.versions.node}`);
  }

  if (!fs.existsSync(MAIN_FILE)) errors.push("Main.js পাওয়া যায়নি");

  if (!fs.existsSync(PACKAGE_FILE)) {
    errors.push("package.json পাওয়া যায়নি");
  } else {
    try {
      packageInfo = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
    } catch (error) {
      errors.push(`package.json পড়া যায়নি: ${error.message}`);
    }
  }

  if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
    errors.push("node_modules নেই — আগে `npm install` চালান");
  }

  if (!fs.existsSync(ENV_FILE)) {
    warnings.push(".env ফাইল নেই (শুধু system environment ব্যবহার হবে)");
  }

  for (const key of CONFIG.requiredEnv) {
    if (!mergedEnv[key] || !String(mergedEnv[key]).trim()) {
      errors.push(`Environment variable "${key}" সেট করা নেই`);
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// ১১. স্ট্যাটাস ও পরিসংখ্যান (status.json)
// ---------------------------------------------------------------------------
const launcherStartedAt = Date.now();

const status = {
  botName: null,
  version: null,
  state: "starting", // starting | running | waiting-restart | stopped | crash-loop
  launcherPid: process.pid,
  botPid: null,
  launcherStartedAt: new Date(launcherStartedAt).toISOString(),
  currentRunStartedAt: null,
  uptimeSeconds: 0,
  totalStarts: 0,
  totalRestarts: 0,
  totalCrashes: 0,
  lastCrash: null,
  nextRestartAt: null,
  updatedAt: null
};

let bot = null;
let currentRunStartedAt = null;

function saveStatus() {
  try {
    status.botPid = bot ? bot.pid : null;
    status.uptimeSeconds = currentRunStartedAt && bot ? Math.floor((Date.now() - currentRunStartedAt) / 1000) : 0;
    status.currentRunStartedAt = currentRunStartedAt && bot ? new Date(currentRunStartedAt).toISOString() : null;
    status.updatedAt = new Date().toISOString();

    const tmp = `${STATUS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
    fs.renameSync(tmp, STATUS_FILE);
  } catch (error) {
    warn(`status.json লেখা যায়নি: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// ১. অটো-রিস্টার্ট (exponential backoff + crash loop protection)
// ---------------------------------------------------------------------------
let shuttingDown = false;
let restartTimer = null;
let consecutiveFailures = 0;
let crashTimes = [];
const outputTail = [];

function pushTail(line) {
  outputTail.push(line);
  while (outputTail.length > CONFIG.outputTailLines) outputTail.shift();
}

function tailText() {
  return outputTail.length ? `\n\`\`\`\n${outputTail.join("\n").slice(-1200)}\n\`\`\`` : "";
}

function pipeOutput(stream, tag, writer) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    writer(line);
    writeLog(tag, line);
    pushTail(`[${tag}] ${line}`);
    checkCookieLine(line);
    if (/MQTT listener registered/.test(line)) markLoginOk();
  });
}

// ---------------------------------------------------------------------------
// Facebook cookie চেক (নেই / নষ্ট / মেয়াদ শেষ / রানটাইমে লগআউট)
// ---------------------------------------------------------------------------
function parseExpiry(value) {
  if (value === undefined || value === null || value === "" || value === -1 || value === 0) return null;
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value);
    return n > 1e12 ? n : n * 1000; // মিলিসেকেন্ড বা সেকেন্ড
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function cookiesFromJsonText(raw) {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length) return data;
    if (data && Array.isArray(data.cookies) && data.cookies.length) return data.cookies;
  } catch (_) {}
  return null;
}

function decodeEnvCookies(raw) {
  let cookies = cookiesFromJsonText(raw);
  if (cookies) return cookies;
  try {
    cookies = cookiesFromJsonText(Buffer.from(raw, "base64").toString("utf8")); // base64 করা cookie
    if (cookies) return cookies;
  } catch (_) {}
  const pairs = raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return i === -1 ? null : { key: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    })
    .filter(Boolean);
  return pairs.length ? pairs : null;
}

function inspectCookie() {
  // Main.js আগে appstate ফাইল পড়ে। ফাইল ঠিক থাকলে সেটাই ব্যবহার হয়, না থাকলে APPSTATE Variable।
  // ফাইল থাকলে কিন্তু তাতে ভুল লেখা (যেমন "এখানে cookie দিন") থাকলে Main.js চুপচাপ বন্ধ হয়ে যায়।
  const file = path.join(ROOT, CONFIG.cookieFile);
  const envRaw = String(mergedEnv.APPSTATE || mergedEnv.APP_STATE || "").trim();

  let fileRaw = "";
  const fileExists = fs.existsSync(file);
  if (fileExists) {
    try {
      fileRaw = fs.readFileSync(file, "utf8").trim();
    } catch (error) {
      return { ok: false, type: "unreadable", message: `Cookie ফাইল পড়া যায়নি: ${error.message}` };
    }
  }

  let fileBroken = false;
  if (fileExists) {
    try {
      JSON.parse(fileRaw);
    } catch (_) {
      fileBroken = true;
    }
  }
  if (fileBroken) {
    return {
      ok: false,
      type: "file-broken",
      message: `${CONFIG.cookieFile} ফাইলে ঠিক JSON নেই (খালি বা ভুল লেখা)। এই অবস্থায় বট চালু হয় না। ফাইলটা মুছে দিন, অথবা ঠিক cookie বসান।`
    };
  }

  const cookies = (fileExists ? cookiesFromJsonText(fileRaw) : null) || (envRaw ? decodeEnvCookies(envRaw) : null);

  if (!cookies) {
    if (!fileExists && !envRaw) {
      return {
        ok: false,
        type: "missing",
        message: `Facebook cookie পাওয়া যায়নি (${CONFIG.cookieFile} ফাইল বা APPSTATE Variable কোনোটাই নেই)`
      };
    }
    return { ok: false, type: "invalid", message: "Facebook cookie-র ফরম্যাট ঠিক নেই (ঠিক JSON দিন)" };
  }

  const find = (name) => cookies.find((c) => (c.key || c.name) === name);

  const missingKeys = CONFIG.cookieRequiredKeys.filter((k) => {
    const c = find(k);
    return !c || !String(c.value || "").trim();
  });

  if (missingKeys.length) {
    return { ok: false, type: "invalid", message: `Cookie-তে প্রয়োজনীয় ${missingKeys.join(", ")} নেই (লগআউট হয়ে গেছে বা ভুল cookie)` };
  }

  const now = Date.now();
  let earliest = null;
  for (const key of CONFIG.cookieRequiredKeys) {
    const c = find(key);
    const exp = parseExpiry(c.expires ?? c.expirationDate ?? c.expiry);
    if (exp && (earliest === null || exp < earliest)) earliest = exp;
  }

  if (earliest !== null && earliest <= now) {
    return { ok: false, type: "expired", message: `Facebook cookie-র মেয়াদ শেষ হয়ে গেছে (${timeStr(new Date(earliest))})। নতুন cookie দিন।` };
  }

  if (earliest !== null && earliest - now < CONFIG.cookieWarnBeforeMs) {
    return {
      ok: true,
      type: "expiring-soon",
      warn: true,
      message: `Facebook cookie-র মেয়াদ শীঘ্রই শেষ হবে (${timeStr(new Date(earliest))})`
    };
  }

  return { ok: true, type: "ok", message: "Facebook cookie ঠিক আছে" };
}

const cookieAlertSentAt = {};

function alertCookie(type, message) {
  const now = Date.now();
  if (cookieAlertSentAt[type] && now - cookieAlertSentAt[type] < CONFIG.cookieAlertCooldownMs) return;
  cookieAlertSentAt[type] = now;
  warn(`Cookie: ${message}`);
  notify(`🍪 ${message}`);
}

function checkCookie() {
  const result = inspectCookie();
  status.cookie = {
    ok: result.ok,
    type: result.type,
    message: result.message,
    checkedAt: new Date().toISOString()
  };
  if (!result.ok || result.warn) alertCookie(result.type, result.message);
  else cookieAlertSentAt["expiring-soon"] = 0;
  return result;
}

// Main.js-এর আউটপুট দেখে রানটাইমে লগআউট/checkpoint ধরা
function checkCookieLine(line) {
  if (!CONFIG.cookieErrorPatterns.some((re) => re.test(line))) return;
  const result = inspectCookie();
  if (!result.ok) alertCookie(result.type, result.message);
  else {
    alertCookie(
      "runtime-logout",
      `Bot-এর লগইনে সমস্যা ধরা পড়েছে (cookie expire বা checkpoint হতে পারে): ${line.slice(0, 200)}`
    );
  }
}

// ---------------------------------------------------------------------------
// ব্যানার
// ---------------------------------------------------------------------------
function printBanner() {
  const bar = "═".repeat(44);
  console.log(`\n${bar}\n   Project : ${CONFIG.projectName}\n   Credit  : ${CONFIG.bannerText}\n${bar}\n`);
  writeLog("banner", CONFIG.bannerText);
}

// ---------------------------------------------------------------------------
// ২৪/৭ চালু রাখার ব্যবস্থা: নির্ধারিত রিস্টার্ট
// নোট: প্রতিবার রিস্টার্টে Facebook-এ নতুন করে লগইন হয়। ঘন ঘন লগইন হলে
// checkpoint-এর ঝুঁকি থাকে, তাই এটা ডিফল্টভাবে বন্ধ। মেমরি বাড়তে থাকলে চালু করুন।
// ---------------------------------------------------------------------------
let plannedRestart = false;
let lastPlannedRestartDate = null;

function requestPlannedRestart(reason) {
  if (!bot || shuttingDown || plannedRestart) return;
  plannedRestart = true;
  info(`Planned restart: ${reason}`);
  notify(`🔄 Planned restart: ${reason}`);
  try {
    bot.kill("SIGTERM");
  } catch (_) {}
  setTimeout(() => {
    try {
      if (bot) bot.kill("SIGKILL");
    } catch (_) {}
  }, 10000).unref();
}

function scheduleDailyRestart() {
  if (!CONFIG.dailyRestartEnabled) return;
  setInterval(() => {
    const now = new Date();
    const today = dateStr(now);
    if (now.getHours() === CONFIG.dailyRestartHour && lastPlannedRestartDate !== today) {
      lastPlannedRestartDate = today;
      requestPlannedRestart(`দৈনিক রিস্টার্ট (${pad(CONFIG.dailyRestartHour)}:00)`);
    }
  }, 60 * 1000).unref();
}

// লগইন আটকে গেলে (Main.js লগইন ব্যর্থ হলে বন্ধ হয় না, শুধু লগ করে) ধরার ব্যবস্থা
let loginOk = false;
let loginTimer = null;
let stuckRestarts = 0;

function markLoginOk() {
  loginOk = true;
  stuckRestarts = 0;
  if (loginTimer) {
    clearTimeout(loginTimer);
    loginTimer = null;
  }
  status.lastLoginAt = new Date().toISOString();
  saveStatus();
}

function armLoginWatch() {
  loginOk = false;
  if (loginTimer) clearTimeout(loginTimer);
  loginTimer = setTimeout(() => {
    loginTimer = null;
    if (!bot || loginOk || shuttingDown || plannedRestart) return;
    if (stuckRestarts < CONFIG.maxStuckRestarts) {
      stuckRestarts += 1;
      requestPlannedRestart(
        `${formatDuration(CONFIG.loginWaitMs)} হয়ে গেছে কিন্তু বট লগইন করেনি, আবার চেষ্টা (${stuckRestarts}/${CONFIG.maxStuckRestarts})`
      );
    } else {
      notify(
        `🚨 বট বারবার লগইন করতে পারছে না। সম্ভবত cookie নষ্ট বা Facebook আটকে দিয়েছে। নতুন cookie দিয়ে আবার deploy করুন।${tailText()}`
      );
    }
  }, CONFIG.loginWaitMs);
}

// বট বেশি RAM নিতে থাকলে (দীর্ঘ সময় চললে যা হয়) নিজে থেকে রিস্টার্ট
let memoryStrikes = 0;

function readRssMb(pid) {
  try {
    const m = /VmRSS:\s+(\d+)\s*kB/.exec(fs.readFileSync(`/proc/${pid}/status`, "utf8"));
    return m ? parseInt(m[1], 10) / 1024 : null;
  } catch (_) {
    return null;
  }
}

function watchMemory() {
  setInterval(() => {
    if (!bot || shuttingDown || plannedRestart) return;
    const mb = readRssMb(bot.pid);
    if (mb === null) return;
    status.memoryMb = Math.round(mb);
    if (mb > CONFIG.maxMemoryMb) {
      memoryStrikes += 1;
      if (memoryStrikes >= CONFIG.memoryStrikes) {
        memoryStrikes = 0;
        requestPlannedRestart(`মেমরি ব্যবহার বেশি (${Math.round(mb)}MB)`);
      }
    } else {
      memoryStrikes = 0;
    }
  }, CONFIG.memoryCheckIntervalMs).unref();
}

function startBot() {
  restartTimer = null;
  outputTail.length = 0;

  bot = spawn(process.execPath, ["--trace-warnings", "--async-stack-traces", MAIN_FILE], {
    cwd: ROOT,
    stdio: ["inherit", "pipe", "pipe"],
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || "1"
    }
  });

  currentRunStartedAt = Date.now();
  armLoginWatch();
  status.state = "running";
  status.totalStarts += 1;
  status.nextRestartAt = null;
  saveStatus();

  info(`Main.js started (pid ${bot.pid})`);

  pipeOutput(bot.stdout, "out", (line) => console.log(line));
  pipeOutput(bot.stderr, "err", (line) => console.error(line));

  bot.on("error", (error) => {
    warn(`Main.js Error: ${error.message}`);
  });

  bot.on("close", (code, signal) => {
    const uptimeMs = Date.now() - currentRunStartedAt;
    bot = null;

    if (shuttingDown) {
      status.state = "stopped";
      saveStatus();
      quit(0);
      return;
    }

    info(`Main.js stopped. Exit Code: ${code}${signal ? `, Signal: ${signal}` : ""}, Uptime: ${formatDuration(uptimeMs)}`);

    // নির্ধারিত রিস্টার্ট: crash হিসেবে গণ্য হবে না
    if (plannedRestart) {
      plannedRestart = false;
      status.state = "waiting-restart";
      status.totalRestarts += 1;
      status.nextRestartAt = new Date(Date.now() + 3000).toISOString();
      saveStatus();
      restartTimer = setTimeout(startBot, 3000);
      return;
    }

    // exit code 0 হলেও (restartOnCleanExit চালু থাকলে) আবার চালু করবে
    if (code === 0 && CONFIG.restartOnCleanExit && uptimeMs >= CONFIG.quickExitMs) {
      status.state = "waiting-restart";
      status.totalRestarts += 1;
      status.nextRestartAt = new Date(Date.now() + 3000).toISOString();
      saveStatus();
      info("Main.js exited with code 0. Restarting in 3s (restartOnCleanExit).");
      restartTimer = setTimeout(startBot, 3000);
      return;
    }

    // exit code 0 = ইচ্ছাকৃতভাবে বন্ধ, রিস্টার্ট করা হবে না (restartOnCleanExit বন্ধ থাকলে)
    if (code === 0 && !CONFIG.restartOnCleanExit) {
      status.state = "stopped";
      saveStatus();
      info("Main.js exited normally. Automatic restart skipped.");
      notify(`Main.js স্বাভাবিকভাবে বন্ধ হয়েছে (exit code 0)। Uptime: ${formatDuration(uptimeMs)}`).finally(() => quit(0));
      return;
    }

    handleCrash(code, signal, uptimeMs);
  });
}

function handleCrash(code, signal, uptimeMs) {
  const now = Date.now();

  status.totalCrashes += 1;
  status.lastCrash = {
    at: new Date(now).toISOString(),
    exitCode: code,
    signal: signal || null,
    uptimeSeconds: Math.floor(uptimeMs / 1000),
    lastOutput: outputTail.slice(-5)
  };

  // দীর্ঘ সময় স্থিতিশীল চললে backoff রিসেট
  if (uptimeMs >= CONFIG.stableUptimeMs) consecutiveFailures = 0;
  consecutiveFailures += 1;

  // crash loop protection
  crashTimes = crashTimes.filter((t) => now - t < CONFIG.crashWindowMs);
  crashTimes.push(now);

  if (crashTimes.length > CONFIG.crashWindowMax) {
    status.state = "crash-loop";
    saveStatus();
    const msg = `🚨 Crash loop! ${Math.round(CONFIG.crashWindowMs / 1000)} সেকেন্ডে ${crashTimes.length} বার crash হয়েছে। ${formatDuration(CONFIG.crashLoopCooldownMs)} অপেক্ষা করে আবার চেষ্টা করা হবে। Exit code: ${code}${signal ? `, signal: ${signal}` : ""}.${tailText()}`;
    warn(msg.replace(/```/g, ""));
    notify(msg);

    // থেমে না গিয়ে অপেক্ষা করে আবার চেষ্টা (বট যাতে নিজে থেকেই ফিরে আসে)
    crashTimes = [];
    consecutiveFailures = 0;
    status.nextRestartAt = new Date(now + CONFIG.crashLoopCooldownMs).toISOString();
    saveStatus();
    restartTimer = setTimeout(startBot, CONFIG.crashLoopCooldownMs);
    return;
  }

  const delay = Math.min(
    CONFIG.restartBaseDelayMs * 2 ** (consecutiveFailures - 1),
    CONFIG.restartMaxDelayMs
  );

  status.state = "waiting-restart";
  status.totalRestarts += 1;
  status.nextRestartAt = new Date(now + delay).toISOString();
  saveStatus();

  info(`Restarting in ${formatDuration(delay)} (restart #${status.totalRestarts})...`);

  notify(
    `⚠️ Bot crash করেছে। Exit code: ${code}${signal ? `, signal: ${signal}` : ""}. Uptime: ${formatDuration(uptimeMs)}. ` +
      `Restart #${status.totalRestarts}, ${formatDuration(delay)} পর আবার চালু হবে।${tailText()}`
  );

  restartTimer = setTimeout(startBot, delay);
}

// ---------------------------------------------------------------------------
// শাটডাউন
// ---------------------------------------------------------------------------
function quit(code) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    process.exit(code);
  };
  try {
    if (logStream) logStream.end(finish);
    else finish();
  } catch (_) {
    finish();
  }
  setTimeout(finish, 2000).unref();
}

function stopBot(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info(`${signal} received. Shutting down...`);

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (bot && bot.exitCode === null && bot.signalCode === null) {
    try {
      bot.kill(signal);
    } catch (_) {}

    const forceTimer = setTimeout(() => {
      try {
        if (bot) bot.kill("SIGKILL");
      } catch (_) {}
    }, 10000);

    bot.once("close", () => clearTimeout(forceTimer));
    return; // close হ্যান্ডলার quit(0) করবে
  }

  status.state = "stopped";
  saveStatus();
  quit(0);
}

// launcher নিজে যেন কখনো হঠাৎ মারা না যায়
process.on("uncaughtException", (error) => {
  warn(`Launcher uncaughtException: ${(error && error.stack) || error}`);
});
process.on("unhandledRejection", (reason) => {
  warn(`Launcher unhandledRejection: ${(reason && reason.stack) || reason}`);
});
// SSH/টার্মিনাল বন্ধ করলেও বট চলতে থাকবে
process.on("SIGHUP", () => info("SIGHUP ignored (terminal closed)."));

process.on("SIGINT", () => stopBot("SIGINT"));
process.on("SIGTERM", () => stopBot("SIGTERM"));

process.on("exit", () => {
  try {
    if (readPid() === process.pid) fs.unlinkSync(PID_FILE);
  } catch (_) {}
  if (bot && bot.exitCode === null && bot.signalCode === null) {
    try {
      bot.kill("SIGKILL");
    } catch (_) {}
  }
});

// ---------------------------------------------------------------------------
// শুরু
// ---------------------------------------------------------------------------
(async () => {
  printBanner();
  setInterval(printBanner, CONFIG.bannerIntervalMs).unref();

  cleanOldLogs();
  setInterval(cleanOldLogs, 6 * 60 * 60 * 1000).unref();

  const { errors, warnings } = runStartupChecks();

  console.log("Starting Main.js...");
  if (packageInfo) {
    status.botName = packageInfo.name;
    status.version = packageInfo.version;
    console.log(`botName: ${packageInfo.name}`);
    console.log(`version: ${packageInfo.version}`);
  }

  for (const w of warnings) warn(`Warning: ${w}`);

  if (errors.length) {
    for (const e of errors) warn(`Startup check failed: ${e}`);
    status.state = "waiting-fix";
    saveStatus();
    await notify(`❌ Startup check ব্যর্থ (ঠিক হলে নিজে থেকেই চালু হবে):\n- ${errors.join("\n- ")}`);

    // থেমে না গিয়ে প্রতি মিনিটে আবার চেক করবে
    while (!shuttingDown) {
      await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
      if (!runStartupChecks().errors.length) break;
    }
    if (shuttingDown) return;

    if (packageInfo) {
      status.botName = packageInfo.name;
      status.version = packageInfo.version;
    }
  }

  info("Startup checks passed.");

  const cookieResult = checkCookie();
  info(`Cookie check: ${cookieResult.message}`);
  setInterval(checkCookie, CONFIG.cookieCheckIntervalMs).unref();

  setInterval(saveStatus, CONFIG.statusIntervalMs).unref();

  status.project = CONFIG.projectName;
  status.credit = CONFIG.bannerText;
  scheduleDailyRestart();
  watchMemory();

  await notify(`✅ ${CONFIG.projectName} চালু হয়েছে (v${status.version}) — ${CONFIG.bannerText}`);
  startBot();
})();
