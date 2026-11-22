module.exports.config = {
	name: "adduser",
	version: "7.0.0",
	hasPermssion: 0,
	credits: "乛 M𝆠፝֟R ཐི༏ཋྀ JU𝆠፝֟W𝆠፝֟ELꜛཐི༏ཋྀ࿐",
	description: "Add user to group by UID or Facebook link (bot admin only)",
	commandCategory: "group",
	usages: "[uid/link]",
	cooldowns: 5,
	usePrefix: true
};

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

//━━━━━━━━━━━━━━━
// ✅ GET UID FROM LINK
//━━━━━━━━━━━━━━━
async function getUID(url) {
	try {
		if (!url.includes("facebook.com") && !url.includes("fb.com"))
			return [null, null, true];
		if (!url.startsWith("http")) url = "https://" + url;

		const res = await axios.get(url, {
			headers: { "user-agent": "Mozilla/5.0" },
			timeout: 10000
		});
		const data = res.data;

		const uid =
			data.match(/"userID":"(\d+)"/)?.[1] ||
			data.match(/"entity_id":"(\d+)"/)?.[1] ||
			data.match(/"profile_id":"(\d+)"/)?.[1] ||
			data.match(/profile\.php\?id=(\d+)/)?.[1];

		const name =
			data.match(/<title>(.*?)<\/title>/)?.[1]?.replace(" | Facebook", "") ||
			"Facebook User";

		if (!uid) return [null, null, true];
		return [uid, name, false];
	} catch (e) {
		return [null, null, true];
	}
}

//━━━━━━━━━━━━━━━
// ✅ GET NAMES FROM UIDs
//━━━━━━━━━━━━━━━
async function getUserNames(api, ids) {
	const result = {};
	for (const id of ids) result[id] = "Admin";
	try {
		const info = await new Promise((resolve, reject) => {
			let done = false;
			const t = setTimeout(() => { if (!done) { done = true; reject(new Error("timeout")); } }, 10000);
			api.getUserInfo(ids, (err, data) => {
				if (done) return;
				done = true;
				clearTimeout(t);
				err ? reject(err) : resolve(data);
			});
		});
		for (const id of ids) result[id] = info?.[id]?.name || "Admin";
	} catch (e) {}
	return result;
}

//━━━━━━━━━━━━━━━
// ✅ CHECK BOT ADMIN (config.json → ADMINBOT)
//━━━━━━━━━━━━━━━
function isBotAdmin(senderID) {
	try {
		const candidates = [
			path.join(process.cwd(), "config.json"),
			path.join(__dirname, "..", "..", "config.json"),
			path.join(__dirname, "..", "config.json")
		];

		const configPath = candidates.find(p => fs.existsSync(p));
		if (!configPath) return false;

		const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		const admins = (config.ADMINBOT || []).map(String);
		return admins.includes(String(senderID));
	} catch (e) {
		console.log("[adduser] config read error:", e.message);
		return false;
	}
}

//━━━━━━━━━━━━━━━
// ✅ getThreadInfo (callback + promise দুইভাবেই কাজ করে)
// আগের কোডের মূল সমস্যা: await api.getThreadInfo(threadID)
// callback ছাড়া অনেক FCA-তে undefined ফেরত দেয়, তাই সবসময় null আসত।
//━━━━━━━━━━━━━━━
function getThreadInfo(api, threadID) {
	return new Promise((resolve) => {
		let done = false;
		const finish = (v) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve(v || null);
		};
		const timer = setTimeout(() => finish(null), 12000);

		try {
			const r = api.getThreadInfo(threadID, (err, info) => {
				if (err) {
					console.log("[adduser] getThreadInfo error:", err.message || err);
					return finish(null);
				}
				finish(info);
			});
			if (r && typeof r.then === "function") {
				r.then(finish).catch(() => finish(null));
			}
		} catch (e) {
			console.log("[adduser] getThreadInfo failed:", e.message);
			finish(null);
		}
	});
}

//━━━━━━━━━━━━━━━
// ✅ addUserToGroup (callback + promise)
// ⚠️ আগের কোডে আর্গুমেন্ট উল্টো করে দ্বিতীয়বার চেষ্টা করা হতো — সেটা বাদ দেওয়া হয়েছে
//━━━━━━━━━━━━━━━
function addUser(api, uid, threadID) {
	return new Promise((resolve, reject) => {
		let done = false;
		const finish = (err) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			err ? reject(err) : resolve();
		};
		const timer = setTimeout(() => finish(new Error("Request timeout")), 20000);

		try {
			const r = api.addUserToGroup(uid, threadID, (err) => finish(err));
			if (r && typeof r.then === "function") {
				r.then(() => finish()).catch(finish);
			}
		} catch (e) {
			finish(e);
		}
	});
}

//━━━━━━━━━━━━━━━
// ✅ CHECK USER IN GROUP (retry সহ)
// true = আছে | false = নেই | null = যাচাই করা যায়নি
//━━━━━━━━━━━━━━━
async function isUserInGroup(api, threadID, uid) {
	let result = null;
	for (let i = 0; i < 3; i++) {
		await sleep(2500);
		const info = await getThreadInfo(api, threadID);
		if (info && Array.isArray(info.participantIDs)) {
			if (info.participantIDs.map(String).includes(String(uid))) return { inGroup: true, info };
			result = { inGroup: false, info };
		}
	}
	return result || { inGroup: null, info: null };
}

function parseApproval(info) {
	if (!info) return false;
	const v = info.approvalMode;
	return v === true || v === 1 || v === "true";
}

function parseAdmins(info) {
	if (!info) return [];
	return (info.adminIDs || []).map(e => String(e.id || e));
}

//━━━━━━━━━━━━━━━
// ✅ MAIN RUN
//━━━━━━━━━━━━━━━
module.exports.run = async function ({ api, event, args }) {
	const { threadID, messageID, senderID } = event;
	const botID = String(api.getCurrentUserID());
	const send = (msg) => api.sendMessage(msg, threadID, messageID);

	// ❌ BOT ADMIN CHECK
	if (!isBotAdmin(senderID)) {
		return send(`╭━━━❌ ACCESS DENIED ❌━━━╮
┃
┃ ⚠️ শুধুমাত্র BOT ADMIN এই কমান্ড
┃ ব্যবহার করতে পারবে!
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	// ❌ NO INPUT
	if (!args[0]) {
		return send(`╭━━━📌 ADDUSER SYSTEM 📌━━━╮
┃
┃ ➤ উদাহরণ:
┃ /adduser 1000xxxxxxxx
┃ /adduser https://facebook.com/xxx
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	const loadingMsg = await new Promise((resolve) => {
		api.sendMessage(
			`╭━━━⏳ PROCESSING ⏳━━━╮
┃
┃ 🔍 User Checking...
┃ 📡 Collecting UID...
┃ ⚙️ Preparing Add System...
╰━━━━━━━━━━━━━━━━━━╯`,
			threadID,
			(err, info) => resolve(err ? null : info)
		);
	});

	const removeLoading = () => {
		try { if (loadingMsg?.messageID) api.unsendMessage(loadingMsg.messageID); } catch (e) {}
	};

	// UID / LINK
	let uid;
	let name = "Facebook User";

	if (/^\d+$/.test(args[0])) {
		uid = String(args[0]);
		const names = await getUserNames(api, [uid]);
		name = names[uid] === "Admin" ? "Facebook User" : names[uid];
	} else {
		const [id, userName, fail] = await getUID(args[0]);
		if (fail || !id) {
			removeLoading();
			return send(`╭━━━❌ FAILED ❌━━━╮
┃
┃ ⚠️ Facebook UID বের করা যায়নি!
╰━━━━━━━━━━━━━━━━━━╯`);
		}
		uid = String(id);
		name = userName;
	}

	// ✅ আগে থেকে গ্রুপে আছে কিনা + approval mode + admin list
	const beforeInfo = await getThreadInfo(api, threadID);
	let adminIDs = parseAdmins(beforeInfo);
	let approvalMode = parseApproval(beforeInfo);

	if (beforeInfo && (beforeInfo.participantIDs || []).map(String).includes(uid)) {
		removeLoading();
		return send(`╭━━━⚠️ USER EXIST ⚠️━━━╮
┃
┃ 👤 ${name}
┃ 🆔 ${uid}
┃
┃ আগে থেকেই গ্রুপে আছে।
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	//━━━━━━━━━━━━━━━
	// ✅ ADD USER
	//━━━━━━━━━━━━━━━
	try {
		await addUser(api, uid, threadID);
	} catch (e) {
		removeLoading();
		console.log("[adduser] addUserToGroup error:", e);
		const reason = String((e && (e.message || e.error || e.errorDescription)) || "Unknown").slice(0, 100);
		return send(`╭━━━❌ ADD FAILED ❌━━━╮
┃
┃ 👤 ${name}
┃ 🆔 ${uid}
┃
┃ ⚠️ ইউজারকে এড করা যায়নি!
┃
┃ 📌 সম্ভাব্য কারণ:
┃ • Profile Locked / Privacy
┃ • Add Option Off
┃ • Bot Blocked
┃ • Invalid UID
┃ • Group Full
┃
┃ 🛠 Error: ${reason}
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	// ✅ আসলেই গ্রুপে ঢুকেছে কিনা যাচাই (নতুন info দিয়ে)
	const { inGroup, info: afterInfo } = await isUserInGroup(api, threadID, uid);
	removeLoading();

	if (afterInfo) {
		approvalMode = approvalMode || parseApproval(afterInfo);
		const a = parseAdmins(afterInfo);
		if (a.length) adminIDs = a;
	}

	// 🎉 সরাসরি অ্যাড হয়ে গেছে
	if (inGroup === true) {
		return send(`╭━━━✅ USER ADDED ✅━━━╮
┃
┃ 👤 Name : ${name}
┃ 🆔 UID  : ${uid}
┃
┃ 🎉 সফলভাবে গ্রুপে এড করা হয়েছে!
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	// 🔔 গ্রুপে APPROVAL চালু → এডমিনদের মেনশন করে বলবে অ্যাপ্রুভ করতে
	if (approvalMode) {
		const admins = adminIDs.filter(id => id !== botID).slice(0, 15);

		let body = `╭━━━🔔 APPROVAL NEEDED 🔔━━━╮
┃
┃ 👤 Name : ${name}
┃ 🆔 UID  : ${uid}
┃
┃ ✅ ইউজারকে এড করা হয়েছে।
┃ ⚠️ গ্রুপে Approval চালু আছে,
┃ কোনো এডমিন দেখে Approve করুন।
╰━━━━━━━━━━━━━━━━━━╯`;

		const mentions = [];

		if (admins.length > 0) {
			const names = await getUserNames(api, admins);
			body += "\n\n👮 Admins:";
			for (const id of admins) {
				const tag = "@" + names[id];
				body += "\n";
				const fromIndex = body.length;
				body += tag;
				mentions.push({ tag, id, fromIndex });
			}
		}

		return api.sendMessage({ body, mentions }, threadID, messageID);
	}

	// ⚠️ গ্রুপে নেই, approval বন্ধ, বট এডমিন নয় → জয়েন রিকুয়েস্ট
	if (inGroup === false && !adminIDs.includes(botID)) {
		return send(`╭━━━⏳ JOIN REQUEST ⏳━━━╮
┃
┃ 👤 Name : ${name}
┃ 🆔 UID  : ${uid}
┃
┃ ✅ রিকুয়েস্ট পাঠানো হয়েছে।
┃ ⚠️ বট এই গ্রুপের এডমিন নয়,
┃ তাই সরাসরি এড হয়নি।
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	// ⚠️ গ্রুপে নেই, কিন্তু কারণ পরিষ্কার না
	if (inGroup === false) {
		return send(`╭━━━⏳ PENDING ⏳━━━╮
┃
┃ 👤 Name : ${name}
┃ 🆔 UID  : ${uid}
┃
┃ রিকুয়েস্ট পাঠানো হয়েছে, কিন্তু
┃ ইউজার এখনো গ্রুপে ঢোকেনি।
┃ (Approval বা ইউজারের privacy
┃ সেটিংস কারণ হতে পারে)
╰━━━━━━━━━━━━━━━━━━╯`);
	}

	// যাচাই করা যায়নি
	return send(`╭━━━✅ REQUEST SENT ✅━━━╮
┃
┃ 👤 Name : ${name}
┃ 🆔 UID  : ${uid}
┃
┃ অ্যাড রিকুয়েস্ট পাঠানো হয়েছে,
┃ তবে স্ট্যাটাস যাচাই করা যায়নি।
╰━━━━━━━━━━━━━━━━━━╯`);
};
