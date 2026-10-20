// ============================================================================
// Amadeni (Debts) + Ibitabo by'ibaruramari (Books) - interface.
// Amagambo yose avuye muri locale (rw/en/fr) ukoresheje t() / tf().
// ============================================================================

function tf(key, params) {
  let s = t(key);
  Object.keys(params || {}).forEach(k => { s = s.split('{' + k + '}').join(params[k] == null ? '' : params[k]); });
  return s;
}
function todayStr() {
  const d = new Date(Date.now() + 2 * 3600 * 1000); // Kigali (UTC+2)
  return d.toISOString().slice(0, 10);
}
function fmtDay(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function num(n) { return Math.round(n || 0).toLocaleString('en-US'); }

function methodLabel(m, bank) {
  if (m === 'phone') return `📱 ${t('mobileMoney')}`;
  if (m === 'bank') return `🏦 ${esc(bank || t('bank'))}`;
  if (m === 'credit') return `📝 ${t('debt')}`;
  return `💵 ${t('cash')}`;
}

// ---------- Modal ----------
function openModal(html) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay';
  wrap.id = 'app-modal';
  wrap.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">${html}</div>`;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  return wrap;
}
function closeModal() {
  const m = document.getElementById('app-modal');
  if (m) m.remove();
}
function methodPickerHtml(prefix) {
  return `
    <div class="pay-toggle" id="${prefix}-methods">
      <button type="button" class="pay-opt active" data-m="cash">💵 ${t('cash')}</button>
      <button type="button" class="pay-opt" data-m="phone">📱 ${t('mobileMoney')}</button>
      <button type="button" class="pay-opt" data-m="bank">🏦 ${t('bank')}</button>
    </div>
    <div class="field" id="${prefix}-bank-wrap" style="display:none;margin-top:10px;">
      <label>${t('bankName')}</label>
      <input id="${prefix}-bank" type="text" list="${prefix}-banklist" placeholder="${t('bankNamePlaceholder')}">
      <datalist id="${prefix}-banklist">${RW_BANKS.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
    </div>`;
}
function bindMethodPicker(prefix) {
  let method = 'cash';
  document.querySelectorAll(`#${prefix}-methods .pay-opt`).forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll(`#${prefix}-methods .pay-opt`).forEach(x => x.classList.remove('active'));
    b.classList.add('active'); method = b.dataset.m;
    document.getElementById(`${prefix}-bank-wrap`).style.display = method === 'bank' ? 'block' : 'none';
  }));
  return () => ({ method, bankName: method === 'bank' ? (document.getElementById(`${prefix}-bank`).value || '').trim() : '' });
}

// Fomu isanzwe yo kwandika ubwishyu (ikoreshwa ku bakiriya no ku madeni tugomba)
function openPayModal({ title, subtitle, outstanding, submitLabel, onSubmit }) {
  openModal(`
    <h3>${title}</h3>
    <div class="modal-sub">${subtitle || ''}</div>
    <div class="modal-owed">${t('outstanding')}: <strong>${fmtRWF(outstanding)}</strong></div>
    <div class="field"><label>${t('amountPaid')}</label><input id="pm-amount" type="number" min="1" max="${outstanding}" value="${outstanding}"></div>
    <div class="field"><label>${t('paymentMethod')}</label>${methodPickerHtml('pm')}</div>
    <div class="form-row" style="grid-template-columns:1fr 1fr;">
      <div class="field" style="margin:0;"><label>${t('paymentDate')}</label><input id="pm-date" type="date" value="${todayStr()}" max="${todayStr()}"></div>
      <div class="field" style="margin:0;"><label>${t('note')} (${t('optional')})</label><input id="pm-note" type="text" maxlength="200"></div>
    </div>
    <div class="field" id="pm-next-wrap" style="display:none;margin-top:12px;">
      <label>📅 ${t('nextDueDate')}</label><input id="pm-next" type="date" min="${todayStr()}">
      <div class="field-hint">${t('nextDueDateHint')}</div>
    </div>
    <div class="form-msg" id="pm-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="pm-cancel" type="button">${t('cancel')}</button>
      <button class="btn-primary" id="pm-ok" type="button" style="width:auto;">${submitLabel}</button>
    </div>`);
  const getMethod = bindMethodPicker('pm');
  const amt = document.getElementById('pm-amount');
  const toggleNext = () => { document.getElementById('pm-next-wrap').style.display = (parseFloat(amt.value) || 0) < outstanding ? 'block' : 'none'; };
  amt.addEventListener('input', toggleNext);
  document.getElementById('pm-cancel').addEventListener('click', closeModal);
  document.getElementById('pm-ok').addEventListener('click', async () => {
    const msg = document.getElementById('pm-msg');
    const amount = parseFloat(amt.value);
    if (!amount || amount <= 0 || amount > outstanding) { msg.textContent = tf('amountBetween', { max: num(outstanding) }); msg.className = 'form-msg show error'; return; }
    const m = getMethod();
    const btn = document.getElementById('pm-ok'); btn.disabled = true;
    try {
      await onSubmit({ amount, method: m.method, bankName: m.bankName, date: document.getElementById('pm-date').value, note: document.getElementById('pm-note').value.trim(), nextDueDate: document.getElementById('pm-next').value });
      closeModal(); renderApp();
    } catch (e) { btn.disabled = false; msg.textContent = e.message; msg.className = 'form-msg show error'; }
  });
}

function openDueModal({ current, onSubmit }) {
  openModal(`
    <h3>📅 ${t('changeDueDate')}</h3>
    <div class="field"><label>${t('dueDateToPay')}</label><input id="dm-date" type="date" value="${current || ''}" min="${todayStr()}"></div>
    <div class="form-msg" id="dm-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="dm-cancel" type="button">${t('cancel')}</button>
      <button class="btn-primary" id="dm-ok" type="button" style="width:auto;">${t('save')}</button>
    </div>`);
  document.getElementById('dm-cancel').addEventListener('click', closeModal);
  document.getElementById('dm-ok').addEventListener('click', async () => {
    const msg = document.getElementById('dm-msg');
    const v = document.getElementById('dm-date').value;
    if (!v) { msg.textContent = t('dueDateRequired'); msg.className = 'form-msg show error'; return; }
    try { await onSubmit(v); closeModal(); renderApp(); } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
  });
}

async function openSettleModal(saleId) {
  let list;
  try { list = await API.get('/api/debts/receivables'); } catch (e) { alert(e.message); return; }
  const d = list.find(x => x.id === saleId);
  if (!d || d.outstanding <= 0) { alert(t('alreadyPaid')); return; }
  openPayModal({
    title: `💰 ${t('recordPayment')}`, subtitle: `${esc(d.customerName)} · ${esc(d.invoiceNo)}`,
    outstanding: d.outstanding, submitLabel: t('savePayment'),
    onSubmit: (p) => API.patch(`/api/sales/${saleId}/settle`, p)
  });
}

// ---------- Dashboard banner ----------
function statusBadgeHtml(status, daysLeft) {
  if (status === 'paid') return `<span class="pay-badge paid">✅ ${t('paid')}</span>`;
  if (status === 'overdue') return `<span class="pay-badge debt">⏰ ${tf('overdueBy', { n: Math.abs(daysLeft) })}</span>`;
  if (status === 'due_today') return `<span class="pay-badge debt">🔔 ${t('dueToday')}</span>`;
  if (status === 'due_soon') return `<span class="pay-badge pending">⏳ ${tf('dueIn', { n: daysLeft })}</span>`;
  if (status === 'no_date') return `<span class="pay-badge pending">❔ ${t('noDueDate')}</span>`;
  return `<span class="pay-badge cash">📅 ${tf('dueIn', { n: daysLeft })}</span>`;
}

function debtBannerHtml() {
  const s = state.debtSummary;
  if (!s || !s.urgent || s.urgent.length === 0) return '';
  return `
    <div class="debt-banner">
      <div class="debt-banner-head"><span>🔔 ${t('debtRemindersTitle')}</span><button class="link-btn" data-goto="debts">${t('seeAll')} →</button></div>
      ${s.urgent.map(u => `
        <div class="debt-banner-row ${u.status}">
          <div><strong>${esc(u.name || '—')}</strong>
            <div class="sub">${u.kind === 'rec' ? t('theyOweMe') : t('iOweThem')} · ${fmtDay(u.dueDate)}</div></div>
          <div class="amt">${fmtRWF(u.amount)}</div>
          <div>${statusBadgeHtml(u.status, u.daysLeft)}</div>
        </div>`).join('')}
    </div>`;
}
function bindDebtBannerEvents() {
  document.querySelectorAll('[data-goto="debts"]').forEach(b => b.addEventListener('click', () => { state.view = 'debts'; renderApp(); }));
}

// ---------- Debts view ----------
function reminderLinks(d, kind) {
  const phone = (d.customerPhone || d.creditorPhone || '').replace(/[^\d+]/g, '');
  if (!phone || kind !== 'rec') return '';
  const biz = state.user.businessName || state.user.name || '';
  const text = tf('reminderMsgCustomer', { name: d.customerName, amount: num(d.outstanding), date: fmtDay(d.dueDate), business: biz });
  const intl = phone.startsWith('+') ? phone.slice(1) : phone.startsWith('0') ? '250' + phone.slice(1) : phone;
  return `<a class="btn-secondary mini" target="_blank" rel="noopener" href="https://wa.me/${intl}?text=${encodeURIComponent(text)}">💬 WhatsApp</a>
          <a class="btn-secondary mini" href="sms:${phone}?body=${encodeURIComponent(text)}">✉️ SMS</a>`;
}

function paymentsTimelineHtml(d) {
  const rows = d.payments || [];
  if (!rows.length) return `<div class="empty small">${t('noPaymentsYet')}</div>`;
  return `<div class="timeline">${rows.slice().sort((a, b) => new Date(a.at) - new Date(b.at)).map(p => `
    <div class="tl-row"><span class="tl-dot"></span>
      <div><strong>${fmtRWF(p.amount)}</strong> · ${methodLabel(p.method, p.bankName)}
        <div class="sub">${fmtDate(p.at)}${p.note ? ' · ' + esc(p.note) : ''}</div></div></div>`).join('')}</div>`;
}

function debtCardHtml(d, kind) {
  const isRec = kind === 'rec';
  const who = isRec ? d.customerName : d.creditorName;
  const contact = isRec ? (d.customerPhone || d.customerEmail) : (d.creditorPhone || d.creditorEmail);
  const sub = isRec
    ? `${esc(d.invoiceNo)} · ${esc(d.productName || '')} ×${d.qty}`
    : `${t('nature.' + d.nature)}${d.description ? ' · ' + esc(d.description) : ''}`;
  const pct = d.total ? Math.min(100, Math.round((d.paid / d.total) * 100)) : 0;
  const open = d.outstanding > 0;
  return `
    <div class="debt-card ${d.status}">
      <div class="debt-card-head">
        <div><div class="debt-who">${esc(who || '—')}</div><div class="sub">${esc(contact || '')}</div><div class="sub">${sub}</div></div>
        <div style="text-align:right;">${statusBadgeHtml(d.status, d.daysLeft)}<div class="sub" style="margin-top:6px;">📅 ${fmtDay(d.dueDate)}</div></div>
      </div>
      <div class="debt-amounts">
        <div><span>${t('totalAmount')}</span><strong>${fmtRWF(d.total)}</strong></div>
        <div><span>${t('paid')}</span><strong style="color:var(--positive)">${fmtRWF(d.paid)}</strong></div>
        <div><span>${t('outstanding')}</span><strong style="color:${open ? 'var(--danger)' : 'var(--positive)'}">${fmtRWF(d.outstanding)}</strong></div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="debt-actions">
        ${open ? `<button class="btn-primary mini" data-act="pay" data-kind="${kind}" data-id="${d.id}">${isRec ? t('collectPayment') : t('payNow')}</button>
        <button class="btn-secondary mini" data-act="due" data-kind="${kind}" data-id="${d.id}" data-due="${d.dueDate || ''}">📅 ${t('changeDueDate')}</button>${reminderLinks(d, kind)}` : ''}
        <button class="btn-secondary mini" data-act="hist" data-id="${d.id}">🕘 ${t('history')} (${(d.payments || []).length})</button>
        ${!isRec && (d.payments || []).length === 0 && d.source === 'manual' ? `<button class="btn-secondary mini btn-danger" data-act="void" data-id="${d.id}">✕</button>` : ''}
      </div>
      <div class="debt-history" id="hist-${d.id}" style="display:none;">${paymentsTimelineHtml(d)}</div>
    </div>`;
}

let _debtCache = { rec: [], pay: [] };

function payableFormHtml() {
  const natures = ['opening', 'loan', 'expense'];
  return `
  <div class="card" id="payable-form" style="display:none;">
    <h3>${t('addPayable')}</h3>
    <div class="form-row" style="grid-template-columns:1fr 1fr;">
      <div class="field" style="margin:0;"><label>${t('creditorName')} *</label><input id="pb-name" type="text"></div>
      <div class="field" style="margin:0;"><label>${t('creditorPhone')}</label><input id="pb-phone" type="tel"></div>
    </div>
    <div class="form-row" style="grid-template-columns:1fr 1fr;">
      <div class="field" style="margin:0;"><label>${t('creditorEmail')} (${t('optional')})</label><input id="pb-email" type="email"></div>
      <div class="field" style="margin:0;"><label>${t('payableNature')}</label>
        <select id="pb-nature">${natures.map(n => `<option value="${n}">${t('nature.' + n)}</option>`).join('')}</select></div>
    </div>
    <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
      <div class="field" style="margin:0;"><label>${t('amountOwed')} *</label><input id="pb-total" type="number" min="1"></div>
      <div class="field" style="margin:0;"><label>${t('dateIncurred')}</label><input id="pb-inc" type="date" value="${todayStr()}" max="${todayStr()}"></div>
      <div class="field" style="margin:0;"><label>📅 ${t('dueDateToPay')} *</label><input id="pb-due" type="date" min="${todayStr()}"></div>
    </div>
    <div class="field" id="pb-loan-wrap" style="display:none;"><label>${t('loanReceivedVia')}</label>${methodPickerHtml('pb')}</div>
    <div class="field" id="pb-cat-wrap" style="display:none;"><label>${t('expenseCategory')}</label>
      <select id="pb-cat">${Object.keys(EXP_CATS).map(c => `<option value="${c}">${t('exp.cat.' + c)}</option>`).join('')}</select></div>
    <div class="field"><label>${t('description')} (${t('optional')})</label><input id="pb-desc" type="text" maxlength="300"></div>
    <div class="field-hint" id="pb-nature-hint"></div>
    <button class="btn-primary" id="pb-save" style="width:auto;margin-top:10px;">${t('save')}</button>
    <div class="form-msg" id="pb-msg"></div>
  </div>`;
}
const EXP_CATS = { rent: 1, salaries: 1, transport: 1, utilities: 1, communication: 1, marketing: 1, maintenance: 1, supplies: 1, other: 1 };

async function debtsHtml() {
  const isAdmin = state.user.role === 'admin';
  if (!isAdmin) state.debtTab = 'receivables';
  const [rec, pay] = await Promise.all([
    API.get('/api/debts/receivables'),
    isAdmin ? API.get('/api/debts/payables') : Promise.resolve([])
  ]);
  _debtCache = { rec, pay };
  const kind = state.debtTab === 'payables' ? 'pay' : 'rec';
  const list = kind === 'rec' ? rec : pay;
  const filter = state.debtFilter || 'open';
  const matches = (d) => filter === 'all' ? true : filter === 'open' ? d.outstanding > 0 : filter === 'paid' ? d.outstanding === 0 : d.status === filter;
  const shown = list.filter(matches).sort((a, b) => {
    const ra = a.outstanding > 0 ? 0 : 1, rb = b.outstanding > 0 ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (a.daysLeft == null ? 99999 : a.daysLeft) - (b.daysLeft == null ? 99999 : b.daysLeft);
  });
  const open = list.filter(d => d.outstanding > 0);
  const sumOf = (f) => open.filter(f).reduce((a, d) => a + d.outstanding, 0);
  const filters = [['open', t('fOpen')], ['overdue', t('fOverdue')], ['due_today', t('dueToday')], ['due_soon', t('fSoon')], ['no_date', t('noDueDate')], ['paid', t('paid')], ['all', t('allHistory')]];
  return `
    <div class="topbar">
      <h2>${t('debts')}</h2>
      ${isAdmin ? `<div class="hist-filter">
        <button data-dtab="receivables" class="${kind === 'rec' ? 'active' : ''}">${t('receivables')}</button>
        <button data-dtab="payables" class="${kind === 'pay' ? 'active' : ''}">${t('payables')}</button>
      </div>` : ''}
    </div>
    <p class="page-hint">${kind === 'rec' ? t('receivablesHint') : t('payablesHint')}</p>
    <div class="grid-stats">
      <div class="stat"><div class="label">${kind === 'rec' ? t('totalToCollect') : t('totalToPay')}</div><div class="value">${fmtRWF(sumOf(() => true))}</div></div>
      <div class="stat warn"><div class="label">${t('fOverdue')}</div><div class="value">${fmtRWF(sumOf(d => d.status === 'overdue'))}</div></div>
      <div class="stat"><div class="label">${t('dueToday')}</div><div class="value">${fmtRWF(sumOf(d => d.status === 'due_today'))}</div></div>
      <div class="stat"><div class="label">${t('fSoon')}</div><div class="value">${fmtRWF(sumOf(d => d.status === 'due_soon'))}</div></div>
    </div>
    ${kind === 'pay' ? `<div style="margin:6px 0 14px;"><button class="btn-primary" id="pb-toggle" style="width:auto;">＋ ${t('addPayable')}</button></div>${payableFormHtml()}` : ''}
    <div class="hist-filter" style="margin:12px 0 16px;">
      ${filters.map(([k, label]) => `<button data-dfilter="${k}" class="${filter === k ? 'active' : ''}">${label}</button>`).join('')}
    </div>
    ${shown.length === 0 ? `<div class="empty">${t('noDebts')}</div>` : `<div class="debt-grid">${shown.map(d => debtCardHtml(d, kind)).join('')}</div>`}
  `;
}

function bindDebtsEvents() {
  document.querySelectorAll('[data-dtab]').forEach(b => b.addEventListener('click', () => { state.debtTab = b.dataset.dtab; state.debtFilter = 'open'; renderApp(); }));
  document.querySelectorAll('[data-dfilter]').forEach(b => b.addEventListener('click', () => { state.debtFilter = b.dataset.dfilter; renderApp(); }));
  document.querySelectorAll('[data-act="hist"]').forEach(b => b.addEventListener('click', () => {
    const el = document.getElementById('hist-' + b.dataset.id); el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }));
  document.querySelectorAll('[data-act="pay"]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.kind;
    const d = (kind === 'rec' ? _debtCache.rec : _debtCache.pay).find(x => x.id === b.dataset.id);
    if (!d) return;
    if (kind === 'rec') {
      openPayModal({ title: `💰 ${t('collectPayment')}`, subtitle: `${esc(d.customerName)} · ${esc(d.invoiceNo)}`, outstanding: d.outstanding, submitLabel: t('savePayment'),
        onSubmit: (p) => API.patch(`/api/sales/${d.id}/settle`, p) });
    } else {
      openPayModal({ title: `💸 ${t('payNow')}`, subtitle: esc(d.creditorName), outstanding: d.outstanding, submitLabel: t('savePayment'),
        onSubmit: (p) => API.post(`/api/debts/payables/${d.id}/pay`, p) });
    }
  }));
  document.querySelectorAll('[data-act="due"]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.kind, id = b.dataset.id;
    openDueModal({ current: b.dataset.due, onSubmit: (v) => kind === 'rec' ? API.patch(`/api/sales/${id}/due-date`, { dueDate: v }) : API.patch(`/api/debts/payables/${id}`, { dueDate: v }) });
  }));
  document.querySelectorAll('[data-act="void"]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(t('confirmVoid'))) return;
    try { await API.del('/api/debts/payables/' + b.dataset.id); renderApp(); } catch (e) { alert(e.message); }
  }));

  const toggle = document.getElementById('pb-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => { const f = document.getElementById('payable-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; });
    const getMethod = bindMethodPicker('pb');
    const natureSel = document.getElementById('pb-nature');
    const syncNature = () => {
      const n = natureSel.value;
      document.getElementById('pb-loan-wrap').style.display = n === 'loan' ? 'block' : 'none';
      document.getElementById('pb-cat-wrap').style.display = n === 'expense' ? 'block' : 'none';
      document.getElementById('pb-nature-hint').textContent = t('natureHint.' + n);
    };
    natureSel.addEventListener('change', syncNature); syncNature();
    document.getElementById('pb-save').addEventListener('click', async () => {
      const msg = document.getElementById('pb-msg');
      const m = getMethod();
      try {
        await API.post('/api/debts/payables', {
          creditorName: document.getElementById('pb-name').value, creditorPhone: document.getElementById('pb-phone').value,
          creditorEmail: document.getElementById('pb-email').value, nature: natureSel.value,
          total: document.getElementById('pb-total').value, incurredAt: document.getElementById('pb-inc').value,
          dueDate: document.getElementById('pb-due').value, description: document.getElementById('pb-desc').value,
          expenseCategory: document.getElementById('pb-cat').value, receiveMethod: m.method, bankName: m.bankName
        });
        renderApp();
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
    });
  }
}

// ============================================================================
// BOOKS (Ibitabo by'ibaruramari)
// ============================================================================
const BOOK_TABS = [
  ['overview', '📈', 'bookOverview'], ['journal', '📒', 'generalJournal'], ['ledger', '📚', 'generalLedger'],
  ['trial', '⚖️', 'trialBalance'], ['cashbook', '💵', 'cashBook'], ['aging', '⏳', 'agingReport'],
  ['stock', '📦', 'stockLedger'], ['expenses', '🧾', 'expensesTab'], ['manual', '✍️', 'manualEntry'], ['settings', '⚙️', 'openingBalances']
];
const ACCT_CODES = ['1010', '1020', '1030', '1100', '1200', '1210', '2010', '2020', '2040', '2200', '2300', '3010', '3020', '4010', '4020', '5010', '5020', '6010', '6020', '6030', '6040', '6050', '6060', '6070', '6080', '6090', '6100', '6110', '6120', '6130'];
const CONTROL = ['1100', '1200', '1210', '2010', '2020', '2040', '2200', '2300'];
const acctName = (c) => c === 'RE' ? t('acct.RE') : `${c} · ${t('acct.' + c)}`;

function descText(d) {
  if (!d) return '';
  const p = d.params || {};
  const base = tf('jd.' + d.code, { ...p, category: p.category ? t('exp.cat.' + p.category) : '' });
  return p.note || p.text ? `${base}${p.note || p.text ? ' — ' + (p.note || p.text) : ''}` : base;
}

function periodBarHtml(showPeriod) {
  if (!showPeriod) return '';
  return `
  <div class="period-bar">
    <div class="hist-filter">
      <button data-preset="month">${t('thisMonth')}</button><button data-preset="year">${t('thisYear')}</button><button data-preset="all">${t('allTime')}</button>
    </div>
    <div class="period-inputs">
      <label>${t('fromDate')}<input type="date" id="bk-from" value="${state.booksFrom}"></label>
      <label>${t('toDate')}<input type="date" id="bk-to" value="${state.booksTo}"></label>
      <button class="btn-secondary mini" id="bk-apply">${t('apply')}</button>
      <button class="btn-secondary mini" id="bk-print">🖨️ ${t('print')}</button>
      <button class="btn-secondary mini" id="bk-csv">⬇️ CSV</button>
    </div>
  </div>`;
}
function qs() {
  const p = [];
  if (state.booksFrom) p.push('from=' + state.booksFrom);
  if (state.booksTo) p.push('to=' + state.booksTo);
  return p.join('&');
}
function periodLabel() {
  if (!state.booksFrom && !state.booksTo) return t('allTime');
  return `${state.booksFrom ? fmtDay(state.booksFrom) : '…'} → ${state.booksTo ? fmtDay(state.booksTo) : fmtDay(todayStr())}`;
}

let _csv = null;

async function booksHtml() {
  const tab = state.booksTab;
  _csv = null;
  const showPeriod = ['overview', 'journal', 'ledger', 'trial', 'cashbook'].includes(tab);
  let body = '';
  try {
    if (tab === 'overview') body = await booksOverviewHtml();
    else if (tab === 'journal') body = await booksJournalHtml();
    else if (tab === 'ledger') body = await booksLedgerHtml();
    else if (tab === 'trial') body = await booksTrialHtml();
    else if (tab === 'cashbook') body = await booksCashbookHtml();
    else if (tab === 'aging') body = await booksAgingHtml();
    else if (tab === 'stock') body = await booksStockHtml();
    else if (tab === 'expenses') body = await booksExpensesHtml();
    else if (tab === 'manual') body = await booksManualHtml();
    else body = await booksSettingsHtml();
  } catch (e) { body = `<div class="empty">${esc(e.message)}</div>`; }
  return `
    <div class="topbar"><h2>📚 ${t('books')}</h2></div>
    <div class="book-tabs">${BOOK_TABS.map(([k, ic, lab]) => `<button data-btab="${k}" class="${tab === k ? 'active' : ''}"><span>${ic}</span> ${t(lab)}</button>`).join('')}</div>
    ${periodBarHtml(showPeriod)}
    <div class="print-title">${esc(state.user.businessName || state.user.name)} — ${t(BOOK_TABS.find(x => x[0] === tab)[2])} — ${periodLabel()}</div>
    ${body}`;
}

function bindBooksEvents() {
  document.querySelectorAll('[data-btab]').forEach(b => b.addEventListener('click', () => { state.booksTab = b.dataset.btab; renderApp(); }));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const now = todayStr(); const p = b.dataset.preset;
    if (p === 'month') { state.booksFrom = now.slice(0, 8) + '01'; state.booksTo = now; }
    else if (p === 'year') { state.booksFrom = now.slice(0, 4) + '-01-01'; state.booksTo = now; }
    else { state.booksFrom = ''; state.booksTo = ''; }
    renderApp();
  }));
  const apply = document.getElementById('bk-apply');
  if (apply) apply.addEventListener('click', () => { state.booksFrom = document.getElementById('bk-from').value; state.booksTo = document.getElementById('bk-to').value; renderApp(); });
  const pr = document.getElementById('bk-print'); if (pr) pr.addEventListener('click', () => window.print());
  const csv = document.getElementById('bk-csv');
  if (csv) csv.addEventListener('click', () => { if (_csv) downloadCsv(_csv.name, _csv.rows); });
  const lsel = document.getElementById('lg-account');
  if (lsel) lsel.addEventListener('change', () => { state.ledgerAccount = lsel.value; renderApp(); });
  document.querySelectorAll('[data-ledger]').forEach(b => b.addEventListener('click', () => { state.ledgerAccount = b.dataset.ledger; state.booksTab = 'ledger'; renderApp(); }));
  bindExpenseEvents(); bindManualEvents(); bindSettingsEvents();
}

function downloadCsv(name, rows) {
  const lines = rows.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ---- Overview: Income Statement + Balance Sheet + Cash flow + checks ----
function plRow(label, amount, cls) { return `<div class="fs-row ${cls || ''}"><span>${label}</span><strong>${fmtRWF(amount)}</strong></div>`; }

async function booksOverviewHtml() {
  const o = await API.get('/api/accounting/overview?' + qs());
  const inc = o.income, bs = o.balance, cf = o.cashFlow;
  const errors = o.checks.filter(c => !c.ok && c.severity === 'error');
  const warns = o.checks.filter(c => !c.ok && c.severity !== 'error');
  const allOk = errors.length === 0;
  const csvRows = [[t('incomeStatement'), periodLabel()], [t('salesRevenue'), inc.sales], [t('costOfGoodsSold'), inc.cogs], [t('grossProfit'), inc.grossProfit], [t('otherIncome'), inc.other]];
  inc.expenses.forEach(e => csvRows.push([acctName(e.code), e.amount]));
  csvRows.push([t('netProfit'), inc.netProfit], [], [t('balanceSheet')]);
  bs.assets.forEach(a => csvRows.push([acctName(a.code), a.amount])); csvRows.push([t('totalAssets'), bs.totalAssets]);
  bs.liabilities.forEach(a => csvRows.push([acctName(a.code), a.amount])); csvRows.push([t('totalLiabilities'), bs.totalLiabilities]);
  bs.equity.forEach(a => csvRows.push([acctName(a.code), a.amount])); csvRows.push([t('totalEquity'), bs.totalEquity]);
  _csv = { name: 'financial-statements.csv', rows: csvRows };
  const quality = [];
  if (o.quality.productsWithoutCost.length) quality.push(tf('qProductsNoCost', { n: o.quality.productsWithoutCost.length, list: o.quality.productsWithoutCost.slice(0, 5).map(p => p.name).join(', ') }));
  if (o.quality.procurementsWithoutCost) quality.push(tf('qProcNoCost', { n: o.quality.procurementsWithoutCost }));
  if (o.quality.debtsWithoutDueDate) quality.push(tf('qDebtNoDate', { n: o.quality.debtsWithoutDueDate }));
  if (o.quality.negativeStock.length) quality.push(tf('qNegStock', { list: o.quality.negativeStock.slice(0, 5).map(p => p.name).join(', ') }));
  return `
    <div class="check-banner ${allOk ? 'ok' : 'bad'}">
      <div><strong>${allOk ? '✅ ' + t('booksBalanced') : '⚠️ ' + t('booksNotBalanced')}</strong>
        <div class="sub">${tf('checksPassed', { ok: o.checks.filter(c => c.ok).length, total: o.checks.length })} · ${tf('entriesCount', { n: o.entryCount })}</div></div>
      <button class="link-btn" id="chk-toggle">${t('viewChecks')}</button>
    </div>
    <div id="chk-list" class="chk-list" style="display:none;">
      ${o.checks.map(c => `<div class="chk-row ${c.ok ? 'ok' : (c.severity === 'error' ? 'bad' : 'warn')}"><span>${c.ok ? '✅' : (c.severity === 'error' ? '❌' : '⚠️')} ${t('chk.' + c.id)}</span><span class="mono">${num(c.expected)} / ${num(c.actual)}</span></div>`).join('')}
    </div>
    ${quality.length ? `<div class="quality-note"><strong>💡 ${t('dataQuality')}</strong><ul>${quality.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
    <div class="grid-stats">
      <div class="stat positive"><div class="label">${t('salesRevenue')}</div><div class="value">${fmtRWF(inc.sales)}</div></div>
      <div class="stat"><div class="label">${t('grossProfit')}</div><div class="value">${fmtRWF(inc.grossProfit)}</div></div>
      <div class="stat ${inc.netProfit < 0 ? 'warn' : 'positive'}"><div class="label">${t('netProfit')}</div><div class="value">${fmtRWF(inc.netProfit)}</div></div>
      <div class="stat"><div class="label">${t('cashAtEnd')}</div><div class="value">${fmtRWF(cf.closing)}</div></div>
    </div>
    <div class="fs-grid">
      <div class="card"><h3>${t('incomeStatement')}</h3>
        ${plRow(t('salesRevenue'), inc.sales)}
        ${plRow('− ' + t('costOfGoodsSold'), inc.cogs)}
        ${plRow(t('grossProfit') + ` (${inc.grossMarginPct.toFixed(1)}%)`, inc.grossProfit, 'sub-total')}
        ${inc.other ? plRow('+ ' + t('otherIncome'), inc.other) : ''}
        <div class="fs-head">${t('operatingExpenses')}</div>
        ${inc.expenses.length ? inc.expenses.map(e => plRow('− ' + t('acct.' + e.code), e.amount)).join('') : `<div class="sub" style="padding:6px 0;">—</div>`}
        ${plRow(t('totalExpenses'), inc.totalExpenses, 'sub-total')}
        ${plRow(t('netProfit') + ` (${inc.netMarginPct.toFixed(1)}%)`, inc.netProfit, 'grand ' + (inc.netProfit < 0 ? 'neg' : ''))}
      </div>
      <div class="card"><h3>${t('balanceSheet')} <span class="sub">${t('asOf')} ${state.booksTo ? fmtDay(state.booksTo) : fmtDay(todayStr())}</span></h3>
        <div class="fs-head">${t('assets')}</div>
        ${bs.assets.map(a => plRow(`<a href="#" data-ledger="${a.code}" class="lg-link">${t('acct.' + a.code)}</a>`, a.amount)).join('')}
        ${plRow(t('totalAssets'), bs.totalAssets, 'sub-total')}
        <div class="fs-head">${t('liabilities')}</div>
        ${bs.liabilities.length ? bs.liabilities.map(a => plRow(`<a href="#" data-ledger="${a.code}" class="lg-link">${t('acct.' + a.code)}</a>`, a.amount)).join('') : `<div class="sub" style="padding:6px 0;">—</div>`}
        ${plRow(t('totalLiabilities'), bs.totalLiabilities, 'sub-total')}
        <div class="fs-head">${t('equity')}</div>
        ${bs.equity.map(a => plRow(t('acct.' + a.code), a.amount)).join('')}
        ${plRow(t('totalEquity'), bs.totalEquity, 'sub-total')}
        ${plRow(t('totalLiabEquity'), bs.totalLiabilities + bs.totalEquity, 'grand')}
        <div class="balance-proof ${bs.difference === 0 ? 'ok' : 'bad'}">${bs.difference === 0 ? '✅ ' + t('assetsEqualLE') : '❌ ' + t('difference') + ': ' + fmtRWF(bs.difference)}</div>
      </div>
    </div>
    <div class="card"><h3>${t('cashFlowTitle')}</h3>
      ${plRow(t('cashAtStart'), cf.opening)}
      ${Object.keys(cf.categories).map(k => plRow(t('cf.' + k), cf.categories[k])).join('')}
      ${plRow(t('netCashChange'), cf.net, 'sub-total')}
      ${plRow(t('cashAtEnd'), cf.closing, 'grand')}
    </div>
    <script>0</script>`;
}

async function booksJournalHtml() {
  const j = await API.get('/api/accounting/journal?' + qs());
  const rows = j.rows;
  _csv = { name: 'general-journal.csv', rows: [[t('date'), t('reference'), t('description'), t('account'), 'Debit', 'Credit']].concat(rows.flatMap(e => e.lines.map(l => [e.date.slice(0, 10), e.ref, descText(e.desc), acctName(l.acct), l.dr || '', l.cr || '']))) };
  if (!rows.length) return `<div class="empty">${t('noEntries')}</div>`;
  return `<div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('date')}</th><th>${t('reference')}</th><th>${t('account')} / ${t('description')}</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
    ${rows.map(e => `
      <tr class="je-head"><td>${fmtDate(e.date)}</td><td class="mono">${esc(e.ref)}</td><td><span class="type-chip">${t('jt.' + e.type)}</span> ${esc(descText(e.desc))}${e.reversed ? ` <span class="pay-badge pending">${t('reversed')}</span>` : ''}</td><td></td><td></td></tr>
      ${e.lines.map(l => `<tr class="je-line"><td></td><td></td><td class="${l.cr ? 'indent' : ''}">${acctName(l.acct)}${l.memo ? ` <span class="sub">(${esc(l.memo)})</span>` : ''}</td><td class="num">${l.dr ? num(l.dr) : ''}</td><td class="num">${l.cr ? num(l.cr) : ''}</td></tr>`).join('')}`).join('')}
  </tbody></table></div>`;
}

async function booksLedgerHtml() {
  const code = state.ledgerAccount || '1010';
  const lg = await API.get(`/api/accounting/ledger?account=${code}&${qs()}`);
  _csv = { name: `ledger-${code}.csv`, rows: [[acctName(code)], [t('date'), t('reference'), t('description'), 'Debit', 'Credit', t('balance')], [t('openingBalance'), '', '', '', '', lg.opening]].concat(lg.rows.map(r => [r.date.slice(0, 10), r.ref, descText(r.desc), r.dr || '', r.cr || '', r.balance])) };
  return `
    <div class="card"><div class="field" style="max-width:420px;margin:0;"><label>${t('account')}</label>
      <select id="lg-account">${ACCT_CODES.map(c => `<option value="${c}" ${c === code ? 'selected' : ''}>${acctName(c)}</option>`).join('')}</select></div></div>
    <div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('date')}</th><th>${t('reference')}</th><th>${t('description')}</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">${t('balance')}</th></tr></thead><tbody>
      <tr class="je-head"><td colspan="5">${t('openingBalance')}</td><td class="num">${num(lg.opening)}</td></tr>
      ${lg.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td class="mono">${esc(r.ref)}</td><td>${esc(descText(r.desc))}</td><td class="num">${r.dr ? num(r.dr) : ''}</td><td class="num">${r.cr ? num(r.cr) : ''}</td><td class="num">${num(r.balance)}</td></tr>`).join('')}
      <tr class="je-head"><td colspan="3">${t('closingBalance')}</td><td class="num">${num(lg.totalDr)}</td><td class="num">${num(lg.totalCr)}</td><td class="num">${num(lg.closing)}</td></tr>
    </tbody></table></div>`;
}

async function booksTrialHtml() {
  const tb = await API.get('/api/accounting/trial-balance?' + qs());
  const hasOpen = !!state.booksFrom;
  _csv = { name: 'trial-balance.csv', rows: [[t('account'), 'Debit', 'Credit']].concat(tb.rows.map(r => [acctName(r.code), r.cDr || '', r.cCr || ''])).concat([[t('total'), tb.totals.cDr, tb.totals.cCr]]) };
  return `<div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('account')}</th>${hasOpen ? `<th class="num">${t('openingBalance')} Dr</th><th class="num">${t('openingBalance')} Cr</th>` : ''}<th class="num">${t('periodMovement')} Dr</th><th class="num">${t('periodMovement')} Cr</th><th class="num">${t('closingBalance')} Dr</th><th class="num">${t('closingBalance')} Cr</th></tr></thead><tbody>
    ${tb.rows.map(r => `<tr><td><a href="#" class="lg-link" data-ledger="${r.code}">${acctName(r.code)}</a></td>${hasOpen ? `<td class="num">${r.oDr ? num(r.oDr) : ''}</td><td class="num">${r.oCr ? num(r.oCr) : ''}</td>` : ''}<td class="num">${num(r.pDr)}</td><td class="num">${num(r.pCr)}</td><td class="num">${r.cDr ? num(r.cDr) : ''}</td><td class="num">${r.cCr ? num(r.cCr) : ''}</td></tr>`).join('')}
    <tr class="je-head"><td>${t('total')}</td>${hasOpen ? `<td class="num">${num(tb.totals.oDr)}</td><td class="num">${num(tb.totals.oCr)}</td>` : ''}<td class="num">${num(tb.totals.pDr)}</td><td class="num">${num(tb.totals.pCr)}</td><td class="num">${num(tb.totals.cDr)}</td><td class="num">${num(tb.totals.cCr)}</td></tr>
  </tbody></table></div>
  <div class="balance-proof ${tb.totals.cDr === tb.totals.cCr ? 'ok' : 'bad'}">${tb.totals.cDr === tb.totals.cCr ? '✅ ' + t('debitsEqualCredits') : '❌ ' + t('difference') + ': ' + fmtRWF(tb.totals.cDr - tb.totals.cCr)}</div>`;
}

async function booksCashbookHtml() {
  const cb = await API.get('/api/accounting/cashbook?' + qs());
  const names = { '1010': t('cash'), '1020': t('mobileMoney'), '1030': t('bank') };
  _csv = { name: 'cash-book.csv', rows: [[t('date'), t('reference'), t('description'), t('account'), t('receipts'), t('payments'), t('balance')]].concat(cb.rows.map(r => [r.date.slice(0, 10), r.ref, descText(r.desc), names[r.acct], r.receipt || '', r.payment || '', r.balance])) };
  return `
    <div class="grid-stats">${['1010', '1020', '1030'].map(c => `<div class="stat"><div class="label">${names[c]}</div><div class="value">${fmtRWF(cb.closing[c])}</div></div>`).join('')}</div>
    <div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('date')}</th><th>${t('description')}</th><th>${t('account')}</th><th class="num">${t('receipts')}</th><th class="num">${t('payments')}</th><th class="num">${t('balance')}</th></tr></thead><tbody>
      ${cb.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(descText(r.desc))}<div class="sub mono">${esc(r.ref)}</div></td><td>${names[r.acct]}${r.memo ? ` <span class="sub">${esc(r.memo)}</span>` : ''}</td><td class="num pos">${r.receipt ? num(r.receipt) : ''}</td><td class="num neg">${r.payment ? num(r.payment) : ''}</td><td class="num">${num(r.balance)}</td></tr>`).join('')}
      <tr class="je-head"><td colspan="3">${t('total')}</td><td class="num">${num(cb.totals.receipts)}</td><td class="num">${num(cb.totals.payments)}</td><td class="num">${num(cb.rows.length ? cb.rows[cb.rows.length - 1].balance : 0)}</td></tr>
    </tbody></table></div>`;
}

function agingTableHtml(title, a, isRec) {
  const b = a.buckets;
  return `<div class="card"><h3>${title}</h3>
    <div class="aging-bar">
      ${[['current', 'agCurrent'], ['d1_30', 'ag1'], ['d31_60', 'ag2'], ['d61_90', 'ag3'], ['d90p', 'ag4'], ['nodate', 'noDueDate']].map(([k, lab]) => `<div class="ag-cell ${k}"><span>${t(lab)}</span><strong>${fmtRWF(b[k])}</strong></div>`).join('')}
    </div>
    ${a.rows.length ? `<div style="overflow-x:auto;"><table class="book-table"><thead><tr><th>${isRec ? t('customerName') : t('creditorName')}</th><th>${t('dueDateToPay')}</th><th class="num">${t('outstanding')}</th><th>${t('status')}</th></tr></thead><tbody>
      ${a.rows.map(r => `<tr><td>${esc(isRec ? r.customerName : r.creditorName)}</td><td>${fmtDay(r.dueDate)}</td><td class="num">${num(r.outstanding)}</td><td>${statusBadgeHtml(r.status, r.daysLeft)}</td></tr>`).join('')}
      <tr class="je-head"><td colspan="2">${t('total')}</td><td class="num">${num(a.total)}</td><td></td></tr></tbody></table></div>` : `<div class="empty small">${t('noDebts')}</div>`}</div>`;
}
async function booksAgingHtml() {
  const a = await API.get('/api/accounting/aging');
  _csv = null;
  return agingTableHtml(`💰 ${t('receivables')}`, a.receivables, true) + agingTableHtml(`💸 ${t('payables')}`, a.payables, false);
}

async function booksStockHtml() {
  const s = await API.get('/api/accounting/stock');
  _csv = { name: 'stock-ledger.csv', rows: [[t('productName'), t('quantity'), t('avgCost'), t('value')]].concat(s.rows.map(r => [r.name, r.qty, Math.round(r.avgCost), r.value])) };
  return `
    <div class="grid-stats"><div class="stat"><div class="label">${t('stockValue')}</div><div class="value">${fmtRWF(s.totalValue)}</div></div>
    <div class="stat"><div class="label">${t('stockInField')}</div><div class="value">${fmtRWF(s.fieldValue)}</div></div></div>
    <p class="page-hint">${t('stockMethodHint')}</p>
    <div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('productName')}</th><th class="num">${t('quantity')}</th><th class="num">${t('avgCost')}</th><th class="num">${t('value')}</th></tr></thead><tbody>
      ${s.rows.map(r => `<tr><td>${esc(r.name)}${!(r.costPrice > 0) && r.qty > 0 ? ` <span class="pay-badge pending">${t('noCost')}</span>` : ''}</td><td class="num">${num(r.qty)} ${unitAbbrev(r.unit)}</td><td class="num">${num(r.avgCost)}</td><td class="num">${num(r.value)}</td></tr>`).join('')}
      <tr class="je-head"><td colspan="3">${t('total')}</td><td class="num">${num(s.totalValue)}</td></tr></tbody></table></div>`;
}

async function booksExpensesHtml() {
  const list = await API.get('/api/accounting/expenses');
  _csv = { name: 'expenses.csv', rows: [[t('date'), t('expenseCategory'), t('description'), t('paymentMethod'), t('amount')]].concat(list.filter(e => !e.voidedAt).map(e => [e.date.slice(0, 10), t('exp.cat.' + e.category), e.description, e.method, e.amount])) };
  return `
    <div class="card"><h3>${t('addExpense')}</h3>
      <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('expenseCategory')}</label><select id="ex-cat">${Object.keys(EXP_CATS).map(c => `<option value="${c}">${t('exp.cat.' + c)}</option>`).join('')}</select></div>
        <div class="field" style="margin:0;"><label>${t('amount')}</label><input id="ex-amount" type="number" min="1"></div>
        <div class="field" style="margin:0;"><label>${t('date')}</label><input id="ex-date" type="date" value="${todayStr()}" max="${todayStr()}"></div>
      </div>
      <div class="field"><label>${t('paymentMethod')}</label>
        <div class="pay-toggle" id="ex-methods">
          <button type="button" class="pay-opt active" data-m="cash">💵 ${t('cash')}</button><button type="button" class="pay-opt" data-m="phone">📱 ${t('mobileMoney')}</button>
          <button type="button" class="pay-opt" data-m="bank">🏦 ${t('bank')}</button><button type="button" class="pay-opt" data-m="credit">📝 ${t('onCredit')}</button>
        </div></div>
      <div class="field" id="ex-bank-wrap" style="display:none;"><label>${t('bankName')}</label><input id="ex-bank" type="text" list="ex-banklist"><datalist id="ex-banklist">${RW_BANKS.map(b => `<option value="${esc(b)}">`).join('')}</datalist></div>
      <div id="ex-credit-wrap" style="display:none;" class="form-row"><div class="field" style="margin:0;"><label>${t('creditorName')} *</label><input id="ex-cname" type="text"></div>
        <div class="field" style="margin:0;"><label>${t('creditorPhone')}</label><input id="ex-cphone" type="tel"></div>
        <div class="field" style="margin:0;"><label>📅 ${t('dueDateToPay')} *</label><input id="ex-due" type="date" min="${todayStr()}"></div></div>
      <div class="field"><label>${t('description')} (${t('optional')})</label><input id="ex-desc" type="text" maxlength="300"></div>
      <button class="btn-primary" id="ex-save" style="width:auto;">${t('save')}</button><div class="form-msg" id="ex-msg"></div>
    </div>
    ${list.filter(e => !e.voidedAt).length === 0 ? `<div class="empty">${t('noEntries')}</div>` : `<div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('date')}</th><th>${t('expenseCategory')}</th><th>${t('description')}</th><th>${t('paymentMethod')}</th><th class="num">${t('amount')}</th><th></th></tr></thead><tbody>
      ${list.filter(e => !e.voidedAt).map(e => `<tr><td>${fmtDate(e.date)}</td><td>${t('exp.cat.' + e.category)}</td><td>${esc(e.description)}</td><td>${methodLabel(e.method, e.bankName)}</td><td class="num">${num(e.amount)}</td><td><button class="btn-secondary mini btn-danger" data-exdel="${e.id}">✕</button></td></tr>`).join('')}</tbody></table></div>`}`;
}
function bindExpenseEvents() {
  const save = document.getElementById('ex-save');
  if (!save) return;
  let method = 'cash';
  document.querySelectorAll('#ex-methods .pay-opt').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#ex-methods .pay-opt').forEach(x => x.classList.remove('active')); b.classList.add('active'); method = b.dataset.m;
    document.getElementById('ex-bank-wrap').style.display = method === 'bank' ? 'block' : 'none';
    document.getElementById('ex-credit-wrap').style.display = method === 'credit' ? 'grid' : 'none';
  }));
  save.addEventListener('click', async () => {
    const msg = document.getElementById('ex-msg');
    try {
      await API.post('/api/accounting/expenses', {
        category: document.getElementById('ex-cat').value, amount: document.getElementById('ex-amount').value, date: document.getElementById('ex-date').value,
        method, bankName: document.getElementById('ex-bank').value, description: document.getElementById('ex-desc').value,
        creditorName: document.getElementById('ex-cname').value, creditorPhone: document.getElementById('ex-cphone').value, dueDate: document.getElementById('ex-due').value
      });
      renderApp();
    } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
  });
  document.querySelectorAll('[data-exdel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(t('confirmVoid'))) return;
    try { await API.del('/api/accounting/expenses/' + b.dataset.exdel); renderApp(); } catch (e) { alert(e.message); }
  }));
}

// ---- Manual journal ----
async function booksManualHtml() {
  const j = await API.get('/api/accounting/journal');
  const manual = j.rows.filter(r => r.type === 'manual');
  const free = ACCT_CODES.filter(c => !CONTROL.includes(c));
  const opt = free.map(c => `<option value="${c}">${acctName(c)}</option>`).join('');
  return `
    <p class="page-hint">${t('manualHint')}</p>
    <div class="card"><h3>${t('manualEntry')}</h3>
      <div class="form-row" style="grid-template-columns:1fr 2fr;">
        <div class="field" style="margin:0;"><label>${t('date')}</label><input id="mj-date" type="date" value="${todayStr()}" max="${todayStr()}"></div>
        <div class="field" style="margin:0;"><label>${t('description')}</label><input id="mj-desc" type="text" maxlength="300"></div>
      </div>
      <div id="mj-lines">
        ${[0, 1].map(() => `<div class="mj-line"><select class="mj-acct">${opt}</select><input class="mj-dr" type="number" min="0" placeholder="Debit"><input class="mj-cr" type="number" min="0" placeholder="Credit"></div>`).join('')}
      </div>
      <div style="margin:8px 0;"><button class="btn-secondary mini" id="mj-add" type="button">＋ ${t('addLine')}</button>
        <span class="mj-total" id="mj-total"></span></div>
      <button class="btn-primary" id="mj-save" style="width:auto;">${t('save')}</button><div class="form-msg" id="mj-msg"></div>
      <template id="mj-tpl"><div class="mj-line"><select class="mj-acct">${opt}</select><input class="mj-dr" type="number" min="0" placeholder="Debit"><input class="mj-cr" type="number" min="0" placeholder="Credit"></div></template>
    </div>
    ${manual.length ? `<div class="card" style="padding:0;overflow-x:auto;"><table class="book-table"><thead><tr><th>${t('date')}</th><th>${t('description')}</th><th>${t('account')}</th><th class="num">Debit</th><th class="num">Credit</th><th></th></tr></thead><tbody>
      ${manual.map(e => e.lines.map((l, i) => `<tr><td>${i === 0 ? fmtDate(e.date) : ''}</td><td>${i === 0 ? esc(descText(e.desc)) + (e.reversed ? ` <span class="pay-badge pending">${t('reversed')}</span>` : '') : ''}</td><td>${acctName(l.acct)}</td><td class="num">${l.dr ? num(l.dr) : ''}</td><td class="num">${l.cr ? num(l.cr) : ''}</td><td>${i === 0 && !e.reversed && e.desc.code !== 'manual_reversal' ? `<button class="btn-secondary mini" data-reverse="${e.manualId}">↩ ${t('reverse')}</button>` : ''}</td></tr>`).join('')).join('')}</tbody></table></div>` : ''}`;
}
function bindManualEvents() {
  const save = document.getElementById('mj-save');
  if (!save) return;
  const sumUp = () => {
    let dr = 0, cr = 0;
    document.querySelectorAll('.mj-dr').forEach(i => dr += parseFloat(i.value) || 0);
    document.querySelectorAll('.mj-cr').forEach(i => cr += parseFloat(i.value) || 0);
    const el = document.getElementById('mj-total'); el.textContent = `Debit ${num(dr)} · Credit ${num(cr)}`; el.className = 'mj-total ' + (dr === cr && dr > 0 ? 'ok' : 'bad');
  };
  document.getElementById('mj-lines').addEventListener('input', sumUp); sumUp();
  document.getElementById('mj-add').addEventListener('click', () => {
    document.getElementById('mj-lines').appendChild(document.getElementById('mj-tpl').content.cloneNode(true));
  });
  save.addEventListener('click', async () => {
    const msg = document.getElementById('mj-msg');
    const lines = [...document.querySelectorAll('.mj-line')].map(r => ({ account: r.querySelector('.mj-acct').value, debit: r.querySelector('.mj-dr').value, credit: r.querySelector('.mj-cr').value }))
      .filter(l => (parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0);
    try {
      await API.post('/api/accounting/journal-entries', { date: document.getElementById('mj-date').value, description: document.getElementById('mj-desc').value, lines });
      renderApp();
    } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
  });
  document.querySelectorAll('[data-reverse]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(t('confirmReverse'))) return;
    try { await API.post(`/api/accounting/journal-entries/${b.dataset.reverse}/reverse`, {}); renderApp(); } catch (e) { alert(e.message); }
  }));
}

// ---- Settings: opening balances ----
async function booksSettingsHtml() {
  const s = await API.get('/api/accounting/settings');
  return `
    <p class="page-hint">${t('openingHint')}</p>
    <div class="card"><h3>${t('openingBalances')}</h3>
      <div class="form-row">
        <div class="field" style="margin:0;"><label>💵 ${t('cash')}</label><input id="os-cash" type="number" min="0" value="${s.openingCash || 0}"></div>
        <div class="field" style="margin:0;"><label>📱 ${t('mobileMoney')}</label><input id="os-momo" type="number" min="0" value="${s.openingMobileMoney || 0}"></div>
        <div class="field" style="margin:0;"><label>🏦 ${t('bank')}</label><input id="os-bank" type="number" min="0" value="${s.openingBank || 0}"></div>
      </div>
      <button class="btn-primary" id="os-save" style="width:auto;">${t('save')}</button><div class="form-msg" id="os-msg"></div>
    </div>`;
}
function bindSettingsEvents() {
  const b = document.getElementById('os-save');
  if (!b) return;
  b.addEventListener('click', async () => {
    const msg = document.getElementById('os-msg');
    try {
      await fetchPut('/api/accounting/settings', { openingCash: document.getElementById('os-cash').value, openingMobileMoney: document.getElementById('os-momo').value, openingBank: document.getElementById('os-bank').value });
      msg.textContent = t('saved'); msg.className = 'form-msg show success';
    } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
  });
}
function fetchPut(path, body) { return API.request('PUT', path, body); }

document.addEventListener('click', (e) => {
  const chk = e.target.closest && e.target.closest('#chk-toggle');
  if (chk) { const l = document.getElementById('chk-list'); l.style.display = l.style.display === 'none' ? 'block' : 'none'; }
  const lg = e.target.closest && e.target.closest('a.lg-link');
  if (lg) e.preventDefault();
});
