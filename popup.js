// Birthday Buddy — Popup

// ── Constants ─────────────────────────────────────────────────────────────────
const BATCH_SIZE     = 14;
const INITIAL_PAST   = 3;
const INITIAL_FUTURE = 10;
const TONE_MEMORY    = 10;

// ── State ─────────────────────────────────────────────────────────────────────
let allContacts  = [];
let allMessages  = { english: [], afrikaans: [] };
let apiKey       = '';
let toneHistory  = [];

let startOffset     = -INITIAL_PAST;
let endOffset       = INITIAL_FUTURE;
let isLoadingTop    = false;
let isLoadingBottom = false;

let composerContact   = null;
let composerGenerated = '';
let selectedTplIndex  = 0;
let currentMainView   = 'today'; // 'today' | 'all'

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseBirthdate(bd) {
  if (!bd) return null;
  const p = bd.split('/');
  if (p.length < 3) return null;
  const yr = parseInt(p[0], 10), mo = parseInt(p[1], 10), dy = parseInt(p[2], 10);
  if (isNaN(mo) || isNaN(dy)) return null;
  return { year: isNaN(yr) ? null : yr, month: mo, day: dy };
}

function birthdaysOnDate(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  return allContacts.filter(c => {
    const p = parseBirthdate(c.birthdate);
    return p && p.month === m && p.day === d;
  });
}

function offsetToDate(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d;
}

function calcAge(year, date) { return year ? date.getFullYear() - year : null; }

function formatHeaderDate(date) {
  const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${D[date.getDay()]}, ${M[date.getMonth()]} ${date.getDate()}`;
}

function formatShortDate(bd) {
  if (!bd) return '';
  const p = bd.split('/');
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${M[parseInt(p[1],10)-1] || '?'} ${parseInt(p[2],10)}`;
}

function isTodayBirthday(c) {
  const t = new Date();
  return birthdaysOnDate(t).some(x => x.id === c.id);
}

// ── Infinite scroll ───────────────────────────────────────────────────────────
function buildDaySection(offset) {
  const date  = offsetToDate(offset);
  const bdays = birthdaysOnDate(date);

  const section = document.createElement('div');
  section.className = 'day-section';
  section.dataset.offset = offset;
  if (offset === 0) section.id = 'dayToday';

  let labelText, labelCls;
  if      (offset === -1) { labelText = 'Yesterday';       labelCls = 'past'; }
  else if (offset ===  0) { labelText = 'Today';           labelCls = 'today'; }
  else if (offset ===  1) { labelText = 'Tomorrow';        labelCls = ''; }
  else if (offset  >  1)  { labelText = `In ${offset} days`; labelCls = ''; }
  else                    { labelText = `${Math.abs(offset)} days ago`; labelCls = 'past'; }

  const header = document.createElement('div');
  header.className = 'day-header';
  header.innerHTML = `<span class="day-label ${labelCls}">${labelText}</span>
                      <span class="day-date">${formatHeaderDate(date)}</span>`;
  section.appendChild(header);

  if (bdays.length === 0) {
    const e = document.createElement('div');
    e.className = 'day-empty'; e.textContent = 'No birthdays';
    section.appendChild(e);
  } else {
    bdays.forEach(c => section.appendChild(buildBirthdayItem(c, date, offset)));
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
  starBtn.className   = 'star-btn';
  starBtn.title       = contact.starred ? 'Remove star' : 'Star to enable message copy';
  starBtn.textContent = contact.starred ? '⭐' : '☆';
  starBtn.addEventListener('click', async () => {
    await toggleStar(contact.id);
    refreshDaySection(offset);
    // if unstarred while composer is open for this person, close it
    const still = allContacts.find(c => c.id === contact.id);
    if (composerContact?.id === contact.id && !still?.starred) closeComposer();
  });

  // Info
  const info   = document.createElement('div'); info.className = 'birthday-info';
  const nameEl = document.createElement('div'); nameEl.className = 'birthday-name';
  nameEl.textContent = contact.name;
  info.appendChild(nameEl);
  if (age !== null) {
    const ageEl = document.createElement('div'); ageEl.className = 'birthday-age';
    const verb = offset < 0 ? 'Turned' : offset === 0 ? 'Turning' : 'Turns';
    ageEl.textContent = `${verb} ${age}${offset === 0 ? ' today 🎂' : ''}`;
    info.appendChild(ageEl);
  }

  item.appendChild(starBtn);
  item.appendChild(info);

  // Message button — all of today's birthdays
  if (offset === 0) {
    const btn = document.createElement('button');
    btn.className   = 'msg-open-btn';
    btn.textContent = '✉️ Write Message';
    btn.addEventListener('click', () => openComposer(contact));
    item.appendChild(btn);
  }

  return item;
}

function refreshDaySection(offset) {
  const scroll = document.getElementById('dayScroll');
  const old    = scroll.querySelector(`.day-section[data-offset="${offset}"]`);
  if (old) scroll.replaceChild(buildDaySection(offset), old);
}

function initInfiniteScroll() {
  const scroll  = document.getElementById('dayScroll');
  const topEl   = document.getElementById('topSentinel');
  const bottomEl= document.getElementById('bottomSentinel');

  const frag = document.createDocumentFragment();
  for (let i = startOffset; i <= endOffset; i++) frag.appendChild(buildDaySection(i));
  scroll.insertBefore(frag, bottomEl);

  requestAnimationFrame(() => {
    const today = document.getElementById('dayToday');
    if (today) scroll.scrollTop = today.offsetTop - 4;
  });

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      if (e.target === topEl    && !isLoadingTop)    loadMore('top',    scroll, topEl, bottomEl);
      if (e.target === bottomEl && !isLoadingBottom) loadMore('bottom', scroll, topEl, bottomEl);
    });
  }, { root: scroll, rootMargin: '80px', threshold: 0 });

  obs.observe(topEl);
  obs.observe(bottomEl);
}

function loadMore(dir, scroll, topEl, bottomEl) {
  if (dir === 'top') {
    isLoadingTop = true;
    const prevH = scroll.scrollHeight, prevT = scroll.scrollTop;
    const frag  = document.createDocumentFragment();
    for (let i = startOffset - BATCH_SIZE; i < startOffset; i++) frag.appendChild(buildDaySection(i));
    startOffset -= BATCH_SIZE;
    scroll.insertBefore(frag, topEl.nextSibling);
    scroll.scrollTop = prevT + (scroll.scrollHeight - prevH);
    isLoadingTop = false;
  } else {
    isLoadingBottom = true;
    const frag = document.createDocumentFragment();
    for (let i = endOffset + 1; i <= endOffset + BATCH_SIZE; i++) frag.appendChild(buildDaySection(i));
    endOffset += BATCH_SIZE;
    scroll.insertBefore(frag, bottomEl);
    isLoadingBottom = false;
  }
}

// ── Star toggle ───────────────────────────────────────────────────────────────
async function toggleStar(id) {
  const i = allContacts.findIndex(c => c.id === id);
  if (i === -1) return;
  allContacts[i].starred = !allContacts[i].starred;
  await chrome.storage.local.set({ contacts: allContacts });
}

// ── Panel switching ───────────────────────────────────────────────────────────
function showBirthdayPanel() {
  document.getElementById('birthdayPanel').style.display  = 'block';
  document.getElementById('composerPanel').style.display  = 'none';
  document.getElementById('viewToggle').style.display     = 'flex';
}

function showComposerPanel() {
  document.getElementById('birthdayPanel').style.display  = 'none';
  document.getElementById('composerPanel').style.display  = 'flex';
  document.getElementById('viewToggle').style.display     = 'none';
}

// ── Main view (today scroll vs all contacts) ──────────────────────────────────
function showMainView(view) {
  currentMainView = view;
  document.getElementById('dayScroll').style.display         = view === 'today' ? 'block' : 'none';
  document.getElementById('allContactsPanel').style.display  = view === 'all'   ? 'block' : 'none';
  document.getElementById('btnViewToday').classList.toggle('active', view === 'today');
  document.getElementById('btnViewAll').classList.toggle('active',   view === 'all');
  if (view === 'all') renderAllContacts(document.getElementById('searchInput').value);
}

// ── All Contacts ──────────────────────────────────────────────────────────────
function renderAllContacts(filter = '') {
  const list  = document.getElementById('allContactsList');
  const empty = document.getElementById('noContacts');
  list.innerHTML = '';

  const q = filter.toLowerCase();
  const filtered = q ? allContacts.filter(c => c.name.toLowerCase().includes(q)) : [...allContacts];
  filtered.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  if (!filtered.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  filtered.forEach(contact => {
    const item    = document.createElement('div'); item.className = 'contact-item';
    const starBtn = document.createElement('button'); starBtn.className = 'star-btn';
    starBtn.title       = contact.starred ? 'Remove star' : 'Star for birthday messages';
    starBtn.textContent = contact.starred ? '⭐' : '☆';
    starBtn.addEventListener('click', async () => {
      await toggleStar(contact.id);
      renderAllContacts(document.getElementById('searchInput').value);
    });

    const info   = document.createElement('div'); info.className = 'contact-info';
    const nameEl = document.createElement('div'); nameEl.className = 'contact-name';
    nameEl.textContent = contact.name;
    info.appendChild(nameEl);

    const dateEl = document.createElement('div');
    if (isTodayBirthday(contact)) {
      dateEl.className = 'contact-bday-today'; dateEl.textContent = '🎂 Birthday today!';
    } else {
      dateEl.className = 'contact-date'; dateEl.textContent = formatShortDate(contact.birthdate);
    }
    info.appendChild(dateEl);

    item.appendChild(starBtn); item.appendChild(info);
    list.appendChild(item);
  });
}

// ── Message Composer ──────────────────────────────────────────────────────────
async function openComposer(contact) {
  composerContact   = contact;
  composerGenerated = '';
  selectedTplIndex  = 0;

  document.getElementById('composerName').textContent       = contact.name;
  document.getElementById('copyFeedback').style.display     = 'none';
  document.getElementById('aiError').style.display          = 'none';
  document.getElementById('aiMessageWrap').style.display    = 'none';
  document.getElementById('aiSpinner').style.display        = 'none';

  showComposerPanel();

  if (apiKey) {
    document.getElementById('aiSection').style.display       = 'block';
    document.getElementById('templateSection').style.display = 'none';
    updateToneNote();
    await triggerGenerate();
  } else {
    document.getElementById('aiSection').style.display       = 'none';
    document.getElementById('templateSection').style.display = 'block';
    renderTemplateList();
  }
}

function closeComposer() {
  composerContact = null;
  showBirthdayPanel();
}

async function triggerGenerate() {
  const spinner  = document.getElementById('aiSpinner');
  const wrap     = document.getElementById('aiMessageWrap');
  const errEl    = document.getElementById('aiError');
  const regenBtn = document.getElementById('regenBtn');
  const copyBtn  = document.getElementById('copyAiBtn');

  spinner.style.display = 'flex';
  wrap.style.display    = 'none';
  errEl.style.display   = 'none';
  regenBtn.disabled = copyBtn.disabled = true;

  try {
    const msg = await generateAIMessage(composerContact.name);
    composerGenerated = msg;
    document.getElementById('aiMessage').value = msg;
    wrap.style.display = 'block';
  } catch (err) {
    errEl.textContent = err.message === 'NO_API_KEY'
      ? '⚠ No API key set. Go to Settings → 🔑 API Key.'
      : `⚠ ${err.message}`;
    errEl.style.display = 'block';
    wrap.style.display  = 'block';
  } finally {
    spinner.style.display = 'none';
    regenBtn.disabled = copyBtn.disabled = false;
  }
}

function updateToneNote() {
  const note = document.getElementById('toneNote');
  const n    = toneHistory.length;
  if (n === 0) {
    note.textContent = '✨ First message — copy and save a few to start teaching the AI your style.';
  } else {
    note.textContent = `🧠 Learning from your last ${n} saved message${n === 1 ? '' : 's'}.`;
  }
}

function renderTemplateList() {
  if (!composerContact) return;
  const lang  = document.getElementById('msgLang').value;
  const tmpls = allMessages[lang] || [];
  const list  = document.getElementById('msgList');
  list.innerHTML = '';
  tmpls.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className   = 'msg-option' + (i === selectedTplIndex ? ' selected' : '');
    btn.textContent = t.replace(/\{name\}/g, composerContact.name);
    btn.addEventListener('click', () => { selectedTplIndex = i; renderTemplateList(); });
    list.appendChild(btn);
  });
  const preview = document.getElementById('msgPreview');
  if (preview) preview.textContent = (tmpls[selectedTplIndex] || '').replace(/\{name\}/g, composerContact.name);
}

// ── AI generation ─────────────────────────────────────────────────────────────
async function generateAIMessage(name) {
  if (!apiKey) throw new Error('NO_API_KEY');

  const examples = [...toneHistory].reverse().slice(0, TONE_MEMORY);

  let prompt = `Skryf 'n verjaardagboodskap in Afrikaans met emojis vir ${name}.`;
  if (examples.length > 0) {
    prompt += '\n\nHier is voorbeelde van verjaardagboodskappe wat ek voorheen gestuur het — leer my toon en styl:';
    examples.forEach((ex, i) => { prompt += `\n${i + 1}. "${ex.sent}"`; });
    prompt += `\n\nSkryf nou 'n nuwe boodskap vir ${name} in my styl.`;
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
      system: "Jy skryf verjaardagboodskappe in Afrikaans. Hou dit warm, opreg en persoonlik — 2 tot 3 sinne. Gebruik gepaste emojis. Gee slegs die boodskapsteks terug, niks anders nie.",
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API fout ${resp.status}`);
  }
  const data = await resp.json();
  return data.content[0].text.trim();
}

async function saveToneEdit(generated, sent) {
  toneHistory.push({ generated, sent, timestamp: Date.now() });
  if (toneHistory.length > TONE_MEMORY) toneHistory = toneHistory.slice(-TONE_MEMORY);
  await chrome.storage.local.set({ toneHistory });
}

// ── Clipboard helper ──────────────────────────────────────────────────────────
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function showCopyFeedback() {
  const fb = document.getElementById('copyFeedback');
  fb.style.display = 'block';
  setTimeout(() => { fb.style.display = 'none'; }, 3500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const data  = await chrome.storage.local.get(['contacts', 'messages', 'apiKey', 'toneHistory']);
  allContacts = data.contacts    || [];
  allMessages = data.messages    || { english: [], afrikaans: [] };
  apiKey      = data.apiKey      || '';
  toneHistory = data.toneHistory || [];

  // Clear badge + notification as soon as popup opens
  chrome.action.setBadgeText({ text: '' });
  chrome.notifications.clear('birthday-notification');

  // Today count on tab button
  const todayCount = birthdaysOnDate(new Date()).length;
  if (todayCount > 0) {
    const badge = document.getElementById('todayBadge');
    badge.textContent = todayCount; badge.style.display = 'inline-block';
  }

  initInfiniteScroll();

  // View toggle
  document.getElementById('btnViewToday').addEventListener('click', () => showMainView('today'));
  document.getElementById('btnViewAll').addEventListener('click',   () => showMainView('all'));

  // All contacts search
  document.getElementById('searchInput').addEventListener('input', e => renderAllContacts(e.target.value));

  // Back button in composer
  document.getElementById('backBtn').addEventListener('click', closeComposer);

  // Regenerate
  document.getElementById('regenBtn').addEventListener('click', triggerGenerate);

  // Copy AI message
  document.getElementById('copyAiBtn').addEventListener('click', async () => {
    const text = document.getElementById('aiMessage').value.trim();
    if (!text) return;
    await copyToClipboard(text);
    await saveToneEdit(composerGenerated, text);
    showCopyFeedback();
    updateToneNote();
  });

  // Template language change
  document.getElementById('msgLang').addEventListener('change', () => { selectedTplIndex = 0; renderTemplateList(); });

  // Copy template message
  document.getElementById('copyTplBtn').addEventListener('click', async () => {
    const text = document.getElementById('msgPreview')?.textContent;
    if (!text) return;
    await copyToClipboard(text);
    showCopyFeedback();
  });

  // API key shortcut link
  document.getElementById('goToApiKey').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Settings / manage
  document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('manageBtn').addEventListener('click',   () => chrome.runtime.openOptionsPage());
});
