// Birthday Buddy - Popup Script

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return new Date().getFullYear() - year;
}

function formatMessage(template, name) {
  return template.replace(/\{name\}/g, name);
}

function formatShortDate(birthdate) {
  if (!birthdate) return '';
  const parts = birthdate.split('/');
  if (parts.length < 3) return birthdate;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return `${months[m] || '?'} ${d}`;
}

function isTodayBirthday(birthdate) {
  const p = parseBirthdate(birthdate);
  if (!p) return false;
  const today = new Date();
  return p.month === today.getMonth() + 1 && p.day === today.getDate();
}

// ── State ─────────────────────────────────────────────────────────────────────

let allContacts = [];
let allMessages = { english: [], afrikaans: [] };
let selectedMsgIndex = 0;
let composerContact = null;
let currentView = 'today'; // 'today' | 'all'

// ── Today's birthday list ─────────────────────────────────────────────────────

function renderToday() {
  const list  = document.getElementById('birthdayList');
  const empty = document.getElementById('noBirthdays');
  const badge = document.getElementById('todayBadge');
  list.innerHTML = '';

  const birthdays = getTodayBirthdays(allContacts);

  // Badge on the "Today" tab button
  if (birthdays.length > 0) {
    badge.textContent = birthdays.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  if (birthdays.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  birthdays.forEach(contact => {
    const parsed = parseBirthdate(contact.birthdate);
    const age    = parsed ? calcAge(parsed.year) : null;

    const item = document.createElement('div');
    item.className = 'birthday-item';

    // Star toggle
    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn';
    starBtn.title = contact.starred ? 'Remove VIP star' : 'Star to enable message copy';
    starBtn.textContent = contact.starred ? '⭐' : '☆';
    starBtn.addEventListener('click', async () => {
      await toggleStar(contact.id);
      renderToday();
      // Close composer if it was open for this contact and they got un-starred
      if (!allContacts.find(c => c.id === contact.id)?.starred) {
        closeComposer();
      }
    });

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

    item.appendChild(starBtn);
    item.appendChild(info);

    // Copy message button — only for starred contacts
    if (contact.starred) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = '📋 Copy Msg';
      copyBtn.title = 'Pick and copy a birthday message';
      copyBtn.addEventListener('click', () => openComposer(contact));
      item.appendChild(copyBtn);
    }

    list.appendChild(item);
  });
}

// ── All Contacts list ─────────────────────────────────────────────────────────

function renderAllContacts(filter = '') {
  const list    = document.getElementById('allContactsList');
  const emptyEl = document.getElementById('noContacts');
  list.innerHTML = '';

  const q = filter.toLowerCase();
  const filtered = q
    ? allContacts.filter(c => c.name.toLowerCase().includes(q))
    : [...allContacts];

  // Sort: starred first, then alphabetical
  filtered.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  if (filtered.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  filtered.forEach(contact => {
    const item = document.createElement('div');
    item.className = 'contact-item';

    // Star toggle
    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn';
    starBtn.title = contact.starred ? 'Remove VIP star' : 'Star for birthday messages';
    starBtn.textContent = contact.starred ? '⭐' : '☆';
    starBtn.addEventListener('click', async () => {
      await toggleStar(contact.id);
      renderAllContacts(document.getElementById('searchInput').value);
    });

    // Info
    const info = document.createElement('div');
    info.className = 'contact-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'contact-name';
    nameEl.textContent = contact.name;
    info.appendChild(nameEl);

    const dateEl = document.createElement('div');
    if (isTodayBirthday(contact.birthdate)) {
      dateEl.className = 'contact-bday-today';
      dateEl.textContent = '🎂 Birthday today!';
    } else {
      dateEl.className = 'contact-date';
      dateEl.textContent = formatShortDate(contact.birthdate);
    }
    info.appendChild(dateEl);

    item.appendChild(starBtn);
    item.appendChild(info);
    list.appendChild(item);
  });
}

// ── Star toggle ───────────────────────────────────────────────────────────────

async function toggleStar(contactId) {
  const idx = allContacts.findIndex(c => c.id === contactId);
  if (idx === -1) return;
  allContacts[idx].starred = !allContacts[idx].starred;
  await chrome.storage.local.set({ contacts: allContacts });
}

// ── Message Composer ──────────────────────────────────────────────────────────

function openComposer(contact) {
  composerContact = contact;
  selectedMsgIndex = 0;

  document.getElementById('composerName').textContent = contact.name;
  document.getElementById('composer').style.display = 'block';
  document.getElementById('copyFeedback').style.display = 'none';

  renderMsgList();
}

function closeComposer() {
  document.getElementById('composer').style.display = 'none';
  document.getElementById('copyFeedback').style.display = 'none';
  composerContact = null;
}

function renderMsgList() {
  if (!composerContact) return;
  const lang      = document.getElementById('msgLang').value;
  const templates = allMessages[lang] || [];
  const msgList   = document.getElementById('msgList');
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
  const lang      = document.getElementById('msgLang').value;
  const templates = allMessages[lang] || [];
  const tmpl      = templates[selectedMsgIndex] || '';
  document.getElementById('msgPreview').textContent = formatMessage(tmpl, composerContact.name);
}

// ── View switching ────────────────────────────────────────────────────────────

function showView(view) {
  currentView = view;
  document.getElementById('viewToday').style.display = view === 'today' ? 'block' : 'none';
  document.getElementById('viewAll').style.display   = view === 'all'   ? 'block' : 'none';
  document.getElementById('btnViewToday').classList.toggle('active', view === 'today');
  document.getElementById('btnViewAll').classList.toggle('active', view === 'all');

  if (view === 'all') {
    renderAllContacts(document.getElementById('searchInput').value);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['contacts', 'messages']);
  allContacts = data.contacts || [];
  allMessages = data.messages || { english: [], afrikaans: [] };

  renderToday();

  // View toggle
  document.getElementById('btnViewToday').addEventListener('click', () => showView('today'));
  document.getElementById('btnViewAll').addEventListener('click', () => showView('all'));

  // All contacts search
  document.getElementById('searchInput').addEventListener('input', e => {
    renderAllContacts(e.target.value);
  });

  // Settings / manage buttons
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('manageBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Language selector in composer
  document.getElementById('msgLang').addEventListener('change', () => {
    selectedMsgIndex = 0;
    renderMsgList();
  });

  // Close composer
  document.getElementById('closeComposer').addEventListener('click', closeComposer);

  // Copy message
  document.getElementById('copyMsgBtn').addEventListener('click', async () => {
    const text = document.getElementById('msgPreview').textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const fb = document.getElementById('copyFeedback');
    fb.style.display = 'block';
    setTimeout(() => { fb.style.display = 'none'; }, 3000);
  });
});
