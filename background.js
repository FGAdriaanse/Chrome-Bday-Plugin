// Birthday Buddy - Background Service Worker

const DEFAULT_MESSAGES = {
  english: [
    "Happy Birthday {name}! 🎉 Hope your day is as amazing as you are! 🎂✨",
    "Wishing you the happiest of birthdays, {name}! 🥳🎈 May all your wishes come true! 🌟",
    "Happy Birthday {name}! 🎊 Sending you lots of love and joy on your special day! ❤️🎂",
    "It's your birthday, {name}! 🎉🎈 Hope it's filled with laughter, love, and cake! 🍰😄",
    "Many happy returns of the day, {name}! 🎂🎁 Wishing you a fantastic birthday! 🌈✨"
  ],
  afrikaans: [
    "Veels geluk met jou verjaarsdag, {name}! 🎉 Mag jou dag so wonderlik wees soos jy is! 🎂✨",
    "Gelukkige verjaarsdag, {name}! 🥳🎈 Mag al jou wense uitkom! 🌟",
    "Baie geluk, {name}! 🎊 Ek stuur vir jou baie liefde en vreugde op jou spesiale dag! ❤️🎂",
    "Dit's jou verjaarsdag, {name}! 🎉🎈 Hoop dit is vol lag, liefde en koek! 🍰😄",
    "Hartlike gelukwense op jou verjaarsdag, {name}! 🎂🎁 Mag hierdie jaar fantasties wees! 🌈✨"
  ]
};

// Parse YYYY/MM/DD birthdate and return { month, day }
function parseBirthdate(birthdate) {
  if (!birthdate) return null;
  const parts = birthdate.split('/');
  if (parts.length < 3) return null;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day)) return null;
  return { month, day };
}

function getTodayBirthdays(contacts) {
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  return contacts.filter(contact => {
    const parsed = parseBirthdate(contact.birthdate);
    if (!parsed) return false;
    return parsed.month === todayMonth && parsed.day === todayDay;
  });
}

async function updateBadge() {
  const data = await chrome.storage.local.get(['contacts']);
  const contacts = data.contacts || [];
  const todayBirthdays = getTodayBirthdays(contacts);
  const count = todayBirthdays.length;

  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }

  return todayBirthdays;
}

async function showNotification(birthdays) {
  if (birthdays.length === 0) return;

  const names = birthdays.map(b => b.name).join(', ');
  const title = birthdays.length === 1
    ? `🎂 Birthday today!`
    : `🎂 ${birthdays.length} birthdays today!`;
  const message = birthdays.length === 1
    ? `${names} has a birthday today! Open Birthday Buddy to send a message.`
    : `${names} have birthdays today! Open Birthday Buddy to send messages.`;

  await chrome.notifications.create('birthday-notification', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2
  });
}

function setupDailyAlarm() {
  chrome.alarms.get('daily-check', (alarm) => {
    if (!alarm) {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight - now;

      chrome.alarms.create('daily-check', {
        delayInMinutes: msUntilMidnight / 60000,
        periodInMinutes: 24 * 60
      });
    }
  });
}

// Render the 🎉 emoji onto the toolbar icon using OffscreenCanvas
// so it shows in its original full colour on every platform.
async function setEmojiIcon() {
  try {
    const imageData = {};
    for (const size of [16, 48, 128]) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx    = canvas.getContext('2d');
      ctx.font         = `${Math.round(size * 0.82)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎉', size / 2, size / 2 + size * 0.04);
      imageData[size]  = ctx.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
  } catch {
    // If OffscreenCanvas isn't available fall back to the static PNG
  }
}

// On first install: seed default messages and empty contacts
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['messages', 'contacts']);
  const updates = {};
  if (!data.messages) updates.messages = DEFAULT_MESSAGES;
  if (!data.contacts) updates.contacts = [];
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
  await setEmojiIcon();
  await updateBadge();
  setupDailyAlarm();
});

// On browser startup: update badge and notify
chrome.runtime.onStartup.addListener(async () => {
  await setEmojiIcon();
  const birthdays = await updateBadge();
  await showNotification(birthdays);
  setupDailyAlarm();
});

// Daily alarm fires at midnight
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-check') {
    const birthdays = await updateBadge();
    await showNotification(birthdays);
  }
});

// Message listener for popup/options pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REFRESH_BADGE') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true;
  }
});
