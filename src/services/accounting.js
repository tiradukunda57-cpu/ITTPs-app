// ============================================================================
// Moteri y'ibaruramari (Accounting engine) - double-entry, ikorwa automatically.
//
// UKO IKORA (ngombwa ku muntu ugenzura):
//  * Nta byinjizwa n'intoki hano. Ibitabo byose (journal, ledger, trial balance,
//    income statement, balance sheet, cash book, ...) bikorwa NANONE (replay)
//    biturutse ku byanditswe muri system: amagurisha, ubwishyu bw'amadeni,
//    kurangura, amadeni y'ubucuruzi, ibyakoreshejwe (expenses), imisoro, amande,
//    commission, n'ibyinjijwe n'intoki muri General Journal.
//  * Buri gikorwa gikora "journal entry" ifite Debit = Credit. Balance Sheet
//    ntiyigeze "ihuzwa ku ngufu": Umutungo = Imyenda + Imari ni ukuri kuko
//    byose bivuye mu ma-entries aringaniye. Hari n'ibigenzura (checks) bigereranya
//    ibitabo n'ibyanditswe (urugero: Receivables ledger = amadeni abakiriya basigaje).
//  * Agaciro ka stock: "moving average cost" (impuzandengo igenda ihinduka igihe
//    hari ibyaranguwe). Igiciro cy'ibanze cy'ibisanzwe muri stock ni "costPrice"
//    y'igicuruzwa (nyiri business ni we ukiyandikira). Iyo kitaranditswe, agaciro
//    karabarwa kuri 0 maze system ikabimenyesha (data-quality warning).
//  * Amafaranga yose ni RWF, imibare yuzuye (nta mafaranga y'ibice).
//  * Igihe: u Rwanda ruri kuri UTC+2 (nta saa y'impeshyi). Amatariki y'amanota
//    (YYYY-MM-DD) asobanurwa nk'itariki yo mu Rwanda.
// ============================================================================

const TZ_OFFSET_MS = 2 * 3600 * 1000; // Africa/Kigali

// ---------------- Chart of accounts ----------------
// control = konti ikurikiranwa n'ikindi gitabo (subledger) - ntishobora kwinjizwamo n'intoki.
const ACCOUNTS = [
  { code: '1010', type: 'asset', group: 'cash' },
  { code: '1020', type: 'asset', group: 'cash' },
  { code: '1030', type: 'asset', group: 'cash' },
  { code: '1100', type: 'asset', group: 'receivable', control: true },
  { code: '1200', type: 'asset', group: 'inventory', control: true },
  { code: '1210', type: 'asset', group: 'inventory', control: true },
  { code: '2010', type: 'liability', group: 'payable', control: true },
  { code: '2020', type: 'liability', group: 'loan', control: true },
  { code: '2040', type: 'liability', group: 'deposit', control: true },
  { code: '2200', type: 'liability', group: 'fine', control: true },
  { code: '2300', type: 'liability', group: 'commission', control: true },
  { code: '3010', type: 'equity', group: 'capital' },
  { code: '3020', type: 'equity', group: 'drawings' },
  { code: '4010', type: 'revenue', group: 'sales' },
  { code: '4020', type: 'revenue', group: 'other_income' },
  { code: '5010', type: 'expense', group: 'cogs' },
  { code: '5020', type: 'expense', group: 'writeoff' },
  { code: '6010', type: 'expense', group: 'opex' },
  { code: '6020', type: 'expense', group: 'opex' },
  { code: '6030', type: 'expense', group: 'opex' },
  { code: '6040', type: 'expense', group: 'opex' },
  { code: '6050', type: 'expense', group: 'opex' },
  { code: '6060', type: 'expense', group: 'opex' },
  { code: '6070', type: 'expense', group: 'opex' },
  { code: '6080', type: 'expense', group: 'opex' },
  { code: '6090', type: 'expense', group: 'opex' },
  { code: '6100', type: 'expense', group: 'commission_exp' },
  { code: '6110', type: 'expense', group: 'tax' },
  { code: '6120', type: 'expense', group: 'fine_exp' },
  { code: '6130', type: 'expense', group: 'shortage' }
];
const ACCOUNT_MAP = Object.fromEntries(ACCOUNTS.map(a => [a.code, a]));

const EXPENSE_CATEGORIES = {
  rent: '6010', salaries: '6020', transport: '6030', utilities: '6040',
  communication: '6050', marketing: '6060', maintenance: '6070', supplies: '6080', other: '6090'
};

// ---------------- Helpers ----------------
const r = (n) => Math.round(Number(n) || 0);

function kigaliDate(ts) {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
function todayKigali() { return kigaliDate(Date.now()); }
// 'YYYY-MM-DD' -> mu ntangiriro y'umunsi (Kigali) mu ms
function dayStartTs(d) { return Date.parse(`${d}T00:00:00+02:00`); }
function dayEndTs(d) { return dayStartTs(d) + 86400000 - 1; }
// Itariki y'amanota (YYYY-MM-DD) -> ISO ya saa sita z'amanywa (Kigali), kugira ngo igume ku munsi wayo
function dateToNoonIso(d) { return new Date(Date.parse(`${d}T12:00:00+02:00`)).toISOString(); }
function isDateStr(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T00:00:00+02:00`)); }
function daysBetween(fromDate, toDate) {
  return Math.round((dayStartTs(toDate) - dayStartTs(fromDate)) / 86400000);
}
function cashAcct(method) {
  return method === 'phone' ? '1020' : method === 'bank' ? '1030' : '1010';
}
function parseTs(iso, fallback) {
  const t = iso ? Date.parse(iso) : NaN;
  return isNaN(t) ? fallback : t;
}

// ---------------- Sales payments (new + legacy) ----------------
// Amagurisha mashya afite `payments[]`. Ay'kera (legacy) ntafite - turayakora
// "synthesize" kuri amountPaid/paidAt kugira ngo ibitabo bihuze n'ibyanditswe.
function normalizeSalePayments(s) {
  const saleTs = parseTs(s.timestamp, 0);
  if (Array.isArray(s.payments)) {
    return s.payments.map(p => ({
      id: p.id, amount: r(p.amount), at: parseTs(p.at, saleTs), initial: !!p.initial,
      method: p.method || s.paymentMethod || 'cash', bankName: p.bankName || '', note: p.note || ''
    })).filter(p => p.amount > 0);
  }
  const total = r(s.total);
  const paid = s.amountPaid != null ? r(s.amountPaid) : total;
  if (paid <= 0) return [];
  const paidAtTs = s.paidAt ? parseTs(s.paidAt, null) : null;
  const settledLater = s.paymentStatus === 'paid' && paidAtTs != null && paidAtTs - saleTs > 5000;
  return [{
    id: `${s.id}-p0`, amount: paid, at: settledLater ? paidAtTs : saleTs, initial: !settledLater,
    method: s.paymentMethod || 'cash', bankName: s.bankName || '', note: ''
  }];
}

function saleOutstanding(s) {
  const total = r(s.total);
  const paid = normalizeSalePayments(s).reduce((a, p) => a + p.amount, 0);
  return Math.max(0, total - paid);
}

function payablePayments(p) {
  return (p.payments || []).map(x => ({
    id: x.id, amount: r(x.amount), at: parseTs(x.at, 0), method: x.method || 'cash', bankName: x.bankName || '', note: x.note || ''
  })).filter(x => x.amount > 0);
}

// ---------------- Build the journal ----------------
function buildBooks(data, businessId) {
  const owner = (data.users || []).find(u => u.id === businessId) || {};
  const settings = owner.accounting || {};
  const products = (data.products || []).filter(p => p.businessId === businessId);
  const sales = (data.sales || []).filter(s => s.businessId === businessId);
  const dispatches = (data.dispatches || []).filter(d => d.businessId === businessId);
  const procs = (data.procurements || []).filter(p => p.businessId === businessId && p.status === 'confirmed');
  const payables = (data.payables || []).filter(p => p.businessId === businessId && !p.voidedAt);
  const expenses = (data.expenses || []).filter(e => e.businessId === businessId && !e.voidedAt);
  const taxPayments = (data.taxPayments || []).filter(t => t.businessId === businessId);
  const fines = (data.fines || []).filter(f => f.businessId === businessId);
  const commissions = (data.payments || []).filter(c => c.businessId === businessId);
  const manual = (data.journalEntries || []).filter(j => j.businessId === businessId);

  const entries = [];
  const problems = [];
  const quality = { productsWithoutCost: [], procurementsWithoutCost: 0, negativeStock: [], debtsWithoutDueDate: 0 };
  let seq = 0;

  function addEntry({ ts, type, ref, desc, lines, cf, source }) {
    const clean = lines.filter(l => (l.dr || 0) !== 0 || (l.cr || 0) !== 0)
      .map(l => ({ acct: l.acct, dr: r(l.dr), cr: r(l.cr), memo: l.memo || '' }));
    if (clean.length === 0) return;
    const dr = clean.reduce((a, l) => a + l.dr, 0);
    const cr = clean.reduce((a, l) => a + l.cr, 0);
    if (dr !== cr) problems.push({ type, ref, dr, cr });
    entries.push({
      id: `${type}:${source && source.id ? source.id : ref}:${seq}`, seq: seq++, ts, date: new Date(ts).toISOString(),
      type, ref: ref || '', desc: desc || { code: type, params: {} }, lines: clean, cf: cf || null, source: source || null
    });
  }

  // ---- Opening quantities (derived) ----
  const sold = {}, taken = {}, returned = {}, procured = {};
  const firstEvent = {};
  const touch = (pid, ts) => { if (pid && ts && (firstEvent[pid] == null || ts < firstEvent[pid])) firstEvent[pid] = ts; };
  for (const s of sales) { sold[s.productId] = (sold[s.productId] || 0) + (Number(s.qty) || 0); touch(s.productId, parseTs(s.timestamp)); }
  for (const d of dispatches) {
    for (const it of d.items || []) {
      taken[it.productId] = (taken[it.productId] || 0) + (Number(it.qtyTaken) || 0);
      touch(it.productId, parseTs(d.dispatchedAt));
      if (d.status === 'returned') returned[it.productId] = (returned[it.productId] || 0) + (Number(it.qtyReturned) || 0);
    }
  }
  for (const p of procs) for (const it of p.items || []) { procured[it.productId] = (procured[it.productId] || 0) + (Number(it.qty) || 0); touch(it.productId, parseTs(p.confirmedAt)); }

  // ---- Events ----
  const events = [];
  const push = (ts, pri, fn) => events.push({ ts, pri, n: events.length, fn });
  const productById = Object.fromEntries(products.map(p => [p.id, p]));
  const st = {}; // productId -> { qty, value }
  const ensure = (pid) => (st[pid] = st[pid] || { qty: 0, value: 0 });
  const issue = (pid, q) => {
    const s = ensure(pid);
    q = Number(q) || 0;
    if (s.qty <= 0) { s.qty -= q; return 0; }
    const v = q >= s.qty ? s.value : r((s.value * q) / s.qty);
    s.qty -= q; s.value -= v;
    return v;
  };

  const allDates = [];
  const ownerCreated = parseTs(owner.createdAt, null);
  if (ownerCreated) allDates.push(ownerCreated);
  for (const p of products) allDates.push(parseTs(p.createdAt, Date.now()));
  Object.values(firstEvent).forEach(t => allDates.push(t));
  const startTs = (allDates.length ? Math.min(...allDates) : Date.now()) - 1000;

  // Opening cash balances (nyiri business ni we uzibwira)
  push(startTs, 0, () => {
    const oc = r(settings.openingCash), om = r(settings.openingMobileMoney), ob = r(settings.openingBank);
    const total = oc + om + ob;
    if (total === 0) return;
    addEntry({
      ts: startTs, type: 'opening_cash', ref: 'OPEN', desc: { code: 'opening_cash', params: {} }, cf: 'opening',
      lines: [{ acct: '1010', dr: oc }, { acct: '1020', dr: om }, { acct: '1030', dr: ob }, { acct: '3010', cr: total }]
    });
  });

  // Opening stock per product
  for (const p of products) {
    const opening = (Number(p.stock) || 0) + (sold[p.id] || 0) + (taken[p.id] || 0) - (returned[p.id] || 0) - (procured[p.id] || 0);
    const ts = Math.min(parseTs(p.createdAt, Date.now()), firstEvent[p.id] != null ? firstEvent[p.id] : Infinity) - 1;
    push(ts, 0, () => {
      const q = opening > 0 ? opening : 0;
      if (opening < -1e-9) problems.push({ type: 'negative_opening', ref: p.name, dr: opening, cr: 0 });
      const cost = Number(p.costPrice) > 0 ? Number(p.costPrice) : 0;
      const value = r(q * cost);
      const s = ensure(p.id); s.qty += q; s.value += value;
      if (q > 0 && !(cost > 0)) quality.productsWithoutCost.push({ id: p.id, name: p.name });
      if (value > 0) addEntry({
        ts, type: 'opening_stock', ref: 'OPEN', desc: { code: 'opening_stock', params: { product: p.name } },
        lines: [{ acct: '1200', dr: value }, { acct: '3010', cr: value }], source: { type: 'product', id: p.id }
      });
    });
    if (p.deletedAt) {
      const dts = parseTs(p.deletedAt, Date.now());
      push(dts, 5, () => {
        const s = ensure(p.id);
        const v = s.value;
        if (v > 0) addEntry({
          ts: dts, type: 'writeoff', ref: p.name, desc: { code: 'writeoff', params: { product: p.name } },
          lines: [{ acct: '5020', dr: v }, { acct: '1200', cr: v }], source: { type: 'product', id: p.id }
        });
        s.qty = 0; s.value = 0; s.writtenOff = true;
      });
    }
  }

  // Procurement receipts
  for (const pr of procs) {
    const ts = parseTs(pr.confirmedAt, parseTs(pr.startedAt, 0));
    push(ts, 1, () => {
      let total = 0;
      for (const it of pr.items || []) {
        const cost = r((Number(it.unitCost) || 0) * (Number(it.qty) || 0));
        if (!(Number(it.unitCost) > 0)) quality.procurementsWithoutCost += 1;
        const s = ensure(it.productId); s.qty += Number(it.qty) || 0; s.value += cost;
        total += cost;
      }
      let paid = pr.amountPaid != null ? r(pr.amountPaid) : (pr.paymentMethod === 'debt' ? 0 : total);
      paid = Math.max(0, Math.min(paid, total));
      const payMethod = pr.paymentMethod === 'debt' ? 'cash' : pr.paymentMethod;
      const supplier = (pr.supplier && (pr.supplier.businessName || pr.supplier.name)) || '';
      addEntry({
        ts, type: 'procurement', ref: pr.invoiceNumber || pr.id, cf: 'pay_suppliers',
        desc: { code: 'procurement', params: { supplier } },
        lines: [{ acct: '1200', dr: total }, { acct: cashAcct(payMethod), cr: paid, memo: pr.bankName || '' }, { acct: '2010', cr: total - paid }],
        source: { type: 'procurement', id: pr.id }
      });
    });
  }

  // Dispatches
  const field = {}; // dispatchId -> [{pid, qty, value}]
  for (const d of dispatches) {
    const outTs = parseTs(d.dispatchedAt, 0);
    push(outTs, 2, () => {
      const lines = []; field[d.id] = []; let total = 0;
      for (const it of d.items || []) {
        const v = issue(it.productId, it.qtyTaken);
        field[d.id].push({ pid: it.productId, qty: Number(it.qtyTaken) || 0, value: v });
        total += v;
      }
      addEntry({
        ts: outTs, type: 'dispatch_out', ref: d.id, desc: { code: 'dispatch_out', params: { vendor: d.vendorName } },
        lines: [{ acct: '1210', dr: total }, { acct: '1200', cr: total }], source: { type: 'dispatch', id: d.id }
      });
    });
    if (d.status === 'returned') {
      const retTs = parseTs(d.returnedAt, outTs);
      push(retTs, 4, () => {
        let retTotal = 0, soldTotal = 0, fieldTotal = 0;
        for (const f of field[d.id] || []) {
          const it = (d.items || []).find(x => x.productId === f.pid) || {};
          const qr = Math.min(Number(it.qtyReturned) || 0, f.qty);
          const rv = qr >= f.qty ? f.value : r((f.value * qr) / (f.qty || 1));
          retTotal += rv; soldTotal += f.value - rv; fieldTotal += f.value;
          const s = ensure(f.pid); s.qty += qr; s.value += rv;
        }
        const expected = r(d.expectedAmount), collected = r(d.amountCollected);
        const lines = [
          { acct: '1200', dr: retTotal }, { acct: '5010', dr: soldTotal }, { acct: '1210', cr: fieldTotal },
          { acct: '1010', dr: collected }, { acct: '4010', cr: expected }
        ];
        if (collected < expected) lines.push({ acct: '6130', dr: expected - collected });
        if (collected > expected) lines.push({ acct: '4020', cr: collected - expected });
        addEntry({
          ts: retTs, type: 'dispatch_return', ref: d.id, cf: 'receipts_customers',
          desc: { code: 'dispatch_return', params: { vendor: d.vendorName } }, lines, source: { type: 'dispatch', id: d.id }
        });
      });
    }
  }

  // Sales + customer payments
  const outstanding = {};
  for (const s of sales) {
    const ts = parseTs(s.timestamp, 0);
    const pays = normalizeSalePayments(s);
    const initial = pays.filter(p => p.initial);
    push(ts, 3, () => {
      const total = r(s.total);
      const initPaid = initial.reduce((a, p) => a + p.amount, 0);
      const applied = Math.min(initPaid, total);
      const over = initPaid - applied;
      const ar = total - applied;
      outstanding[s.id] = ar;
      const cogs = issue(s.productId, s.qty);
      const lines = initial.map(p => ({ acct: cashAcct(p.method), dr: p.amount, memo: p.method === 'bank' ? p.bankName : '' }));
      lines.push({ acct: '1100', dr: ar }, { acct: '4010', cr: total }, { acct: '2040', cr: over },
        { acct: '5010', dr: cogs }, { acct: '1200', cr: cogs });
      if (ar > 0 && !s.dueDate) quality.debtsWithoutDueDate += 1;
      addEntry({
        ts, type: 'sale', ref: s.invoiceNo || s.id, cf: 'receipts_customers',
        desc: { code: 'sale', params: { customer: s.customerName || '', product: s.productName || '' } },
        lines, source: { type: 'sale', id: s.id }
      });
    });
    for (const p0 of pays.filter(x => !x.initial)) {
      const p = { ...p0, at: Math.max(p0.at, ts) }; // ubwishyu ntibushobora kubanziriza igurisha
      push(p.at, 6, () => {
        const out = outstanding[s.id] != null ? outstanding[s.id] : 0;
        const apply = Math.min(p.amount, out);
        outstanding[s.id] = out - apply;
        addEntry({
          ts: p.at, type: 'sale_payment', ref: s.invoiceNo || s.id, cf: 'receipts_customers',
          desc: { code: 'sale_payment', params: { customer: s.customerName || '' } },
          lines: [{ acct: cashAcct(p.method), dr: p.amount, memo: p.method === 'bank' ? p.bankName : '' }, { acct: '1100', cr: apply }, { acct: '2040', cr: p.amount - apply }],
          source: { type: 'sale', id: s.id }
        });
      });
    }
  }

  // Payables (manual + linked) and their payments
  for (const pb of payables) {
    const incTs = parseTs(pb.incurredAt, parseTs(pb.createdAt, 0));
    const liab = pb.nature === 'loan' ? '2020' : '2010';
    if (pb.source === 'manual' || !pb.source) {
      push(incTs, 3, () => {
        const total = r(pb.total);
        let lines;
        if (pb.nature === 'loan') lines = [{ acct: cashAcct(pb.receiveMethod), dr: total, memo: pb.bankName || '' }, { acct: '2020', cr: total }];
        else if (pb.nature === 'expense') lines = [{ acct: EXPENSE_CATEGORIES[pb.expenseCategory] || '6090', dr: total }, { acct: '2010', cr: total }];
        else lines = [{ acct: '3010', dr: total }, { acct: '2010', cr: total }]; // 'opening' - ideni ryariho mbere
        addEntry({
          ts: incTs, type: 'payable', ref: pb.id, cf: pb.nature === 'loan' ? 'loans_in' : null,
          desc: { code: pb.nature === 'loan' ? 'payable_loan' : pb.nature === 'expense' ? 'payable_expense' : 'payable_opening', params: { creditor: pb.creditorName || '' } },
          lines, source: { type: 'payable', id: pb.id }
        });
      });
    }
    for (const p0 of payablePayments(pb)) {
      const p = { ...p0, at: Math.max(p0.at, incTs) };
      push(p.at, 6, () => {
        addEntry({
          ts: p.at, type: 'payable_payment', ref: pb.id,
          cf: pb.nature === 'loan' ? 'loans_out' : (pb.source === 'procurement' ? 'pay_suppliers' : 'pay_expenses'),
          desc: { code: 'payable_payment', params: { creditor: pb.creditorName || '' } },
          lines: [{ acct: liab, dr: p.amount }, { acct: cashAcct(p.method), cr: p.amount, memo: p.method === 'bank' ? p.bankName : '' }],
          source: { type: 'payable', id: pb.id }
        });
      });
    }
  }

  // Expenses
  for (const e of expenses) {
    const ts = parseTs(e.date, parseTs(e.createdAt, 0));
    push(ts, 3, () => {
      const amt = r(e.amount);
      const credit = e.method === 'credit';
      addEntry({
        ts, type: 'expense', ref: e.id, cf: credit ? null : 'pay_expenses',
        desc: { code: 'expense', params: { category: e.category, note: e.description || '' } },
        lines: [{ acct: EXPENSE_CATEGORIES[e.category] || '6090', dr: amt },
          credit ? { acct: '2010', cr: amt } : { acct: cashAcct(e.method), cr: amt, memo: e.method === 'bank' ? (e.bankName || '') : '' }],
        source: { type: 'expense', id: e.id }
      });
    });
  }

  // Tax payments (RRA)
  for (const t of taxPayments) {
    const ts = parseTs(t.paidAt, 0);
    push(ts, 3, () => addEntry({
      ts, type: 'tax_payment', ref: t.id, cf: 'pay_tax', desc: { code: 'tax_payment', params: { note: t.note || '' } },
      lines: [{ acct: '6110', dr: r(t.amountPaid) }, { acct: cashAcct(t.method), cr: r(t.amountPaid), memo: t.method === 'bank' ? (t.bankName || '') : '' }],
      source: { type: 'tax', id: t.id }
    }));
  }

  // Fines
  for (const f of fines) {
    const ts = parseTs(f.issuedAt, 0);
    push(ts, 3, () => addEntry({
      ts, type: 'fine', ref: f.reference || f.id, desc: { code: 'fine', params: { reason: f.reason || '' } },
      lines: [{ acct: '6120', dr: r(f.amount) }, { acct: '2200', cr: r(f.amount) }], source: { type: 'fine', id: f.id }
    }));
    if (f.status === 'paid' && f.paidAt) {
      const pts = parseTs(f.paidAt, ts);
      push(pts, 6, () => addEntry({
        ts: pts, type: 'fine_payment', ref: f.reference || f.id, cf: 'pay_fines', desc: { code: 'fine_payment', params: { reason: f.reason || '' } },
        lines: [{ acct: '2200', dr: r(f.amount) }, { acct: '1010', cr: r(f.amount) }], source: { type: 'fine', id: f.id }
      }));
    }
  }

  // Platform commission
  for (const c of commissions) {
    const ts = parseTs(c.periodEnd, parseTs(c.createdAt, 0));
    const exp = r(c.expectedAmount);
    push(ts, 3, () => addEntry({
      ts, type: 'commission', ref: c.id, desc: { code: 'commission', params: {} },
      lines: [{ acct: '6100', dr: exp }, { acct: '2300', cr: exp }], source: { type: 'commission', id: c.id }
    }));
    if (c.confirmedAt && c.confirmedAmount != null) {
      const pts = parseTs(c.confirmedAt, ts);
      push(pts, 6, () => addEntry({
        ts: pts, type: 'commission_payment', ref: c.id, cf: 'pay_commission', desc: { code: 'commission_payment', params: {} },
        lines: [{ acct: '2300', dr: r(c.confirmedAmount) }, { acct: '1020', cr: r(c.confirmedAmount) }], source: { type: 'commission', id: c.id }
      }));
    }
  }

  // Manual journal entries
  for (const j of manual) {
    const ts = parseTs(j.date, 0);
    push(ts, 7, () => addEntry({
      ts, type: 'manual', ref: j.id, cf: 'manual', desc: { code: j.reversalOf ? 'manual_reversal' : 'manual', params: { text: j.description || '' } },
      lines: (j.lines || []).map(l => ({ acct: l.account, dr: l.debit, cr: l.credit })), source: { type: 'manual', id: j.id }
    }));
  }

  events.sort((a, b) => a.ts - b.ts || a.pri - b.pri || a.n - b.n);
  for (const ev of events) ev.fn();

  // Stock state (final)
  const stock = products.map(p => {
    const s = st[p.id] || { qty: 0, value: 0 };
    return {
      id: p.id, name: p.name, unit: p.unit || 'unit', deleted: !!p.deletedAt, physicalQty: Number(p.stock) || 0,
      qty: s.qty, value: s.value, avgCost: s.qty > 0 ? s.value / s.qty : (Number(p.costPrice) || 0), costPrice: Number(p.costPrice) || 0
    };
  });
  for (const s of stock) if (!s.deleted && s.qty < -1e-9) quality.negativeStock.push({ id: s.id, name: s.name });
  const fieldValue = Object.entries(field).reduce((a, [did, arr]) => {
    const d = dispatches.find(x => x.id === did);
    if (d && d.status !== 'returned') a += arr.reduce((x, f) => x + f.value, 0);
    return a;
  }, 0);

  return { entries, problems, quality, stock, fieldValue, startTs, outstanding,
    ctx: { sales, dispatches, procs, payables, expenses, products, owner } };
}

// ---------------- Aggregations ----------------
function emptyBal() { return { dr: 0, cr: 0 }; }

function sumByAccount(entries, fromTs, toTs) {
  const m = {};
  for (const e of entries) {
    if (fromTs != null && e.ts < fromTs) continue;
    if (toTs != null && e.ts > toTs) continue;
    for (const l of e.lines) {
      const b = (m[l.acct] = m[l.acct] || emptyBal());
      b.dr += l.dr; b.cr += l.cr;
    }
  }
  return m;
}

// Umubare w'konti mu ruhande rwayo (natural side): asset/expense => dr-cr ; ibindi => cr-dr
function natural(code, b) {
  const a = ACCOUNT_MAP[code];
  const net = (b ? b.dr - b.cr : 0);
  return ((a.type === 'asset' || a.type === 'expense') ? net : -net) || 0;
}

function trialBalance(entries, fromTs, toTs) {
  const opening = fromTs != null ? sumByAccount(entries, null, fromTs - 1) : {};
  const period = sumByAccount(entries, fromTs, toTs);
  const rows = [];
  let tot = { oDr: 0, oCr: 0, pDr: 0, pCr: 0, cDr: 0, cCr: 0 };
  for (const a of ACCOUNTS) {
    const o = opening[a.code] || emptyBal(), p = period[a.code] || emptyBal();
    if (!o.dr && !o.cr && !p.dr && !p.cr) continue;
    const oNet = o.dr - o.cr, cNet = oNet + p.dr - p.cr;
    const row = {
      code: a.code, type: a.type,
      oDr: oNet > 0 ? oNet : 0, oCr: oNet < 0 ? -oNet : 0,
      pDr: p.dr, pCr: p.cr,
      cDr: cNet > 0 ? cNet : 0, cCr: cNet < 0 ? -cNet : 0
    };
    for (const k of Object.keys(tot)) tot[k] += row[k];
    rows.push(row);
  }
  return { rows, totals: tot };
}

function incomeStatement(entries, fromTs, toTs) {
  const p = sumByAccount(entries, fromTs, toTs);
  const line = (code) => natural(code, p[code]);
  const sales = line('4010'), other = line('4020');
  const cogs = line('5010');
  const expenseCodes = ACCOUNTS.filter(a => a.type === 'expense' && a.code !== '5010').map(a => a.code);
  const expenses = expenseCodes.map(c => ({ code: c, amount: line(c) })).filter(x => x.amount !== 0);
  const totalExpenses = expenses.reduce((a, x) => a + x.amount, 0);
  const grossProfit = sales - cogs;
  const netProfit = grossProfit + other - totalExpenses;
  return { sales, other, cogs, grossProfit, expenses, totalExpenses, netProfit,
    grossMarginPct: sales ? (grossProfit / sales) * 100 : 0, netMarginPct: sales ? (netProfit / sales) * 100 : 0 };
}

function balanceSheet(entries, toTs) {
  const b = sumByAccount(entries, null, toTs);
  const val = (c) => natural(c, b[c]);
  const assets = ACCOUNTS.filter(a => a.type === 'asset').map(a => ({ code: a.code, amount: val(a.code) }));
  const liabilities = ACCOUNTS.filter(a => a.type === 'liability').map(a => ({ code: a.code, amount: val(a.code) }));
  const revenue = ACCOUNTS.filter(a => a.type === 'revenue').reduce((s, a) => s + val(a.code), 0);
  const expense = ACCOUNTS.filter(a => a.type === 'expense').reduce((s, a) => s + val(a.code), 0);
  const retained = revenue - expense;
  const equity = [
    { code: '3010', amount: val('3010') },
    { code: '3020', amount: val('3020') },         // drawings: umubare mubi (kuko ari Debit)
    { code: 'RE', amount: retained }
  ];
  const totalAssets = assets.reduce((s, x) => s + x.amount, 0);
  const totalLiabilities = liabilities.reduce((s, x) => s + x.amount, 0);
  const totalEquity = equity.reduce((s, x) => s + x.amount, 0);
  return { assets: assets.filter(x => x.amount !== 0 || ['1010', '1020', '1030', '1100', '1200'].includes(x.code)),
    liabilities: liabilities.filter(x => x.amount !== 0), equity,
    totalAssets, totalLiabilities, totalEquity, difference: totalAssets - (totalLiabilities + totalEquity) };
}

function cashFlow(entries, fromTs, toTs) {
  const cashCodes = ['1010', '1020', '1030'];
  const cats = {};
  const openingB = sumByAccount(entries, null, fromTs != null ? fromTs - 1 : -Infinity);
  const opening = fromTs != null ? cashCodes.reduce((s, c) => s + natural(c, openingB[c]), 0) : 0;
  for (const e of entries) {
    if (fromTs != null && e.ts < fromTs) continue;
    if (toTs != null && e.ts > toTs) continue;
    const net = e.lines.filter(l => cashCodes.includes(l.acct)).reduce((s, l) => s + l.dr - l.cr, 0);
    if (!net) continue;
    const k = e.cf || 'other';
    cats[k] = (cats[k] || 0) + net;
  }
  const net = Object.values(cats).reduce((a, b) => a + b, 0);
  return { opening, categories: cats, net, closing: opening + net };
}

// ---------------- Ledger / Cash book ----------------
function ledgerFor(entries, code, fromTs, toTs) {
  const before = sumByAccount(entries, null, fromTs != null ? fromTs - 1 : -Infinity);
  const openingNet = fromTs != null && before[code] ? before[code].dr - before[code].cr : 0;
  let run = openingNet;
  const rows = [];
  for (const e of entries) {
    if (fromTs != null && e.ts < fromTs) continue;
    if (toTs != null && e.ts > toTs) continue;
    for (const l of e.lines) {
      if (l.acct !== code) continue;
      run += l.dr - l.cr;
      rows.push({ date: e.date, ref: e.ref, desc: e.desc, type: e.type, dr: l.dr, cr: l.cr, balance: run, memo: l.memo, entryId: e.id });
    }
  }
  const a = ACCOUNT_MAP[code];
  const sign = (a.type === 'asset' || a.type === 'expense') ? 1 : -1;
  return { code, opening: openingNet * sign, closing: run * sign, rows: rows.map(x => ({ ...x, balance: x.balance * sign })), totalDr: rows.reduce((s, x) => s + x.dr, 0), totalCr: rows.reduce((s, x) => s + x.cr, 0) };
}

function cashBook(entries, fromTs, toTs) {
  const cashCodes = ['1010', '1020', '1030'];
  const before = sumByAccount(entries, null, fromTs != null ? fromTs - 1 : -Infinity);
  const bal = {};
  for (const c of cashCodes) bal[c] = fromTs != null && before[c] ? before[c].dr - before[c].cr : 0;
  const opening = { ...bal };
  const rows = [];
  for (const e of entries) {
    if (fromTs != null && e.ts < fromTs) continue;
    if (toTs != null && e.ts > toTs) continue;
    for (const l of e.lines) {
      if (!cashCodes.includes(l.acct)) continue;
      bal[l.acct] += l.dr - l.cr;
      rows.push({ date: e.date, ref: e.ref, desc: e.desc, type: e.type, acct: l.acct, memo: l.memo, receipt: l.dr, payment: l.cr,
        balance: cashCodes.reduce((s, c) => s + bal[c], 0), accountBalance: bal[l.acct], entryId: e.id });
    }
  }
  return { opening, closing: { ...bal }, rows,
    totals: { receipts: rows.reduce((s, x) => s + x.receipt, 0), payments: rows.reduce((s, x) => s + x.payment, 0) } };
}

// ---------------- Receivables / payables (subledgers) ----------------
function receivableList(data, businessId) {
  const today = todayKigali();
  return (data.sales || []).filter(s => s.businessId === businessId).map(s => {
    const total = r(s.total);
    const pays = normalizeSalePayments(s);
    const paid = pays.reduce((a, p) => a + p.amount, 0);
    const out = Math.max(0, total - paid);
    const daysLeft = s.dueDate && isDateStr(s.dueDate) ? daysBetween(today, s.dueDate) : null;
    let status = 'paid';
    if (out > 0) status = daysLeft == null ? 'no_date' : daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'due_today' : daysLeft <= 7 ? 'due_soon' : 'ok';
    return {
      id: s.id, invoiceNo: s.invoiceNo || '', customerName: s.customerName || '', customerPhone: s.customerPhone || '', customerEmail: s.customerEmail || '',
      productName: s.productName, qty: s.qty, total, paid, outstanding: out, givenAt: s.timestamp, dueDate: s.dueDate || null, daysLeft, status,
      paymentMethod: s.paymentMethod || 'cash', payments: pays.map(p => ({ id: p.id, amount: p.amount, at: new Date(p.at).toISOString(), method: p.method, bankName: p.bankName, note: p.note }))
    };
  }).sort((a, b) => new Date(b.givenAt) - new Date(a.givenAt));
}

function payableList(data, businessId) {
  const today = todayKigali();
  return (data.payables || []).filter(p => p.businessId === businessId && !p.voidedAt).map(p => {
    const total = r(p.total);
    const pays = payablePayments(p);
    const paid = pays.reduce((a, x) => a + x.amount, 0);
    const out = Math.max(0, total - paid);
    const daysLeft = p.dueDate && isDateStr(p.dueDate) ? daysBetween(today, p.dueDate) : null;
    let status = 'paid';
    if (out > 0) status = daysLeft == null ? 'no_date' : daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'due_today' : daysLeft <= 7 ? 'due_soon' : 'ok';
    return { ...p, total, paid, outstanding: out, daysLeft, status,
      payments: pays.map(x => ({ id: x.id, amount: x.amount, at: new Date(x.at).toISOString(), method: x.method, bankName: x.bankName, note: x.note })) };
  }).sort((a, b) => new Date(b.incurredAt || b.createdAt) - new Date(a.incurredAt || a.createdAt));
}

function agingBuckets(items) {
  const b = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0, nodate: 0 };
  const rows = [];
  for (const it of items) {
    if (it.outstanding <= 0) continue;
    let k;
    if (it.daysLeft == null) k = 'nodate';
    else if (it.daysLeft >= 0) k = 'current';
    else { const od = -it.daysLeft; k = od <= 30 ? 'd1_30' : od <= 60 ? 'd31_60' : od <= 90 ? 'd61_90' : 'd90p'; }
    b[k] += it.outstanding;
    rows.push({ ...it, bucket: k });
  }
  return { buckets: b, total: Object.values(b).reduce((a, x) => a + x, 0), rows };
}

// ---------------- Reconciliation checks ----------------
function runChecks(data, businessId, books) {
  const { entries, problems, quality } = books;
  const all = sumByAccount(entries, null, null);
  const bal = (c) => natural(c, all[c]);
  const checks = [];
  const add = (id, ok, expected, actual, severity = 'error') => checks.push({ id, ok, expected, actual, severity });

  const totDr = entries.reduce((s, e) => s + e.lines.reduce((a, l) => a + l.dr, 0), 0);
  const totCr = entries.reduce((s, e) => s + e.lines.reduce((a, l) => a + l.cr, 0), 0);
  add('journal_balanced', problems.filter(p => p.cr !== undefined && p.type !== 'negative_opening').length === 0 && totDr === totCr, totDr, totCr);

  const tb = trialBalance(entries, null, null).totals;
  add('trial_balance', tb.cDr === tb.cCr, tb.cDr, tb.cCr);

  const bs = balanceSheet(entries, null);
  add('balance_sheet', Math.abs(bs.difference) < 1, bs.totalAssets, bs.totalLiabilities + bs.totalEquity);

  const recv = receivableList(data, businessId).reduce((s, x) => s + x.outstanding, 0);
  add('receivables_subledger', bal('1100') === recv, bal('1100'), recv);

  const pay = payableList(data, businessId);
  const apSub = pay.filter(p => p.nature !== 'loan').reduce((s, x) => s + x.outstanding, 0);
  const loanSub = pay.filter(p => p.nature === 'loan').reduce((s, x) => s + x.outstanding, 0);
  add('payables_subledger', bal('2010') === apSub, bal('2010'), apSub);
  add('loans_subledger', bal('2020') === loanSub, bal('2020'), loanSub);

  const stockVal = books.stock.filter(s => !s.deleted).reduce((s, x) => s + x.value, 0);
  add('inventory_valuation', bal('1200') === stockVal, bal('1200'), stockVal);
  add('inventory_in_field', bal('1210') === books.fieldValue, bal('1210'), books.fieldValue);
  const qtyMismatch = books.stock.filter(s => !s.deleted && Math.abs(s.qty - s.physicalQty) > 1e-6);
  add('stock_quantities', qtyMismatch.length === 0, 0, qtyMismatch.length);

  const salesRev = (data.sales || []).filter(s => s.businessId === businessId).reduce((s, x) => s + r(x.total), 0)
    + (data.dispatches || []).filter(d => d.businessId === businessId && d.status === 'returned').reduce((s, d) => s + r(d.expectedAmount), 0);
  add('revenue_matches_sales', bal('4010') === salesRev, bal('4010'), salesRev);

  const fineOut = (data.fines || []).filter(f => f.businessId === businessId && f.status !== 'paid').reduce((s, f) => s + r(f.amount), 0);
  add('fines_subledger', bal('2200') === fineOut, bal('2200'), fineOut);

  const negCash = ['1010', '1020', '1030'].filter(c => bal(c) < 0);
  add('cash_not_negative', negCash.length === 0, 0, negCash.length, 'warn');
  add('products_have_cost', quality.productsWithoutCost.length === 0, 0, quality.productsWithoutCost.length, 'warn');
  add('procurements_have_cost', quality.procurementsWithoutCost === 0, 0, quality.procurementsWithoutCost, 'warn');
  add('debts_have_due_date', quality.debtsWithoutDueDate === 0, 0, quality.debtsWithoutDueDate, 'warn');
  return checks;
}

module.exports = {
  ACCOUNTS, ACCOUNT_MAP, EXPENSE_CATEGORIES, TZ_OFFSET_MS,
  buildBooks, trialBalance, incomeStatement, balanceSheet, cashFlow, ledgerFor, cashBook, sumByAccount, natural,
  receivableList, payableList, agingBuckets, runChecks, normalizeSalePayments, saleOutstanding, payablePayments,
  kigaliDate, todayKigali, dayStartTs, dayEndTs, dateToNoonIso, isDateStr, daysBetween, cashAcct, r
};
