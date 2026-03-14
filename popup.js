// Birthday Buddy - Popup Script

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE  = 14;  // days loaded per scroll batch
const INITIAL_PAST   = 3;   // days before today on first load
const INITIAL_FUTURE = 10;  // days after today on first load
const TONE_MEMORY = 10;     // how many past sent messages to feed to AI

// ── State ─────────────────────────────────────────────────────────────────────

let allContacts  = [];
let allMessages  = { english: [], afrikaans: [] };
let apiKey       = '';
let toneHistory  = [];  // [{ generated, sent, timestamp }]

// Infinite scroll range (offsets from today)
let startOffset = -INITIAL_PAST;
let endOffset   = INITIAL_FUTURE;
let isLoadingTop    = false;
let isLoadingBottom = false;

// Composer state
let composerContact   = null;
let composerGenerated = '';  // original AI output before user edits
let selectedTplIndex  = 0;

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseBirthdate(birthdate) {
  if (!birthdate) return null;
  const p = birthdate.split('/');
  if (p.length < 3) return null;
  const year = parseInt(p[0], 10), month = parseInt(p[1], 10), day = parseInt(p[2], 10);
  if (isNaN(month) || isNaN(day)) return null;
  return { year: isNaN(year) ? null : year, month, day };
}

function birthdaysOnDate(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  return allContacts.filter(c => {
    const p = parseBirthdate(c.birthdate);
    return p && p.month === m && p.day === d;
  });
}

function calcAge(year, onDate) {
  return year ? onDate.getFullYear() - year : null;
}

function offsetToDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function formatHeaderDate(date) {
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatShortDate(birthdate) {
  if (!birthdate) return '';
  const p = birthdate.split('/');
  if (p.length < 3) return birthdate;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(p[1], 10) - 1] || '?'} ${parseInt(p[2], 10)}`;
}

function isTodayBirthday(contact) {
  const today = new Date();
  return birthdaysOnDate(today).some(c => c.id === contact.id);
}

// ── Day section builder ────────────────────────────────────────────────────────

function buildDaySection(offset) {
  const date  = offsetToDate(offset);
  const bdays = birthdaysOnDate(date);

  const section = document.createElement('div');
  section.className = 'day-section';
  section.dataset.offset = offset;
  if (offset === 0) section.id = 'dayToday';

  // Header
  let labelText, labelCls;
  if (offset === -1)     { labelText = 'Yesterday'; labelCls = 'past'; }
  else if (offset === 0) { labelText = 'Today';     labelCls = 'today'; }
  else if (offset === 1) { labelText = 'Tomorrow';  labelCls = ''; }
  else if (offset > 1)   { labelText = `+${offset} days`; labelCls = ''; }
  else                   { labelText = `${Math.abs(offset)} days ago`; labelCls = 'past'; }

  const header = document.createElement('div');
  header.className = 'day-header';
  header.innerHTML = `<span class="day-label ${labelCls}">${labelText}</span>
                      <span class="day-date">${formatHeaderDate(date)}</span>`;
  section.appendChild(header);

  if (bdays.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'day-empty';
    empty.textContent = 'No birthdays';
    section.appendChild(empty);
  } else {
    bdays.forEach(contact => section.appendChild(buildBirthdayItem(contact, date, offset)));
  }

  return section;
}

function buildBirthdayItem(contact, date, offset) {
  const parsed = parseBirthdate(contact.birthdate);
  const age    = parsed ? calcAge(parsed.year, date) : null;

  const item = document.createElement('div');
  item.className = 'birthday-item';
  item.dataset.contactId = contact.id;

  // Star button
  const starBtn = document.createElement('button');
  starBtn.className = 'star-btn';
  starBtn.title = contact.starred ? 'Remove star' : 'Star to enable message copy';
  starBtn.textContent = contact.starred ? '⭐' : '☆';
  starBtn.addEventListener('click', async () => {
    await toggleStar(contact.id);
    refreshDaySection(offset);
    if (!allContacts.find(c => c.id === contact.id)?.starred) closeComposer();
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
    ageEl.textContent = `${verb} ${age}${offset === 0 ? ' today 🎂' : ''}`;
    info.appendChild(ageEl);
  }

  item.appendChild(starBtn);
  item.appendChild(info);

  // Copy message button: only for today's starred contacts
  if (offset === 0 && contact.starred) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '📋 Copy Msg';
    btn.addEventListener('click', () => openComposer(contact));
    item.appendChild(btn);
  }

  return item;
}

// Re-render a single day's section without disturbing scroll position
function refreshDaySection(offset) {
  const scroll   = document.getElementById('dayScroll');
  const existing = scroll.querySelector(`.day-section[data-offset="${offset}"]`);
  if (!existing) return;
  const fresh = buildDaySection(offset);
  scroll.replaceChild(fresh, existing);
}

// ── Infinite scroll ───────────────────────────────────────────────────────────

function initInfiniteScroll() {
  const scroll = document.getElementById('dayScroll');
  const top    = document.getElementById('topSentinel');
  const bottom = document.getElementById('bottomSentinel');

  // Render initial batch
  const frag = document.createDocumentFragment();
  for (let i = startOffset; i <= endOffset; i++) {
    frag.appendChild(buildDaySection(i));
  }
  // Insert between sentinels
  scroll.insertBefore(frag, bottom);

  // Scroll Today into view (offset 0 section)
  requestAnimationFrame(() => {
    const todayEl = document.getElementById('dayToday');
    if (todayEl) scroll.scrollTop = todayEl.offsetTop - 4;
  });

  // Observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      if (entry.target === top    && !isLoadingTop)    loadMoreDays('top',    scroll, top, bottom);
      if (entry.target === bottom && !isLoadingBottom) loadMoreDays('bottom', scroll, top, bottom);
    });
  }, { root: scroll, rootMargin: '80px', threshold: 0 });

  observer.observe(top);
  observer.observe(bottom);
}

function loadMoreDays(direction, scroll, top, bottom) {
  if (direction === 'top') {
    isLoadingTop = true;
    const prevHeight = scroll.scrollHeight;
    const prevTop    = scroll.scrollTop;

    const frag = document.createDocumentFragment();
    for (let i = startOffset - BATCH_SIZE; i < startOffset; i++) {
      frag.appendChild(buildDaySection(i));
    }
    startOffset -= BATCH_SIZE;
    scroll.insertBefore(frag, top.nextSibling);

    // Restore scroll position so the view doesn't jump
    scroll.scrollTop = prevTop + (scroll.scrollHeight - prevHeight);
    isLoadingTop = false;
  } else {
    isLoadingBottom = true;
    const frag = document.createDocumentFragment();
    for (let i = endOffset + 1; i <= endOffset + BATCH_SIZE; i++) {
      frag.appendChild(buildDaySection(i));
    }
    endOffset += BATCH_SIZE;
    scroll.insertBefore(frag, bottom);
    isLoadingBottom = false;
  }
}

// ── Star toggle ───────────────────────────────────────────────────────────────

async function toggleStar(contactId) {
  const idx = allContacts.findIndex(c => c.id === contactId);
  if (idx === -1) return;
  allContacts[idx].starred = !allContacts[idx].starred;
  await chrome.storage.local.set({ contacts: allContacts });
}

// ── AI message generation ─────────────────────────────────────────────────────

async function generateAIMessage(name) {
  if (!apiKey) throw new Error('NO_API_KEY');

  // Build style examples from tone history (most recent first)
  const examples = [...toneHistory].reverse().slice(0, TONE_MEMORY);

  let userContent = `Skryf 'n verjaardagboodskap in Afrikaans met emojis vir ${name}.`;

  if (examples.length > 0) {
    userContent += '\n\nHier is voorbeelde van verjaardagboodskappe wat ek voorheen gestuur het — leer my toon en styl:';
    examples.forEach((ex, i) => {
      userContent += `\n${i + 1}. "${ex.sent}"`;
    });
    userContent += `\n\nSkryf nou 'n nuwe boodskap vir ${name} in my styl.`;
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system: 'Jy is \'n verjaardagboodskap-skrywer. Skryf warm, persoonlike verjaardagboodskappe in Afrikaans met relevante emojis. Hou boodskappe tot 2-3 sinne. Wees opreg en hartlik. Gee net die boodskapsteks terug, niks anders nie.',
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
  return data.content[0].text.trim();
}

async function saveToneEdit(generated, sent) {
  // Save whether edited or not — both contribute to tone profile
  toneHistory.push({ generated, sent, timestamp: Date.now() });
  // Keep last 10
  if (toneHistory.length > TONE_MEMORY) toneHistory = toneHistory.slice(-TONE_MEMORY);
  await chrome.storage.local.set({ toneHistory });
}

// ── Message Composer ──────────────────────────────────────────────────────────

async function openComposer(contact) {
  composerContact   = contact;
  composerGenerated = '';
  selectedTplIndex  = 0;

  document.getElementById('composerName').textContent    = contact.name;
  document.getElementById('composer').style.display      = 'block';
  document.getElementById('copyFeedback').style.display  = 'none';
  document.getElementById('aiError').style.display       = 'none';

  if (apiKey) {
    // Show AI section
    document.getElementById('aiSection').style.display       = 'block';
    document.getElementById('templateSection').style.display = 'none';
    await triggerGenerate();
  } else {
    // Show template fallback
    document.getElementById('aiSection').style.display       = 'none';
    document.getElementById('templateSection').style.display = 'block';
    renderTemplateList();
  }
}

async function triggerGenerate() {
  const spinner  = document.getElementById('aiSpinner');
  const textarea = document.getElementById('aiMessage');
  const errEl    = document.getElementById('aiError');
  const regenBtn = document.getElementById('regenBtn');
  const copyBtn  = document.getElementById('copyAiBtn');

  spinner.style.display  = 'flex';
  textarea.style.display = 'none';
  errEl.style.display    = 'none';
  regenBtn.disabled = true;
  copyBtn.disabled  = true;

  try {
    const msg = await generateAIMessage(composerContact.name);
    composerGenerated    = msg;
    textarea.value       = msg;
    textarea.style.display = 'block';
  } catch (err) {
    errEl.textContent   = err.message === 'NO_API_KEY'
      ? '⚠ No API key set. Go to Settings → API Key.'
      : `⚠ ${err.message}`;
    errEl.style.display = 'block';
    textarea.style.display = 'block';
  } finally {
    spinner.style.display = 'none';
    regenBtn.disabled = false;
    copyBtn.disabled  = false;
  }
}

function closeComposer() {
  document.getElementById('composer').style.display     = 'none';
  document.getElementById('copyFeedback').style.display = 'none';
  composerContact = null;
}

// Template fallback rendering
function renderTemplateList() {
  if (!composerContact) return;
  const lang      = document.getElementById('msgLang').value;
  const templates = allMessages[lang] || [];
  const list      = document.getElementById('msgList');
  list.innerHTML  = '';

  templates.forEach((tmpl, i) => {
    const btn = document.createElement('button');
    btn.className   = 'msg-option' + (i === selectedTplIndex ? ' selected' : '');
    btn.textContent = tmpl.replace(/\{name\}/g, composerContact.name);
    btn.addEventListener('click', () => { selectedTplIndex = i; renderTemplateList(); });
    list.appendChild(btn);
  });

  const tpl     = templates[selectedTplIndex] || '';
  const preview = document.getElementById('msgPreview');
  if (preview) preview.textContent = tpl.replace(/\{name\}/g, composerContact.name);
}

// ── All Contacts view ─────────────────────────────────────────────────────────

function renderAllContacts(filter = '') {
  const list    = document.getElementById('allContactsList');
  const emptyEl = document.getElementById('noContacts');
  list.innerHTML = '';

  const q        = filter.toLowerCase();
  const filtered = q
    ? allContacts.filter(c => c.name.toLowerCase().includes(q))
    : [...allContacts];

  filtered.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  if (filtered.length === 0) { emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  filtered.forEach(contact => {
    const item = document.createElement('div');
    item.className = 'contact-item';

    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn';
    starBtn.title     = contact.starred ? 'Remove star' : 'Star for message copy';
    starBtn.textContent = contact.starred ? '⭐' : '☆';
    starBtn.addEventListener('click', async () => {
      await toggleStar(contact.id);
      renderAllContacts(document.getElementById('searchInput').value);
    });

    const info   = document.createElement('div');
    info.className = 'contact-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'contact-name';
    nameEl.textContent = contact.name;
    info.appendChild(nameEl);

    const dateEl = document.createElement('div');
    if (isTodayBirthday(contact)) {
      dateEl.className   = 'contact-bday-today';
      dateEl.textContent = '🎂 Birthday today!';
    } else {
      dateEl.className   = 'contact-date';
      dateEl.textContent = formatShortDate(contact.birthdate);
    }
    info.appendChild(dateEl);

    item.appendChild(starBtn);
    item.appendChild(info);
    list.appendChild(item);
  });
}

// ── View switching ─────────────────────────────────────────────────────────────

function showView(view) {
  document.getElementById('viewToday').style.display = view === 'today' ? 'block' : 'none';
  document.getElementById('viewAll').style.display   = view === 'all'   ? 'block' : 'none';
  document.getElementById('btnViewToday').classList.toggle('active', view === 'today');
  document.getElementById('btnViewAll').classList.toggle('active',   view === 'all');
  if (view === 'all') renderAllContacts(document.getElementById('searchInput').value);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['contacts', 'messages', 'apiKey', 'toneHistory']);
  allContacts  = data.contacts    || [];
  allMessages  = data.messages    || { english: [], afrikaans: [] };
  apiKey       = data.apiKey      || '';
  toneHistory  = data.toneHistory || [];

  // Clear badge and notification on popup open
  chrome.action.setBadgeText({ text: '' });
  chrome.notifications.clear('birthday-notification');

  // Today badge on the tab button
  const todayCount = birthdaysOnDate(new Date()).length;
  if (todayCount > 0) {
    const badge = document.getElementById('todayBadge');
    badge.textContent    = todayCount;
    badge.style.display  = 'inline-block';
  }

  initInfiniteScroll();

  // View toggle
  document.getElementById('btnViewToday').addEventListener('click', () => showView('today'));
  document.getElementById('btnViewAll').addEventListener('click',   () => showView('all'));

  // Search
  document.getElementById('searchInput').addEventListener('input', e => renderAllContacts(e.target.value));

  // Settings buttons
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('manageBtn').addEventListener('click',   () => chrome.runtime.openOptionsPage());

  // Close composer
  document.getElementById('closeComposer').addEventListener('click', closeComposer);

  // Regenerate AI message
  document.getElementById('regenBtn').addEventListener('click', triggerGenerate);

  // Copy AI message & save to tone history
  document.getElementById('copyAiBtn').addEventListener('click', async () => {
    const textarea = document.getElementById('aiMessage');
    const text = textarea.value.trim();
    if (!text) return;
    await copyToClipboard(text);
    await saveToneEdit(composerGenerated, text);
    showCopyFeedback();
  });

  // Template language selector
  document.getElementById('msgLang').addEventListener('change', () => {
    selectedTplIndex = 0;
    renderTemplateList();
  });

  // Copy template message
  document.getElementById('copyTplBtn').addEventListener('click', async () => {
    const preview = document.getElementById('msgPreview');
    if (!preview?.textContent) return;
    await copyToClipboard(preview.textContent);
    showCopyFeedback();
  });

  // "Add API key" shortcut from template fallback hint
  document.getElementById('goToApiKey').addEventListener('click', () => chrome.runtime.openOptionsPage());
});

// ── Utilities ─────────────────────────────────────────────────────────────────

async function copyToClipboard(text) {
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
}

function showCopyFeedback() {
  const fb = document.getElementById('copyFeedback');
  fb.style.display = 'block';
  setTimeout(() => { fb.style.display = 'none'; }, 3000);
}
