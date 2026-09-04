/* ===========================================================
   Pokémon TCG Business Tracker — app.js
   Vanilla JS, no build step. Data persisted to localStorage.
   =========================================================== */

const STORE_KEY = 'pkmnTcgTracker_v1';

const CATEGORIES = ['Single Card', 'Graded Slabs'];
const ERAS = ['Modern', 'Mid-Era', 'Vintage'];
const LANGUAGES = ['ENG', 'JP', 'CN'];
const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG', 'Sealed'];
const SOURCES = ['Purchased', 'Trade', 'Pulled/Opened', 'Other'];
const PLATFORMS = ['eBay', 'TCGPlayer', 'Facebook/Marketplace', 'Whatnot', 'Local/Card Show', 'Other'];
const PURCHASE_CATS = ['Singles', 'Sealed Product', 'Supplies', 'Fees', 'Other'];
const EXPENSE_CATS = ['Shipping Supplies', 'Software/Subscriptions', 'Booth/Event Fees', 'Travel', 'Marketing', 'Platform Fees', 'Other'];
const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'SGC', 'Other'];

/* ---------------- Data store ---------------- */

function defaultData() {
  return { inventory: [], lots: [], shows: [], purchases: [], sales: [], trades: [], expenses: [], finance: { cashOnHand: 0, bank: 0 } };
}

let DATA = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultData(), parsed);
  } catch (e) {
    console.error('Failed to load data, starting fresh.', e);
    return defaultData();
  }
}

function saveData() {
  localStorage.setItem(STORE_KEY, JSON.stringify(DATA));
  const el = document.getElementById('saveStatus');
  el.textContent = 'Saved ' + new Date().toLocaleTimeString();
}

function genId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/* ---------------- Utilities ---------------- */

function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(n) {
  n = Number(n) || 0;
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows, columns) {
  const esc2 = v => {
    v = v === undefined || v === null ? '' : String(v);
    if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  };
  const header = columns.map(c => esc2(c.label)).join(',');
  const lines = rows.map(r => columns.map(c => esc2(c.get(r))).join(','));
  return [header, ...lines].join('\n');
}

function exportCsv(filename, rows, columns) {
  downloadFile(filename, toCsv(rows, columns), 'text/csv');
}

/* ---------------- Modal helpers ---------------- */

const modalOverlay = () => document.getElementById('modalOverlay');
const modalBody = () => document.getElementById('modalBody');
const modalTitle = () => document.getElementById('modalTitle');

function openModal(title, bodyHtml, onMount) {
  modalTitle().textContent = title;
  modalBody().innerHTML = bodyHtml;
  modalOverlay().classList.add('open');
  if (onMount) onMount(modalBody());
}

function closeModal() {
  modalOverlay().classList.remove('open');
  modalBody().innerHTML = '';
}

document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modalOverlay().addEventListener('click', e => { if (e.target === modalOverlay()) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function fieldOptions(list, selected) {
  return list.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

function findShow(id) { return DATA.shows.find(s => s.id === id); }

// Options for a "Show / Event" dropdown, newest show first, with a blank default.
function showOptionsHtml(selectedId) {
  const opts = DATA.shows
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}${s.date ? ' — ' + esc(s.date) : ''}</option>`)
    .join('');
  return `<option value="">— none —</option>` + opts;
}

function showName(id) {
  const s = findShow(id);
  return s ? s.name : '';
}

/* ---------------- Tab navigation ---------------- */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  renderAll();
}

// Sub-tab navigation inside the Transactions tab (Purchases / Sales / Trades).
document.querySelectorAll('#txnSubtabs .subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const st = btn.dataset.subtab;
    document.querySelectorAll('#txnSubtabs .subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('#tab-transactions .subtab-panel').forEach(p => p.classList.toggle('active', p.id === 'sub-' + st));
  });
});

/* ===========================================================
   INVENTORY
   =========================================================== */

function findInventory(id) { return DATA.inventory.find(i => i.id === id); }

function invTotals(item) {
  return { totalCost: item.quantity * item.costPerUnit, totalMarket: item.quantity * item.marketPerUnit };
}

function isSlab(item) { return item.category === 'Graded Slabs' || item.graded; }

function itemsOfCategory(cat) { return DATA.inventory.filter(i => (i.category || 'Single Card') === cat); }

// Shared search + era filter for an inventory subset, sorted by name.
function invApplyFilters(items, searchId, eraId) {
  const searchEl = document.getElementById(searchId);
  const eraEl = document.getElementById(eraId);
  const search = (searchEl ? searchEl.value : '').trim().toLowerCase();
  const era = eraEl ? eraEl.value : '';
  return items.filter(it => {
    if (era && (it.era || '') !== era) return false;
    if (search) {
      const hay = [it.name, it.set, it.cardNumber, it.language, it.notes].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

const rowActions = id => `
      <td><div class="row-actions">
        <button class="btn secondary small" data-act="edit" data-id="${id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${id}">Delete</button>
      </div></td>`;

/* ---- Singles tab (category: Single Card) ---- */
function renderSingles() {
  renderOverviewInto('singlesOverview', itemsOfCategory('Single Card'), 'Singles Overview — Cost Basis by Era');
  const rows = invApplyFilters(itemsOfCategory('Single Card'), 'singlesSearch', 'singlesEraFilter');
  const tbody = document.querySelector('#singlesTable tbody');
  if (!rows.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="13">No single cards yet.</td></tr>`; return; }
  tbody.innerHTML = rows.map(item => {
    const { totalCost, totalMarket } = invTotals(item);
    return `<tr>
      <td class="wrap sticky-col sticky-1">${esc(item.name)}</td>
      <td class="sticky-col sticky-2">${esc(item.cardNumber)}</td>
      <td>${esc(item.era || '')}</td>
      <td>${esc(item.set)}</td>
      <td>${esc(item.language || '')}</td>
      <td>${esc(item.condition || '')}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.costPerUnit)}</td>
      <td class="num">${money(item.marketPerUnit)}</td>
      <td class="num">${money(totalCost)}</td>
      <td class="num">${money(totalMarket)}</td>
      <td>${esc(item.dateAcquired)}</td>${rowActions(item.id)}
    </tr>`;
  }).join('');
}

/* ---- Slabs tab (category: Graded Slabs) ---- */
function renderSlabs() {
  renderOverviewInto('slabsOverview', itemsOfCategory('Graded Slabs'), 'Slabs Overview — Cost Basis by Era');
  const rows = invApplyFilters(itemsOfCategory('Graded Slabs'), 'slabsSearch', 'slabsEraFilter');
  const tbody = document.querySelector('#slabsTable tbody');
  if (!rows.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="13">No graded slabs yet.</td></tr>`; return; }
  tbody.innerHTML = rows.map(item => {
    const { totalCost, totalMarket } = invTotals(item);
    const grade = `${esc(item.gradingCompany || '')} ${esc(item.grade || '')}`.trim();
    return `<tr>
      <td class="wrap sticky-col sticky-1">${esc(item.name)}</td>
      <td class="sticky-col sticky-2">${esc(item.cardNumber)}</td>
      <td>${esc(item.era || '')}</td>
      <td>${esc(item.set)}</td>
      <td>${esc(item.language || '')}</td>
      <td>${grade ? `<span class="badge graded">${grade}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.costPerUnit)}</td>
      <td class="num">${money(item.marketPerUnit)}</td>
      <td class="num">${money(totalCost)}</td>
      <td class="num">${money(totalMarket)}</td>
      <td>${esc(item.dateAcquired)}</td>${rowActions(item.id)}
    </tr>`;
  }).join('');
}

/* ---- Binder tab (category: Binder — bulk low-cost cards by count + average cost) ---- */
function renderBinderSummary(items) {
  const el = document.getElementById('binderOverview');
  if (!el) return;
  const binders = items.length;
  const cards = items.reduce((s, i) => s + num(i.quantity), 0);
  const cost = items.reduce((s, i) => s + num(i.quantity) * num(i.costPerUnit), 0);
  const market = items.reduce((s, i) => s + num(i.quantity) * num(i.marketPerUnit), 0);
  el.innerHTML = `
    <div class="stat-grid" style="margin-bottom:16px;">
      <div class="stat-card"><div class="label">Binders</div><div class="value">${binders}</div><div class="sub">${binders === 1 ? 'entry' : 'entries'}</div></div>
      <div class="stat-card"><div class="label">Total Cards</div><div class="value">${cards.toLocaleString()}</div><div class="sub">across all binders</div></div>
      <div class="stat-card"><div class="label">Cost Basis</div><div class="value">${money(cost)}</div><div class="sub">what you paid</div></div>
      <div class="stat-card"><div class="label">Market Value</div><div class="value">${money(market)}</div><div class="sub">${(market - cost >= 0 ? '+' : '') + money(market - cost)} unrealized</div></div>
    </div>`;
}

function renderBinder() {
  renderBinderSummary(itemsOfCategory('Binder'));
  const rows = invApplyFilters(itemsOfCategory('Binder'), 'binderSearch', 'binderEraFilter');
  const tbody = document.querySelector('#binderTable tbody');
  if (!rows.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No binder entries yet.</td></tr>`; return; }
  tbody.innerHTML = rows.map(item => {
    const { totalCost, totalMarket } = invTotals(item);
    return `<tr>
      <td class="wrap sticky-col">${esc(item.name)}</td>
      <td>${esc(item.era || '')}</td>
      <td>${esc(item.language || '')}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.costPerUnit)}</td>
      <td class="num">${money(totalCost)}</td>
      <td class="num">${money(item.marketPerUnit)}</td>
      <td class="num">${money(totalMarket)}</td>
      <td>${esc(item.dateAcquired)}</td>
      <td><div class="row-actions">
        <button class="btn primary small" data-act="cards" data-id="${item.id}">Cards (${(item.cards || []).length})</button>
        <button class="btn secondary small" data-act="edit" data-id="${item.id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${item.id}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

// Catalog of individual cards inside a binder (lightweight: name, number, set only).
function openBinderModal(binder) {
  if (!binder.cards) binder.cards = [];
  const cards = binder.cards;
  const cardRows = cards.length ? cards.map(c => `
    <tr>
      <td class="wrap">${esc(c.name)}</td>
      <td>${esc(c.cardNumber)}</td>
      <td>${esc(c.set)}</td>
      <td><button class="btn danger small" data-card="${c.id}">Remove</button></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="4">No cards catalogued yet.</td></tr>`;

  const html = `
    <p class="muted">Bulk count: <strong>${num(binder.quantity)}</strong> cards &nbsp;·&nbsp; Avg cost ${money(binder.costPerUnit)} &nbsp;·&nbsp; Catalogued: <strong>${cards.length}</strong></p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Pokémon Name</th><th>Card #</th><th>Set</th><th></th></tr></thead>
        <tbody id="binderCardBody">${cardRows}</tbody>
      </table>
    </div>
    <h3>Add a card</h3>
    <div class="form-grid">
      <div class="field full"><label>Pokémon Name</label><input id="bc_name" type="text" placeholder="e.g. Pikachu"></div>
      <div class="field"><label>Card #</label><input id="bc_num" type="text" placeholder="e.g. 58/102"></div>
      <div class="field"><label>Set</label><input id="bc_set" type="text" placeholder="e.g. Base Set"></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="closeBinderBtn">Close</button>
      <button class="btn primary" id="bc_add">+ Add Card</button>
    </div>`;

  openModal(`Binder — ${binder.name}`, html, body => {
    body.querySelector('#closeBinderBtn').addEventListener('click', closeModal);
    body.querySelector('#bc_add').addEventListener('click', () => {
      const name = body.querySelector('#bc_name').value.trim();
      if (!name) { alert('Enter a Pokémon name.'); return; }
      binder.cards.push({
        id: genId(), name,
        cardNumber: body.querySelector('#bc_num').value.trim(),
        set: body.querySelector('#bc_set').value.trim(),
      });
      saveData(); renderAll(); openBinderModal(binder); // refresh
    });
    body.querySelector('#binderCardBody').addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      binder.cards = binder.cards.filter(c => c.id !== btn.dataset.card);
      saveData(); renderAll(); openBinderModal(binder);
    });
  });
}

// Overview: cost basis (COGS on hand), market value, and unrealized P/L by era, over a subset.
function renderOverviewInto(containerId, items, title) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const keys = [...ERAS, 'Uncategorized'];
  const groups = {};
  keys.forEach(k => groups[k] = { items: 0, qty: 0, cost: 0, market: 0 });
  for (const it of items) {
    const key = ERAS.includes(it.era) ? it.era : 'Uncategorized';
    const g = groups[key];
    g.items++;
    g.qty += num(it.quantity);
    g.cost += num(it.quantity) * num(it.costPerUnit);
    g.market += num(it.quantity) * num(it.marketPerUnit);
  }
  const shown = keys.filter(k => groups[k].items > 0 || ERAS.includes(k));
  const tot = { items: 0, qty: 0, cost: 0, market: 0 };
  shown.forEach(k => { tot.items += groups[k].items; tot.qty += groups[k].qty; tot.cost += groups[k].cost; tot.market += groups[k].market; });

  const rowHtml = (label, g, isTotal) => {
    const unreal = g.market - g.cost;
    const margin = g.cost > 0 ? (unreal / g.cost) * 100 : 0;
    return `<tr${isTotal ? ' class="ov-total"' : ''}>
      <td class="sticky-col">${esc(label)}</td>
      <td class="num">${g.items}</td>
      <td class="num">${g.qty}</td>
      <td class="num">${money(g.cost)}</td>
      <td class="num">${money(g.market)}</td>
      <td class="num ${unreal >= 0 ? 'pos' : 'neg'}">${money(unreal)}</td>
      <td class="num ${unreal >= 0 ? 'pos' : 'neg'}">${g.cost > 0 ? (margin >= 0 ? '+' : '') + margin.toFixed(1) + '%' : '—'}</td>
    </tr>`;
  };

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-bottom:10px;">${esc(title)}</h2>
      <div class="table-wrap" style="box-shadow:none;border:none;">
        <table class="overview-table">
          <thead><tr>
            <th class="sticky-col">Era</th><th class="num">Items</th><th class="num">Qty</th>
            <th class="num">Cost Basis</th><th class="num">Market Value</th><th class="num">Unrealized</th><th class="num">Margin</th>
          </tr></thead>
          <tbody>
            ${shown.map(k => rowHtml(k, groups[k], false)).join('')}
            ${rowHtml('TOTAL', tot, true)}
          </tbody>
        </table>
      </div>
    </div>`;
}

// Edit/Delete delegation for each inventory table.
function wireInvTable(tableId) {
  document.querySelector(`#${tableId} tbody`).addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const item = findInventory(btn.dataset.id); if (!item) return;
    if (btn.dataset.act === 'cards') openBinderModal(item);
    if (btn.dataset.act === 'edit') openInventoryModal(item);
    if (btn.dataset.act === 'del') {
      if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
        DATA.inventory = DATA.inventory.filter(i => i.id !== item.id);
        saveData(); renderAll(); showToast('Deleted.');
      }
    }
  });
}
['singlesTable', 'slabsTable', 'binderTable'].forEach(wireInvTable);

// Search + era filters per tab.
[['singlesSearch', 'singlesEraFilter', renderSingles],
 ['slabsSearch', 'slabsEraFilter', renderSlabs],
 ['binderSearch', 'binderEraFilter', renderBinder]].forEach(([sId, eId, fn]) => {
  document.getElementById(sId).addEventListener('input', fn);
  document.getElementById(eId).addEventListener('change', fn);
});

// Add buttons — type is fixed by the tab (no Type dropdown in the modal).
document.getElementById('singlesAddBtn').addEventListener('click', () => openInventoryModal(null, 'Single Card'));
document.getElementById('slabsAddBtn').addEventListener('click', () => openInventoryModal(null, 'Graded Slabs'));
document.getElementById('binderAddBtn').addEventListener('click', () => openInventoryModal(null, 'Binder'));

// CSV export per tab.
function exportInvCsv(filename, items) {
  exportCsv(filename, items, [
    { label: 'Name', get: r => r.name }, { label: 'Category', get: r => r.category },
    { label: 'Era', get: r => r.era }, { label: 'Language', get: r => r.language },
    { label: 'Set', get: r => r.set }, { label: 'Card #', get: r => r.cardNumber },
    { label: 'Condition', get: r => isSlab(r) ? '' : r.condition }, { label: 'Grading Co', get: r => r.gradingCompany },
    { label: 'Grade', get: r => r.grade }, { label: 'Quantity', get: r => r.quantity }, { label: 'Cost/Unit', get: r => r.costPerUnit },
    { label: 'Market/Unit', get: r => r.marketPerUnit }, { label: 'Date Acquired', get: r => r.dateAcquired },
    { label: 'Source', get: r => r.source }, { label: 'Notes', get: r => r.notes },
  ]);
}
document.getElementById('singlesExportCsv').addEventListener('click', () => exportInvCsv('singles.csv', itemsOfCategory('Single Card')));
document.getElementById('slabsExportCsv').addEventListener('click', () => exportInvCsv('slabs.csv', itemsOfCategory('Graded Slabs')));
document.getElementById('binderExportCsv').addEventListener('click', () => exportInvCsv('binder.csv', itemsOfCategory('Binder')));

// Add/edit modal. Type is fixed by `forcedCategory` (new) or the item's category (edit);
// fields shown adapt to Single Card / Graded Slab / Binder.
function openInventoryModal(item, forcedCategory) {
  const isEdit = !!item;
  const category = isEdit ? (item.category || 'Single Card') : (forcedCategory || 'Single Card');
  const isSlabCat = category === 'Graded Slabs';
  const isBinder = category === 'Binder';
  const typeLabel = isBinder ? 'Binder Entry' : (isSlabCat ? 'Graded Slab' : 'Single Card');
  const v = item || {
    category, era: 'Modern', language: 'ENG', name: '', set: '', cardNumber: '', condition: 'NM',
    gradingCompany: 'PSA', grade: '', quantity: 1, costPerUnit: 0,
    marketPerUnit: 0, dateAcquired: todayISO(), source: 'Purchased', notes: ''
  };

  const nameLabel = isBinder ? 'Binder / Description' : 'Name';
  const namePlaceholder = isBinder ? 'e.g. Modern bulk commons' : 'e.g. Charizard ex';
  const qtyLabel = isBinder ? 'Number of Cards' : 'Quantity';
  const costLabel = isBinder ? 'Average Cost / Card' : 'Cost / Unit';
  const marketLabel = isBinder ? 'Average Market / Card' : 'Market Value / Unit';

  const setBlock = isBinder ? '' : `
      <div class="field"><label>Set / Expansion</label><input id="f_set" type="text" value="${esc(v.set)}" placeholder="e.g. Obsidian Flames"></div>
      <div class="field"><label>Card #</label><input id="f_cardNumber" type="text" value="${esc(v.cardNumber)}" placeholder="e.g. 125/197"></div>`;
  const conditionBlock = (isBinder || isSlabCat) ? '' : `
      <div class="field"><label>Condition</label><select id="f_condition">${fieldOptions(CONDITIONS, v.condition)}</select></div>`;
  const gradingBlock = isSlabCat ? `
      <div class="field"><label>Grading Company</label><select id="f_gradingCompany">${fieldOptions(GRADING_COMPANIES, v.gradingCompany || 'PSA')}</select></div>
      <div class="field"><label>Grade</label><input id="f_grade" type="text" value="${esc(v.grade)}" placeholder="e.g. 10"></div>` : '';

  const html = `
    <div class="form-grid">
      <div class="field"><label>Era</label><select id="f_era">${fieldOptions(ERAS, ERAS.includes(v.era) ? v.era : 'Modern')}</select></div>
      <div class="field"><label>Language</label><select id="f_language">${fieldOptions(LANGUAGES, LANGUAGES.includes(v.language) ? v.language : 'ENG')}</select></div>

      <div class="field full"><label>${nameLabel}</label><input id="f_name" type="text" value="${esc(v.name)}" placeholder="${namePlaceholder}"></div>
      ${setBlock}
      ${conditionBlock}
      ${gradingBlock}
      <div class="field"><label>${qtyLabel}</label><input id="f_quantity" type="number" min="0" step="1" value="${v.quantity}"></div>
      ${(isBinder || isSlabCat) ? '<div class="field"></div>' : ''}

      <div class="field"><label>${costLabel}</label><input id="f_costPerUnit" type="number" min="0" step="0.01" value="${v.costPerUnit}"></div>
      <div class="field"><label>${marketLabel}</label><input id="f_marketPerUnit" type="number" min="0" step="0.01" value="${v.marketPerUnit}"></div>

      <div class="field"><label>Date Acquired</label><input id="f_dateAcquired" type="date" value="${esc(v.dateAcquired)}"></div>
      <div class="field"><label>Source</label><select id="f_source">${fieldOptions(SOURCES, v.source)}</select></div>

      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Add ' + typeLabel}</button>
    </div>`;

  openModal(`${isEdit ? 'Edit' : 'Add'} ${typeLabel}`, html, body => {
    const val = sel => { const el = body.querySelector(sel); return el ? el.value : ''; };
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);
    body.querySelector('#saveBtn').addEventListener('click', () => {
      const name = body.querySelector('#f_name').value.trim();
      if (!name) { alert(isBinder ? 'Please enter a binder name.' : 'Please enter a name.'); return; }
      const record = {
        id: isEdit ? item.id : genId(),
        category,
        era: val('#f_era'),
        language: val('#f_language'),
        name,
        set: val('#f_set').trim(),
        cardNumber: val('#f_cardNumber').trim(),
        condition: (isSlabCat || isBinder) ? '' : val('#f_condition'),
        graded: isSlabCat,
        gradingCompany: isSlabCat ? val('#f_gradingCompany') : '',
        grade: isSlabCat ? val('#f_grade').trim() : '',
        quantity: num(val('#f_quantity')),
        costPerUnit: num(val('#f_costPerUnit')),
        marketPerUnit: num(val('#f_marketPerUnit')),
        dateAcquired: val('#f_dateAcquired') || todayISO(),
        source: val('#f_source'),
        notes: val('#f_notes').trim(),
      };
      if (isEdit) Object.assign(item, record); else DATA.inventory.push(record);
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Saved.' : 'Added.');
    });
  });
}

/* ===========================================================
   PURCHASES
   =========================================================== */

function renderPurchases() {
  const tbody = document.querySelector('#purchasesTable tbody');
  const rows = DATA.purchases.slice().sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = '';
  if (rows.length === 0) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No purchases logged yet.</td></tr>`; return; }
  for (const p of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(p.date)}</td><td>${esc(p.vendor)}</td><td>${esc(p.category)}</td>
      <td class="wrap">${esc(p.description)}</td><td class="num">${money(p.amount)}</td>
      <td class="wrap">${esc(p.notes)}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" data-act="edit" data-id="${p.id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${p.id}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#purchasesTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const p = DATA.purchases.find(x => x.id === btn.dataset.id); if (!p) return;
  if (btn.dataset.act === 'edit') openPurchaseModal(p);
  if (btn.dataset.act === 'del') {
    if (confirm('Delete this purchase record?')) {
      DATA.purchases = DATA.purchases.filter(x => x.id !== p.id);
      saveData(); renderAll(); showToast('Purchase deleted.');
    }
  }
});

document.getElementById('purAddBtn').addEventListener('click', () => openPurchaseModal(null));
document.getElementById('purExportCsv').addEventListener('click', () => {
  exportCsv('purchases.csv', DATA.purchases, [
    { label: 'Date', get: r => r.date }, { label: 'Vendor', get: r => r.vendor },
    { label: 'Category', get: r => r.category }, { label: 'Description', get: r => r.description },
    { label: 'Amount', get: r => r.amount }, { label: 'Show', get: r => showName(r.showId) }, { label: 'Notes', get: r => r.notes },
  ]);
});

function openPurchaseModal(p) {
  const isEdit = !!p;
  const v = p || { date: todayISO(), vendor: '', category: 'Singles', description: '', amount: 0, showId: '', notes: '' };
  const html = `
    <div class="form-grid">
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Vendor</label><input id="f_vendor" type="text" value="${esc(v.vendor)}" placeholder="e.g. Local card shop"></div>
      <div class="field"><label>Category</label><select id="f_category">${fieldOptions(PURCHASE_CATS, v.category)}</select></div>
      <div class="field"><label>Amount</label><input id="f_amount" type="number" min="0" step="0.01" value="${v.amount}"></div>
      <div class="field full"><label>Show / Event</label><select id="f_showId">${showOptionsHtml(v.showId)}</select></div>
      <div class="field full"><label>Description</label><input id="f_description" type="text" value="${esc(v.description)}" placeholder="What did you buy?"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <p class="muted">Tip: to add the purchased cards to your Inventory (for resale tracking), use the Inventory tab's "+ Add Item" with Source = Purchased.</p>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Add Purchase'}</button>
    </div>`;
  openModal(isEdit ? 'Edit Purchase' : 'Add Purchase', html, body => {
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);
    body.querySelector('#saveBtn').addEventListener('click', () => {
      const record = {
        id: isEdit ? p.id : genId(),
        date: body.querySelector('#f_date').value || todayISO(),
        vendor: body.querySelector('#f_vendor').value.trim(),
        category: body.querySelector('#f_category').value,
        description: body.querySelector('#f_description').value.trim(),
        amount: num(body.querySelector('#f_amount').value),
        showId: body.querySelector('#f_showId').value,
        notes: body.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) Object.assign(p, record); else DATA.purchases.push(record);
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Purchase updated.' : 'Purchase added.');
    });
  });
}

/* ===========================================================
   EXPENSES
   =========================================================== */

function renderExpenses() {
  const tbody = document.querySelector('#expensesTable tbody');
  const rows = DATA.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = '';
  if (rows.length === 0) { tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No expenses logged yet.</td></tr>`; return; }
  for (const x of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(x.date)}</td><td>${esc(x.category)}</td>
      <td class="wrap">${esc(x.description)}</td><td class="num">${money(x.amount)}</td>
      <td class="wrap">${esc(x.notes)}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" data-act="edit" data-id="${x.id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${x.id}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#expensesTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const x = DATA.expenses.find(r => r.id === btn.dataset.id); if (!x) return;
  if (btn.dataset.act === 'edit') openExpenseModal(x);
  if (btn.dataset.act === 'del') {
    if (confirm('Delete this expense record?')) {
      DATA.expenses = DATA.expenses.filter(r => r.id !== x.id);
      saveData(); renderAll(); showToast('Expense deleted.');
    }
  }
});

document.getElementById('expAddBtn').addEventListener('click', () => openExpenseModal(null));
document.getElementById('expExportCsv').addEventListener('click', () => {
  exportCsv('expenses.csv', DATA.expenses, [
    { label: 'Date', get: r => r.date }, { label: 'Category', get: r => r.category },
    { label: 'Description', get: r => r.description }, { label: 'Amount', get: r => r.amount },
    { label: 'Show', get: r => showName(r.showId) }, { label: 'Notes', get: r => r.notes },
  ]);
});

function openExpenseModal(x) {
  const isEdit = !!x;
  const v = x || { date: todayISO(), category: 'Shipping Supplies', description: '', amount: 0, showId: '', notes: '' };
  const html = `
    <div class="form-grid">
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Category</label><select id="f_category">${fieldOptions(EXPENSE_CATS, v.category)}</select></div>
      <div class="field"><label>Amount</label><input id="f_amount" type="number" min="0" step="0.01" value="${v.amount}"></div>
      <div class="field"><label>Show / Event</label><select id="f_showId">${showOptionsHtml(v.showId)}</select></div>
      <div class="field full"><label>Description</label><input id="f_description" type="text" value="${esc(v.description)}"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Add Expense'}</button>
    </div>`;
  openModal(isEdit ? 'Edit Expense' : 'Add Expense', html, body => {
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);
    body.querySelector('#saveBtn').addEventListener('click', () => {
      const record = {
        id: isEdit ? x.id : genId(),
        date: body.querySelector('#f_date').value || todayISO(),
        category: body.querySelector('#f_category').value,
        description: body.querySelector('#f_description').value.trim(),
        amount: num(body.querySelector('#f_amount').value),
        showId: body.querySelector('#f_showId').value,
        notes: body.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) Object.assign(x, record); else DATA.expenses.push(record);
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Expense updated.' : 'Expense added.');
    });
  });
}

/* ===========================================================
   SALES  (line items pull from inventory, decrement stock)
   =========================================================== */

let saleLineItems = [];
let editingSaleId = null;

// Return sold units to stock. Binder-card lines restore the binder count and re-file the card.
function releaseInventory(items) {
  for (const it of items) {
    if (it.binderId) {
      const b = findInventory(it.binderId);
      if (b) {
        b.quantity = num(b.quantity) + num(it.qty);
        if (it.binderCardId && it.cardSnapshot) {
          if (!b.cards) b.cards = [];
          if (!b.cards.some(c => c.id === it.binderCardId)) b.cards.push({ id: it.binderCardId, ...it.cardSnapshot });
        }
      }
      continue;
    }
    const inv = findInventory(it.inventoryId);
    if (inv) inv.quantity += it.qty;
  }
}
// Remove sold units from stock. Binder-card lines drop the binder count and pull the card out.
function consumeInventory(items) {
  for (const it of items) {
    if (it.binderId) {
      const b = findInventory(it.binderId);
      if (b) {
        b.quantity = num(b.quantity) - num(it.qty);
        if (it.binderCardId && b.cards) b.cards = b.cards.filter(c => c.id !== it.binderCardId);
      }
      continue;
    }
    const inv = findInventory(it.inventoryId);
    if (inv) inv.quantity -= it.qty;
  }
}

function saleTotals(sale) {
  const revenue = sale.items.reduce((s, i) => s + i.qty * i.priceEach, 0);
  const cogs = sale.items.reduce((s, i) => s + i.qty * i.costEach, 0);
  const netProfit = revenue - (sale.fees || 0) - (sale.shipping || 0) - cogs;
  return { revenue, cogs, netProfit };
}

function renderSales() {
  const tbody = document.querySelector('#salesTable tbody');
  const rows = DATA.sales.slice().sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = '';
  if (rows.length === 0) { tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No sales recorded yet.</td></tr>`; return; }
  for (const s of rows) {
    const { revenue, cogs, netProfit } = saleTotals(s);
    const itemsLabel = s.items.map(i => `${i.qty}× ${i.name}`).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(s.date)}</td><td>${esc(s.buyer)}</td><td>${esc(s.platform)}</td>
      <td class="wrap">${esc(itemsLabel)}</td>
      <td class="num">${money(revenue)}</td><td class="num">${money(s.fees)}</td>
      <td class="num">${money(s.shipping)}</td><td class="num">${money(cogs)}</td>
      <td class="num ${netProfit >= 0 ? 'pos' : 'neg'}">${money(netProfit)}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" data-act="edit" data-id="${s.id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${s.id}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#salesTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const s = DATA.sales.find(x => x.id === btn.dataset.id); if (!s) return;
  if (btn.dataset.act === 'edit') openSaleModal(s);
  if (btn.dataset.act === 'del') {
    if (confirm('Delete this sale? Sold quantities will be returned to inventory.')) {
      releaseInventory(s.items);
      DATA.sales = DATA.sales.filter(x => x.id !== s.id);
      saveData(); renderAll(); showToast('Sale deleted, stock restored.');
    }
  }
});

document.getElementById('salesAddBtn').addEventListener('click', () => openSaleModal(null));
document.getElementById('salesExportCsv').addEventListener('click', () => {
  const rows = DATA.sales.map(s => ({ ...s, ...saleTotals(s), itemsLabel: s.items.map(i => `${i.qty}x ${i.name}`).join('; ') }));
  exportCsv('sales.csv', rows, [
    { label: 'Date', get: r => r.date }, { label: 'Buyer', get: r => r.buyer },
    { label: 'Platform', get: r => r.platform }, { label: 'Show', get: r => showName(r.showId) },
    { label: 'Items', get: r => r.itemsLabel }, { label: 'Revenue', get: r => r.revenue.toFixed(2) }, { label: 'Fees', get: r => (r.fees || 0).toFixed(2) },
    { label: 'Shipping', get: r => (r.shipping || 0).toFixed(2) }, { label: 'COGS', get: r => r.cogs.toFixed(2) },
    { label: 'Net Profit', get: r => r.netProfit.toFixed(2) }, { label: 'Notes', get: r => r.notes },
  ]);
});

function availableQty(inventoryId) {
  const inv = findInventory(inventoryId);
  return inv ? inv.quantity : 0;
}

function inventoryOptionsHtml(selectedId) {
  const opts = DATA.inventory
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${esc(i.name)} — ${esc(i.set || '')} (${esc(i.condition)}) [${i.quantity} in stock]</option>`)
    .join('');
  return `<option value="">Select item…</option>` + opts;
}

// A sale line can point at a normal inventory item (value = id) or a specific
// card catalogued inside a binder (value = "bcard:<binderId>:<cardId>").
function parseSaleSel(val) {
  if (typeof val === 'string' && val.startsWith('bcard:')) {
    const parts = val.split(':');
    return { type: 'bcard', binderId: parts[1], cardId: parts[2] };
  }
  return { type: 'inv', inventoryId: val };
}

function saleSelAvail(val) {
  const p = parseSaleSel(val);
  if (p.type === 'bcard') return 1;
  return availableQty(val);
}

// Options for the sale item picker: Singles & Slabs individually, then one entry per
// binder (value "binderpick:<id>") that opens a card-selection window.
function saleItemOptionsHtml(selectedValue) {
  const singles = DATA.inventory
    .filter(i => i.category === 'Single Card' || i.category === 'Graded Slabs')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => `<option value="${i.id}" ${i.id === selectedValue ? 'selected' : ''}>${esc(i.name)}${i.cardNumber ? ' #' + esc(i.cardNumber) : ''} — ${esc(i.set || '')} [${i.quantity} in stock]</option>`)
    .join('');
  const binderOpts = DATA.inventory
    .filter(i => i.category === 'Binder')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(b => `<option value="binderpick:${b.id}">${esc(b.name)} — ${num(b.quantity)} cards${(b.cards || []).length ? ` (${(b.cards || []).length} listed)` : ''}…</option>`)
    .join('');
  return `<option value="">Select item…</option>`
    + (singles ? `<optgroup label="Singles &amp; Slabs">${singles}</optgroup>` : '')
    + (binderOpts ? `<optgroup label="Binders (pick cards)">${binderOpts}</optgroup>` : '');
}

// Nested modal: pick several catalogued cards (and/or a bulk quantity) from a binder.
function openBinderCardPicker(binder, onConfirm, onCancel) {
  const cards = binder.cards || [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h2>Select cards — ${esc(binder.name)}</h2>
        <button class="modal-close" data-cancel>&times;</button>
      </div>
      <div class="modal-body">
        <p class="muted">Avg cost ${money(binder.costPerUnit)} · ${num(binder.quantity)} in binder · ${cards.length} catalogued</p>
        ${cards.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width:34px"><input type="checkbox" id="pickAll"></th><th>Pokémon</th><th>#</th><th>Set</th></tr></thead>
            <tbody>
              ${cards.map(c => `<tr>
                <td><input type="checkbox" class="pick" value="${c.id}"></td>
                <td class="wrap">${esc(c.name)}</td><td>${esc(c.cardNumber)}</td><td>${esc(c.set)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<p class="muted">No cards catalogued in this binder yet — add them under the Binder tab, or just sell in bulk below.</p>`}
        <div class="field" style="max-width:280px;margin-top:12px;">
          <label>Also sell bulk / unlisted cards (qty)</label>
          <input type="number" id="pickBulkQty" min="0" step="1" value="0">
        </div>
        <div class="form-actions">
          <button class="btn secondary" data-cancel>Cancel</button>
          <button class="btn primary" data-confirm>Add to sale</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  const cancel = () => { cleanup(); if (onCancel) onCancel(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  overlay.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', cancel));
  const pickAll = overlay.querySelector('#pickAll');
  if (pickAll) pickAll.addEventListener('change', e => overlay.querySelectorAll('.pick').forEach(c => { c.checked = e.target.checked; }));
  overlay.querySelector('[data-confirm]').addEventListener('click', () => {
    const ids = [...overlay.querySelectorAll('.pick:checked')].map(c => c.value);
    const bulkQty = num(overlay.querySelector('#pickBulkQty').value);
    cleanup();
    onConfirm(ids, bulkQty);
  });
}

function renderSaleLineItems(container) {
  container.innerHTML = saleLineItems.map((li, idx) => {
    if (li.lotId) {
      // Lot-sourced line: card name is free text, cost is fixed at the lot's per-card cost.
      return `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>Card (lot: ${esc(li.lotName || lotName(li.lotId))})</label>
        <input class="li-name" type="text" value="${esc(li.name)}" placeholder="Card name"></div>
      <div class="field"><label>Qty</label><input class="li-qty" type="number" min="1" step="1" value="${li.qty}"></div>
      <div class="field"><label>Price/Ea</label><input class="li-price" type="number" min="0" step="0.01" value="${li.priceEach}"></div>
      <div class="field"><label>Cost/Ea</label><input type="text" value="${money(li.costEach)}" disabled></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`;
    }
    if (li.binderId) {
      // Binder line: a specific catalogued card (qty locked to 1) or a bulk quantity.
      const bname = esc(lotOrBinderName(li.binderId));
      const isCard = !!li.binderCardId;
      const label = isCard ? `${bname}: ${esc(li.name || 'card')}` : `${bname} (bulk)`;
      const qtyCell = isCard
        ? `<input type="text" value="1" disabled>`
        : `<input class="li-qty" type="number" min="1" step="1" value="${li.qty}">`;
      return `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>${isCard ? 'Card (from binder)' : 'Binder (bulk)'}</label><input type="text" value="${label}" disabled></div>
      <div class="field"><label>Qty</label>${qtyCell}</div>
      <div class="field"><label>Price/Ea</label><input class="li-price" type="number" min="0" step="0.01" value="${li.priceEach}"></div>
      <div class="field"><label>Cost/Ea</label><input type="text" value="${money(li.costEach)}" disabled></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`;
    }
    return `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>Item</label>
        <select class="li-item">${saleItemOptionsHtml(li.inventoryId)}</select>
      </div>
      <div class="field"><label>Qty</label><input class="li-qty" type="number" min="1" step="1" value="${li.qty}"></div>
      <div class="field"><label>Price/Ea</label><input class="li-price" type="number" min="0" step="0.01" value="${li.priceEach}"></div>
      <div class="field"><label>Avail.</label><input type="text" value="${saleSelAvail(li.inventoryId)}" disabled></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`;
  }).join('') || `<p class="muted">No items added yet.</p>`;

  container.querySelectorAll('.line-item-row').forEach(row => {
    const idx = Number(row.dataset.idx);
    const itemSelect = row.querySelector('.li-item');
    if (itemSelect) {
      itemSelect.addEventListener('change', e => {
        const val = e.target.value;
        if (val.startsWith('binderpick:')) {
          const binder = findInventory(val.split(':')[1]);
          if (!binder) return;
          openBinderCardPicker(binder, (cardIds, bulkQty) => {
            const newLines = [];
            for (const cid of cardIds) {
              const card = ((binder.cards) || []).find(c => c.id === cid) || {};
              newLines.push({
                binderId: binder.id, binderCardId: cid, inventoryId: '',
                cardSnapshot: { name: card.name || '', cardNumber: card.cardNumber || '', set: card.set || '' },
                name: card.name || 'Binder card', qty: 1,
                priceEach: num(binder.marketPerUnit), costEach: num(binder.costPerUnit),
              });
            }
            if (bulkQty > 0) {
              newLines.push({
                binderId: binder.id, inventoryId: '', name: binder.name + ' (bulk)', qty: bulkQty,
                priceEach: num(binder.marketPerUnit), costEach: num(binder.costPerUnit),
              });
            }
            if (newLines.length) saleLineItems.splice(idx, 1, ...newLines);
            else saleLineItems[idx].inventoryId = '';
            renderSaleLineItems(container);
            updateSaleTotalsDisplay();
          }, () => {
            saleLineItems[idx].inventoryId = '';
            renderSaleLineItems(container);
          });
          return;
        }
        const li = saleLineItems[idx];
        li.inventoryId = val; li.binderId = undefined; li.binderCardId = undefined;
        const inv = findInventory(val);
        if (inv) li.priceEach = inv.marketPerUnit;
        renderSaleLineItems(container);
        updateSaleTotalsDisplay();
      });
    }
    const nameInput = row.querySelector('.li-name');
    if (nameInput) {
      nameInput.addEventListener('input', e => { saleLineItems[idx].name = e.target.value; });
    }
    const qtyInput = row.querySelector('.li-qty');
    if (qtyInput) {
      qtyInput.addEventListener('input', e => { saleLineItems[idx].qty = num(e.target.value); updateSaleTotalsDisplay(); });
    }
    row.querySelector('.li-price').addEventListener('input', e => {
      saleLineItems[idx].priceEach = num(e.target.value); updateSaleTotalsDisplay();
    });
    row.querySelector('.line-item-remove').addEventListener('click', () => {
      saleLineItems.splice(idx, 1); renderSaleLineItems(container); updateSaleTotalsDisplay();
    });
  });
}

// Name lookup that works for both lots and binders (both live in different stores).
function lotOrBinderName(id) { const inv = findInventory(id); return inv ? inv.name : ''; }

function updateSaleTotalsDisplay() {
  const el = document.getElementById('saleTotalsDisplay');
  if (!el) return;
  const subtotal = saleLineItems.reduce((s, i) => s + (num(i.qty) * num(i.priceEach)), 0);
  const fees = num(document.getElementById('f_fees').value);
  const shipping = num(document.getElementById('f_shipping').value);
  const cogs = saleLineItems.reduce((s, li) => {
    if (li.lotId || li.binderId) return s + num(li.costEach) * num(li.qty);
    const inv = findInventory(li.inventoryId);
    return s + (inv ? inv.costPerUnit * num(li.qty) : 0);
  }, 0);
  const net = subtotal - fees - shipping - cogs;
  el.innerHTML = `Revenue: <strong>${money(subtotal)}</strong> &nbsp; COGS: <strong>${money(cogs)}</strong> &nbsp; Net Profit: <strong class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</strong>`;
}

function openSaleModal(sale) {
  const isEdit = !!sale;
  editingSaleId = isEdit ? sale.id : null;
  saleLineItems = isEdit ? sale.items.map(i => ({ ...i })) : [];
  const v = sale || { date: todayISO(), buyer: '', platform: 'Local/Card Show', fees: 0, shipping: 0, showId: '', notes: '' };

  const html = `
    <div class="form-grid">
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Buyer</label><input id="f_buyer" type="text" value="${esc(v.buyer)}" placeholder="Optional"></div>
      <div class="field"><label>Platform</label><select id="f_platform">${fieldOptions(PLATFORMS, v.platform)}</select></div>
      <div class="field"><label>Show / Event</label><select id="f_showId">${showOptionsHtml(v.showId)}</select></div>
      <div class="field"><label>Fees</label><input id="f_fees" type="number" min="0" step="0.01" value="${v.fees || 0}"></div>
      <div class="field"><label>Shipping Cost</label><input id="f_shipping" type="number" min="0" step="0.01" value="${v.shipping || 0}"></div>
    </div>

    <h3>Items Sold</h3>
    <div class="line-items" id="saleLineItemsWrap"></div>
    <button class="btn secondary small add-line-btn" id="addLineBtn">+ Add Item</button>
    <div class="line-totals" id="saleTotalsDisplay"></div>

    <div class="form-grid" style="margin-top:14px;">
      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Record Sale'}</button>
    </div>`;

  openModal(isEdit ? 'Edit Sale' : 'New Sale', html, body => {
    const lineWrap = body.querySelector('#saleLineItemsWrap');
    renderSaleLineItems(lineWrap);
    updateSaleTotalsDisplay();

    body.querySelector('#addLineBtn').addEventListener('click', () => {
      saleLineItems.push({ inventoryId: '', name: '', qty: 1, priceEach: 0, costEach: 0 });
      renderSaleLineItems(lineWrap); updateSaleTotalsDisplay();
    });
    body.querySelector('#f_fees').addEventListener('input', updateSaleTotalsDisplay);
    body.querySelector('#f_shipping').addEventListener('input', updateSaleTotalsDisplay);
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);

    body.querySelector('#saveBtn').addEventListener('click', () => {
      const cleanItems = saleLineItems.filter(i => (i.inventoryId || i.lotId || i.binderId) && num(i.qty) > 0);
      if (cleanItems.length === 0) { alert('Add at least one item with a valid quantity.'); return; }

      // Temporarily release stock held by the original sale (if editing) so validation reflects true availability
      if (isEdit) releaseInventory(sale.items);

      for (const li of cleanItems) {
        if (li.lotId) continue; // lot lines draw from a bulk pile, not tracked inventory stock
        if (li.binderId) {
          const b = findInventory(li.binderId);
          if (!b) { alert('A binder in this sale no longer exists.'); if (isEdit) consumeInventory(sale.items); return; }
          const need = li.binderCardId ? 1 : num(li.qty);
          if (num(b.quantity) < need) { alert(`Not enough cards left in binder "${b.name}". Available: ${b.quantity}.`); if (isEdit) consumeInventory(sale.items); return; }
          continue;
        }
        const inv = findInventory(li.inventoryId);
        if (!inv) { alert('An item in this sale no longer exists in inventory.'); if (isEdit) consumeInventory(sale.items); return; }
        if (num(li.qty) > inv.quantity) {
          alert(`Not enough stock for "${inv.name}". Available: ${inv.quantity}, requested: ${li.qty}.`);
          if (isEdit) consumeInventory(sale.items);
          return;
        }
      }

      const finalItems = cleanItems.map(li => {
        if (li.lotId) {
          const lot = findLot(li.lotId);
          return { lotId: li.lotId, lotName: lot ? lot.name : (li.lotName || ''), name: (li.name || '').trim() || 'Card from lot',
                   qty: num(li.qty), priceEach: num(li.priceEach), costEach: lot ? lotPerCard(lot) : num(li.costEach) };
        }
        if (li.binderId) {
          const b = findInventory(li.binderId);
          if (li.binderCardId) {
            const card = ((b && b.cards) || []).find(c => c.id === li.binderCardId) || {};
            const snap = li.cardSnapshot || { name: card.name || li.name || 'Binder card', cardNumber: card.cardNumber || '', set: card.set || '' };
            return { binderId: li.binderId, binderCardId: li.binderCardId, cardSnapshot: snap,
                     name: snap.name || 'Binder card', qty: 1,
                     priceEach: num(li.priceEach), costEach: b ? num(b.costPerUnit) : num(li.costEach) };
          }
          return { binderId: li.binderId, name: (b ? b.name : 'Binder') + ' (bulk)', qty: num(li.qty),
                   priceEach: num(li.priceEach), costEach: b ? num(b.costPerUnit) : num(li.costEach) };
        }
        const inv = findInventory(li.inventoryId);
        return { inventoryId: inv.id, name: inv.name, qty: num(li.qty), priceEach: num(li.priceEach), costEach: inv.costPerUnit };
      });

      consumeInventory(finalItems);

      const record = {
        id: isEdit ? sale.id : genId(),
        date: body.querySelector('#f_date').value || todayISO(),
        buyer: body.querySelector('#f_buyer').value.trim(),
        platform: body.querySelector('#f_platform').value,
        showId: body.querySelector('#f_showId').value,
        items: finalItems,
        fees: num(body.querySelector('#f_fees').value),
        shipping: num(body.querySelector('#f_shipping').value),
        notes: body.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) Object.assign(sale, record); else DATA.sales.push(record);
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Sale updated.' : 'Sale recorded.');
    });
  });
}

/* ===========================================================
   TRADES
   =========================================================== */

let tradeGivenItems = [];
let tradeReceivedItems = [];

function tradeTotals(t) {
  const givenValue = t.given.reduce((s, i) => s + num(i.qty) * num(i.valueEach), 0);
  const receivedValue = t.received.reduce((s, i) => s + num(i.qty) * num(i.valueEach), 0);
  const cashReceived = num(t.cashReceived);
  const cashPaid = num(t.cashPaid);
  const givenBasis = t.given.reduce((s, i) => s + num(i.qty) * num(i.costEach), 0);
  // Net market swing including cash — did you come out ahead at market value?
  const net = (receivedValue + cashReceived) - (givenValue + cashPaid);
  return { givenValue, receivedValue, cashReceived, cashPaid, givenBasis, net };
}

// Carryover (substituted) basis: the cost basis of what you gave, plus cash paid, minus
// cash received, flows into the received cards — allocated by their relative market value.
function computeTradeCarryover(given, received, cashReceived, cashPaid) {
  let givenBasis = 0;
  for (const g of given) {
    let costEach = (g.costEach !== undefined && g.costEach !== null && g.costEach !== '') ? num(g.costEach) : null;
    if (costEach === null) { const inv = findInventory(g.inventoryId); costEach = inv ? num(inv.costPerUnit) : 0; }
    givenBasis += num(g.qty) * costEach;
  }
  const raw = givenBasis + num(cashPaid) - num(cashReceived);
  const totalNewBasis = Math.max(0, raw);
  const realizedGain = raw < 0 ? -raw : 0; // cash received exceeded your basis → a gain you can't defer
  const totalRecvValue = received.reduce((s, r) => s + num(r.qty) * num(r.valueEach), 0);
  const totalRecvQty = received.reduce((s, r) => s + num(r.qty), 0);
  const allocations = received.map(r => {
    let share = 0;
    if (totalRecvValue > 0) share = (num(r.qty) * num(r.valueEach)) / totalRecvValue;
    else if (totalRecvQty > 0) share = num(r.qty) / totalRecvQty;
    const basisTotal = totalNewBasis * share;
    return { basisTotal, basisPerUnit: num(r.qty) > 0 ? basisTotal / num(r.qty) : 0 };
  });
  return { givenBasis, totalNewBasis, realizedGain, totalRecvValue, allocations };
}

function renderTrades() {
  const tbody = document.querySelector('#tradesTable tbody');
  const rows = DATA.trades.slice().sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = '';
  if (rows.length === 0) { tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No trades recorded yet.</td></tr>`; return; }
  for (const t of rows) {
    const { givenValue, receivedValue, cashReceived, cashPaid, net } = tradeTotals(t);
    const cashNet = cashReceived - cashPaid;
    const cashCell = cashNet === 0 ? '—' : (cashNet > 0 ? '+' : '') + money(cashNet);
    const givenLabel = t.given.map(i => `${i.qty}× ${i.name}`).join(', ');
    const receivedLabel = t.received.map(i => `${i.qty}× ${i.name}`).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(t.date)}</td><td>${esc(t.partner)}</td>
      <td class="wrap">${esc(givenLabel)}</td><td class="num">${money(givenValue)}</td>
      <td class="wrap">${esc(receivedLabel)}</td><td class="num">${money(receivedValue)}</td>
      <td class="num ${cashNet > 0 ? 'pos' : (cashNet < 0 ? 'neg' : '')}">${cashCell}</td>
      <td class="num ${net >= 0 ? 'pos' : 'neg'}">${money(net)}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" data-act="edit" data-id="${t.id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${t.id}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#tradesTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const t = DATA.trades.find(x => x.id === btn.dataset.id); if (!t) return;
  if (btn.dataset.act === 'edit') openTradeModal(t);
  if (btn.dataset.act === 'del') {
    if (confirm('Delete this trade? Given quantities will be returned to inventory.')) {
      releaseInventory(t.given);
      DATA.trades = DATA.trades.filter(x => x.id !== t.id);
      saveData(); renderAll(); showToast('Trade deleted, stock restored.');
    }
  }
});

document.getElementById('tradesAddBtn').addEventListener('click', () => openTradeModal(null));
document.getElementById('tradesExportCsv').addEventListener('click', () => {
  const rows = DATA.trades.map(t => ({
    ...t, ...tradeTotals(t),
    givenLabel: t.given.map(i => `${i.qty}x ${i.name}`).join('; '),
    receivedLabel: t.received.map(i => `${i.qty}x ${i.name}`).join('; '),
  }));
  exportCsv('trades.csv', rows, [
    { label: 'Date', get: r => r.date }, { label: 'Partner', get: r => r.partner },
    { label: 'Given', get: r => r.givenLabel }, { label: 'Given Value', get: r => r.givenValue.toFixed(2) },
    { label: 'Given Cost Basis', get: r => r.givenBasis.toFixed(2) },
    { label: 'Received', get: r => r.receivedLabel }, { label: 'Received Value', get: r => r.receivedValue.toFixed(2) },
    { label: 'Cash Received', get: r => r.cashReceived.toFixed(2) }, { label: 'Cash Paid', get: r => r.cashPaid.toFixed(2) },
    { label: 'Basis to Received', get: r => num(r.carryoverBasis).toFixed(2) },
    { label: 'Net (mkt)', get: r => r.net.toFixed(2) }, { label: 'Notes', get: r => r.notes },
  ]);
});

function givenCostEach(li) {
  if (li.costEach !== undefined && li.costEach !== null && li.costEach !== '') return num(li.costEach);
  const inv = findInventory(li.inventoryId);
  return inv ? num(inv.costPerUnit) : 0;
}

function renderTradeGivenItems(container) {
  container.innerHTML = tradeGivenItems.map((li, idx) => `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>Item (from Inventory)</label>
        <select class="li-item">${inventoryOptionsHtml(li.inventoryId)}</select>
      </div>
      <div class="field"><label>Qty</label><input class="li-qty" type="number" min="1" step="1" value="${li.qty}"></div>
      <div class="field"><label>Est. Value/Ea</label><input class="li-value" type="number" min="0" step="0.01" value="${li.valueEach}"></div>
      <div class="field"><label>Your Cost/Ea</label><input type="text" value="${money(givenCostEach(li))}" disabled title="Cost basis from inventory — flows into the received cards"></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`).join('') || `<p class="muted">Nothing added yet.</p>`;

  container.querySelectorAll('.line-item-row').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelector('.li-item').addEventListener('change', e => {
      tradeGivenItems[idx].inventoryId = e.target.value;
      const inv = findInventory(e.target.value);
      if (inv) { tradeGivenItems[idx].valueEach = inv.marketPerUnit; tradeGivenItems[idx].costEach = inv.costPerUnit; }
      renderTradeGivenItems(container); updateTradeTotalsDisplay();
    });
    row.querySelector('.li-qty').addEventListener('input', e => { tradeGivenItems[idx].qty = num(e.target.value); updateTradeTotalsDisplay(); });
    row.querySelector('.li-value').addEventListener('input', e => { tradeGivenItems[idx].valueEach = num(e.target.value); updateTradeTotalsDisplay(); });
    row.querySelector('.line-item-remove').addEventListener('click', () => {
      tradeGivenItems.splice(idx, 1); renderTradeGivenItems(container); updateTradeTotalsDisplay();
    });
  });
}

function renderTradeReceivedItems(container) {
  container.innerHTML = tradeReceivedItems.map((li, idx) => `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>Name</label><input class="li-name" type="text" value="${esc(li.name)}" placeholder="e.g. Blastoise ex"></div>
      <div class="field"><label>Set</label><input class="li-set" type="text" value="${esc(li.set)}"></div>
      <div class="field"><label>Qty</label><input class="li-qty" type="number" min="1" step="1" value="${li.qty}"></div>
      <div class="field"><label>Est. Value/Ea</label><input class="li-value" type="number" min="0" step="0.01" value="${li.valueEach}"></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`).join('') || `<p class="muted">Nothing added yet.</p>`;

  container.querySelectorAll('.line-item-row').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelector('.li-name').addEventListener('input', e => { tradeReceivedItems[idx].name = e.target.value; });
    row.querySelector('.li-set').addEventListener('input', e => { tradeReceivedItems[idx].set = e.target.value; });
    row.querySelector('.li-qty').addEventListener('input', e => { tradeReceivedItems[idx].qty = num(e.target.value); updateTradeTotalsDisplay(); });
    row.querySelector('.li-value').addEventListener('input', e => { tradeReceivedItems[idx].valueEach = num(e.target.value); updateTradeTotalsDisplay(); });
    row.querySelector('.line-item-remove').addEventListener('click', () => {
      tradeReceivedItems.splice(idx, 1); renderTradeReceivedItems(container); updateTradeTotalsDisplay();
    });
  });
}

function readTradeCash() {
  const dirEl = document.getElementById('f_cashDir');
  const amtEl = document.getElementById('f_cashAmount');
  const dir = dirEl ? dirEl.value : 'none';
  const amt = amtEl ? num(amtEl.value) : 0;
  return { cashReceived: dir === 'received' ? amt : 0, cashPaid: dir === 'paid' ? amt : 0 };
}

function updateTradeTotalsDisplay() {
  const el = document.getElementById('tradeTotalsDisplay');
  if (!el) return;
  const givenValue = tradeGivenItems.reduce((s, i) => s + num(i.qty) * num(i.valueEach), 0);
  const receivedValue = tradeReceivedItems.reduce((s, i) => s + num(i.qty) * num(i.valueEach), 0);
  const { cashReceived, cashPaid } = readTradeCash();
  const carry = computeTradeCarryover(tradeGivenItems, tradeReceivedItems, cashReceived, cashPaid);
  const net = (receivedValue + cashReceived) - (givenValue + cashPaid);
  const cashLabel = cashReceived ? '+' + money(cashReceived) : (cashPaid ? '-' + money(cashPaid) : '—');
  const perCard = tradeReceivedItems
    .map((r, i) => `${esc(r.name || 'Card ' + (i + 1))}: <strong>${money(carry.allocations[i].basisPerUnit)}</strong>/ea`)
    .join(' &nbsp;·&nbsp; ');
  const basisFormula = carry.givenBasis || cashPaid || cashReceived
    ? ` <span class="muted">(your cost ${money(carry.givenBasis)}${cashPaid ? ' + cash paid ' + money(cashPaid) : ''}${cashReceived ? ' − cash received ' + money(cashReceived) : ''})</span>`
    : '';
  el.innerHTML = `
    <div>Given (market): <strong>${money(givenValue)}</strong> &nbsp; Received (market): <strong>${money(receivedValue)}</strong> &nbsp; Cash: <strong>${cashLabel}</strong> &nbsp; Net: <strong class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</strong></div>
    <div style="margin-top:6px;">Cost basis assigned to received cards: <strong>${money(carry.totalNewBasis)}</strong>${basisFormula}</div>
    ${tradeReceivedItems.length ? `<div class="muted" style="margin-top:4px;">${perCard}</div>` : ''}
    ${carry.realizedGain ? `<div class="neg" style="margin-top:4px;">Cash received exceeds your cost basis by ${money(carry.realizedGain)} — the received cards get $0.00 basis (that overflow is a realized gain).</div>` : ''}`;
}

function openTradeModal(trade) {
  const isEdit = !!trade;
  tradeGivenItems = isEdit ? trade.given.map(i => ({ ...i })) : [];
  tradeReceivedItems = isEdit ? trade.received.map(i => ({ ...i })) : [];
  const v = trade || { date: todayISO(), partner: '', notes: '', cashReceived: 0, cashPaid: 0 };
  const initCashDir = num(v.cashReceived) > 0 ? 'received' : (num(v.cashPaid) > 0 ? 'paid' : 'none');
  const initCashAmount = num(v.cashReceived) > 0 ? num(v.cashReceived) : (num(v.cashPaid) > 0 ? num(v.cashPaid) : 0);

  const html = `
    <div class="form-grid">
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Trade Partner</label><input id="f_partner" type="text" value="${esc(v.partner)}"></div>
    </div>

    <h3>Items You Gave (from Inventory)</h3>
    <div class="line-items" id="givenWrap"></div>
    <button class="btn secondary small add-line-btn" id="addGivenBtn">+ Add Given Item</button>

    <h3>Items You Received</h3>
    <div class="line-items" id="receivedWrap"></div>
    <button class="btn secondary small add-line-btn" id="addReceivedBtn">+ Add Received Item</button>
    ${!isEdit ? `<div class="field" style="margin-top:10px;"><label class="checkbox-field"><input type="checkbox" id="f_addToInv" checked> Add received items to Inventory at their carryover cost basis</label></div>` : ''}

    <div class="form-grid" style="margin-top:10px;">
      <div class="field"><label>Cash</label>
        <select id="f_cashDir">
          <option value="none" ${initCashDir === 'none' ? 'selected' : ''}>No cash</option>
          <option value="received" ${initCashDir === 'received' ? 'selected' : ''}>You received cash</option>
          <option value="paid" ${initCashDir === 'paid' ? 'selected' : ''}>You paid cash</option>
        </select>
      </div>
      <div class="field"><label>Cash Amount</label><input id="f_cashAmount" type="number" min="0" step="0.01" value="${initCashAmount}"></div>
    </div>

    <div class="line-totals" id="tradeTotalsDisplay"></div>

    <div class="form-grid" style="margin-top:14px;">
      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Record Trade'}</button>
    </div>`;

  openModal(isEdit ? 'Edit Trade' : 'New Trade', html, body => {
    const givenWrap = body.querySelector('#givenWrap');
    const receivedWrap = body.querySelector('#receivedWrap');
    renderTradeGivenItems(givenWrap);
    renderTradeReceivedItems(receivedWrap);
    updateTradeTotalsDisplay();

    body.querySelector('#addGivenBtn').addEventListener('click', () => {
      tradeGivenItems.push({ inventoryId: '', name: '', qty: 1, valueEach: 0 });
      renderTradeGivenItems(givenWrap); updateTradeTotalsDisplay();
    });
    body.querySelector('#addReceivedBtn').addEventListener('click', () => {
      tradeReceivedItems.push({ name: '', set: '', qty: 1, valueEach: 0 });
      renderTradeReceivedItems(receivedWrap); updateTradeTotalsDisplay();
    });
    body.querySelector('#f_cashDir').addEventListener('change', updateTradeTotalsDisplay);
    body.querySelector('#f_cashAmount').addEventListener('input', updateTradeTotalsDisplay);
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);

    body.querySelector('#saveBtn').addEventListener('click', () => {
      const cleanGiven = tradeGivenItems.filter(i => i.inventoryId && num(i.qty) > 0);
      const cleanReceived = tradeReceivedItems.filter(i => i.name.trim() && num(i.qty) > 0);

      if (isEdit) releaseInventory(trade.given);

      for (const li of cleanGiven) {
        const inv = findInventory(li.inventoryId);
        if (!inv) { alert('A given item no longer exists in inventory.'); if (isEdit) consumeInventory(trade.given); return; }
        if (num(li.qty) > inv.quantity) {
          alert(`Not enough stock for "${inv.name}". Available: ${inv.quantity}, requested: ${li.qty}.`);
          if (isEdit) consumeInventory(trade.given);
          return;
        }
      }

      const finalGiven = cleanGiven.map(li => {
        const inv = findInventory(li.inventoryId);
        return { inventoryId: inv.id, name: inv.name, qty: num(li.qty), valueEach: num(li.valueEach), costEach: num(inv.costPerUnit) };
      });
      const finalReceived = cleanReceived.map(li => ({ name: li.name.trim(), set: (li.set || '').trim(), qty: num(li.qty), valueEach: num(li.valueEach) }));

      // Carryover basis: spread the given cards' cost (± cash) across the received cards.
      const { cashReceived, cashPaid } = readTradeCash();
      const carry = computeTradeCarryover(finalGiven, finalReceived, cashReceived, cashPaid);
      finalReceived.forEach((r, i) => { r.costEach = Math.round(carry.allocations[i].basisPerUnit * 100) / 100; });

      consumeInventory(finalGiven);

      const record = {
        id: isEdit ? trade.id : genId(),
        date: body.querySelector('#f_date').value || todayISO(),
        partner: body.querySelector('#f_partner').value.trim(),
        given: finalGiven,
        received: finalReceived,
        cashReceived, cashPaid,
        carryoverBasis: Math.round(carry.totalNewBasis * 100) / 100,
        realizedGain: Math.round(carry.realizedGain * 100) / 100,
        notes: body.querySelector('#f_notes').value.trim(),
      };

      const addToInvCheckbox = body.querySelector('#f_addToInv');
      if (!isEdit && addToInvCheckbox && addToInvCheckbox.checked) {
        for (const r of finalReceived) {
          DATA.inventory.push({
            id: genId(), category: 'Single Card', name: r.name, set: r.set, cardNumber: '',
            condition: 'NM', graded: false, gradingCompany: '', grade: '',
            quantity: r.qty, costPerUnit: r.costEach, marketPerUnit: r.valueEach,
            dateAcquired: record.date, source: 'Trade', notes: `Received in trade with ${record.partner || 'trade partner'} (carryover basis)`,
          });
        }
      }

      if (isEdit) Object.assign(trade, record); else DATA.trades.push(record);
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Trade updated.' : 'Trade recorded.');
    });
  });
}

/* ===========================================================
   BULK LOTS  (flat-fee lots; cost split equally per card)
   =========================================================== */

function findLot(id) { return DATA.lots.find(l => l.id === id); }
function lotName(id) { const l = findLot(id); return l ? l.name : ''; }

function lotPerCard(lot) {
  const c = num(lot.cardCount);
  return c > 0 ? num(lot.totalCost) / c : 0;
}

// Every card sold out of a lot, gathered from sales line items that reference it.
function lotSoldItems(lot) {
  const out = [];
  for (const s of DATA.sales) {
    for (const it of (s.items || [])) {
      if (it.lotId === lot.id) {
        out.push({ saleId: s.id, date: s.date, showId: s.showId, platform: s.platform,
                   name: it.name, qty: num(it.qty), priceEach: num(it.priceEach), costEach: num(it.costEach) });
      }
    }
  }
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}

function lotStats(lot) {
  const perCard = lotPerCard(lot);
  const sold = lotSoldItems(lot);
  const soldQty = sold.reduce((a, x) => a + x.qty, 0);
  const remaining = num(lot.cardCount) - soldQty;
  const revenue = sold.reduce((a, x) => a + x.qty * x.priceEach, 0);
  const cogs = sold.reduce((a, x) => a + x.qty * x.costEach, 0);
  return { perCard, sold, soldQty, remaining, revenue, cogs, profit: revenue - cogs, remainingCost: perCard * remaining };
}

function renderLots() {
  const tbody = document.querySelector('#lotsTable tbody');
  const rows = DATA.lots.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">No bulk lots yet. Add one (e.g. 100 cards for $180) and the cost splits equally per card.</td></tr>`;
    return;
  }
  for (const lot of rows) {
    const st = lotStats(lot);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(lot.date)}</td>
      <td class="wrap">${esc(lot.name)}</td>
      <td class="wrap">${esc(lot.vendor)}</td>
      <td class="num">${money(lot.totalCost)}</td>
      <td class="num">${money(st.perCard)}</td>
      <td class="num">${num(lot.cardCount)}</td>
      <td class="num">${st.soldQty}</td>
      <td class="num">${st.remaining}</td>
      <td class="num">${money(st.revenue)}</td>
      <td class="num ${st.profit >= 0 ? 'pos' : 'neg'}">${money(st.profit)}</td>
      <td><div class="row-actions">
        <button class="btn primary small" data-act="open" data-id="${lot.id}">Open</button>
        <button class="btn danger small" data-act="del" data-id="${lot.id}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#lotsTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const lot = findLot(btn.dataset.id); if (!lot) return;
  if (btn.dataset.act === 'open') openLotModal(lot);
  if (btn.dataset.act === 'del') {
    const st = lotStats(lot);
    const warn = st.soldQty
      ? `\n\n${st.soldQty} sold card(s) from this lot are recorded as sales. Those sales are kept, but will no longer link back to a lot.`
      : '';
    if (confirm(`Delete lot "${lot.name}"?${warn}`)) {
      DATA.lots = DATA.lots.filter(l => l.id !== lot.id);
      saveData(); renderAll(); showToast('Lot deleted.');
    }
  }
});

document.getElementById('lotsAddBtn').addEventListener('click', () => openLotEditModal(null));
document.getElementById('lotsExportCsv').addEventListener('click', () => {
  const rows = DATA.lots.map(l => ({ ...l, ...lotStats(l) }));
  exportCsv('lots.csv', rows, [
    { label: 'Date', get: r => r.date }, { label: 'Lot', get: r => r.name }, { label: 'Vendor', get: r => r.vendor },
    { label: 'Total Cost', get: r => num(r.totalCost).toFixed(2) }, { label: 'Per Card', get: r => r.perCard.toFixed(2) },
    { label: 'Cards', get: r => num(r.cardCount) }, { label: 'Sold', get: r => r.soldQty }, { label: 'Remaining', get: r => r.remaining },
    { label: 'Revenue', get: r => r.revenue.toFixed(2) }, { label: 'COGS', get: r => r.cogs.toFixed(2) },
    { label: 'Profit', get: r => r.profit.toFixed(2) }, { label: 'Notes', get: r => r.notes },
  ]);
});

// Add / edit a lot's core fields.
function openLotEditModal(lot) {
  const isEdit = !!lot;
  const v = lot || { name: '', date: todayISO(), vendor: '', totalCost: 0, cardCount: 0, notes: '' };
  const html = `
    <div class="form-grid">
      <div class="field full"><label>Lot Name</label><input id="f_name" type="text" value="${esc(v.name)}" placeholder="e.g. Bulk box from card show"></div>
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Vendor / Source</label><input id="f_vendor" type="text" value="${esc(v.vendor)}"></div>
      <div class="field"><label>Total Cost ($)</label><input id="f_totalCost" type="number" min="0" step="0.01" value="${v.totalCost}"></div>
      <div class="field"><label>Number of Cards</label><input id="f_cardCount" type="number" min="1" step="1" value="${v.cardCount}"></div>
      <div class="field full"><div class="line-totals" id="perCardPreview" style="text-align:left;"></div></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Add Lot'}</button>
    </div>`;
  openModal(isEdit ? 'Edit Lot' : 'Add Bulk Lot', html, body => {
    const preview = () => {
      const tc = num(body.querySelector('#f_totalCost').value);
      const cc = num(body.querySelector('#f_cardCount').value);
      const pc = cc > 0 ? tc / cc : 0;
      body.querySelector('#perCardPreview').innerHTML =
        `Cost per card: <strong>${money(pc)}</strong>${cc > 0 ? ` &nbsp;(${money(tc)} ÷ ${cc} cards)` : ''}`;
    };
    preview();
    body.querySelector('#f_totalCost').addEventListener('input', preview);
    body.querySelector('#f_cardCount').addEventListener('input', preview);
    body.querySelector('#cancelBtn').addEventListener('click', () => isEdit ? openLotModal(lot) : closeModal());
    body.querySelector('#saveBtn').addEventListener('click', () => {
      const name = body.querySelector('#f_name').value.trim();
      if (!name) { alert('Please enter a lot name.'); return; }
      const cardCount = num(body.querySelector('#f_cardCount').value);
      if (cardCount < 1) { alert('Enter the number of cards (at least 1).'); return; }
      if (isEdit) {
        const soldQty = lotStats(lot).soldQty;
        if (cardCount < soldQty) { alert(`You've already sold ${soldQty} card(s) from this lot, so the count can't drop below ${soldQty}.`); return; }
      }
      const record = {
        id: isEdit ? lot.id : genId(),
        name,
        date: body.querySelector('#f_date').value || todayISO(),
        vendor: body.querySelector('#f_vendor').value.trim(),
        totalCost: num(body.querySelector('#f_totalCost').value),
        cardCount,
        notes: body.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) Object.assign(lot, record); else DATA.lots.push(record);
      saveData(); renderAll();
      showToast(isEdit ? 'Lot updated.' : 'Lot added.');
      if (isEdit) openLotModal(lot); else closeModal();
    });
  });
}

// Lot detail: stats, sold-card list, and the "Sell a Card" action.
function openLotModal(lot) {
  const st = lotStats(lot);
  const soldRows = st.sold.length ? st.sold.map(x => `
    <tr>
      <td>${esc(x.date)}</td>
      <td class="wrap">${x.name ? esc(x.name) : '<span class="muted">(unnamed)</span>'}</td>
      <td class="num">${x.qty}</td>
      <td class="num">${money(x.priceEach)}</td>
      <td class="num ${(x.priceEach - x.costEach) >= 0 ? 'pos' : 'neg'}">${money((x.priceEach - x.costEach) * x.qty)}</td>
      <td><button class="btn danger small" data-sale="${x.saleId}" data-name="${esc(x.name)}">Undo</button></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="6">No cards sold from this lot yet.</td></tr>`;

  const html = `
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-bottom:14px;">
      <div class="stat-card"><div class="label">Per Card</div><div class="value">${money(st.perCard)}</div><div class="sub">${money(lot.totalCost)} ÷ ${num(lot.cardCount)}</div></div>
      <div class="stat-card"><div class="label">Remaining</div><div class="value">${st.remaining}</div><div class="sub">of ${num(lot.cardCount)} cards</div></div>
      <div class="stat-card"><div class="label">Sold</div><div class="value">${st.soldQty}</div><div class="sub">${money(st.revenue)} revenue</div></div>
      <div class="stat-card"><div class="label">Lot Profit</div><div class="value ${st.profit >= 0 ? 'pos' : 'neg'}">${money(st.profit)}</div><div class="sub">so far</div></div>
    </div>
    <div class="toolbar">
      <button class="btn secondary small" id="editLotBtn">Edit Lot</button>
      <span class="spacer"></span>
      <button class="btn primary" id="sellCardBtn" ${st.remaining <= 0 ? 'disabled' : ''}>Sell a Card</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Card</th><th class="num">Qty</th><th class="num">Price/Ea</th><th class="num">Profit</th><th></th></tr></thead>
        <tbody id="lotSoldBody">${soldRows}</tbody>
      </table>
    </div>
    ${st.remaining <= 0 ? `<p class="muted" style="margin-top:10px;">All cards in this lot are sold. 🎉</p>` : ''}
    <div class="form-actions"><button class="btn secondary" id="closeLotBtn">Close</button></div>`;

  openModal(`Lot — ${lot.name}`, html, body => {
    body.querySelector('#closeLotBtn').addEventListener('click', closeModal);
    body.querySelector('#editLotBtn').addEventListener('click', () => openLotEditModal(lot));
    const sellBtn = body.querySelector('#sellCardBtn');
    if (sellBtn) sellBtn.addEventListener('click', () => openSellFromLotModal(lot));
    body.querySelector('#lotSoldBody').addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const label = btn.dataset.name ? ` of "${btn.dataset.name}"` : '';
      if (confirm(`Undo this sale${label}? The card(s) return to the lot as available and the sale is removed.`)) {
        undoLotSale(btn.dataset.sale);
        const fresh = findLot(lot.id);
        if (fresh) openLotModal(fresh); else closeModal();
      }
    });
  });
}

// Remove a sale that came from a lot (returns the card to the available pool).
function undoLotSale(saleId) {
  const s = DATA.sales.find(x => x.id === saleId);
  if (!s) return;
  releaseInventory(s.items); // no-op for pure lot lines; restores stock if the sale also held inventory items
  DATA.sales = DATA.sales.filter(x => x.id !== saleId);
  saveData(); renderAll(); showToast('Sale undone; card returned to lot.');
}

// Sell one (or several) cards out of a lot. Creates a normal Sale so totals/dashboard/shows stay accurate.
function openSellFromLotModal(lot) {
  const st = lotStats(lot);
  const html = `
    <p class="muted">Remaining in lot: <strong>${st.remaining}</strong> &nbsp;·&nbsp; Cost per card: <strong>${money(st.perCard)}</strong></p>
    <div class="form-grid">
      <div class="field full"><label>Card Name (what sold)</label><input id="f_name" type="text" placeholder="e.g. Pikachu VMAX — or 'bulk commons'"></div>
      <div class="field"><label>Qty</label><input id="f_qty" type="number" min="1" step="1" value="1"></div>
      <div class="field"><label>Sale Price / Ea</label><input id="f_price" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Platform</label><select id="f_platform">${fieldOptions(PLATFORMS, 'Local/Card Show')}</select></div>
      <div class="field full"><label>Show / Event</label><select id="f_showId">${showOptionsHtml('')}</select></div>
      <div class="field full"><label>Buyer (optional)</label><input id="f_buyer" type="text"></div>
      <div class="field full"><div class="line-totals" id="sellProfitPreview" style="text-align:left;"></div></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelSellBtn">Cancel</button>
      <button class="btn primary" id="confirmSellBtn">Record Sale</button>
    </div>`;
  openModal(`Sell from — ${lot.name}`, html, body => {
    const preview = () => {
      const qty = num(body.querySelector('#f_qty').value);
      const price = num(body.querySelector('#f_price').value);
      const profit = (price - st.perCard) * qty;
      body.querySelector('#sellProfitPreview').innerHTML =
        `Revenue: <strong>${money(price * qty)}</strong> &nbsp; Cost: <strong>${money(st.perCard * qty)}</strong> &nbsp; Profit: <strong class="${profit >= 0 ? 'pos' : 'neg'}">${money(profit)}</strong>`;
    };
    preview();
    body.querySelector('#f_qty').addEventListener('input', preview);
    body.querySelector('#f_price').addEventListener('input', preview);
    body.querySelector('#cancelSellBtn').addEventListener('click', () => openLotModal(lot));
    body.querySelector('#confirmSellBtn').addEventListener('click', () => {
      const qty = num(body.querySelector('#f_qty').value);
      if (qty < 1) { alert('Quantity must be at least 1.'); return; }
      const remaining = lotStats(lot).remaining;
      if (qty > remaining) { alert(`Only ${remaining} card(s) remain in this lot.`); return; }
      const sale = {
        id: genId(),
        date: body.querySelector('#f_date').value || todayISO(),
        buyer: body.querySelector('#f_buyer').value.trim(),
        platform: body.querySelector('#f_platform').value,
        showId: body.querySelector('#f_showId').value,
        items: [{ lotId: lot.id, lotName: lot.name, name: body.querySelector('#f_name').value.trim() || 'Card from lot',
                  qty, priceEach: num(body.querySelector('#f_price').value), costEach: lotPerCard(lot) }],
        fees: 0, shipping: 0,
        notes: `Sold from lot: ${lot.name}`,
      };
      DATA.sales.push(sale);
      saveData(); renderAll();
      showToast('Card sold from lot.');
      openLotModal(lot);
    });
  });
}

/* ===========================================================
   SHOWS / EVENTS  (per-show accounting)
   =========================================================== */

// Aggregate every money figure tied to one show.
function showAccounting(show) {
  const salesAtShow = DATA.sales.filter(s => s.showId === show.id);
  let revenue = 0, cogs = 0, feesShipping = 0;
  for (const s of salesAtShow) {
    const t = saleTotals(s);
    revenue += t.revenue;
    cogs += t.cogs;
    feesShipping += (s.fees || 0) + (s.shipping || 0);
  }
  const grossProfit = revenue - cogs - feesShipping;            // profit from selling
  const buys = DATA.purchases.filter(p => p.showId === show.id).reduce((a, p) => a + num(p.amount), 0);
  const showExpenses = DATA.expenses.filter(x => x.showId === show.id).reduce((a, x) => a + num(x.amount), 0);
  const tableRent = num(show.tableRent);
  const netProfit = grossProfit - tableRent - showExpenses;     // accounting profit for the event
  const cashFlow = revenue - buys - tableRent - showExpenses;   // change in cash at the event
  return { revenue, cogs, feesShipping, grossProfit, buys, showExpenses, tableRent, netProfit, cashFlow, salesCount: salesAtShow.length };
}

function renderShows() {
  const tbody = document.querySelector('#showsTable tbody');
  const rows = DATA.shows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No shows yet. Add a card show, then tag sales, buys, and expenses to it.</td></tr>`;
    return;
  }
  for (const show of rows) {
    const a = showAccounting(show);
    const tr = document.createElement('tr');
    tr.className = 'show-row';
    tr.innerHTML = `
      <td>${esc(show.date)}</td>
      <td class="wrap">${esc(show.name)}</td>
      <td class="wrap">${esc(show.location)}</td>
      <td class="num">${money(a.tableRent)}</td>
      <td class="num">${money(a.buys)}</td>
      <td class="num">${money(a.revenue)}</td>
      <td class="num ${a.grossProfit >= 0 ? 'pos' : 'neg'}">${money(a.grossProfit)}</td>
      <td class="num ${a.netProfit >= 0 ? 'pos' : 'neg'}">${money(a.netProfit)}</td>
      <td class="num ${a.cashFlow >= 0 ? 'pos' : 'neg'}">${money(a.cashFlow)}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" data-act="edit" data-id="${show.id}">Edit</button>
        <button class="btn danger small" data-act="del" data-id="${show.id}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#showsTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const show = findShow(btn.dataset.id); if (!show) return;
  if (btn.dataset.act === 'edit') openShowModal(show);
  if (btn.dataset.act === 'del') {
    const a = showAccounting(show);
    const linked = DATA.sales.filter(s => s.showId === show.id).length
      + DATA.purchases.filter(p => p.showId === show.id).length
      + DATA.expenses.filter(x => x.showId === show.id).length;
    const warn = linked
      ? `\n\n${linked} record(s) are tagged to this show. They will NOT be deleted, but will no longer be linked to any show.`
      : '';
    if (confirm(`Delete show "${show.name}"?${warn}`)) {
      DATA.sales.forEach(s => { if (s.showId === show.id) s.showId = ''; });
      DATA.purchases.forEach(p => { if (p.showId === show.id) p.showId = ''; });
      DATA.expenses.forEach(x => { if (x.showId === show.id) x.showId = ''; });
      DATA.shows = DATA.shows.filter(s => s.id !== show.id);
      saveData(); renderAll(); showToast('Show deleted.');
    }
  }
});

document.getElementById('showsAddBtn').addEventListener('click', () => openShowModal(null));
document.getElementById('showsExportCsv').addEventListener('click', () => {
  const rows = DATA.shows.map(s => ({ ...s, ...showAccounting(s) }));
  exportCsv('shows.csv', rows, [
    { label: 'Date', get: r => r.date }, { label: 'Show', get: r => r.name },
    { label: 'Location', get: r => r.location }, { label: 'Table Rent', get: r => r.tableRent.toFixed(2) },
    { label: 'Buys', get: r => r.buys.toFixed(2) }, { label: 'Sales Revenue', get: r => r.revenue.toFixed(2) },
    { label: 'COGS', get: r => r.cogs.toFixed(2) }, { label: 'Gross Profit', get: r => r.grossProfit.toFixed(2) },
    { label: 'Show Expenses', get: r => r.showExpenses.toFixed(2) }, { label: 'Net Profit', get: r => r.netProfit.toFixed(2) },
    { label: 'Cash Flow', get: r => r.cashFlow.toFixed(2) }, { label: 'Notes', get: r => r.notes },
  ]);
});

function openShowModal(show) {
  const isEdit = !!show;
  const v = show || { name: '', date: todayISO(), location: '', tableRent: 0, notes: '' };
  const a = isEdit ? showAccounting(show) : null;
  const summaryHtml = a ? `
    <div class="line-totals" style="text-align:left;">
      Revenue: <strong>${money(a.revenue)}</strong> &nbsp; Buys: <strong>${money(a.buys)}</strong> &nbsp;
      Gross Profit: <strong class="${a.grossProfit >= 0 ? 'pos' : 'neg'}">${money(a.grossProfit)}</strong><br>
      Net Profit: <strong class="${a.netProfit >= 0 ? 'pos' : 'neg'}">${money(a.netProfit)}</strong> &nbsp;
      Cash Flow: <strong class="${a.cashFlow >= 0 ? 'pos' : 'neg'}">${money(a.cashFlow)}</strong>
    </div>` : '';
  const html = `
    <div class="form-grid">
      <div class="field full"><label>Show / Event Name</label><input id="f_name" type="text" value="${esc(v.name)}" placeholder="e.g. Springfield Card Show — Aug"></div>
      <div class="field"><label>Date</label><input id="f_date" type="date" value="${esc(v.date)}"></div>
      <div class="field"><label>Table Rent</label><input id="f_tableRent" type="number" min="0" step="0.01" value="${v.tableRent || 0}"></div>
      <div class="field full"><label>Location / Venue</label><input id="f_location" type="text" value="${esc(v.location)}" placeholder="e.g. Community Center, Hall B"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    ${summaryHtml}
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Add Show'}</button>
    </div>`;
  openModal(isEdit ? 'Edit Show' : 'Add Show', html, body => {
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);
    body.querySelector('#saveBtn').addEventListener('click', () => {
      const name = body.querySelector('#f_name').value.trim();
      if (!name) { alert('Please enter a show name.'); return; }
      const record = {
        id: isEdit ? show.id : genId(),
        name,
        date: body.querySelector('#f_date').value || todayISO(),
        location: body.querySelector('#f_location').value.trim(),
        tableRent: num(body.querySelector('#f_tableRent').value),
        notes: body.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) Object.assign(show, record); else DATA.shows.push(record);
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Show updated.' : 'Show added.');
    });
  });
}

/* ===========================================================
   DASHBOARD
   =========================================================== */

function renderDashboard() {
  const invValue = DATA.inventory.reduce((s, i) => s + i.quantity * i.marketPerUnit, 0);
  const invCost = DATA.inventory.reduce((s, i) => s + i.quantity * i.costPerUnit, 0);
  const invUnits = DATA.inventory.reduce((s, i) => s + i.quantity, 0);

  // Unsold cards still sitting in bulk lots, valued at their split cost.
  const lotRemainingCost = DATA.lots.reduce((s, l) => s + lotStats(l).remainingCost, 0);
  const lotRemainingUnits = DATA.lots.reduce((s, l) => s + lotStats(l).remaining, 0);
  const totalCostBasis = invCost + lotRemainingCost;
  const totalMarketValue = invValue + lotRemainingCost; // bulk pile carried at cost
  const totalUnits = invUnits + lotRemainingUnits;

  const salesData = DATA.sales.map(saleTotals);
  const revenue = salesData.reduce((s, x) => s + x.revenue, 0);
  const cogs = salesData.reduce((s, x) => s + x.cogs, 0);
  const feesShipping = DATA.sales.reduce((s, x) => s + (x.fees || 0) + (x.shipping || 0), 0);
  const salesProfit = revenue - cogs - feesShipping;

  const totalExpenses = DATA.expenses.reduce((s, x) => s + x.amount, 0);
  const totalPurchases = DATA.purchases.reduce((s, x) => s + x.amount, 0);
  const netProfit = salesProfit - totalExpenses;

  const trades = DATA.trades.map(tradeTotals);
  const netTradeValue = trades.reduce((s, x) => s + x.net, 0);

  const stats = [
    { label: 'Inventory Units', value: totalUnits.toLocaleString(), sub: `${DATA.inventory.length} items + ${lotRemainingUnits} in lots` },
    { label: 'Inventory Cost Basis', value: money(totalCostBasis), sub: 'What you paid (incl. lots)' },
    { label: 'Inventory Market Value', value: money(totalMarketValue), sub: (totalMarketValue - totalCostBasis >= 0 ? '+' : '') + money(totalMarketValue - totalCostBasis) + ' unrealized' },
    { label: 'Bulk Lots (remaining)', value: lotRemainingUnits.toLocaleString() + ' cards', sub: money(lotRemainingCost) + ' at cost · ' + DATA.lots.length + ' lots' },
    { label: 'Total Sales Revenue', value: money(revenue), sub: `${DATA.sales.length} sales` },
    { label: 'Total COGS', value: money(cogs), sub: 'Cost of items sold' },
    { label: 'Sales Profit', value: money(salesProfit), sub: 'Revenue − COGS − fees/shipping', cls: salesProfit >= 0 ? 'pos' : 'neg' },
    { label: 'Business Expenses', value: money(totalExpenses), sub: `${DATA.expenses.length} entries` },
    { label: 'Net Profit', value: money(netProfit), sub: 'Sales profit − expenses', cls: netProfit >= 0 ? 'pos' : 'neg' },
    { label: 'Total Purchases (cash out)', value: money(totalPurchases), sub: 'Informational, cash spent on stock' },
    { label: 'Net Trade Value', value: money(netTradeValue), sub: `${DATA.trades.length} trades`, cls: netTradeValue >= 0 ? 'pos' : 'neg' },
  ];

  document.getElementById('statGrid').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="label">${esc(s.label)}</div>
      <div class="value ${s.cls || ''}">${s.value}</div>
      <div class="sub">${esc(s.sub)}</div>
    </div>`).join('');

  // Recent activity feed
  const activity = [];
  DATA.sales.forEach(s => activity.push({ date: s.date, type: 'Sale', detail: `${s.items.length} item(s) to ${s.buyer || 'buyer'} via ${s.platform}`, amount: saleTotals(s).revenue }));
  DATA.purchases.forEach(p => activity.push({ date: p.date, type: 'Purchase', detail: `${p.description || p.category} from ${p.vendor || '—'}`, amount: -p.amount }));
  DATA.trades.forEach(t => activity.push({ date: t.date, type: 'Trade', detail: `with ${t.partner || '—'}`, amount: tradeTotals(t).net }));
  DATA.expenses.forEach(x => activity.push({ date: x.date, type: 'Expense', detail: `${x.category}: ${x.description || ''}`, amount: -x.amount }));
  activity.sort((a, b) => b.date.localeCompare(a.date));

  const activityTable = document.getElementById('recentActivityTable');
  activityTable.querySelector('thead').innerHTML = `<tr><th>Date</th><th>Type</th><th>Detail</th><th>Amount</th></tr>`;
  const activityBody = activity.slice(0, 12).map(a => `
    <tr><td>${esc(a.date)}</td><td>${esc(a.type)}</td><td class="wrap">${esc(a.detail)}</td>
    <td class="num ${a.amount >= 0 ? 'pos' : 'neg'}">${money(a.amount)}</td></tr>`).join('');
  activityTable.querySelector('tbody').innerHTML = activityBody || `<tr class="empty-row"><td colspan="4">No activity yet — add some inventory to get started.</td></tr>`;

  // Top inventory by market value
  const topInv = DATA.inventory.slice().sort((a, b) => (b.quantity * b.marketPerUnit) - (a.quantity * a.marketPerUnit)).slice(0, 10);
  const topTable = document.getElementById('topInventoryTable');
  topTable.querySelector('thead').innerHTML = `<tr><th>Name</th><th>Qty</th><th>Market Value</th></tr>`;
  topTable.querySelector('tbody').innerHTML = topInv.map(i => `
    <tr><td class="wrap">${esc(i.name)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.quantity * i.marketPerUnit)}</td></tr>`).join('')
    || `<tr class="empty-row"><td colspan="3">No inventory yet.</td></tr>`;
}

/* ===========================================================
   BACKUP
   =========================================================== */

document.getElementById('backupExportBtn').addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`pkmn-tcg-tracker-backup-${stamp}.json`, JSON.stringify(DATA, null, 2), 'application/json');
  showToast('Backup downloaded.');
});

document.getElementById('backupImportInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!confirm('Restoring will replace ALL current data with the contents of this backup file. Continue?')) { e.target.value = ''; return; }
      DATA = Object.assign(defaultData(), parsed);
      saveData(); renderAll();
      showToast('Backup restored.');
    } catch (err) {
      alert('Could not read that file — is it a valid backup JSON?');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (confirm('This will permanently erase ALL inventory, sales, purchases, trades, and expense data in this browser. This cannot be undone. Continue?')) {
    if (confirm('Are you absolutely sure? Consider downloading a backup first.')) {
      DATA = defaultData();
      saveData(); renderAll();
      showToast('All data cleared.');
    }
  }
});

/* ===========================================================
   INIT
   =========================================================== */

/* ---- Install to home screen (Android/Chrome) ---- */
let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtn) installBtn.hidden = false;
});
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });
}
window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.hidden = true;
  showToast('HoennDex installed. Open it from your home screen.');
});

/* ===========================================================
   FINANCE  (cash on hand + bank − expenses = available cashflow)
   =========================================================== */

function renderFinance() {
  const f = DATA.finance || (DATA.finance = { cashOnHand: 0, bank: 0 });
  const cash = num(f.cashOnHand);
  const bank = num(f.bank);
  const onHand = cash + bank;
  const totalExpenses = DATA.expenses.reduce((s, x) => s + num(x.amount), 0);
  const available = onHand - totalExpenses;

  // Keep inputs in sync without clobbering what the user is currently typing.
  const cashEl = document.getElementById('finCash');
  const bankEl = document.getElementById('finBank');
  if (cashEl && document.activeElement !== cashEl) cashEl.value = cash;
  if (bankEl && document.activeElement !== bankEl) bankEl.value = bank;

  const stats = [
    { label: 'Cash on Hand', value: money(cash) },
    { label: 'Bank Balance', value: money(bank) },
    { label: 'Total On Hand', value: money(onHand), sub: 'Cash + Bank' },
    { label: 'Total Expenses', value: money(totalExpenses), sub: `${DATA.expenses.length} ${DATA.expenses.length === 1 ? 'entry' : 'entries'}` },
    { label: 'Available Cashflow', value: money(available), sub: 'On hand − expenses', cls: available >= 0 ? 'pos' : 'neg' },
  ];
  const el = document.getElementById('financeStats');
  if (el) el.innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="label">${esc(s.label)}</div>
      <div class="value ${s.cls || ''}">${s.value}</div>
      ${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}
    </div>`).join('');
}

const finSaveBtn = document.getElementById('finSaveBtn');
if (finSaveBtn) {
  finSaveBtn.addEventListener('click', () => {
    if (!DATA.finance) DATA.finance = { cashOnHand: 0, bank: 0 };
    DATA.finance.cashOnHand = num(document.getElementById('finCash').value);
    DATA.finance.bank = num(document.getElementById('finBank').value);
    saveData(); renderAll();
    showToast('Balances saved.');
  });
}

function renderAll() {
  renderDashboard();
  renderSingles();
  renderSlabs();
  renderBinder();
  renderLots();
  renderShows();
  renderPurchases();
  renderSales();
  renderTrades();
  renderExpenses();
  renderFinance();
}

renderAll();
