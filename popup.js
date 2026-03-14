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

function birthdaysOnDate(contacts, date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return contacts.filter(c => {
    const p = parseBirthdate(c.birthdate);
    return p && p.month === m && p.day === d;
  });
}

function calcAge(year, onDate) {
  if (!year) return null;
  return onDate.getFullYear() - year;
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

function isSameDay(date, contact) {
  const p = parseBirthdate(contact.birthdate);
  if (!p) return false;
  return p.month === date.getMonth() + 1 && p.day === date.getDate();
}

// ── State ─────────────────────────────────────────────────────────────────────

let allContacts = [];
let allMessages = { english: [], afrikaans: [] };
let selectedMsgIndex = 0;
let composerContact  = null;

// ── Multi-day scroll ──────────────────────────────────────────────────────────

// Days to show: -1 (yesterday), 0 (today), +1 (tomorrow), +2 (day after)
const DAY_OFFSETS = [-1, 0, 1, 2];

function dayLabel(offset) {
  switch (offset) {
    case -1: return { text: 'Yesterday', cls: 'past' };
    case  0: return { text: 'Today',     cls: 'today' };
    case  1: return { text: 'Tomorrow',  cls: '' };
    case  2: return { text: 'Day After Tomorrow', cls: '' };
  }
}

function formatHeaderDate(date) {
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function renderDayScroll() {
  const container = document.getElementById('dayScroll');
  container.innerHTML = '';

  const base = new Date();

  DAY_OFFSETS.forEach(offset => {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);

    const birthdays = birthdaysOnDate(allContacts, date);
    const { text, cls } = dayLabel(offset);

    const section = document.createElement('div');
    section.className = 'day-section';
    if (offset === 0) section.id = 'dayToday';

    // Header
    const header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = `
      <span class="day-label ${cls}">${text}</span>
      <span class="day-date">${formatHeaderDate(date)}</span>
    `;
    section.appendChild(header);

    if (birthdays.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'day-empty';
      empty.textContent = 'No birthdays';
      section.appendChild(empty);
    } else {
      birthdays.forEach(contact => {
        section.appendChild(buildBirthdayItem(contact, date, offset));
      });
    }

    container.appendChild(section);
  });

  // Scroll Today into view (it's the second section)
  const todayEl = document.getElementById('dayToday');
  if (todayEl) {
    // Use scrollTop on the container so Yesterday is still reachable by scrolling up
    todayEl.scrollIntoView({ block: 'start' });
  }
}

function buildBirthdayItem(contact, date, offset) {
  const parsed = parseBirthdate(contact.birthdate);
  const age    = parsed ? calcAge(parsed.year, date) : null;

  const item = document.createElement('div');
  item.className = 'birthday-item';

  // Star toggle
  const starBtn = document.createElement('button');
  starBtn.className = 'star-btn';
  starBtn.title = contact.starred ? 'Remove VIP star' : 'Star to enable message copy';
  starBtn.textContent = contact.starred ? '⭐' : '☆';
  starBtn.addEventListener('click', async () => {
    await toggleStar(contact.id);
    const updated = allContacts.find(c => c.id === contact.id);
    if (updated && !updated.starred) closeComposer();
    renderDayScroll();
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
    const verb = offset < 0 ? 'Turned' : offset === 0 ? 'Turning' : 'Turns';
    ageEl.textContent = `${verb} ${age} ${offset === 0 ? 'today 🎂' : ''}`;
    info.appendChild(ageEl);
  }

  item.appendChild(starBtn);
  item.appendChild(info);

  // Copy message button — today's starred contacts only
  if (offset === 0 && contact.starred) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '📋 Copy Msg';
    copyBtn.title = 'Pick and copy a birthday message';
    copyBtn.addEventListener('click', () => openComposer(contact));
    item.appendChild(copyBtn);
  }

  return item;
}

// ── All Contacts list ─────────────────────────────────────────────────────────

function renderAllContacts(filter = '') {
  const list    = document.getElementById('allContactsList');
  const emptyEl = document.getElementById('noContacts');
  list.innerHTML = '';

  const today = new Date();
  const q = filter.toLowerCase();
  const filtered = q
    ? allContacts.filter(c => c.name.toLowerCase().includes(q))
    : [...allContacts];

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

    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn';
    starBtn.title = contact.starred ? 'Remove VIP star' : 'Star for birthday messages';
    starBtn.textContent = contact.starred ? '⭐' : '☆';
    starBtn.addEventListener('click', async () => {
      await toggleStar(contact.id);
      renderAllContacts(document.getElementById('searchInput').value);
    });

    const info = document.createElement('div');
    info.className = 'contact-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'contact-name';
    nameEl.textContent = contact.name;
    info.appendChild(nameEl);

    const dateEl = document.createElement('div');
    if (isSameDay(today, contact)) {
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
  composerContact  = contact;
  selectedMsgIndex = 0;
  document.getElementById('composerName').textContent = contact.name;
  document.getElementById('composer').style.display   = 'block';
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
    btn.addEventListener('click', () => { selectedMsgIndex = i; renderMsgList(); });
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
  document.getElementById('viewToday').style.display = view === 'today' ? 'block' : 'none';
  document.getElementById('viewAll').style.display   = view === 'all'   ? 'block' : 'none';
  document.getElementById('btnViewToday').classList.toggle('active', view === 'today');
  document.getElementById('btnViewAll').classList.toggle('active',   view === 'all');
  if (view === 'all') renderAllContacts(document.getElementById('searchInput').value);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['contacts', 'messages']);
  allContacts = data.contacts || [];
  allMessages = data.messages || { english: [], afrikaans: [] };

  // Clear the badge and dismiss notification as soon as popup opens
  chrome.action.setBadgeText({ text: '' });
  chrome.notifications.clear('birthday-notification');

  // Update today badge count on the tab button
  const todayCount = birthdaysOnDate(allContacts, new Date()).length;
  const badge = document.getElementById('todayBadge');
  if (todayCount > 0) {
    badge.textContent = todayCount;
    badge.style.display = 'inline-block';
  }

  renderDayScroll();

  // View toggle
  document.getElementById('btnViewToday').addEventListener('click', () => showView('today'));
  document.getElementById('btnViewAll').addEventListener('click',   () => showView('all'));

  // All contacts search
  document.getElementById('searchInput').addEventListener('input', e => {
    renderAllContacts(e.target.value);
  });

  // Settings / manage
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('manageBtn').addEventListener('click',   () => chrome.runtime.openOptionsPage());

  // Language selector
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
