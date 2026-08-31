// Birthday Buddy — Options / Settings Page

// ── State ────────────────────────────────────────────────────────────────────

let allContacts = [];
let allMessages = { english: [], afrikaans: [] };
let csvParsed   = [];
let activeLang  = 'english';

// ── Storage helpers ───────────────────────────────────────────────────────────

async function loadData() {
  const data = await chrome.storage.local.get(['contacts', 'messages']);
  allContacts = data.contacts || [];
  allMessages = data.messages || { english: [], afrikaans: [] };
}

async function saveContacts() {
  await chrome.storage.local.set({ contacts: allContacts });
  chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
}

async function saveMessages() {
  await chrome.storage.local.set({ messages: allMessages });
}

// ── ID generation ─────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// Converts a <input type="date"> value (YYYY-MM-DD) → stored format YYYY/MM/DD
function inputDateToStored(val) {
  return val.replace(/-/g, '/');
}

// Converts stored format YYYY/MM/DD → input value YYYY-MM-DD
function storedToInputDate(val) {
  return val ? val.replace(/\//g, '-') : '';
}

function formatDisplayDate(birthdate) {
  if (!birthdate) return '—';
  const parts = birthdate.split('/');
  if (parts.length < 3) return birthdate;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const y = parts[0];
  return `${months[m] || '?'} ${d}, ${y}`;
}

// Days until next birthday (0 = today)
function daysUntilBirthday(birthdate) {
  if (!birthdate) return null;
  const parts = birthdate.split('/');
  if (parts.length < 3) return null;
  const month = parseInt(parts[1], 10) - 1;
  const day   = parseInt(parts[2], 10);
  const today = new Date();
  const bday  = new Date(today.getFullYear(), month, day);
  if (bday < today) bday.setFullYear(today.getFullYear() + 1);
  const diff = Math.round((bday - today) / 86400000);
  return diff;
}

// ── CSV Parsing ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const results = [];
  const errors  = [];

  lines.forEach((line, idx) => {
    // Handle quoted fields (e.g. "Smith, John",1991/03/25)
    const cols = [];
    let inQuote = false, current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    cols.push(current.trim());

    const name      = cols[0] ? cols[0].replace(/^"|"$/g, '').trim() : '';
    const birthdate = cols[1] ? cols[1].replace(/^"|"$/g, '').trim() : '';
    const starredRaw = cols[2] ? cols[2].replace(/^"|"$/g, '').trim().toLowerCase() : '';
    const starred    = ['true', '1', 'yes'].includes(starredRaw);

    if (!name) {
      errors.push(`Row ${idx + 1}: missing name`);
      return;
    }

    // Validate and normalise date: accept YYYY/MM/DD or YYYY-MM-DD
    const normalised = birthdate.replace(/-/g, '/');
    const dateRx     = /^\d{4}\/\d{2}\/\d{2}$/;
    if (!dateRx.test(normalised)) {
      errors.push(`Row ${idx + 1}: invalid date "${birthdate}" for "${name}" — expected YYYY/MM/DD`);
      results.push({ name, birthdate: '', error: true });
      return;
    }

    results.push({ name, birthdate: normalised, starred });
  });

  return { results, errors };
}

// ── CSV Export (backup) ──────────────────────────────────────────────────────

function csvEscape(field) {
  const str = String(field);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportContactsToCSV() {
  const rows = allContacts.map(c =>
    [csvEscape(c.name), csvEscape(c.birthdate), c.starred ? 'TRUE' : 'FALSE'].join(',')
  );
  const csv  = rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `birthday-buddy-backup-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initExportButton() {
  const btn = document.getElementById('exportBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (allContacts.length === 0) {
      alert('No contacts to export yet.');
      return;
    }
    exportContactsToCSV();
  });
}

// ── CSV Import Tab ────────────────────────────────────────────────────────────

function initImportTab() {
  const fileInput   = document.getElementById('csvFile');
  const fileNameEl  = document.getElementById('csvFileName');
  const importBtn   = document.getElementById('importBtn');
  const previewDiv  = document.getElementById('csvPreview');
  const previewList = document.getElementById('csvPreviewList');
  const countEl     = document.getElementById('csvPreviewCount');
  const feedbackEl  = document.getElementById('importFeedback');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileNameEl.textContent = file.name;

    const reader = new FileReader();
    reader.onload = e => {
      const { results, errors } = parseCSV(e.target.result);
      csvParsed = results;

      // Render preview
      previewList.innerHTML = '';
      results.forEach(r => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `<span>${r.name}</span>
          ${r.error
            ? `<span class="preview-error">⚠ Invalid date</span>`
            : `<span class="preview-date">${r.birthdate}</span>`
          }`;
        previewList.appendChild(div);
      });

      const validCount = results.filter(r => !r.error).length;
      countEl.textContent = `(${validCount} valid / ${results.length} rows)`;
      previewDiv.style.display = 'block';
      importBtn.disabled = validCount === 0;

      if (errors.length > 0) {
        showFeedback(feedbackEl, `⚠ ${errors.length} row(s) had errors and will be skipped.`, 'error');
      } else {
        feedbackEl.style.display = 'none';
      }
    };
    reader.readAsText(file);
  });

  importBtn.addEventListener('click', async () => {
    const valid = csvParsed.filter(r => !r.error);
    let added = 0, skipped = 0;

    valid.forEach(row => {
      const exists = allContacts.some(
        c => c.name.toLowerCase() === row.name.toLowerCase() &&
             c.birthdate === row.birthdate
      );
      if (exists) { skipped++; return; }
      allContacts.push({ id: generateId(), name: row.name, birthdate: row.birthdate, starred: !!row.starred });
      added++;
    });

    await saveContacts();
    showFeedback(feedbackEl,
      `✅ Imported ${added} contact(s). ${skipped > 0 ? `${skipped} duplicate(s) skipped.` : ''}`,
      'success'
    );
    csvParsed = [];
    previewDiv.style.display = 'none';
    fileNameEl.textContent = 'No file chosen';
    fileInput.value = '';
    importBtn.disabled = true;
    renderContactList();
    updateContactCount();
  });
}

// ── Add Birthday Tab ──────────────────────────────────────────────────────────

function initAddTab() {
  const nameInput    = document.getElementById('addName');
  const dateInput    = document.getElementById('addDate');
  const starredInput = document.getElementById('addStarred');
  const addBtn       = document.getElementById('addBtn');
  const feedbackEl   = document.getElementById('addFeedback');

  addBtn.addEventListener('click', async () => {
    const name     = nameInput.value.trim();
    const dateVal  = dateInput.value; // YYYY-MM-DD from <input type="date">
    const starred  = starredInput.checked;

    if (!name) {
      showFeedback(feedbackEl, '⚠ Please enter a name.', 'error');
      nameInput.focus();
      return;
    }
    if (!dateVal) {
      showFeedback(feedbackEl, '⚠ Please select a birthdate.', 'error');
      dateInput.focus();
      return;
    }

    const birthdate = inputDateToStored(dateVal); // → YYYY/MM/DD

    allContacts.push({ id: generateId(), name, birthdate, starred });
    await saveContacts();

    nameInput.value  = '';
    dateInput.value  = '';
    starredInput.checked = false;

    showFeedback(feedbackEl, `✅ ${name} added!`, 'success');
    renderContactList();
    updateContactCount();
  });
}

// ── Contacts Tab ──────────────────────────────────────────────────────────────

function renderContactList(filter = '') {
  const list       = document.getElementById('contactList');
  const emptyEl    = document.getElementById('noContacts');
  const editForm   = document.getElementById('editForm');

  list.innerHTML = '';
  editForm.style.display = 'none';

  const q = filter.toLowerCase();
  const filtered = q
    ? allContacts.filter(c => c.name.toLowerCase().includes(q))
    : [...allContacts];

  // Sort: today's birthdays first, then by upcoming days
  filtered.sort((a, b) => {
    const da = daysUntilBirthday(a.birthdate) ?? 999;
    const db = daysUntilBirthday(b.birthdate) ?? 999;
    return da - db;
  });

  if (filtered.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  filtered.forEach(contact => {
    const days = daysUntilBirthday(contact.birthdate);
    const card = document.createElement('div');
    card.className = 'contact-card';

    let badge = '';
    if (days === 0)      badge = '<div class="contact-bday-soon">🎂 Birthday today!</div>';
    else if (days === 1) badge = '<div class="contact-bday-soon">🎈 Birthday tomorrow!</div>';
    else if (days <= 7)  badge = `<div class="contact-bday-soon">🎈 Birthday in ${days} days</div>`;

    card.innerHTML = `
      <span class="contact-star">${contact.starred ? '⭐' : '☆'}</span>
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(contact.name)}</div>
        <div class="contact-date">${formatDisplayDate(contact.birthdate)}</div>
        ${badge}
      </div>
      <div class="contact-actions">
        <button class="action-btn edit-btn" data-id="${contact.id}">✏️ Edit</button>
        <button class="action-btn delete action-btn-delete" data-id="${contact.id}">🗑 Delete</button>
      </div>
    `;
    list.appendChild(card);
  });

  // Bind edit buttons
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });

  // Bind delete buttons
  list.querySelectorAll('.action-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteContact(btn.dataset.id));
  });
}

function updateContactCount() {
  const el = document.getElementById('contactCount');
  if (el) el.textContent = allContacts.length;
}

function openEditForm(contactId) {
  const contact = allContacts.find(c => c.id === contactId);
  if (!contact) return;

  document.getElementById('editId').value      = contact.id;
  document.getElementById('editName').value    = contact.name;
  document.getElementById('editDate').value    = storedToInputDate(contact.birthdate);
  document.getElementById('editStarred').checked = contact.starred || false;

  const editForm = document.getElementById('editForm');
  editForm.style.display = 'block';
  editForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteContact(contactId) {
  if (!confirm('Delete this contact?')) return;
  allContacts = allContacts.filter(c => c.id !== contactId);
  await saveContacts();
  renderContactList(document.getElementById('searchInput').value);
  updateContactCount();
}

function initContactsTab() {
  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    renderContactList(e.target.value);
  });

  // Save edit
  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const id      = document.getElementById('editId').value;
    const name    = document.getElementById('editName').value.trim();
    const dateVal = document.getElementById('editDate').value;
    const starred = document.getElementById('editStarred').checked;

    if (!name || !dateVal) return;

    const idx = allContacts.findIndex(c => c.id === id);
    if (idx === -1) return;

    allContacts[idx] = { ...allContacts[idx], name, birthdate: inputDateToStored(dateVal), starred };
    await saveContacts();

    document.getElementById('editForm').style.display = 'none';
    renderContactList(document.getElementById('searchInput').value);
  });

  // Cancel edit
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('editForm').style.display = 'none';
  });
}

// ── Messages Tab ──────────────────────────────────────────────────────────────

function renderMsgEditor() {
  const container = document.getElementById('msgListEditor');
  container.innerHTML = '';
  const templates = allMessages[activeLang] || [];

  if (templates.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet. Add one below!</div>';
    return;
  }

  templates.forEach((tmpl, i) => {
    const item = document.createElement('div');
    item.className = 'msg-editor-item';
    item.innerHTML = `
      <div class="msg-text">${escapeHtml(tmpl)}</div>
      <button class="msg-delete" data-index="${i}" title="Delete this message">✕</button>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.msg-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index, 10);
      allMessages[activeLang].splice(idx, 1);
      await saveMessages();
      renderMsgEditor();
    });
  });
}

function initMessagesTab() {
  document.querySelectorAll('.msg-lang-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.msg-lang-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLang = btn.dataset.lang;
      renderMsgEditor();
    });
  });

  document.getElementById('addMsgBtn').addEventListener('click', async () => {
    const ta  = document.getElementById('newMsg');
    const msg = ta.value.trim();
    const fb  = document.getElementById('msgFeedback');

    if (!msg) {
      showFeedback(fb, '⚠ Please type a message first.', 'error');
      return;
    }
    if (!allMessages[activeLang]) allMessages[activeLang] = [];
    allMessages[activeLang].push(msg);
    await saveMessages();
    ta.value = '';
    renderMsgEditor();
    showFeedback(fb, '✅ Message added!', 'success');
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

      if (tab.dataset.tab === 'contacts') {
        renderContactList();
        updateContactCount();
      }
      if (tab.dataset.tab === 'messages') {
        renderMsgEditor();
      }
      if (tab.dataset.tab === 'apikey') {
        loadApiKeyTab();
      }
    });
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showFeedback(el, message, type) {
  el.textContent = message;
  el.className = `feedback ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initTabs();
  initImportTab();
  initExportButton();
  initAddTab();
  initContactsTab();
  initMessagesTab();
  initApiKeyTab();
  updateContactCount();
});

// ── API Key Tab ───────────────────────────────────────────────────────────────

async function loadApiKeyTab() {
  const data = await chrome.storage.local.get(['apiKey', 'toneHistory']);
  const key  = data.apiKey || '';
  const tone = data.toneHistory || [];

  const input = document.getElementById('apiKeyInput');
  if (input) input.value = key;

  const countEl = document.getElementById('toneHistoryCount');
  if (countEl) {
    countEl.textContent = tone.length === 0
      ? 'No messages saved yet. Start copying messages from the popup to build your tone profile.'
      : `${tone.length} message${tone.length === 1 ? '' : 's'} saved. The AI will use ${Math.min(tone.length, 10)} of them as style examples.`;
  }
}

function initApiKeyTab() {
  // Toggle key visibility
  document.getElementById('toggleApiKeyVisibility').addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    input.type  = input.type === 'password' ? 'text' : 'password';
  });

  // Save key
  document.getElementById('saveApiKeyBtn').addEventListener('click', async () => {
    const val = document.getElementById('apiKeyInput').value.trim();
    const fb  = document.getElementById('apiKeyFeedback');
    if (!val) {
      showFeedback(fb, '⚠ Please paste your API key first.', 'error');
      return;
    }
    if (!val.startsWith('sk-ant-')) {
      showFeedback(fb, '⚠ That doesn\'t look like an Anthropic key (should start with sk-ant-).', 'error');
      return;
    }
    await chrome.storage.local.set({ apiKey: val });
    showFeedback(fb, '✅ API key saved! AI messages are now enabled.', 'success');
  });

  // Clear key
  document.getElementById('clearApiKeyBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove('apiKey');
    document.getElementById('apiKeyInput').value = '';
    showFeedback(document.getElementById('apiKeyFeedback'), '🗑 API key removed.', 'success');
  });

  // Clear tone history
  document.getElementById('clearToneBtn').addEventListener('click', async () => {
    if (!confirm('Clear all saved tone examples? The AI will start fresh.')) return;
    await chrome.storage.local.remove('toneHistory');
    showFeedback(document.getElementById('toneFeedback'), '🗑 Tone history cleared.', 'success');
    loadApiKeyTab();
  });

  loadApiKeyTab();
}
