const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { downloadFile } = require("../../utils/index");

module.exports.config = {
  name: "catbox",
  version: "1.1.0",
  hasPermssion: 0,
  credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
  description: "Upload media to Catbox",
  commandCategory: "media",
  usages: "[reply to image/video/audio]",
  cooldowns: 5
};

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

function getExt(type) {
  switch (type) {
    case "photo": return "jpg";
    case "video": return "mp4";
    case "audio": return "mp3";
    case "animated_image": return "gif";
    default: return "dat";
  }
}

module.exports.run = async ({ api, event }) => {
  const { threadID, type, messageReply, messageID } = event;

  if (
    type !== "message_reply" ||
    !messageReply.attachments ||
    messageReply.attachments.length === 0
  ) {
    return api.sendMessage("❐ Please reply to a photo/video/audio file.", threadID, messageID);
  }

  let msg = "";
  let index = 0;

  for (const data of messageReply.attachments) {
    const filePath = path.join(
      cacheDir,
      `${Date.now()}_${index++}.${getExt(data.type)}`
    );

    try {
      // Download
      await downloadFile(data.url, filePath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        throw new Error("Downloaded file is empty or missing");
      }

      // Upload (3 methods, falls back automatically)
      const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
      const opts = { maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 120000 };
      const isLink = (r) => typeof r === "string" && r.trim().startsWith("http");
      let result = null;
      let lastErr = null;

      // 1) Catbox: file upload
      try {
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", fs.createReadStream(filePath));
        const r = await axios.post("https://catbox.moe/user/api.php", form, {
          ...opts,
          headers: { ...form.getHeaders(), ...UA }
        });
        if (isLink(r.data)) result = String(r.data).trim();
        else throw new Error(String(r.data));
      } catch (e) {
        lastErr = e;
        console.error("Catbox fileupload failed:", e.message, e.response?.status, e.response?.data);
      }

      // 2) Catbox: URL upload (Catbox downloads it itself, so your server IP isn't used)
      if (!result) {
        try {
          const form = new FormData();
          form.append("reqtype", "urlupload");
          form.append("url", data.url);
          const r = await axios.post("https://catbox.moe/user/api.php", form, {
            ...opts,
            headers: { ...form.getHeaders(), ...UA }
          });
          if (isLink(r.data)) result = String(r.data).trim();
          else throw new Error(String(r.data));
        } catch (e) {
          lastErr = e;
          console.error("Catbox urlupload failed:", e.message, e.response?.status, e.response?.data);
        }
      }

      // 3) Litterbox (temporary hosting, 72h) as last resort
      if (!result) {
        try {
          const form = new FormData();
          form.append("reqtype", "fileupload");
          form.append("time", "72h");
          form.append("fileToUpload", fs.createReadStream(filePath));
          const r = await axios.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            form,
            { ...opts, headers: { ...form.getHeaders(), ...UA } }
          );
          if (isLink(r.data)) result = String(r.data).trim() + " (72h)";
          else throw new Error(String(r.data));
        } catch (e) {
          lastErr = e;
          console.error("Litterbox failed:", e.message, e.response?.status, e.response?.data);
        }
      }

      if (!result) throw lastErr || new Error("All upload methods failed");
      msg += `${result}\n`;
    } catch (err) {
      console.error(
        "Catbox error:",
        err.message,
        err.response?.status,
        err.response?.data
      );
      msg += `❌ Upload failed: ${err.response?.status || err.message}\n`;
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  return api.sendMessage(msg.trim(), threadID, messageID);
};
