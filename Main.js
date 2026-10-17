// Messenger Chat Bot - readable version (deobfuscated)
const moment = require("moment-timezone");
const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = require("fs-extra");
const { join, resolve } = require("path");
const { execSync } = require("child_process");
const express = require("express");
const path = require("path");
const http = require("http");
const chalk = require("chalk");

const logName = "𝗠𝗥 𝗝𝗨𝗪𝗘𝗟";
const logNickName = "𝗝𝗨𝗪𝗘𝗟 𝗖𝗛𝗔𝗧 𝗕𝗢𝗧";
const logAnthorName = "𝗠𝗥 𝗝𝗨𝗪𝗘𝗟";
// ⚠️ এই দুটি আইডি ডিফল্টভাবে ডেভেলপার পারমিশন পায়। নিজের আইডি দিন বা মুছে দিন।
const anthorUid = "100004225532317";
const anthorId = "100044713412032";
const logconsoleName = "𝗠𝗘𝗦𝗦𝗘𝗡𝗚𝗘𝗥 𝗖𝗛𝗔𝗧 𝗕𝗢𝗧";

const logger = require("./utils/log")(logName, logNickName);
const consoleLogger = require("./utils/console");
const login = require("./includes/login/login");
consoleLogger.init(logconsoleName);

const listPackage = JSON.parse(readFileSync("./package.json")).dependencies;
const listbuiltinModules = require("module").builtinModules;

const colorOptions = ["red", "yellow", "green", "blue", "magenta", "cyan", "white"];
const selectedColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];
const BOT_ART = chalk[selectedColor](`
░░░░░██╗██╗░░░██╗░██╗░░░░░░░██╗███████╗██╗░░░░░
░░░░░██║██║░░░██║░██║░░██╗░░██║██╔════╝██║░░░░░
░░░░░██║██║░░░██║░╚██╗████╗██╔╝█████╗░░██║░░░░░
██╗░░██║██║░░░██║░░████╔═████║░██╔══╝░░██║░░░░░
╚█████╔╝╚██████╔╝░░╚██╔╝░╚██╔╝░███████╗███████╗
░╚════╝░░╚═════╝░░░░╚═╝░░░╚═╝░░╚══════╝╚══════╝
`);

const TZ = "Asia/Kolkata"; // আপনার টাইমজোন অনুযায়ী বদলাতে পারেন (যেমন Asia/Dhaka)

// ---------------- global.client ----------------
global.client = {
  commands: new Map(),
  commandAliases: new Map(),
  commandAliasIndex: new Map(),
  events: new Map(),
  cooldowns: new Map(),
  eventRegistered: [],
  handleSchedule: [],
  handleReaction: [],
  handleReply: [],
  mainPath: process.cwd(),
  configPath: "",
  getTime(option) {
    switch (option) {
      case "seconds": return moment.tz(TZ).format("ss");
      case "minutes": return moment.tz(TZ).format("mm");
      case "hours": return moment.tz(TZ).format("HH");
      case "date": return moment.tz(TZ).format("DD");
      case "month": return moment.tz(TZ).format("MM");
      case "year": return moment.tz(TZ).format("YYYY");
      case "fullHour": return moment.tz(TZ).format("HH:mm:ss");
      case "fullYear": return moment.tz(TZ).format("DD/MM/YYYY");
      case "fullTime": return moment.tz(TZ).format("HH:mm:ss DD/MM/YYYY");
    }
  },
};

// ---------------- alias helpers ----------------
global.client.normalizeAliases = function (cfg) {
  const raw = [];
  if (cfg && cfg.aliases !== undefined) raw.push(cfg.aliases);
  if (cfg && cfg.alias !== undefined) raw.push(cfg.alias);
  const result = [];
  for (const item of raw) {
    if (item === null || item === undefined) continue;
    const parts = Array.isArray(item) ? item : String(item).split(/[,\s]+/);
    for (const p of parts) {
      const v = String(p === null || p === undefined ? "" : p).trim();
      if (!v) continue;
      const lower = v.toLowerCase();
      if (!result.includes(lower)) result.push(lower);
    }
  }
  return result;
};

global.client.resolveCommandName = function (name) {
  const n = String(name === null || name === undefined ? "" : name).trim().toLowerCase();
  if (!n) return null;
  for (const key of global.client.commands.keys()) {
    if (String(key).trim().toLowerCase() === n) return key;
  }
  const target = global.client.commandAliases.get(n);
  if (target !== undefined && global.client.commands.has(target)) return target;
  return null;
};

global.client.resolveCommand = function (name) {
  const resolved = global.client.resolveCommandName(name);
  return resolved === null ? null : global.client.commands.get(resolved) || null;
};

global.client.getAliases = function (name) {
  const resolved = global.client.resolveCommandName(name);
  if (resolved === null) return [];
  return (global.client.commandAliasIndex.get(resolved) || []).slice();
};

global.client.commandCandidates = function () {
  const list = [];
  for (const k of global.client.commands.keys()) list.push(String(k));
  for (const k of global.client.commandAliases.keys()) list.push(k);
  return list;
};

global.client.registerCommand = function (module, fileName) {
  const out = { ok: false, reason: null, name: null, conflict: null, aliases: [], skipped: [] };
  if (!module || typeof module !== "object" || !module.config) {
    out.reason = "module has no config";
    return out;
  }
  let name = String(module.config.name === null || module.config.name === undefined ? "" : module.config.name).trim();
  if (!name && fileName) name = String(fileName).trim().replace(/\.js$/i, "");
  if (!name) {
    out.reason = "module.config.name is empty";
    return out;
  }
  out.name = name;
  const lowerName = name.toLowerCase();

  for (const key of global.client.commands.keys()) {
    if (String(key).trim().toLowerCase() === lowerName) {
      out.reason = `command name collision: "${name}" is already loaded (${key})`;
      out.conflict = String(key);
      return out;
    }
  }
  const existingAlias = global.client.commandAliases.get(lowerName);
  if (existingAlias !== undefined) {
    out.reason = `command name collision: "${name}" is already used as an alias of "${existingAlias}"`;
    out.conflict = existingAlias;
    return out;
  }

  const accepted = [];
  for (const alias of global.client.normalizeAliases(module.config)) {
    if (alias === lowerName) {
      out.skipped.push({ alias, reason: "it is the same as the command name" });
      continue;
    }
    const owner = global.client.commandAliases.get(alias);
    if (owner !== undefined && owner !== name) {
      out.skipped.push({ alias, reason: `it is already an alias of "${owner}"` });
      continue;
    }
    let clash = null;
    for (const key of global.client.commands.keys()) {
      if (String(key).trim().toLowerCase() === alias) {
        clash = String(key);
        break;
      }
    }
    if (clash !== null) {
      out.skipped.push({ alias, reason: `it is already a command name ("${clash}")` });
      continue;
    }
    accepted.push(alias);
  }

  global.client.commands.set(name, module);
  for (const a of accepted) global.client.commandAliases.set(a, name);
  if (accepted.length) global.client.commandAliasIndex.set(name, accepted);
  else global.client.commandAliasIndex.delete(name);

  out.ok = true;
  out.aliases = accepted;
  return out;
};

global.client.unregisterCommand = function (name) {
  const resolved = global.client.resolveCommandName(name);
  if (resolved === null) return false;
  global.client.commands.delete(resolved);
  const aliases = global.client.commandAliasIndex.get(resolved) || [];
  for (const a of aliases) {
    if (global.client.commandAliases.get(a) === resolved) global.client.commandAliases.delete(a);
  }
  global.client.commandAliasIndex.delete(resolved);
  if (Array.isArray(global.client.eventRegistered)) {
    global.client.eventRegistered = global.client.eventRegistered.filter((n) => n !== resolved);
  }
  return true;
};

// ---------------- other globals ----------------
global.data = {
  threadInfo: new Map(),
  threadData: new Map(),
  userName: new Map(),
  userBanned: new Map(),
  threadBanned: new Map(),
  commandBanned: new Map(),
  threadAllowNSFW: [],
  allUserID: [],
  allCurrenciesID: [],
  allThreadID: [],
};

global.utils = require("./utils");
global.nodemodule = {};
global.config = {};
global.configModule = {};
global.moduleData = [];
global.language = {};
global.developers = [anthorUid, anthorId];

global.isDeveloper = function (id) {
  if (!id) return false;
  const uid = String(id);
  const fromConfig =
    global.config && Array.isArray(global.config.DEVELOPER) ? global.config.DEVELOPER.map(String) : [];
  return fromConfig.includes(uid) || global.developers.includes(uid);
};

if (typeof global.handleListen === "undefined") global.handleListen = null;

// ---------------- load config ----------------
let configValue;
try {
  global.client.configPath = join(global.client.mainPath, "config.json");
  configValue = require(global.client.configPath);
  logger.loader("Found file config: config.json");
} catch {
  const configTempPath = join(global.client.mainPath, "config.json.temp");
  if (existsSync(configTempPath)) {
    configValue = JSON.parse(readFileSync(configTempPath));
    logger.loader("Found: " + configTempPath);
  } else {
    return logger.loader("config.json not found!", "error");
  }
}

try {
  for (const key in configValue) global.config[key] = configValue[key];
  logger.loader("Config Loaded!");
} catch {
  return logger.loader("Can't load file config!", "error");
}

const { Sequelize, sequelize } = require("./includes/database");

writeFileSync(global.client.configPath + ".temp", JSON.stringify(global.config, null, 4), {
  encoding: "utf8",
  mode: 0o600,
});

// ---------------- language ----------------
const langFile = readFileSync(__dirname + "/languages/" + (global.config.language || "en") + ".lang", {
  encoding: "utf-8",
}).split(/\r?\n|\r/);
const langData = langFile.filter((line) => line.indexOf("#") != 0 && line != "");

for (const item of langData) {
  const sep = item.indexOf("=");
  const itemKey = item.slice(0, sep);
  const itemValue = item.slice(sep + 1, item.length);
  const head = itemKey.slice(0, itemKey.indexOf("."));
  const key = itemKey.replace(head + ".", "");
  const value = itemValue.replace(/\\n/gi, "\n");
  if (typeof global.language[head] == "undefined") global.language[head] = {};
  global.language[head][key] = value;
}

global.getText = function (...args) {
  const lang = global.language;
  if (!lang.hasOwnProperty(args[0])) throw __filename + " - Not found key language: " + args[0];
  let text = lang[args[0]][args[1]];
  for (let i = args.length - 1; i > 0; i--) {
    const regex = RegExp("%" + i, "g");
    text = text.replace(regex, args[i + 1]);
  }
  return text;
};

// ---------------- appstate ----------------
let appState;
try {
  const appStateFile = resolve(join(global.client.mainPath, global.config.APPSTATEPATH || "appstate.json"));
  if (existsSync(appStateFile)) {
    appState = require(appStateFile);
    logger.loader(global.getText("shahadat", "foundPathAppstate"));
  } else {
    appState = null;
    logger.loader(global.getText("shahadat", "notFoundPathAppstate"), "warn");
  }
} catch {
  return logger.loader(global.getText("shahadat", "notFoundPathAppstate"), "error");
}

logger("MESSENGER CHAT BOT", "[ Starting ]");

// ---------------- single instance (PID file) ----------------
const PID_FILE = join(global.client.mainPath, ".bot.pid");

function checkSingleInstance() {
  try {
    if (existsSync(PID_FILE)) {
      const oldPid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          logger(`Another bot instance (PID ${oldPid}) is already running. Preventing duplicate sessions.`, "[ WARNING ]");
          return false;
        } catch (e) {
          logger("Removing stale PID file from a previous run.", "[ WARNING ]");
        }
      }
    }
    writeFileSync(PID_FILE, String(process.pid), "utf8");
  } catch (e) {}
  return true;
}

function removePidFile() {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
      if (pid === process.pid) unlinkSync(PID_FILE);
    }
  } catch (e) {}
}

// ---------------- web server ----------------
const app = express();
const port = process.env.PORT || 8080;

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "/index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "/index.html")));

const server = http.createServer(app);
let botStartupStarted = false;
let listenerStarted = false;

async function startBot() {
  if (botStartupStarted) return;
  botStartupStarted = true;
  try {
    await sequelize.authenticate();
    const models = require("./includes/database/model")({ Sequelize, sequelize });
    logger(global.getText("shahadat", "successConnectDatabase"), "[ DATABASE ]");
    onBot({ models });
  } catch (error) {
    logger("Database error: " + error.message, "[ ERROR ]");
  }
}

if (!checkSingleInstance()) {
  logger("Duplicate bot instance detected - exiting so the running instance keeps its session.", "[ WARNING ]");
  process.exit(1);
}

server
  .listen(port, "0.0.0.0", () => {
    logger("Server running on port " + port, "[ WEB ]");
    startBot();
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger("Port " + port + " is already in use - this runtime will not open another bot connection", "[ WEB ]");
      process.exit(1);
      return;
    }
    if (err.code === "EACCES") logger("Port " + port + " permission denied", "[ ERROR ]");
    else logger("Web server error: " + err.message, "[ ERROR ]");
    startBot();
  });

// ---------------- console message logging ----------------
const consoleNameCache = new Map();

function isConsoleEnabled(threadID) {
  const id = String(threadID);
  const data = global.data.threadData.get(id) || global.data.threadData.get(parseInt(id, 10)) || {};
  return data.console !== false;
}

async function getConsoleInfo(api, event) {
  const threadID = String(event.threadID);
  const senderID = String(event.senderID);

  let groupName = (global.data.threadInfo.get(threadID) || {}).threadName;
  if (!groupName && !consoleNameCache.has("thread|" + threadID)) {
    try {
      const info = await api.getThreadInfo(threadID);
      consoleNameCache.set("thread|" + threadID, (info || {}).threadName || "");
    } catch {
      consoleNameCache.set("thread|" + threadID, "");
    }
  }
  if (!groupName) groupName = consoleNameCache.get("thread|" + threadID) || undefined;

  let userName = global.data.userName.get(senderID);
  if (!userName && !consoleNameCache.has("user|" + senderID)) {
    try {
      const info = await api.getUserInfo([senderID]);
      consoleNameCache.set("user|" + senderID, ((info || {})[senderID] || {}).name || "");
    } catch {
      consoleNameCache.set("user|" + senderID, "");
    }
  }
  if (!userName) userName = consoleNameCache.get("user|" + senderID) || undefined;

  return { groupName, userName };
}

function logMessageToConsole(api, event) {
  try {
    if (!event || !["message", "message_reply"].includes(event.type)) return;
    const threadID = String(event.threadID || "");
    const senderID = String(event.senderID || "");
    if (!threadID || !senderID) return;

    let botID = "";
    try {
      botID = String(api.getCurrentUserID() || "");
    } catch {
      botID = "";
    }
    if (botID && senderID === botID) return;
    if (!isConsoleEnabled(threadID)) return;

    getConsoleInfo(api, event)
      .then(({ groupName, userName }) => {
        consoleLogger.log({
          groupName,
          threadID,
          userName,
          senderID,
          content: event.body ? event.body : undefined,
        });
      })
      .catch(() => {});
  } catch (e) {}
}

// ---------------- main bot ----------------
function onBot({ models }) {
  login({ appState }, async (loginError, api) => {
    if (loginError) {
      logger("Login error: " + logger.redactSecrets(JSON.stringify(loginError)), "ERROR");
      return;
    }
    if (listenerStarted) {
      logger("Bot already running - duplicate login callback ignored", "[ LISTENER ]");
      return;
    }

    global.client.api = api;
    global.client.timeStart = new Date().getTime();

    // ----- load commands -----
    (function loadCommands() {
      const disabled = Array.isArray(global.config.commandDisabled) ? global.config.commandDisabled : [];
      const files = readdirSync(global.client.mainPath + "/Script/commands").filter(
        (f) => f.endsWith(".js") && !f.includes("example") && !disabled.includes(f)
      );

      for (const file of files) {
        let reg = null;
        let module = null;
        try {
          module = require(global.client.mainPath + "/Script/commands/" + file);
          if (!module.config || !module.run || !module.config.commandCategory) {
            throw new Error(global.getText("shahadat", "errorFormat"));
          }

          reg = global.client.registerCommand(module, file);
          if (!reg.ok) throw new Error(reg.reason);
          for (const s of reg.skipped) {
            logger.loader(`Command "${reg.name}": alias "${s.alias}" was ignored because ${s.reason}.`, "warn");
          }

          if (!module.languages || typeof module.languages != "object" || Object.keys(module.languages).length == 0) {
            logger.loader(global.getText("shahadat", "notFoundLanguage", module.config.name), "warn");
          }

          // dependencies
          if (module.config.dependencies && typeof module.config.dependencies == "object") {
            for (const dep in module.config.dependencies) {
              const depPath = join(__dirname, "nodemodules", "node_modules", dep);
              try {
                if (!global.nodemodule.hasOwnProperty(dep)) {
                  if (listPackage.hasOwnProperty(dep) || listbuiltinModules.includes(dep)) {
                    global.nodemodule[dep] = require(dep);
                  } else {
                    global.nodemodule[dep] = require(depPath);
                  }
                }
              } catch {
                let installed = false;
                let lastError;
                logger.loader(global.getText("shahadat", "notFoundPackage", dep, module.config.name), "warn");
                const ver = module.config.dependencies[dep];
                execSync("npm --package-lock false --save install " + dep + (ver == "*" || ver == "" ? "" : "@" + ver), {
                  stdio: "inherit",
                  env: process.env,
                  shell: true,
                  cwd: join(__dirname, "nodemodules"),
                });
                for (let i = 1; i <= 3; i++) {
                  try {
                    require.cache = {};
                    if (listPackage.hasOwnProperty(dep) || listbuiltinModules.includes(dep)) {
                      global.nodemodule[dep] = require(dep);
                    } else {
                      global.nodemodule[dep] = require(depPath);
                    }
                    installed = true;
                    break;
                  } catch (e) {
                    lastError = e;
                  }
                  if (installed || !lastError) break;
                }
                if (!installed || lastError) {
                  throw global.getText("shahadat", "cantInstallPackage", dep, module.config.name, lastError);
                }
              }
            }
            logger.loader(global.getText("shahadat", "loadedPackage", module.config.name));
          }

          // envConfig
          if (module.config.envConfig) {
            try {
              for (const k in module.config.envConfig) {
                const n = module.config.name;
                if (typeof global.configModule[n] == "undefined") global.configModule[n] = {};
                if (typeof global.config[n] == "undefined") global.config[n] = {};
                if (typeof global.config[n][k] !== "undefined") global.configModule[n][k] = global.config[n][k];
                else global.configModule[n][k] = module.config.envConfig[k] || "";
                if (typeof global.config[n][k] == "undefined") global.config[n][k] = module.config.envConfig[k] || "";
              }
              logger.loader(global.getText("shahadat", "loadedConfig", module.config.name));
            } catch (e) {
              throw new Error(global.getText("shahadat", "loadedConfig", module.config.name, JSON.stringify(e)));
            }
          }

          // onLoad
          if (module.onLoad) {
            try {
              module.onLoad({ api, models });
            } catch (e) {
              throw new Error(global.getText("shahadat", "cantOnload", module.config.name, JSON.stringify(e)), "error");
            }
          }

          if (module.handleEvent) global.client.eventRegistered.push(reg.name);
          logger.loader(global.getText("shahadat", "successLoadModule", module.config.name));
        } catch (e) {
          if (reg && reg.ok) global.client.unregisterCommand(reg.name);
          const name = module && module.config && module.config.name ? module.config.name : file;
          logger.loader(global.getText("shahadat", "failLoadModule", name, e), "error");
        }
      }
    })();

    // ----- load events -----
    (function loadEvents() {
      const disabled = Array.isArray(global.config.eventDisabled) ? global.config.eventDisabled : [];
      const files = readdirSync(global.client.mainPath + "/Script/events").filter(
        (f) => f.endsWith(".js") && !disabled.includes(f)
      );

      for (const file of files) {
        let module;
        try {
          module = require(global.client.mainPath + "/Script/events/" + file);
          if (!module.config || !module.run) throw new Error(global.getText("shahadat", "errorFormat"));
          if (global.client.events.has(module.config.name) || "") {
            throw new Error(global.getText("shahadat", "nameExist"));
          }

          if (module.config.dependencies && typeof module.config.dependencies == "object") {
            for (const dep in module.config.dependencies) {
              const depPath = join(__dirname, "nodemodules", "node_modules", dep);
              try {
                if (!global.nodemodule.hasOwnProperty(dep)) {
                  if (listPackage.hasOwnProperty(dep) || listbuiltinModules.includes(dep)) {
                    global.nodemodule[dep] = require(dep);
                  } else {
                    global.nodemodule[dep] = require(depPath);
                  }
                }
              } catch {
                let installed = false;
                let lastError;
                logger.loader(global.getText("shahadat", "notFoundPackage", dep, module.config.name), "warn");
                const ver = module.config.dependencies[dep];
                execSync("npm --package-lock false --save install " + dep + (ver == "*" || ver == "" ? "" : "@" + ver), {
                  stdio: "inherit",
                  env: process.env,
                  shell: true,
                  cwd: join(__dirname, "nodemodules"),
                });
                for (let i = 1; i <= 3; i++) {
                  try {
                    require.cache = {};
                    if (global.nodemodule.includes(dep)) break;
                    if (listPackage.hasOwnProperty(dep) || listbuiltinModules.includes(dep)) {
                      global.nodemodule[dep] = require(dep);
                    } else {
                      global.nodemodule[dep] = require(depPath);
                    }
                    installed = true;
                    break;
                  } catch (e) {
                    lastError = e;
                  }
                  if (installed || !lastError) break;
                }
                if (!installed || lastError) {
                  throw global.getText("shahadat", "cantInstallPackage", dep, module.config.name);
                }
              }
            }
            logger.loader(global.getText("shahadat", "loadedPackage", module.config.name));
          }

          if (module.config.envConfig) {
            try {
              for (const k in module.config.envConfig) {
                const n = module.config.name;
                if (typeof global.configModule[n] == "undefined") global.configModule[n] = {};
                if (typeof global.config[n] == "undefined") global.config[n] = {};
                if (typeof global.config[n][k] !== "undefined") global.configModule[n][k] = global.config[n][k];
                else global.configModule[n][k] = module.config.envConfig[k] || "";
                if (typeof global.config[n][k] == "undefined") global.config[n][k] = module.config.envConfig[k] || "";
              }
              logger.loader(global.getText("shahadat", "loadedConfig", module.config.name));
            } catch (e) {
              throw new Error(global.getText("shahadat", "loadedConfig", module.config.name, JSON.stringify(e)), "error");
            }
          }

          if (module.onLoad) {
            try {
              module.onLoad({ api, models });
            } catch (e) {
              throw new Error(global.getText("shahadat", "cantOnload", module.config.name, JSON.stringify(e)), "error");
            }
          }

          global.client.events.set(module.config.name, module);
          logger.loader(global.getText("shahadat", "successLoadModule", module.config.name));
        } catch (e) {
          const name = module && module.config && module.config.name ? module.config.name : file;
          logger.loader(global.getText("shahadat", "failLoadModule", name, e), "error");
        }
      }
    })();

    console.log(BOT_ART);
    logger.loader(
      global.getText("shahadat", "finishLoadModule", global.client.commands.size, global.client.events.size)
    );
    logger.loader("Startup Time: " + ((Date.now() - global.client.timeStart) / 1000).toFixed() + "s");
    logger.loader("===== [ " + (Date.now() - global.client.timeStart) + "ms ] =====");

    writeFileSync(global.client.configPath, JSON.stringify(global.config, null, 4), "utf8");
    if (existsSync(global.client.configPath + ".temp")) unlinkSync(global.client.configPath + ".temp");

    const listener = require("./includes/listen")({ api, models, logAnthorName });

    function handleListen(error, event) {
      if (error) {
        return logger(global.getText("shahadat", "handleListenError", logger.redactSecrets(JSON.stringify(error))), "error");
      }
      if (["presence", "typ", "read_receipt"].some((t) => t == event.type)) return;
      if (global.config.DeveloperMode == true) console.log(event);
      logMessageToConsole(api, event);
      return listener(event);
    }

    if (typeof api.listenMqtt === "function") {
      try {
        api.listenMqtt(handleListen);
        listenerStarted = true;
        logger("MQTT listener registered - reconnect / re-listen is managed by includes/login/login.js", "[ LISTENER ]");
      } catch (e) {
        logger("Listen error: " + e.message, "[ ERROR ]");
        return;
      }
    } else {
      logger("api.listenMqtt is unavailable - MQTT listener was not started", "[ ERROR ]");
    }

    if (!global.checkBan) {
      logger(global.getText("shahadat", "warningSourceCode"), "[ WARNING ]");
    }
  });
}

// ---------------- process handlers ----------------
process.on("unhandledRejection", (reason) => {
  logger("Unhandled Rejection: " + logger.redactSecrets(reason && reason.message ? reason.message : reason), "[ ERROR ]");
});

process.on("uncaughtException", (err) => {
  logger("Uncaught Exception: " + logger.redactSecrets(err && err.message ? err.message : err), "[ ERROR ]");
});

let isTerminating = false;

async function handleExitSignal(signal) {
  if (isTerminating) return;
  isTerminating = true;
  logger("Received " + signal + ", shutting down gracefully...", "[ Shutdown ]");
  removePidFile();
  try {
    if (server && server.listening) server.close();
  } catch (e) {}
  stopListenerBestEffort();
  setTimeout(() => process.exit(0), 1500);
}

function stopListenerBestEffort() {
  try {
    const listener = global.handleListen;
    global.handleListen = null;
    if (!listener) return;
    if (typeof listener.stopListening === "function") listener.stopListening();
    else if (typeof listener.stop === "function") listener.stop();
    else if (typeof listener.end === "function") listener.end();
    else if (typeof listener === "function") listener();
  } catch (e) {}
}

process.on("SIGINT", () => handleExitSignal("SIGINT"));
process.on("SIGTERM", () => handleExitSignal("SIGTERM"));
process.on("exit", () => {
  stopListenerBestEffort();
  removePidFile();
});
