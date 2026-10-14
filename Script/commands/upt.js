module.exports.config = {
  name: "upt",
  version: "3.5.0",
  hasPermssion: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Stylish Uptime Text Notice",
  commandCategory: "system",
  usages: "upt",
  cooldowns: 5
};

// মোট কমান্ড কাউন্টার (বট চালু হওয়ার পর থেকে)
if (typeof global.totalCommands !== "number") global.totalCommands = 0;

// Bold font converter
function toBold(str) {
  const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bold = Array.from(
    "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙" +
    "𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳" +
    "𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗"
  );

  return Array.from(str).map(ch => {
    const i = normal.indexOf(ch);
    return i === -1 ? ch : bold[i];
  }).join("");
}

// প্রতিটি মেসেজে চেক করে কমান্ড গুনবে (prefix ছাড়া বা prefix সহ)
module.exports.handleEvent = async function ({ api, event }) {
  if (!event.body) return;

  // বটের নিজের মেসেজ গুনবে না
  try {
    if (event.senderID === api.getCurrentUserID()) return;
  } catch (e) {}

  const body = event.body.trim();
  if (!body) return;

  // prefix থাকলে সেটা বাদ দাও
  const prefix = (global.config && global.config.PREFIX) || "";
  let text = body;
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length).trim();

  const cmdName = text.split(/\s+/)[0].toLowerCase();
  if (!cmdName) return;

  // "upt" লিখলেই চলবে (no-prefix)
  if (text.toLowerCase() === "upt") {
    global.totalCommands++;
    return module.exports.run({ api, event });
  }

  // বটের কমান্ড লিস্টে থাকলে গুনবে
  const commands = global.client && global.client.commands;
  if (commands && commands.has(cmdName)) {
    global.totalCommands++;
  }
};

// Main command
module.exports.run = async function ({ api, event }) {
  try {
    const total = Math.floor(process.uptime());

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    const uptime =
      `${toBold(String(days))}d ` +
      `${toBold(String(hours))}h ` +
      `${toBold(String(minutes))}m ` +
      `${toBold(String(seconds))}s`;

    // বাংলাদেশ (ঢাকা) সময়
    const now = new Date();

    const time = now.toLocaleTimeString("en-US", {
      timeZone: "Asia/Dhaka",
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    const date = now.toLocaleDateString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    const day = now.toLocaleDateString("en-US", {
      timeZone: "Asia/Dhaka",
      weekday: "long"
    });

    const notice =
      `╔═══ ${toBold("SYSTEM NOTICE")} ═══╗\n` +
      `┃ ⏳ ${toBold("UPTIME")}\n` +
      `┃\n` +
      `┃ ➜ ${uptime}\n` +
      `┃\n` +
      `┃ ⚙️ ${toBold("TOTAL COMMANDS")} ➜ ${toBold(String(global.totalCommands))}\n` +
      `┃\n` +
      `┃ 🕒 ${toBold("TIME")} ➜ ${toBold(time)}\n` +
      `┃ 🌏 ${toBold("ZONE")} ➜ ${toBold("DHAKA, BANGLADESH")}\n` +
      `┃ 📅 ${toBold("DATE")} ➜ ${toBold(date)}\n` +
      `┃ 📆 ${toBold("DAY")} ➜ ${toBold(day)}\n` +
      `┃\n` +
      `╠════════════════════╣`;

    return api.sendMessage(
      notice,
      event.threadID,
      undefined,
      event.messageID
    );
  } catch (error) {
    console.error("UPT Error:", error);
    return api.sendMessage(
      "UPT notice error: " + error.message,
      event.threadID,
      undefined,
      event.messageID
    );
  }
};
