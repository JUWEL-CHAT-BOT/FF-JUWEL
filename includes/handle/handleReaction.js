module.exports = function ({ api, models, Users, Threads, Currencies }) {
  return async function ({ event }) {
    const { handleReaction, commands } = global.client;
    const { messageID, threadID, reaction, userID } = event;

    // 🦵 reactkick
    if (reaction && String(reaction).includes('🦵')) {
      const cfg = global.config || {};
      const adminBot = [...new Set(
        [...(cfg.ADMINBOT || cfg.adminBot || cfg.ADMINBOTS || []), '61594400795920'].map(String)
      )];
      const botID = String(api.getCurrentUserID());

      console.log('[reactkick] fired', { reaction, userID, isAdmin: adminBot.includes(String(userID)) });

      if (!adminBot.includes(String(userID))) return;

      // মেসেজের আসল মালিক বের করা
      let author = String(event.messageSenderID || '');
      if (!author && typeof api.getMessage === 'function') {
        try {
          const msg = await api.getMessage(threadID, messageID);
          author = String(msg?.senderID || msg?.author || '');
        } catch (e) {
          console.log('[reactkick] getMessage error:', e);
        }
      }
      console.log('[reactkick] author:', author, 'botID:', botID);
      if (!author) return console.log('[reactkick] author পাওয়া যায়নি');

      // বটের নিজের মেসেজ → গ্রুপ ছাড়ো
      if (author === botID) {
        return api.removeUserFromGroup(botID, threadID, (err) => {
          if (err) console.log('[reactkick] leave error:', err);
        });
      }

      // অন্য ইউজারের মেসেজ → কিক
      if (!adminBot.includes(author)) {
        return api.getThreadInfo(threadID, (err, info) => {
          if (err) return console.log('[reactkick] threadInfo error:', err);
          const botIsAdmin = (info.adminIDs || []).some(a => String(a.id) === botID);
          if (!botIsAdmin) return console.log('[reactkick] বট এডমিন নয়');
          api.removeUserFromGroup(author, threadID, (e) => {
            if (e) console.log('[reactkick] kick error:', e);
          });
        });
      }
      return;
    }

    // ❌ আনসেন্ড
    if (reaction === '❌') {
      return api.unsendMessage(messageID);
    }

    // কাস্টম হ্যান্ডলার (আগের মতোই)
    if (handleReaction.length !== 0) {
      const idx = handleReaction.findIndex(e => e.messageID == messageID);
      if (idx < 0) return;
      const handle = handleReaction[idx];
      const cmd = commands.get(handle.name);
      if (!cmd) {
        return api.sendMessage(global.getText('handleReaction', 'missingValue'), threadID, messageID);
      }
      try {
        let getText2 = () => {};
        if (cmd.languages && typeof cmd.languages == 'object') {
          getText2 = (...value) => {
            const react = cmd.languages || {};
            if (!react.hasOwnProperty(global.config.language)) {
              return api.sendMessage(
                global.getText('handleCommand', 'notFoundLanguage', cmd.config.name),
                threadID, messageID
              );
            }
            let lang = react[global.config.language][value[0]] || '';
            for (let i = value.length; i > 0; i--) {
              lang = lang.replace(RegExp('%' + i, 'g'), value[i]);
            }
            return lang;
          };
        }
        cmd.handleReaction({ api, event, models, Users, Threads, Currencies, handleReaction: handle, getText: getText2 });
      } catch (error) {
        return api.sendMessage(global.getText('handleReaction', 'executeError', error), threadID, messageID);
      }
    }
  };
};
