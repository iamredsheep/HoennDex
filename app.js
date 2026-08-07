/* ===========================================================
   Pokémon TCG Business Tracker — app.js
   Vanilla JS, no build step. Data persisted to localStorage.
   =========================================================== */

const STORE_KEY = 'pkmnTcgTracker_v1';

const CATEGORIES = ['Single Card', 'Sealed Product', 'Supplies/Other'];
const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG', 'Sealed'];
const SOURCES = ['Purchased', 'Trade', 'Pulled/Opened', 'Other'];
const PLATFORMS = ['eBay', 'TCGPlayer', 'Facebook/Marketplace', 'Whatnot', 'Local/Card Show', 'Other'];
const PURCHASE_CATS = ['Singles', 'Sealed Product', 'Supplies', 'Fees', 'Other'];
const EXPENSE_CATS = ['Shipping Supplies', 'Software/Subscriptions', 'Booth/Event Fees', 'Travel', 'Marketing', 'Platform Fees', 'Other'];
const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'SGC', 'Other'];

/* ---------------- Data store ---------------- */

function defaultData() {
  return { inventory: [], shows: [], purchases: [], sales: [], trades: [], expenses: [] };
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

/* ===========================================================
   INVENTORY
   =========================================================== */

function findInventory(id) { return DATA.inventory.find(i => i.id === id); }

function invTotals(item) {
  return { totalCost: item.quantity * item.costPerUnit, totalMarket: item.quantity * item.marketPerUnit };
}

function renderInventory() {
  const tbody = document.querySelector('#inventoryTable tbody');
  const search = document.getElementById('invSearch').value.trim().toLowerCase();
  const catFilter = document.getElementById('invCategoryFilter').value;

  let rows = DATA.inventory.filter(item => {
    if (catFilter && item.category !== catFilter) return false;
    if (search) {
      const hay = [item.name, item.set, item.cardNumber, item.notes].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  rows = rows.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">No inventory items yet.</td></tr>`;
    return;
  }

  for (const item of rows) {
    const { totalCost, totalMarket } = invTotals(item);
    const conditionLabel = item.graded
      ? `${esc(item.gradingCompany || '')} ${esc(item.grade || '')} <span class="badge graded">GRADED</span>`
      : esc(item.condition || '');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="wrap">${esc(item.name)}</td>
      <td>${esc(item.category)}</td>
      <td>${esc(item.set)}</td>
      <td>${esc(item.cardNumber)}</td>
      <td>${conditionLabel}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.costPerUnit)}</td>
      <td class="num">${money(item.marketPerUnit)}</td>
      <td class="num">${money(totalCost)}</td>
      <td class="num">${money(totalMarket)}</td>
      <td>${esc(item.dateAcquired)}</td>
      <td>
        <div class="row-actions">
          <button class="btn secondary small" data-act="edit" data-id="${item.id}">Edit</button>
          <button class="btn danger small" data-act="del" data-id="${item.id}">Delete</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  }
}

document.querySelector('#inventoryTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const item = findInventory(btn.dataset.id);
  if (!item) return;
  if (btn.dataset.act === 'edit') openInventoryModal(item);
  if (btn.dataset.act === 'del') {
    if (confirm(`Delete "${item.name}" from inventory? This cannot be undone.`)) {
      DATA.inventory = DATA.inventory.filter(i => i.id !== item.id);
      saveData(); renderAll();
      showToast('Item deleted.');
    }
  }
});

document.getElementById('invSearch').addEventListener('input', renderInventory);
document.getElementById('invCategoryFilter').addEventListener('change', renderInventory);
document.getElementById('invAddBtn').addEventListener('click', () => openInventoryModal(null));
document.getElementById('invExportCsv').addEventListener('click', () => {
  exportCsv('inventory.csv', DATA.inventory, [
    { label: 'Name', get: r => r.name }, { label: 'Category', get: r => r.category },
    { label: 'Set', get: r => r.set }, { label: 'Card #', get: r => r.cardNumber },
    { label: 'Condition', get: r => r.condition }, { label: 'Graded', get: r => r.graded ? 'Yes' : 'No' },
    { label: 'Grading Co', get: r => r.gradingCompany }, { label: 'Grade', get: r => r.grade },
    { label: 'Quantity', get: r => r.quantity }, { label: 'Cost/Unit', get: r => r.costPerUnit },
    { label: 'Market/Unit', get: r => r.marketPerUnit }, { label: 'Date Acquired', get: r => r.dateAcquired },
    { label: 'Source', get: r => r.source }, { label: 'Notes', get: r => r.notes },
  ]);
});

function openInventoryModal(item) {
  const isEdit = !!item;
  const v = item || {
    category: 'Single Card', name: '', set: '', cardNumber: '', condition: 'NM',
    graded: false, gradingCompany: 'PSA', grade: '', quantity: 1, costPerUnit: 0,
    marketPerUnit: 0, dateAcquired: todayISO(), source: 'Purchased', notes: ''
  };

  const html = `
    <div class="form-grid">
      <div class="field"><label>Category</label>
        <select id="f_category">${fieldOptions(CATEGORIES, v.category)}</select>
      </div>
      <div class="field"><label>Name</label><input id="f_name" type="text" value="${esc(v.name)}" placeholder="e.g. Charizard ex"></div>

      <div class="field"><label>Set / Expansion</label><input id="f_set" type="text" value="${esc(v.set)}" placeholder="e.g. Obsidian Flames"></div>
      <div class="field"><label>Card #</label><input id="f_cardNumber" type="text" value="${esc(v.cardNumber)}" placeholder="e.g. 125/197"></div>

      <div class="field"><label>Condition</label>
        <select id="f_condition">${fieldOptions(CONDITIONS, v.condition)}</select>
      </div>
      <div class="field"><label>Quantity</label><input id="f_quantity" type="number" min="0" step="1" value="${v.quantity}"></div>

      <div class="field full">
        <label class="checkbox-field"><input type="checkbox" id="f_graded" ${v.graded ? 'checked' : ''}> Graded card</label>
      </div>
      <div class="field" id="wrap_gradingCompany" style="display:${v.graded ? 'block' : 'none'}"><label>Grading Company</label>
        <select id="f_gradingCompany">${fieldOptions(GRADING_COMPANIES, v.gradingCompany || 'PSA')}</select>
      </div>
      <div class="field" id="wrap_grade" style="display:${v.graded ? 'block' : 'none'}"><label>Grade</label>
        <input id="f_grade" type="text" value="${esc(v.grade)}" placeholder="e.g. 10">
      </div>

      <div class="field"><label>Cost / Unit</label><input id="f_costPerUnit" type="number" min="0" step="0.01" value="${v.costPerUnit}"></div>
      <div class="field"><label>Market Value / Unit</label><input id="f_marketPerUnit" type="number" min="0" step="0.01" value="${v.marketPerUnit}"></div>

      <div class="field"><label>Date Acquired</label><input id="f_dateAcquired" type="date" value="${esc(v.dateAcquired)}"></div>
      <div class="field"><label>Source</label><select id="f_source">${fieldOptions(SOURCES, v.source)}</select></div>

      <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn secondary" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isEdit ? 'Save Changes' : 'Add Item'}</button>
    </div>`;

  openModal(isEdit ? 'Edit Inventory Item' : 'Add Inventory Item', html, body => {
    body.querySelector('#f_graded').addEventListener('change', e => {
      body.querySelector('#wrap_gradingCompany').style.display = e.target.checked ? 'block' : 'none';
      body.querySelector('#wrap_grade').style.display = e.target.checked ? 'block' : 'none';
    });
    body.querySelector('#cancelBtn').addEventListener('click', closeModal);
    body.querySelector('#saveBtn').addEventListener('click', () => {
      const name = body.querySelector('#f_name').value.trim();
      if (!name) { alert('Please enter a name.'); return; }
      const record = {
        id: isEdit ? item.id : genId(),
        category: body.querySelector('#f_category').value,
        name,
        set: body.querySelector('#f_set').value.trim(),
        cardNumber: body.querySelector('#f_cardNumber').value.trim(),
        condition: body.querySelector('#f_condition').value,
        graded: body.querySelector('#f_graded').checked,
        gradingCompany: body.querySelector('#f_gradingCompany').value,
        grade: body.querySelector('#f_grade').value.trim(),
        quantity: num(body.querySelector('#f_quantity').value),
        costPerUnit: num(body.querySelector('#f_costPerUnit').value),
        marketPerUnit: num(body.querySelector('#f_marketPerUnit').value),
        dateAcquired: body.querySelector('#f_dateAcquired').value || todayISO(),
        source: body.querySelector('#f_source').value,
        notes: body.querySelector('#f_notes').value.trim(),
      };
      if (isEdit) {
        Object.assign(item, record);
      } else {
        DATA.inventory.push(record);
      }
      saveData(); renderAll(); closeModal();
      showToast(isEdit ? 'Item updated.' : 'Item added.');
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

function releaseInventory(items) {
  for (const it of items) {
    const inv = findInventory(it.inventoryId);
    if (inv) inv.quantity += it.qty;
  }
}
function consumeInventory(items) {
  for (const it of items) {
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

function renderSaleLineItems(container) {
  container.innerHTML = saleLineItems.map((li, idx) => `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>Item</label>
        <select class="li-item">${inventoryOptionsHtml(li.inventoryId)}</select>
      </div>
      <div class="field"><label>Qty</label><input class="li-qty" type="number" min="1" step="1" value="${li.qty}"></div>
      <div class="field"><label>Price/Ea</label><input class="li-price" type="number" min="0" step="0.01" value="${li.priceEach}"></div>
      <div class="field"><label>Avail.</label><input type="text" value="${availableQty(li.inventoryId) + (findInventory(li.inventoryId) ? 0 : 0)}" disabled></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`).join('') || `<p class="muted">No items added yet.</p>`;

  container.querySelectorAll('.line-item-row').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelector('.li-item').addEventListener('change', e => {
      saleLineItems[idx].inventoryId = e.target.value;
      const inv = findInventory(e.target.value);
      if (inv) saleLineItems[idx].priceEach = inv.marketPerUnit;
      renderSaleLineItems(container);
      updateSaleTotalsDisplay();
    });
    row.querySelector('.li-qty').addEventListener('input', e => {
      saleLineItems[idx].qty = num(e.target.value); updateSaleTotalsDisplay();
    });
    row.querySelector('.li-price').addEventListener('input', e => {
      saleLineItems[idx].priceEach = num(e.target.value); updateSaleTotalsDisplay();
    });
    row.querySelector('.line-item-remove').addEventListener('click', () => {
      saleLineItems.splice(idx, 1); renderSaleLineItems(container); updateSaleTotalsDisplay();
    });
  });
}

function updateSaleTotalsDisplay() {
  const el = document.getElementById('saleTotalsDisplay');
  if (!el) return;
  const subtotal = saleLineItems.reduce((s, i) => s + (num(i.qty) * num(i.priceEach)), 0);
  const fees = num(document.getElementById('f_fees').value);
  const shipping = num(document.getElementById('f_shipping').value);
  const cogs = saleLineItems.reduce((s, li) => {
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
      const cleanItems = saleLineItems.filter(i => i.inventoryId && num(i.qty) > 0);
      if (cleanItems.length === 0) { alert('Add at least one item with a valid quantity.'); return; }

      // Temporarily release stock held by the original sale (if editing) so validation reflects true availability
      if (isEdit) releaseInventory(sale.items);

      for (const li of cleanItems) {
        const inv = findInventory(li.inventoryId);
        if (!inv) { alert('An item in this sale no longer exists in inventory.'); if (isEdit) consumeInventory(sale.items); return; }
        if (num(li.qty) > inv.quantity) {
          alert(`Not enough stock for "${inv.name}". Available: ${inv.quantity}, requested: ${li.qty}.`);
          if (isEdit) consumeInventory(sale.items);
          return;
        }
      }

      const finalItems = cleanItems.map(li => {
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
  const givenValue = t.given.reduce((s, i) => s + i.qty * i.valueEach, 0);
  const receivedValue = t.received.reduce((s, i) => s + i.qty * i.valueEach, 0);
  return { givenValue, receivedValue, net: receivedValue - givenValue };
}

function renderTrades() {
  const tbody = document.querySelector('#tradesTable tbody');
  const rows = DATA.trades.slice().sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = '';
  if (rows.length === 0) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No trades recorded yet.</td></tr>`; return; }
  for (const t of rows) {
    const { givenValue, receivedValue, net } = tradeTotals(t);
    const givenLabel = t.given.map(i => `${i.qty}× ${i.name}`).join(', ');
    const receivedLabel = t.received.map(i => `${i.qty}× ${i.name}`).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(t.date)}</td><td>${esc(t.partner)}</td>
      <td class="wrap">${esc(givenLabel)}</td><td class="num">${money(givenValue)}</td>
      <td class="wrap">${esc(receivedLabel)}</td><td class="num">${money(receivedValue)}</td>
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
    { label: 'Received', get: r => r.receivedLabel }, { label: 'Received Value', get: r => r.receivedValue.toFixed(2) },
    { label: 'Net', get: r => r.net.toFixed(2) }, { label: 'Notes', get: r => r.notes },
  ]);
});

function renderTradeGivenItems(container) {
  container.innerHTML = tradeGivenItems.map((li, idx) => `
    <div class="line-item-row" data-idx="${idx}">
      <div class="field"><label>Item (from Inventory)</label>
        <select class="li-item">${inventoryOptionsHtml(li.inventoryId)}</select>
      </div>
      <div class="field"><label>Qty</label><input class="li-qty" type="number" min="1" step="1" value="${li.qty}"></div>
      <div class="field"><label>Est. Value/Ea</label><input class="li-value" type="number" min="0" step="0.01" value="${li.valueEach}"></div>
      <div class="field"></div>
      <button class="line-item-remove" title="Remove line">&times;</button>
    </div>`).join('') || `<p class="muted">Nothing added yet.</p>`;

  container.querySelectorAll('.line-item-row').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelector('.li-item').addEventListener('change', e => {
      tradeGivenItems[idx].inventoryId = e.target.value;
      const inv = findInventory(e.target.value);
      if (inv) tradeGivenItems[idx].valueEach = inv.marketPerUnit;
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

function updateTradeTotalsDisplay() {
  const el = document.getElementById('tradeTotalsDisplay');
  if (!el) return;
  const givenValue = tradeGivenItems.reduce((s, i) => s + num(i.qty) * num(i.valueEach), 0);
  const receivedValue = tradeReceivedItems.reduce((s, i) => s + num(i.qty) * num(i.valueEach), 0);
  const net = receivedValue - givenValue;
  el.innerHTML = `Given: <strong>${money(givenValue)}</strong> &nbsp; Received: <strong>${money(receivedValue)}</strong> &nbsp; Net: <strong class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</strong>`;
}

function openTradeModal(trade) {
  const isEdit = !!trade;
  tradeGivenItems = isEdit ? trade.given.map(i => ({ ...i })) : [];
  tradeReceivedItems = isEdit ? trade.received.map(i => ({ ...i })) : [];
  const v = trade || { date: todayISO(), partner: '', notes: '' };

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
    ${!isEdit ? `<div class="field" style="margin-top:10px;"><label class="checkbox-field"><input type="checkbox" id="f_addToInv" checked> Add received items to Inventory when saved</label></div>` : ''}

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
        return { inventoryId: inv.id, name: inv.name, qty: num(li.qty), valueEach: num(li.valueEach) };
      });
      const finalReceived = cleanReceived.map(li => ({ name: li.name.trim(), set: (li.set || '').trim(), qty: num(li.qty), valueEach: num(li.valueEach) }));

      consumeInventory(finalGiven);

      const record = {
        id: isEdit ? trade.id : genId(),
        date: body.querySelector('#f_date').value || todayISO(),
        partner: body.querySelector('#f_partner').value.trim(),
        given: finalGiven,
        received: finalReceived,
        notes: body.querySelector('#f_notes').value.trim(),
      };

      const addToInvCheckbox = body.querySelector('#f_addToInv');
      if (!isEdit && addToInvCheckbox && addToInvCheckbox.checked) {
        for (const r of finalReceived) {
          DATA.inventory.push({
            id: genId(), category: 'Single Card', name: r.name, set: r.set, cardNumber: '',
            condition: 'NM', graded: false, gradingCompany: '', grade: '',
            quantity: r.qty, costPerUnit: r.qty > 0 ? r.valueEach : 0, marketPerUnit: r.valueEach,
            dateAcquired: record.date, source: 'Trade', notes: `Received in trade with ${record.partner || 'trade partner'}`,
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
    { label: 'Inventory Units', value: invUnits.toLocaleString(), sub: `${DATA.inventory.length} unique items` },
    { label: 'Inventory Cost Basis', value: money(invCost), sub: 'What you paid' },
    { label: 'Inventory Market Value', value: money(invValue), sub: (invValue - invCost >= 0 ? '+' : '') + money(invValue - invCost) + ' unrealized' },
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

function renderAll() {
  renderDashboard();
  renderInventory();
  renderShows();
  renderPurchases();
  renderSales();
  renderTrades();
  renderExpenses();
}

renderAll();
