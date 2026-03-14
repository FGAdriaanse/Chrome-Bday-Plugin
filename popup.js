// Birthday Buddy - Popup Script

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseBirthdate(birthdate) {
  if (!birthdate) return null;
  const parts = birthdate.split('/');
  if (parts.length < 3) return null;
  const year  = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day   = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day)) return null;
  return { year: isNaN(year) ? null : year, month, day };
}

function getTodayBirthdays(contacts) {
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  return contacts.filter(c => {
    const p = parseBirthdate(c.birthdate);
    return p && p.month === m && p.day === d;
  });
}

function calcAge(year) {
  if (!year) return null;
  const thisYear = new Date().getFullYear();
  return thisYear - year;
}

function formatMessage(template, name) {
  return template.replace(/\{name\}/g, name);
}

// ── State ────────────────────────────────────────────────────────────────────

let allContacts = [];
let allMessages = { english: [], afrikaans: [] };
let selectedMsgIndex = 0;
let composerContact = null;

// ── Render ───────────────────────────────────────────────────────────────────

function renderBirthdays(birthdays) {
  const list = document.getElementById('birthdayList');
  const empty = document.getElementById('noBirthdays');
  list.innerHTML = '';

  if (birthdays.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  birthdays.forEach(contact => {
    const parsed = parseBirthdate(contact.birthdate);
    const age = parsed ? calcAge(parsed.year) : null;

    const item = document.createElement('div');
    item.className = 'birthday-item';

    // Star button
    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn';
    starBtn.title = contact.starred ? 'Remove VIP star' : 'Mark as VIP';
    starBtn.textContent = contact.starred ? '⭐' : '☆';
    starBtn.addEventListener('click', () => toggleStar(contact.id));

    // Info
    const info = document.createElement('div');
    info.className = 'birthday-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'birthday-name';
    nameEl.textContent = contact.name;
    info.appendChild(nameEl);
    if (age !== null) {
      const ageEl = document.createElement('div');
      ageEl.className = 'birthday-age';
      ageEl.textContent = `Turning ${age} today 🎂`;
      info.appendChild(ageEl);
    }

    // WhatsApp button
    const waBtn = document.createElement('button');
    waBtn.className = 'wa-btn';
    waBtn.textContent = '💬 Message';
    waBtn.title = 'Send a WhatsApp birthday message';
    waBtn.addEventListener('click', () => openComposer(contact));

    item.appendChild(starBtn);
    item.appendChild(info);
    item.appendChild(waBtn);
    list.appendChild(item);
  });
}

// ── Star toggle ──────────────────────────────────────────────────────────────

async function toggleStar(contactId) {
  const idx = allContacts.findIndex(c => c.id === contactId);
  if (idx === -1) return;
  allContacts[idx].starred = !allContacts[idx].starred;
  await chrome.storage.local.set({ contacts: allContacts });
  renderBirthdays(getTodayBirthdays(allContacts));
}

// ── WhatsApp Composer ─────────────────────────────────────────────────────────

function openComposer(contact) {
  composerContact = contact;
  selectedMsgIndex = 0;

  document.getElementById('composerName').textContent = contact.name;
  document.getElementById('waComposer').style.display = 'block';

  renderMsgList();
  document.getElementById('waComposer').scrollIntoView({ behavior: 'smooth' });
}

function renderMsgList() {
  if (!composerContact) return;
  const lang = document.getElementById('msgLang').value;
  const templates = allMessages[lang] || [];
  const msgList = document.getElementById('msgList');
  msgList.innerHTML = '';

  templates.forEach((tmpl, i) => {
    const btn = document.createElement('button');
    btn.className = 'msg-option' + (i === selectedMsgIndex ? ' selected' : '');
    btn.textContent = formatMessage(tmpl, composerContact.name);
    btn.addEventListener('click', () => {
      selectedMsgIndex = i;
      renderMsgList();
    });
    msgList.appendChild(btn);
  });

  updatePreview();
}

function updatePreview() {
  if (!composerContact) return;
  const lang = document.getElementById('msgLang').value;
  const templates = allMessages[lang] || [];
  const tmpl = templates[selectedMsgIndex] || '';
  document.getElementById('msgPreview').textContent = formatMessage(tmpl, composerContact.name);
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['contacts', 'messages']);
  allContacts = data.contacts || [];
  allMessages = data.messages || { english: [], afrikaans: [] };

  const todayBirthdays = getTodayBirthdays(allContacts);
  renderBirthdays(todayBirthdays);

  // Settings button → open options page
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Manage link → open options page
  document.getElementById('manageBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Language change → re-render message list
  document.getElementById('msgLang').addEventListener('change', () => {
    selectedMsgIndex = 0;
    renderMsgList();
  });

  // Close composer
  document.getElementById('closeComposer').addEventListener('click', () => {
    document.getElementById('waComposer').style.display = 'none';
    document.getElementById('copyFeedback').style.display = 'none';
    composerContact = null;
  });

  // Copy message to clipboard
  document.getElementById('copyMsgBtn').addEventListener('click', async () => {
    const text = document.getElementById('msgPreview').textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const fb = document.getElementById('copyFeedback');
      fb.style.display = 'block';
      setTimeout(() => { fb.style.display = 'none'; }, 2500);
    } catch {
      // Fallback: select and copy via execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const fb = document.getElementById('copyFeedback');
      fb.style.display = 'block';
      setTimeout(() => { fb.style.display = 'none'; }, 2500);
    }
  });

  // Open WhatsApp Web
  document.getElementById('openWaBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
  });
});
