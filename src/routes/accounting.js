const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../services/notify');
const acc = require('../services/accounting');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

function stamp(dateStr) {
  const today = acc.todayKigali();
  if (!acc.isDateStr(dateStr) || dateStr > today) return new Date().toISOString();
  return dateStr === today ? new Date().toISOString() : acc.dateToNoonIso(dateStr);
}

// ---- Ibitabo (byose bikorwa nanone biturutse ku byanditswe) ----
function ctx(req) {
  const businessId = req.user.id;
  const data = db.read();
  const books = acc.buildBooks(data, businessId);
  const from = acc.isDateStr(req.query.from) ? req.query.from : null;
  const to = acc.isDateStr(req.query.to) ? req.query.to : null;
  return { businessId, data, books, entries: books.entries, fromTs: from ? acc.dayStartTs(from) : null, toTs: to ? acc.dayEndTs(to) : null };
}

router.get('/overview', (req, res) => {
  const c = ctx(req);
  res.json({
    income: acc.incomeStatement(c.entries, c.fromTs, c.toTs),
    balance: acc.balanceSheet(c.entries, c.toTs),
    cashFlow: acc.cashFlow(c.entries, c.fromTs, c.toTs),
    checks: acc.runChecks(c.data, c.businessId, c.books),
    quality: c.books.quality,
    entryCount: c.entries.length
  });
});

router.get('/journal', (req, res) => {
  const c = ctx(req);
  const manual = Object.fromEntries((c.data.journalEntries || []).filter(j => j.businessId === c.businessId).map(j => [j.id, j]));
  const rows = c.entries.filter(e => (c.fromTs == null || e.ts >= c.fromTs) && (c.toTs == null || e.ts <= c.toTs))
    .map(e => {
      const m = e.type === 'manual' && e.source ? manual[e.source.id] : null;
      return { id: e.id, date: e.date, type: e.type, ref: e.ref, desc: e.desc, lines: e.lines.map(l => ({ acct: l.acct, dr: l.dr, cr: l.cr, memo: l.memo })),
        manualId: m ? m.id : undefined, reversed: !!(m && m.reversedBy) };
    });
  res.json({ rows });
});

router.get('/ledger', (req, res) => {
  const c = ctx(req);
  const code = String(req.query.account || '');
  if (!acc.ACCOUNT_MAP[code]) return res.status(400).json({ error: 'Konti ntiyemewe.' });
  res.json(acc.ledgerFor(c.entries, code, c.fromTs, c.toTs));
});

router.get('/trial-balance', (req, res) => {
  const c = ctx(req);
  res.json(acc.trialBalance(c.entries, c.fromTs, c.toTs));
});

router.get('/cashbook', (req, res) => {
  const c = ctx(req);
  res.json(acc.cashBook(c.entries, c.fromTs, c.toTs));
});

router.get('/aging', (req, res) => {
  const c = ctx(req);
  res.json({ receivables: acc.agingBuckets(acc.receivableList(c.data, c.businessId)), payables: acc.agingBuckets(acc.payableList(c.data, c.businessId)) });
});

router.get('/stock', (req, res) => {
  const c = ctx(req);
  const rows = c.books.stock.filter(s => !s.deleted).map(s => ({ id: s.id, name: s.name, unit: s.unit, qty: s.qty, avgCost: s.avgCost, value: s.value, costPrice: s.costPrice, physicalQty: s.physicalQty }));
  res.json({ rows, totalValue: rows.reduce((a, x) => a + x.value, 0), fieldValue: c.books.fieldValue });
});

router.get('/settings', (req, res) => {
  const owner = db.read().users.find(u => u.id === req.user.id) || {};
  res.json(owner.accounting || {});
});

// ---- Opening balances ----
router.put('/settings', async (req, res) => {
  const data = db.read();
  const owner = data.users.find(u => u.id === req.user.id);
  if (!owner) return res.status(404).json({ error: 'Business ntibonetse.' });
  const num = (v) => { const n = Math.round(Number(v)); return isNaN(n) || n < 0 ? 0 : n; };
  const before = owner.accounting || {};
  owner.accounting = {
    openingCash: num(req.body.openingCash), openingMobileMoney: num(req.body.openingMobileMoney), openingBank: num(req.body.openingBank),
    updatedAt: new Date().toISOString()
  };
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'accounting_settings', entityId: owner.id, details: { before, after: owner.accounting } });
  res.json(owner.accounting);
});

// ---- Expenses ----
router.get('/expenses', (req, res) => {
  const list = (db.read().expenses || []).filter(e => e.businessId === req.user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(list);
});

router.post('/expenses', async (req, res) => {
  const b = req.body || {};
  const amount = Math.round(Number(b.amount));
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Andika amafaranga (arenze 0).' });
  if (!Object.keys(acc.EXPENSE_CATEGORIES).includes(b.category)) return res.status(400).json({ error: 'Hitamo ubwoko bw\'igikorwa.' });
  const data = db.read();
  if (b.method === 'credit') {
    // Igikorwa kiguzwe ku ideni => kiba ideni (payable) rifite uwo ugomba kwishyura n'itariki
    const creditorName = String(b.creditorName || '').trim();
    if (!creditorName) return res.status(400).json({ error: "Andika izina ry'uwo ugomba kwishyura." });
    if (!acc.isDateStr(b.dueDate)) return res.status(400).json({ error: 'Andika itariki uzishyuriraho.' });
    const pb = {
      id: db.genId('pay'), businessId: req.user.id, source: 'manual', nature: 'expense', expenseCategory: b.category,
      creditorName, creditorPhone: String(b.creditorPhone || '').trim(), creditorEmail: '',
      description: String(b.description || '').trim().slice(0, 300), total: amount, incurredAt: stamp(b.date),
      dueDate: b.dueDate, payments: [], createdAt: new Date().toISOString(), createdBy: req.user.id
    };
    data.payables = data.payables || [];
    data.payables.push(pb);
    await db.write(data);
    await logAudit({ actorId: req.user.id, action: 'create', entity: 'payable', entityId: pb.id, details: { creditorName, total: amount, nature: 'expense' } });
    return res.status(201).json(pb);
  }
  const method = ['phone', 'bank'].includes(b.method) ? b.method : 'cash';
  const e = {
    id: db.genId('exp'), businessId: req.user.id, category: b.category, amount, method,
    bankName: method === 'bank' ? String(b.bankName || '').trim() : '',
    description: String(b.description || '').trim().slice(0, 200),
    date: stamp(b.date), createdAt: new Date().toISOString(), createdBy: req.user.id
  };
  data.expenses = data.expenses || [];
  data.expenses.push(e);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'expense', entityId: e.id, details: { category: e.category, amount } });
  res.status(201).json(e);
});

router.delete('/expenses/:id', async (req, res) => {
  const data = db.read();
  const e = (data.expenses || []).find(x => x.id === req.params.id && x.businessId === req.user.id && !x.voidedAt);
  if (!e) return res.status(404).json({ error: 'Ntibonetse.' });
  e.voidedAt = new Date().toISOString();
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'delete', entity: 'expense', entityId: e.id, details: { amount: e.amount, category: e.category } });
  res.json({ ok: true });
});

// ---- Manual journal entries (balanced; reverse rather than delete) ----
router.get('/journal-entries', (req, res) => {
  res.json((db.read().journalEntries || []).filter(j => j.businessId === req.user.id).sort((a, b) => new Date(b.date) - new Date(a.date)));
});

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return 'Nibura hagomba kuba imirongo ibiri.';
  let dr = 0, cr = 0;
  const out = [];
  for (const l of lines) {
    const a = acc.ACCOUNT_MAP[l.account];
    if (!a) return 'Konti ntiyemewe.';
    if (a.control) return `Konti ${l.account} ikorwa na system (ntishobora kwandikwamo n'intoki).`;
    const debit = Math.round(Number(l.debit) || 0), credit = Math.round(Number(l.credit) || 0);
    if (debit < 0 || credit < 0) return 'Imibare igomba kuba myiza.';
    if (debit > 0 && credit > 0) return 'Umurongo umwe ntushobora kugira Debit na Credit.';
    if (debit === 0 && credit === 0) continue;
    dr += debit; cr += credit;
    out.push({ account: l.account, debit, credit });
  }
  if (out.length < 2) return 'Nibura hagomba kuba imirongo ibiri ifite amafaranga.';
  if (dr !== cr) return `Debit (${dr}) na Credit (${cr}) ntibingana.`;
  return { lines: out };
}

router.post('/journal-entries', async (req, res) => {
  const v = validateLines(req.body.lines);
  if (typeof v === 'string') return res.status(400).json({ error: v });
  const description = String(req.body.description || '').trim();
  if (!description) return res.status(400).json({ error: 'Andika ibisobanuro.' });
  const data = db.read();
  const j = {
    id: db.genId('jrn'), businessId: req.user.id, date: stamp(req.body.date), description: description.slice(0, 200),
    lines: v.lines, createdAt: new Date().toISOString(), createdBy: req.user.id, reversalOf: null, reversedBy: null
  };
  data.journalEntries = data.journalEntries || [];
  data.journalEntries.push(j);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'journal', entityId: j.id, details: { description: j.description } });
  res.status(201).json(j);
});

router.post('/journal-entries/:id/reverse', async (req, res) => {
  const data = db.read();
  const j = (data.journalEntries || []).find(x => x.id === req.params.id && x.businessId === req.user.id);
  if (!j) return res.status(404).json({ error: 'Ntibonetse.' });
  if (j.reversedBy || j.reversalOf) return res.status(400).json({ error: 'Iyi nyandiko yamaze guhindurwa cyangwa ni igihindura.' });
  const rev = {
    id: db.genId('jrn'), businessId: req.user.id, date: new Date().toISOString(), description: j.description,
    lines: j.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit })),
    createdAt: new Date().toISOString(), createdBy: req.user.id, reversalOf: j.id, reversedBy: null
  };
  j.reversedBy = rev.id;
  data.journalEntries.push(rev);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'journal', entityId: j.id, details: { reversedBy: rev.id } });
  res.status(201).json(rev);
});

module.exports = router;
