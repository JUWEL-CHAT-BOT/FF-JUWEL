/**
 * Credit: 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐
 *
 * juwelKeepAlive.js  —  নতুন ফাইল (আগের কোনো ফাইলে হাত দেওয়া হয়নি)
 *
 * কাজ: Render-এ বট রান করলে নিজেই নিজের পাবলিক লিংকে নিয়মিত রিকুয়েস্ট পাঠায়,
 * ফলে ১৫ মিনিট idle হয়ে সার্ভিস ঘুমিয়ে যায় না। UptimeRobot লাগবে না।
 *
 * ব্যবহার: Render Dashboard → Settings → Start Command:
 *     node juwelKeepAlive.js
 *
 * লিংক অটো পাওয়া যায় Render-এর RENDER_EXTERNAL_URL থেকে।
 * চাইলে Environment-এ KEEPALIVE_URL দিয়ে নিজের লিংক দিতে পারো।
 */

const https = require("https");
const http = require("http");

const INTERVAL_MS = Number(process.env.KEEPALIVE_INTERVAL_MS) || 4 * 60 * 1000; // প্রতি ৪ মিনিটে
const TARGET = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || "").trim();

function ping(url) {
  const lib = url.startsWith("https") ? https : http;
  const req = lib.get(url, { timeout: 20000, headers: { "User-Agent": "self-keepalive" } }, (res) => {
    res.resume();
    console.log(`[KEEPALIVE] ${new Date().toISOString()} -> ${url} (${res.statusCode})`);
  });
  req.on("timeout", () => req.destroy(new Error("timeout")));
  req.on("error", (e) => console.log(`[KEEPALIVE] ping failed: ${e.message}`));
}

if (!TARGET) {
  console.log("[KEEPALIVE] RENDER_EXTERNAL_URL পাওয়া যায়নি (লোকাল রান?) — keep-alive বন্ধ, বট স্বাভাবিকভাবে চলবে।");
} else {
  console.log("[KEEPALIVE] Credit: 乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐");
  console.log(`[KEEPALIVE] চালু: ${TARGET} প্রতি ${Math.round(INTERVAL_MS / 60000)} মিনিটে পিং হবে`);
  // বট সার্ভার ওঠার জন্য একটু সময় দিয়ে প্রথম পিং
  setTimeout(() => {
    ping(TARGET);
    setInterval(() => ping(TARGET), INTERVAL_MS);
  }, 60 * 1000);
}

// এরপর আগের মতোই আসল বট চালু হবে (Juwel.js অপরিবর্তিত)
// Auto Cookie Guardian চাইলে Render Environment-এ USE_GUARDIAN=1 দিন
if (process.env.USE_GUARDIAN === "1") {
  require("./guardian/start.js");
} else {
  require("./Juwel.js");
}
