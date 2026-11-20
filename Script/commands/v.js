/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║                                                          ║
 * ║   📛 নাম      : v (Voice Generator)                      ║
 * ║   🔢 ভার্সন   : 4.1.0                                    ║
 * ║   👤 ক্রেডিট  : 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐            ║
 * ║   🎯 কাজ     : টেক্সট থেকে ভয়েস তৈরি                    ║
 * ║   🏛️ ডিফল্ট  : তারেক রহমান → শেখ মুজিবুর → শেখ হাসিনা    ║
 * ║                                                          ║
 * ╚══════════════════════════════════════════════════════════╝
 */

// ════════════════════════════════════════════════════════════
// 📦 ১. ইমপোর্ট
// ════════════════════════════════════════════════════════════
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

// ════════════════════════════════════════════════════════════
// 🔐 ২. কনফিগ ও কনস্ট্যান্ট
// ════════════════════════════════════════════════════════════
const CREDIT = "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐";
const FOOTER = "\n\n⚡ Powered By Juwel";

const _u = ["aHR0cHM6Ly90", "dHMubmVva2V4Lnh5eg=="];
const BASE_URL = Buffer.from(_u.join(""), "base64").toString();
const _h = BASE_URL.replace(/^https?:\/\//, "");
const hide = (m) => String(m == null ? "" : m).split(_h).join("***");

// 🇧🇩 বাংলাদেশি রাজনৈতিক ভয়েস — একাধিক বানান দিয়ে খোঁজা হবে
const DEFAULT_VOICES = [
    {
        label: "Tarique Rahman",
        names: ["Tarique Rahman", "Tarek Rahman", "Tariq Rahman", "Tarique Zia", "তারেক রহমান"]
    },
    {
        label: "Sheikh Mujibur Rahman",
        names: ["Sheikh Mujibur Rahman", "Bangabandhu Sheikh Mujibur Rahman", "Mujibur Rahman", "Bangabandhu", "শেখ মুজিবুর রহমান"]
    },
    {
        label: "Sheikh Hasina",
        names: ["Sheikh Hasina", "Sheikh Hasina Wazed", "Hasina Wazed", "Hasina", "শেখ হাসিনা"]
    }
];

const DEFAULT_LANG = "en";
const MAX_CHARS = 500;
const REQUEST_TIMEOUT = 120000;
const PICKER_LIMIT = 15;
const PENDING_TTL = 5 * 60 * 1000;

const REACT_WAIT = "⏳";
const REACT_DONE = "✅";
const REACT_FAIL = "❌";

const LANGUAGES = {
    en: "en", eng: "en", english: "en",
    bn: "bn", ben: "bn", bangla: "bn", bengali: "bn", bd: "bn"
};
const LANG_NAMES = { en: "English 🇬🇧", bn: "বাংলা 🇧🇩" };

// ════════════════════════════════════════════════════════════
// 🎨 ৩. UI টেক্সট
// ════════════════════════════════════════════════════════════
const TEXTS = {
    missingText: `╭───「 ⚠️ টেক্সট নেই 」───╮
│
│  ⚠ কী বলবে লিখুন
│
│  📝 উদাহরণ:
│    {pn} Hello world
│    {pn} তুমি কেমন আছো?
│
│  💡 কারো মেসেজে রিপ্লাই দিয়ে:
│    {pn}         → ভয়েস লিস্ট
│
╰────────────────────╯`,
    noVoice: `╭───「 ❌ ভয়েস পাওয়া যায়নি 」───╮
│
│  "%1" নামে কোনো ভয়েস মেলেনি
│
│  💡 চেষ্টা করুন:
│    {pn} search %1
│
╰─────────────────────────╯`,
    notFound: `╭───「 ❌ ফলাফল শূন্য 」───╮
│
│  "%1" নামে কোনো ভয়েস পাওয়া যায়নি
│
│  💡 অন্য নামে খুঁজে দেখুন:
│    {pn} search <নাম>
│
╰──────────────────────╯`,
    emptyResponse: `╭───「 ⚠️ অডিও খালি 」───╮
│
│  ভয়েস সার্ভার কোনো অডিও দেয়নি
│  আবার চেষ্টা করুন
│
╰───────────────────╯`,
    serverError: `╭───「 🔌 সার্ভার সমস্যা 」───╮
│
│  ভয়েস সার্ভার পাওয়া যাচ্ছে না
│  বা ব্যস্ত আছে
│
│  💡 কিছুক্ষণ পরে আবার চেষ্টা করুন
│
╰──────────────────────╯`,
    tooLong: `╭───「 ⚠️ লেখা বড় হয়ে গেছে 」───╮
│
│  📏 আপনার লেখা: %1 অক্ষর
│  ✅ সর্বোচ্চ সীমা: %2 অক্ষর
│
│  💡 ছোট করে আবার পাঠান
│
╰─────────────────────────╯`,
    badNumber: `╭───「 ⚠️ ভুল নম্বর 」───╮
│
│  #%1 নম্বরে কোনো ভয়েস নেই
│  মোট ফল পাওয়া গেছে: %2টি
│
│  💡 আবার লিস্ট দেখুন:
│    {pn} (মেসেজে রিপ্লাই দিয়ে)
│
╰────────────────────╯`,
    badLang: `╭───「 ⚠️ অসমর্থিত ভাষা 」───╮
│
│  "%1" ভাষা সাপোর্ট করে না
│
│  ✅ শুধু এই দুটি চলবে:
│    • bn  → বাংলা
│    • en  → English
│
╰──────────────────────╯`,
    generating: `╭───「 🎙️ অডিও তৈরি হচ্ছে 」───╮
│
│  ⏳ অনুগ্রহ করে অপেক্ষা করুন...
│
╰────────────────────────╯`
};

// ════════════════════════════════════════════════════════════
// 📡 ৪. HTTP ক্লায়েন্ট
// ════════════════════════════════════════════════════════════
const json = axios.create({ baseURL: BASE_URL, timeout: REQUEST_TIMEOUT, headers: { "User-Agent": "Mirai-v" } });
const audio = axios.create({ baseURL: BASE_URL, timeout: REQUEST_TIMEOUT, responseType: "arraybuffer", headers: { "User-Agent": "Mirai-v" } });

// ════════════════════════════════════════════════════════════
// 🗃️ ৫. ক্যাশ ও স্টেট
// ════════════════════════════════════════════════════════════
const searchCache = new Map();
const allVoicesCache = new Map();
const pendingState = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// ════════════════════════════════════════════════════════════
// 🛠️ ৬. হেল্পার ফাংশন
// ════════════════════════════════════════════════════════════
function normalize(str) {
    return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0980-\u09FF]+/g, "").trim();
}
function resolveLanguage(input) {
    const key = String(input || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!key) return null;
    return LANGUAGES[key] || null;
}
function relevanceRank(name, query) {
    const n = normalize(name), q = normalize(query);
    if (!q) return 3;
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    return 3;
}

async function searchVoices(query, langCode) {
    const params = { q: query, min_likes: 5 };
    const code = langCode || DEFAULT_LANG;
    if (code) params.language = code;
    const key = normalize(query) + "|" + code;
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.items;
    const res = await json.get("/v1/search", { params });
    const raw = res.data || {};
    const items = (Array.isArray(raw) ? raw : raw.items || []).filter(v => v && v.name);
    items.sort((a, b) => relevanceRank(a.name, query) - relevanceRank(b.name, query) || (b.likes || 0) - (a.likes || 0));
    searchCache.set(key, { items, at: Date.now() });
    if (searchCache.size > 40) searchCache.delete(searchCache.keys().next().value);
    return items;
}

async function resolveByTitle(title, langCode) {
    const params = { q: title, min_likes: 0, all: "true" };
    const code = langCode || DEFAULT_LANG;
    if (code) params.language = code;
    const res = await json.get("/v1/search", { params });
    const raw = res.data || {};
    const items = (Array.isArray(raw) ? raw : raw.items || []).filter(v => v && v.name);
    return items.find(v => normalize(v.name) === normalize(title)) || items[0] || null;
}

async function findExactVoice(title, langCode) {
    const params = { q: title, min_likes: 0, all: "true" };
    const code = langCode || DEFAULT_LANG;
    if (code) params.language = code;
    try {
        const res = await json.get("/v1/search", { params });
        const raw = res.data || {};
        const items = (Array.isArray(raw) ? raw : raw.items || []).filter(v => v && v.name);
        return items.find(v => normalize(v.name) === normalize(title)) || null;
    } catch (e) { return null; }
}

// পিকার লিস্ট — বাংলাদেশি ভয়েস আগে, তারপর জনপ্রিয়
async function getAllVoices(langCode) {
    const cacheKey = langCode || "all";
    const cached = allVoicesCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.items;

    const combined = [];
    const seen = new Set();

    // ── ১. বাংলাদেশি রাজনৈতিক ভয়েস (প্রথম ৩টি স্লট) ──
    for (const group of DEFAULT_VOICES) {
        let found = null;
        const langTries = [langCode, "bn", "en", null];
        for (const L of langTries) {
            for (const name of group.names) {
                try {
                    const hit = await findExactVoice(name, L);
                    if (hit && !seen.has(hit.name)) { found = hit; break; }
                } catch (e) {}
            }
            if (found) break;
        }
        if (found) {
            found = { ...found, displayName: group.label };
            seen.add(found.name);
            combined.push(found);
        }
    }

    // ── ২. সবচেয়ে বেশি like পাওয়া ভয়েস দিয়ে বাকি স্লট পূরণ ──
    try {
        const params = { min_likes: 10 };
        if (langCode) params.language = langCode;
        const res = await json.get("/v1/search", { params });
        const raw = res.data || {};
        const items = (Array.isArray(raw) ? raw : raw.items || [])
            .filter(v => v && v.name && !seen.has(v.name));
        items.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        for (const v of items) {
            if (combined.length >= PICKER_LIMIT) break;
            seen.add(v.name);
            combined.push(v);
        }
    } catch (e) {}

    // ── ৩. এখনো জায়গা থাকলে কম like-এর ভয়েস দিয়ে ভরাট ──
    if (combined.length < PICKER_LIMIT) {
        try {
            const params2 = { min_likes: 0 };
            if (langCode) params2.language = langCode;
            const res2 = await json.get("/v1/search", { params: params2 });
            const raw2 = res2.data || {};
            const items2 = (Array.isArray(raw2) ? raw2 : raw2.items || [])
                .filter(v => v && v.name && !seen.has(v.name))
                .sort((a, b) => (b.likes || 0) - (a.likes || 0));
            for (const v of items2) {
                if (combined.length >= PICKER_LIMIT) break;
                seen.add(v.name);
                combined.push(v);
            }
        } catch (e) {}
    }

    allVoicesCache.set(cacheKey, { items: combined, at: Date.now() });
    if (allVoicesCache.size > 10) allVoicesCache.delete(allVoicesCache.keys().next().value);
    return combined;
}

async function toBengali(text) {
    const res = await axios.get("https://translate.googleapis.com/translate_a/single", {
        params: { client: "gtx", sl: "auto", tl: "bn", dt: "t", q: text },
        timeout: 15000
    });
    const parts = (res.data && res.data[0]) || [];
    return parts.map(p => (p && p[0]) || "").join("").trim();
}

function parseNumber(token) {
    const m = /^#?(\d{1,2})$/.exec(String(token || "").trim());
    if (!m) return null;
    const n = Number(m[1]);
    return n < 1 ? null : n;
}

function parseArgs(args, allowTailPick = true) {
    const text = [];
    let voice = null, lang = null, badLang = null, pick = null, pendingVoice = false;
    const voiceWords = [];
    for (let i = 0; i < args.length; i++) {
        const arg = String(args[i] == null ? "" : args[i]);
        const lower = arg.toLowerCase();
        if (lower === "--lang" || lower === "--language" || lower === "-lang" || lower === "-l") {
            if (i + 1 < args.length) {
                const rawLang = args[++i];
                lang = resolveLanguage(rawLang);
                if (!lang) badLang = rawLang;
            } else badLang = "(খালি)";
            continue;
        }
        if (/^(--lang|--language|-lang|-l)=/i.test(arg)) {
            const rawLang = arg.split("=").slice(1).join("=");
            lang = resolveLanguage(rawLang);
            if (!lang) badLang = rawLang;
            continue;
        }
        if (lower === "--v" || lower === "-v") { pendingVoice = true; continue; }
        if (/^(--v|-v)=/i.test(arg)) {
            pendingVoice = true;
            const val = arg.split("=").slice(1).join("=");
            if (val) voiceWords.push(val);
            continue;
        }
        const n = parseNumber(arg);
        if (n !== null && (pendingVoice || voiceWords.length)) { pick = n; pendingVoice = false; continue; }
        if (pendingVoice || voiceWords.length) { voiceWords.push(arg); continue; }
        if (allowTailPick && /^#\d{1,2}$/.test(arg) && i === args.length - 1 && args.length > 1) {
            pick = parseNumber(arg);
            continue;
        }
        text.push(arg);
    }
    if (voiceWords.length) voice = voiceWords.join(" ").trim();
    if (pick !== null && !voice && text.length) {
        const words = text.slice();
        voice = words.pop();
        return { text: words.join(" ").trim(), voice, lang, badLang, pick };
    }
    return { text: text.join(" ").trim(), voice, lang, badLang, pick };
}

// ════════════════════════════════════════════════════════════
// 🎨 ৭. ফরম্যাটার (UI আউটপুট)
// ════════════════════════════════════════════════════════════
function formatList(list, query, langCode) {
    const code = langCode || DEFAULT_LANG;
    const langName = LANG_NAMES[code] || code;
    const medal = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ` ${i + 1}.`;
    const lines = list.map((v, i) => {
        const langs = (v.languages || []).join(" • ");
        return ` ${medal(i)} ${v.name}\n     ❤️ ${v.likes || 0}${langs ? `   🌐 ${langs}` : ""}`;
    });
    return `╭───「 🔍 ভয়েস সার্চ 」───╮
│
│  🎯 কীওয়ার্ড : ${query || "*"}
│  🌐 ভাষা     : ${langName}
│  📊 ফলাফল    : ${list.length}টি
│
╰──────────────────────╯

${lines.join("\n\n")}

╭──────────────────────╮
│ 💡 ব্যবহার:
│    /v <টেক্সট> --v <ভয়েস> #N
╰──────────────────────╯`;
}

// 🎨 ভয়েস পিকার (নম্বরযুক্ত লিস্ট)
function formatVoicePicker(voices, repliedText) {
    const preview = repliedText.length > 60 ? repliedText.slice(0, 60).trim() + "…" : repliedText;

    const lines = voices.map((v, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎙";
        const num = String(i + 1).padStart(2, " ");
        const name = v.displayName || v.name;
        const langs = (v.languages || []).join(",");
        const tag = langs ? ` [${langs}]` : "";
        return ` ${medal} ${num}. ${name}${tag}  ❤️${v.likes || 0}`;
    });

    return `╭───「 🎙️ ভয়েস সিলেক্ট করুন 」───╮
│
│ 📝 আপনার লেখা:
│   "${preview}"
│
╰────────────────────────────╯

${lines.join("\n")}

╭────────────────────────────╮
│ 💡 ভয়েস বাছতে পাঠান:
│    /v <নম্বর>   (যেমন: /v 3)
│
│ ⏱️ ৫ মিনিটের মধ্যে দিতে হবে
╰────────────────────────────╯`;
}

function formatAudioCaption(voiceName, spoken, langName) {
    const preview = spoken.length > 60 ? spoken.slice(0, 60).trim() + "..." : spoken;
    return `╭───「 🎙️ অডিও তৈরি 」───╮
│
│  👤 ভয়েস    : ${voiceName}
│  🌐 ভাষা     : ${langName}
│  📝 টেক্সট   : ${preview}
│
╰──────────────────────╯

⚡ Powered By Juwel`;
}

// ════════════════════════════════════════════════════════════
// ⚙️ ৮. মডিউল কনফিগ
// ════════════════════════════════════════════════════════════
module.exports.config = {
    name: "v",
    version: "4.1.0",
    hasPermssion: 0,
    credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
    description: "টেক্সট থেকে ভয়েস বানায় (পিকার: তারেক → মুজিব → হাসিনা → জনপ্রিয়)",
    commandCategory: "media",
    usages: "v <লেখা>\nv (রিপ্লাই) → ভয়েস লিস্ট\nv <নম্বর> → সিলেক্ট\nv <লেখা> --v <ভয়েস>\nv search <নাম>",
    cooldowns: 5,
    dependencies: { "axios": "", "fs-extra": "" }
};

// ════════════════════════════════════════════════════════════
// 🚀 ৯. মেইন রান ফাংশন
// ════════════════════════════════════════════════════════════
module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const senderID = event.senderID || event.userID || "anon";

    // ── ক্রেডিট চেক ──
    if (module.exports.config.credits !== CREDIT) {
        return api.sendMessage("⚠ Credit বদলানো হয়েছে, তাই কমান্ড কাজ করছে না।", threadID, () => {}, messageID);
    }
    const prefix = (global.config && global.config.PREFIX) || "/";
    const pn = prefix + module.exports.config.name;

    // ── হেল্পার ──
    const getLang = (key, ...vals) => {
        const s = TEXTS[key] || key;
        return s.replace(/%(\d+)|\{pn\}/g, (m, n) => {
            if (m === "{pn}") return pn;
            const v = vals[Number(n) - 1];
            return v !== undefined ? String(v) : m;
        });
    };
    const reply = (m, cb) => api.sendMessage(m + FOOTER, threadID, cb || (() => {}), messageID);
    const react = (emoji) => { try { api.setMessageReaction(emoji, messageID, () => {}, true); } catch (e) {} };

    const stateKey = `${threadID}_${senderID}`;

    // ── args পার্স ──
    const head = String((args && args[0]) || "").toLowerCase();
    const sub = ["search", "list", "find", "voices"].includes(head) ? head : null;
    const parsed = parseArgs(sub ? args.slice(1) : (args || []), !sub);
    let { text, voice: voiceFlag, lang, badLang, pick } = parsed;

    if (badLang) { react(REACT_FAIL); return reply(getLang("badLang", badLang)); }

    // ── search সাব-কমান্ড ──
    if (sub) {
        const query = (text || voiceFlag || "").trim();
        let results;
        try { results = await searchVoices(query, lang); }
        catch (e) { react(REACT_FAIL); return reply(getLang("serverError")); }
        if (!results.length) { react(REACT_FAIL); return reply(getLang("notFound", query)); }
        react(REACT_DONE);
        return reply(formatList(results.slice(0, 10), query || "*", lang));
    }

    // ── pending state যাচাই ──
    const state = pendingState.get(stateKey);
    const stateValid = state && (Date.now() - state.at) < PENDING_TTL;
    if (stateValid && state.lang && !lang) lang = state.lang;

    // ── ধাপ ২: নম্বর দিয়ে ভয়েস বাছা ──
    let forcedSelection = null, forcedText = null;
    if (stateValid && args && args.length === 1 && /^#?\d{1,2}$/.test(String(args[0]))) {
        const num = parseInt(String(args[0]).replace("#", ""));
        if (num < 1 || num > state.voices.length) {
            react(REACT_FAIL);
            return reply(getLang("badNumber", num, state.voices.length));
        }
        forcedSelection = state.voices[num - 1];
        forcedText = state.text;
        pendingState.delete(stateKey);
    }

    // ── ধাপ ১: রিপ্লাই + `/v` (আর্গুমেন্ট ছাড়া) → পিকার ──
    if (!forcedSelection && !text && !voiceFlag && pick === null && event.messageReply) {
        const repliedBody = String(event.messageReply.body || "").trim();
        if (!repliedBody) { react(REACT_FAIL); return reply(getLang("missingText")); }
        if (Array.from(repliedBody).length > MAX_CHARS) {
            react(REACT_FAIL);
            return reply(getLang("tooLong", Array.from(repliedBody).length, MAX_CHARS));
        }
        let voices;
        try { voices = await getAllVoices(lang); }
        catch (e) { react(REACT_FAIL); return reply(getLang("serverError")); }
        if (!voices.length) { react(REACT_FAIL); return reply(getLang("notFound", "*")); }

        const trimmed = voices.slice(0, PICKER_LIMIT);
        pendingState.set(stateKey, { text: repliedBody, voices: trimmed, lang, at: Date.now() });
        if (pendingState.size > 200) pendingState.delete(pendingState.keys().next().value);
        react(REACT_DONE);
        return reply(formatVoicePicker(trimmed, repliedBody));
    }

    // ── টেক্সট নির্ধারণ ──
    let spoken = forcedText || text;
    if (!spoken && event.messageReply) spoken = String(event.messageReply.body || "").trim();
    if (!spoken) { react(REACT_FAIL); return reply(getLang("missingText")); }

    // ── বাংলা অক্ষর না থাকলে অনুবাদ ──
    if (!/[\u0980-\u09FF]/.test(spoken) && lang !== "en") {
        try { const bn = await toBengali(spoken); if (bn) spoken = bn; } catch (e) {}
    }

    const letters = Array.from(spoken.trim());
    if (letters.length > MAX_CHARS) { react(REACT_FAIL); return reply(getLang("tooLong", letters.length, MAX_CHARS)); }

    const autoLang = /[\u0980-\u09FF]/.test(spoken) ? "bn" : null;

    // ── ভয়েস নির্ধারণ ──
    let selected = forcedSelection;

    if (!selected && pick !== null) {
        const query = voiceFlag || text;
        if (!query) { react(REACT_FAIL); return reply(getLang("missingText")); }
        let results;
        try { results = await searchVoices(query, lang); }
        catch (e) { react(REACT_FAIL); return reply(getLang("serverError")); }
        if (!results.length) { react(REACT_FAIL); return reply(getLang("notFound", query)); }
        if (pick > results.length) { react(REACT_FAIL); return reply(getLang("badNumber", pick, results.length)); }
        selected = results[pick - 1];
    }

    if (!selected && voiceFlag) {
        try {
            selected = await resolveByTitle(voiceFlag, lang);
            if (!selected) { const results = await searchVoices(voiceFlag, lang); selected = results[0] || null; }
        } catch (e) { react(REACT_FAIL); return reply(getLang("serverError")); }
        if (!selected) { react(REACT_FAIL); return reply(getLang("noVoice", voiceFlag)); }
    }

    if (!selected) {
        // ডিফল্ট: তারেক রহমান → শেখ মুজিবুর → শেখ হাসিনা
        try {
            const L = lang || autoLang;
            for (const group of DEFAULT_VOICES) {
                for (const name of group.names) {
                    selected = await findExactVoice(name, L);
                    if (selected) break;
                }
                if (selected) break;
            }
            if (!selected && L && L !== DEFAULT_LANG) {
                for (const group of DEFAULT_VOICES) {
                    for (const name of group.names) {
                        selected = await findExactVoice(name, DEFAULT_LANG);
                        if (selected) break;
                    }
                    if (selected) break;
                }
            }
            if (!selected) {
                try {
                    const results = await searchVoices(DEFAULT_VOICES[0].names[0], L || DEFAULT_LANG);
                    selected = results[0] || null;
                } catch (e) {}
            }
        } catch (e) {}
        if (!selected) { react(REACT_FAIL); return reply(getLang("serverError")); }
    }

    // ── TTS তৈরি ──
    react(REACT_WAIT);

    let buffer;
    try {
        const res = await audio.post("/v1/tts", { voice: selected.id || selected.name, text: spoken, format: "mp3" });
        const ctype = String((res.headers && res.headers["content-type"]) || "").toLowerCase();
        if (/json|html|text\/plain/.test(ctype)) {
            react(REACT_FAIL);
            return reply(getLang("emptyResponse"));
        }
        buffer = Buffer.from(res.data);
    } catch (e) {
        react(REACT_FAIL);
        console.error("[v] error:", (e && e.response && e.response.status) || "", hide((e && e.code) || (e && e.message) || e));
        const status = e && e.response && e.response.status;
        if (status === 422) return reply(getLang("tooLong", letters.length, MAX_CHARS));
        if (status === 404) return reply(getLang("notFound", selected.name));
        return reply(getLang("serverError"));
    }

    if (!buffer || !buffer.length) { react(REACT_FAIL); return reply(getLang("emptyResponse")); }

    const file = path.join(os.tmpdir(), `v_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);
    try { await fs.writeFile(file, buffer); }
    catch (e) { react(REACT_FAIL); return reply(getLang("serverError")); }

    react(REACT_DONE);

    const langCode = lang || autoLang || (selected.languages && selected.languages[0]) || DEFAULT_LANG;
    const langName = LANG_NAMES[langCode] || langCode;
    const caption = formatAudioCaption(selected.displayName || selected.name, spoken, langName);

    return api.sendMessage(
        { body: caption, attachment: fs.createReadStream(file) },
        threadID,
        () => { try { fs.unlinkSync(file); } catch (e) {} },
        messageID
    );
};
