const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ★★★ আপনার UID গুলো ★★★ */
const OWNER_UIDS = [
  "61596782829090",
  "61596105511947",
  "100000000000003",
];

/* ★★★ আপনার ২টি এডমিন নাম ★★★
   STRICT মোড: নাম হুবহু (একটা ডট/স্পেস/চিহ্ন কম-বেশি হলেও) মিলতে হবে।
   Facebook থেকে আসা নাম যদি একটু আলাদা হয়, লগের "got" লাইন থেকে
   হুবহু কপি করে নিচের লিস্টে নতুন লাইন হিসেবে যোগ করুন। */
const OWNER_NAMES = [
  "Juwel AhmeD'z",
  "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐"
];

const MASTER_NOTICE = true;

const MASTER_UIDS = [
  // "61500000000000",
];

/* ───────────── Credit ─────────────
   ক্রেডিট আগের মতোই থাকবে। কেউ বদলালে বা মুছে ফেললেও কোড চলবে, কোনো হ্যাশ চেক নেই। */
const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";

const sha = s => crypto.createHash("sha256").update(String(s == null ? "" : s).normalize("NFC")).digest("hex");

function creditOk() {
  return true;
}

/* ───────────── State ───────────── */
const STATE_FILE = path.join(__dirname, "..", "Script", "commands", "cache", "solo.json");
const MARKER_RE = /⟦allbot:(stop|on):(\d+)⟧/;
const DEFAULT_MS = 24 * 3600 * 1000;
const MAX_MS = 7 * 24 * 3600 * 1000;
const MIN_MS = 10 * 1000;

let state = { threads: {}, masters: [], admins: [] };
try {
  if (fs.existsSync(STATE_FILE)) {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (s && typeof s.threads === "object" && s.threads) state.threads = s.threads;
    if (s && Array.isArray(s.masters)) state.masters = s.masters.map(String);
    if (s && Array.isArray(s.admins)) state.admins = s.admins.map(String);
  }
} catch (_) {}

function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.log("[ALLBOT] save error:", e.message); }
}

function masters() {
  return [...MASTER_UIDS, ...state.masters].map(String).filter(Boolean);
}
function isOwner(id) {
  const s = String(id);
  return OWNER_UIDS.map(String).filter(Boolean).includes(s) || state.admins.includes(s);
}

/* ───────────── গোপন কোড দিয়ে অ্যাডমিন লগইন ─────────────
   ব্যবহার:  allbot login <গোপন কোড>     → আপনি সব বটে অ্যাডমিন হবেন
             allbot logout               → নিজের অ্যাডমিন লগইন তুলে নেবেন
   গোপন কোড সেট করার নিয়ম (কোডে সরাসরি লিখবেন না, GitHub-এ দেখা যাবে):
     ১) বট যে হোস্টে চলে (Railway/Render ইত্যাদি) সেখানে Variable বানান:
        ALLBOT_SECRET = আপনার কোড
     ২) অথবা নিচের ADMIN_SECRET_HASH-এ কোডের sha256 বসান (দুর্বল কোড হলে হ্যাশ ভেঙে ফেলা সম্ভব)। */
const ADMIN_SECRET_HASH = "264812e94ff069c6848c76e9189387db19686158b5c5b173273efa4cae484b17";
const loginFails = new Map();

function secretOk(input) {
  const hashes = [];
  if (ADMIN_SECRET_HASH) hashes.push(String(ADMIN_SECRET_HASH).toLowerCase());
  if (process.env.ALLBOT_SECRET) hashes.push(sha(process.env.ALLBOT_SECRET));
  if (!hashes.length || !input) return false;
  const h = Buffer.from(sha(input), "hex");
  return hashes.some(x => {
    try { const b = Buffer.from(x, "hex"); return b.length === h.length && crypto.timingSafeEqual(b, h); }
    catch (_) { return false; }
  });
}

/* কোডে বড়-ছোট হাতের অক্ষর আলাদা ধরা হয়, তাই কাঁচা মেসেজ থেকে পড়া হয় */
function parseLogin(body) {
  let t = String(body || "").trim().replace(/\s+/g, " ");
  const prefix = String((global.config && global.config.PREFIX) || ".");
  if (prefix && t.toLowerCase().startsWith(prefix.toLowerCase())) t = t.slice(prefix.length).trim();
  t = t.replace(/^[^\p{L}\p{N}]+/u, "");
  const m = t.match(/^allbot ?(login|logout)(?: (\S+))?$/i);
  return m ? { type: m[1].toLowerCase(), secret: m[2] || "" } : null;
}

/* নোটিশ মেসেজ নেই — শুধু আপনার মেসেজে রিয়েক্ট দেয় */
function react(api, event, emoji) {
  try { api.setMessageReaction(emoji, event.messageID, () => {}, true); }
  catch (e) { console.log("[ALLBOT] react error:", e && e.message); }
}

function handleLogin(api, event, cmd) {
  const uid = String(event.senderID);
  if (cmd.type === "logout") {
    if (state.admins.includes(uid)) {
      state.admins = state.admins.filter(x => x !== uid);
      save();
      react(api, event, "👍");
    }
    return;
  }
  const f = loginFails.get(uid) || { n: 0, until: 0 };
  if (Date.now() < f.until) return;                       // ব্লক থাকলে চুপ
  if (secretOk(cmd.secret)) {
    loginFails.delete(uid);
    if (!state.admins.includes(uid)) { state.admins.push(uid); save(); }
    console.log("[ALLBOT] ✅ admin login uid=" + uid);
    react(api, event, "❤");
  } else {
    f.n++;
    if (f.n >= 5) { f.until = Date.now() + 3600000; f.n = 0; }   // ৫ বার ভুল → ১ ঘণ্টা ব্লক
    loginFails.set(uid, f);
    console.log("[ALLBOT] ❌ wrong secret from uid=" + uid);
  }
}

/* ───────────── STRICT নাম চেনা ─────────────
   শুধু একটাই নিয়ম: নাম হুবহু সমান হতে হবে।
   (শুধু NFC নরমালাইজ — একই অক্ষরের দুই রকম কোডিং এক ধরা হয়, এর বেশি কিছু না।)
   কোনো ট্রিম, কেস-ইগনোর, স্পেস-ইগনোর, ফ্যান্সি-মার্ক-বাদ — কিছুই নেই। */
const strictKey = n => String(n == null ? "" : n).normalize("NFC");

const OWNER_NAMES_SET = new Set(OWNER_NAMES.map(strictKey).filter(k => k.length > 0));
const hasNameOwners = () => OWNER_NAMES_SET.size > 0;

/* লগে নামের প্রতিটি বিশেষ ক্যারেক্টার \u{...} আকারে দেখানোর জন্য */
const esc = s => Array.from(String(s == null ? "" : s)).map(c => {
  const cp = c.codePointAt(0);
  return (cp < 32 || cp > 126) ? "\\u{" + cp.toString(16).toUpperCase() + "}" : c;
}).join("");

const nameCache = new Map();
const NAME_TTL = 5 * 60 * 1000;

function pickUser(res, uid) {
  if (!res) return null;
  if (Array.isArray(res)) return res.find(x => x && String(x.id) === String(uid)) || null;
  if (typeof res === "object") return res[uid] || res[String(uid)] || null;
  if (typeof res === "string") return res;
  return null;
}

/* STRICT: শুধু পুরো নাম (name / alternateName) ধরা হবে।
   firstName / username ধরা হয় না, যাতে ভুল মিল না হয়। */
function pushName(found, u) {
  if (!u) return;
  if (typeof u === "string") { if (u.length) found.push(u); return; }
  if (u.name) found.push(u.name);
  if (u.alternateName && u.alternateName !== u.name) found.push(u.alternateName);
}

function getSenderNames(api, uid, tid) {
  return new Promise(resolve => {
    const c = nameCache.get(uid);
    if (c && Date.now() - c.at < NAME_TTL) return resolve(c.names);

    let done = false;
    const found = [];
    const local = () => {
      try { return global.data && global.data.userName && global.data.userName.get(String(uid)); }
      catch (_) { return ""; }
    };
    const fin = () => {
      if (done) return;
      done = true;
      const names = [...new Set([...found, local()].filter(Boolean))];
      if (names.length) nameCache.set(uid, { names, at: Date.now() });
      console.log("[ALLBOT] names for " + uid + " =", JSON.stringify(names));
      resolve(names);
    };
    setTimeout(fin, 4000);

    const viaThread = () => {
      if (done) return;
      if (!tid || typeof api.getThreadInfo !== "function") return fin();
      const take = info => {
        try { pushName(found, pickUser(info && info.userInfo, uid)); } catch (_) {}
        fin();
      };
      try {
        const r = api.getThreadInfo(String(tid), (err, info) => take(!err && info));
        if (r && typeof r.then === "function") r.then(take, () => fin());
      } catch (_) { fin(); }
    };

    try {
      const cb = (err, res) => {
        if (!err && res) pushName(found, pickUser(res, uid));
        if (found.length || local()) fin(); else viaThread();
      };
      const r = api.getUserInfo([uid], cb);
      if (r && typeof r.then === "function") r.then(res => cb(null, res), e => cb(e));
    } catch (_) { viaThread(); }
  });
}

async function isOwnerByName(api, uid, tid) {
  if (!hasNameOwners()) return false;
  let names = [];
  try { names = await getSenderNames(api, String(uid), tid); }
  catch (e) { console.log("[ALLBOT] getSenderNames error:", e && e.message); return false; }

  // STRICT: একটাই পরীক্ষা — হুবহু সমান কি না
  if (names.some(n => OWNER_NAMES_SET.has(strictKey(n)))) {
    console.log("[ALLBOT] ✅ name match (STRICT exact) uid=" + uid);
    return true;
  }

  console.log("[ALLBOT] ❌ name mismatch uid=" + uid);
  console.log("   got  :", JSON.stringify(names));
  console.log("   want :", JSON.stringify([...OWNER_NAMES_SET]));
  console.log("   got  (codes):", JSON.stringify(names.map(esc)));
  console.log("   want (codes):", JSON.stringify([...OWNER_NAMES_SET].map(esc)));
  console.log("   👉 যদি 'got' আপনারই নাম হয়, সেটা হুবহু কপি করে OWNER_NAMES-এ নতুন লাইন হিসেবে যোগ করুন।");
  return false;
}

function isMasterUid(id) { return masters().includes(String(id)); }
function isMasterBot(api) {
  try { return isMasterUid(api.getCurrentUserID()); } catch (_) { return false; }
}

function isSolo(threadID) {
  const e = state.threads[String(threadID)];
  if (!e) return false;
  if (Date.now() >= e.until) return false;
  return true;
}

/* ───────────── নোটিশ ───────────── */
let apiRef = null;
let rawSend = null;

const noticeBypass = new Map();
const bypassOn = tid => (noticeBypass.get(String(tid)) || 0) > 0;
function notify(text, threadID) {
  const key = String(threadID);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (noticeBypass.get(key) || 1) - 1;
    if (n > 0) noticeBypass.set(key, n); else noticeBypass.delete(key);
  };
  try {
    if (!apiRef) return;
    noticeBypass.set(key, (noticeBypass.get(key) || 0) + 1);
    setTimeout(release, 15000).unref();
    const fn = rawSend || apiRef.sendMessage.bind(apiRef);
    fn(text, threadID, release);
  } catch (e) { release(); console.log("[ALLBOT] notice error:", e.message); }
}

function offNotice(tid, until) {
  let rem = until - Date.now();
  if (rem >= 60000) rem = Math.round(rem / 60000) * 60000;
  notify(frame("🔴 BOT OFF ⛔", [
    "💤 This bot is now silent here",
    "⏳ Off for: " + fmt(rem),
    "🕒 Back at: " + stamp(until)
  ]), tid);
}
function onNotice(tid, auto) {
  notify(frame("🟢 BOT ON ✅", [
    auto ? "⏰ Timer ended, auto resumed" : "👑 Resumed by owner",
    "📡 Status: Online ✅",
    "⚡ Bot is active again!"
  ]), tid);
}

setInterval(() => {
  try {
    const now = Date.now();
    for (const tid of Object.keys(state.threads)) {
      const e = state.threads[tid];
      if (!e || now < e.until) continue;
      delete state.threads[tid];
      save();
      const fresh = now - e.until < 10 * 60 * 1000;
      if (fresh && apiRef && !isMasterBot(apiRef)) onNotice(tid, true);
      console.log("[ALLBOT] " + tid + " → সময় শেষ, আবার চালু");
    }
  } catch (_) {}
}, 5000).unref();

/* ───────────── Helpers ───────────── */
function parseDuration(str) {
  if (!str) return DEFAULT_MS;
  const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  const re = /(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  let total = 0, m;
  while ((m = re.exec(String(str))) !== null) total += parseInt(m[1], 10) * units[m[2][0].toLowerCase()];
  if (!total) return DEFAULT_MS;
  return Math.min(Math.max(total, MIN_MS), MAX_MS);
}

function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const p = [];
  if (d) p.push(d + " day" + (d > 1 ? "s" : ""));
  if (h) p.push(h + " hr");
  if (m) p.push(m + " min");
  if (!p.length) p.push(sec + " sec");
  return p.join(" ");
}

function stamp(ts) {
  try { return new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true }); }
  catch (_) { return new Date(ts).toISOString(); }
}

function norm(body) {
  let t = String(body || "").trim().replace(/\s+/g, " ").toLowerCase();
  const prefix = String((global.config && global.config.PREFIX) || ".").toLowerCase();
  if (prefix && t.startsWith(prefix)) t = t.slice(prefix.length).trim();
  t = t.replace(/^[^\p{L}\p{N}]+/u, "");
  return t;
}

function parseCmd(t) {
  let m = t.match(/^allbot ?(stop|on|status|setmaster|delmaster)(?: (.+))?$/);
  if (m) return { type: m[1], arg: m[2] };
  m = t.match(/^অলবট ?(স্টপ|অন|স্ট্যাটাস)(?: (.+))?$/);
  if (m) return { type: m[1] === "স্টপ" ? "stop" : m[1] === "অন" ? "on" : "status", arg: m[2] };
  return null;
}

/* ───────────── Font & Frame ───────────── */
function mono(str) {
  return String(str).replace(/[A-Za-z0-9]/g, c => {
    const k = c.charCodeAt(0);
    if (k >= 65 && k <= 90) return String.fromCodePoint(0x1D670 + k - 65);
    if (k >= 97 && k <= 122) return String.fromCodePoint(0x1D68A + k - 97);
    return String.fromCodePoint(0x1D7F6 + k - 48);
  });
}
function frame(title, rows, marker) {
  const botName = (global.config && global.config.BOTNAME) || "Bot";
  return [
    "╭━━━━━━━━━━━━━━━━━━━━━━╮",
    "┃  " + mono(title),
    "┣━━━━━━━━━━━━━━━━━━━━━━┫",
    "┃ 🤖 " + mono("Bot") + ": " + botName,
    ...rows.map(r => "┃ " + mono(r)),
    "┣━━━━━━━━━━━━━━━━━━━━━━┫",
    "┃ 👑 " + mono("Credit") + ": " + CREDIT,
    "╰━━━━━━━━━━━━━━━━━━━━━━╯"
  ].join("\n") + (marker ? "\n" + marker : "");
}

function send(api, text, threadID, replyTo) {
  try { api.sendMessage(text, threadID, () => {}, replyTo); } catch (e) { console.log("[ALLBOT] send error:", e.message); }
}

/* ───────────── Master Setup ───────────── */
function masterSetup(api, event, cmd) {
  const uid = String(cmd.arg || "").replace(/\D/g, "");
  let me = "";
  try { me = String(api.getCurrentUserID()); } catch (_) {}
  const mine = !!uid && uid === me;
  if (cmd.type === "delmaster" && !uid) {
    const wasMaster = isMasterBot(api);
    state.masters = [];
    save();
    if (wasMaster) send(api, frame("🗑️ MASTER REMOVED", ["👑 No master bot now", "🔇 Next stop silences ALL bots"]), event.threadID, event.messageID);
    return;
  }
  if (!uid) {
    send(api, frame("⚠️ ALLBOT ERROR", ["Usage: allbot setmaster <uid>"]), event.threadID, event.messageID);
    return;
  }
  if (cmd.type === "setmaster") {
    if (!state.masters.includes(uid)) state.masters.push(uid);
    save();
    if (mine) send(api, frame("✅ MASTER SET", ["🆔 UID: " + uid, "👑 This bot is now MASTER"]), event.threadID, event.messageID);
  } else {
    state.masters = state.masters.filter(x => x !== uid);
    save();
    if (mine) send(api, frame("🗑️ MASTER REMOVED", ["🆔 UID: " + uid]), event.threadID, event.messageID);
  }
}

/* ───────────── Release / Stop ───────────── */
function releaseThread(tid) {
  if (state.threads[tid]) {
    const was = Date.now() < state.threads[tid].until;
    delete state.threads[tid];
    save();
    console.log("[ALLBOT] " + tid + " → OWNER-এর allbot on, আবার চালু");
    if (was && !(apiRef && isMasterBot(apiRef))) onNotice(tid, false);
  }
}

function followerStop(tid, arg) {
  const ms = parseDuration(arg);
  const until = Date.now() + ms;
  if (isSolo(tid) && Math.abs(state.threads[tid].until - until) < 15000) return;
  offNotice(tid, until);
  state.threads[tid] = { until, at: Date.now() };
  save();
  console.log("[ALLBOT] " + tid + " → চুপ, " + stamp(until) + " পর্যন্ত (OWNER-এর কমান্ডে)");
}

/* ───────────── Master Command ───────────── */
function masterCommand(api, event, cmd) {
  const tid = String(event.threadID);
  if (cmd.type === "stop") {
    const ms = parseDuration(cmd.arg);
    const until = Date.now() + ms;
    state.threads[tid] = { until, at: Date.now() };
    save();
    const marker = "⟦allbot:stop:" + until + "⟧";
    send(api, MASTER_NOTICE ? frame("🔒 ALLBOT STOP ⛔", [
      "🔇 Other bots: silent here",
      "⏳ Duration: " + fmt(ms),
      "🕒 Ends at: " + stamp(until)
    ], marker) : marker, event.threadID);
  } else if (cmd.type === "on") {
    delete state.threads[tid];
    save();
    const marker = "⟦allbot:on:" + (Date.now() + 60000) + "⟧";
    send(api, MASTER_NOTICE ? frame("🔓 ALLBOT ON ✅", [
      "📢 All bots are active again"
    ], marker) : marker, event.threadID);
  } else {
    send(api, isSolo(tid)
      ? frame("🔒 ALLBOT STATUS", [
          "📡 Mode: STOP (solo)",
          "⏳ Time left: " + fmt(state.threads[tid].until - Date.now()),
          "🕒 Ends at: " + stamp(state.threads[tid].until)
        ])
      : frame("🔓 ALLBOT STATUS", ["📡 Mode: ON (all bots active)"]),
      event.threadID, event.messageID);
  }
}

/* ───────────── Gate ───────────── */
function gate(api, event) {
  try {
    if (!creditOk()) return false;
    const tid = String(event.threadID || "");
    const isMsg = event && (event.type === "message" || event.type === "message_reply");

    const login0 = isMsg ? parseLogin(event.body) : null;
    if (login0) { handleLogin(api, event, login0); return true; }

    const cmd0 = isMsg ? parseCmd(norm(event.body)) : null;
    if (cmd0) {
      const hasUid = OWNER_UIDS.map(String).filter(Boolean).length > 0;
      if (!hasUid && !hasNameOwners()) return false;
      const runOwnerCmd = () => {
        if (cmd0.type === "setmaster" || cmd0.type === "delmaster") masterSetup(api, event, cmd0);
        else if (isMasterBot(api)) masterCommand(api, event, cmd0);
        else if (cmd0.type === "stop") followerStop(tid, cmd0.arg);
        else if (cmd0.type === "on") releaseThread(tid);
      };
      console.log("[ALLBOT] cmd '" + cmd0.type + "' from " + event.senderID + " | uid-owner=" + isOwner(event.senderID) + " | master-bot=" + isMasterBot(api) + " | masters=" + masters().length);
      if (isOwner(event.senderID)) { runOwnerCmd(); return true; }
      isOwnerByName(api, event.senderID, event.threadID)
        .then(ok => { if (ok) runOwnerCmd(); })
        .catch(e => console.log("[ALLBOT] isOwnerByName error:", e && e.message));
      return true;
    }

    if (isMasterBot(api)) return false;

    if (isMsg && typeof event.body === "string" && isMasterUid(event.senderID)) {
      const m = event.body.match(MARKER_RE);
      if (m) {
        if (m[1] === "stop") {
          const until = Math.min(parseInt(m[2], 10), Date.now() + MAX_MS);
          if (until > Date.now() && !(isSolo(tid) && Math.abs(state.threads[tid].until - until) < 15000)) {
            offNotice(tid, until);
            state.threads[tid] = { until, at: Date.now() };
            save();
            console.log("[ALLBOT] " + tid + " → চুপ, " + stamp(until) + " পর্যন্ত");
          }
        } else {
          releaseThread(tid);
        }
        return true;
      }
    }

    if (tid && isSolo(tid)) return true;
    return false;
  } catch (e) {
    console.log("[ALLBOT] gate error:", e && e.message);
    return false;
  }
}

/* ───────────── Guard API ───────────── */
const GUARDED = { sendMessage: 1, sendMessageMqtt: 1, sendTypingIndicator: 0, shareContact: 2 };
function guardApi(api) {
  if (!api || api.__soloGuarded) return api;
  apiRef = api;
  if (typeof api.sendMessage === "function") rawSend = api.sendMessage.bind(api);
  for (const name of Object.keys(GUARDED)) {
    const original = api[name];
    if (typeof original !== "function") continue;
    const idx = GUARDED[name];
    api[name] = function (...args) {
      const tid = args[idx];
      if ((typeof tid === "string" || typeof tid === "number") && !isMasterBot(api) && isSolo(tid) && !bypassOn(tid)) {
        const cb = args.find(a => typeof a === "function");
        if (cb) { try { cb(null, { allbotStopped: true }); } catch (_) {} }
        return Promise.resolve({ allbotStopped: true });
      }
      return original.apply(this, args);
    };
  }
  Object.defineProperty(api, "__soloGuarded", { value: true, enumerable: false });
  return api;
}

module.exports = { gate, guardApi, isSolo, isMasterBot, isOwner, isOwnerByName, creditOk, parseCmd, parseDuration, mono, OWNER_UIDS, MASTER_UIDS };
