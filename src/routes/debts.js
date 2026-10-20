const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, businessIdOf } = require('../auth/middleware');
const { logAudit } = require('../services/notify');
const acc = require('../services/accounting');
const { generateDebtReminders } = require('../services/debtReminders');

const router = express.Router();
router.use(requireAuth);

function summarize(list) {
  const open = list.filter(x => x.outstanding > 0);
  const sum = (arr) => arr.reduce((a, x) => a + x.outstanding, 0);
  return {
    count: open.length, total: sum(open),
    overdue: { count: open.filter(x => x.status === 'overdue').length, total: sum(open.filter(x => x.status === 'overdue')) },
    dueToday: { count: open.filter(x => x.status === 'due_today').length, total: sum(open.filter(x => x.status === 'due_today')) },
    dueSoon: { count: open.filter(x => x.status === 'due_soon').length, total: sum(open.filter(x => x.status === 'due_soon')) },
    noDate: { count: open.filter(x => x.status === 'no_date').length, total: sum(open.filter(x => x.status === 'no_date')) }
  };
}
const urgency = (a, b) => (a.daysLeft == null ? 9999 : a.daysLeft) - (b.daysLeft == null ? 9999 : b.daysLeft);

// Incamake y'amadeni + ibyibutso (ikorwa igihe dashboard ifunguwe)
router.get('/summary', async (req, res) => {
  const businessId = businessIdOf(req.user);
  if (req.user.role === 'admin') {
    try { await generateDebtReminders(businessId); } catch (e) { console.error('reminders', e.message); }
  }
  const data = db.read();
  const rec = acc.receivableList(data, businessId);
  const out = { receivables: summarize(rec), urgent: [], today: acc.todayKigali() };
  const urgentRec = rec.filter(x => x.outstanding > 0 && ['overdue', 'due_today', 'due_soon'].includes(x.status))
    .sort(urgency).slice(0, 5).map(x => ({ kind: 'rec', id: x.id, name: x.customerName, phone: x.customerPhone, amount: x.outstanding, dueDate: x.dueDate, daysLeft: x.daysLeft, status: x.status }));
  out.urgent = urgentRec;
  if (req.user.role === 'admin') {
    const pay = acc.payableList(data, businessId);
    out.payables = summarize(pay);
    const urgentPay = pay.filter(x => x.outstanding > 0 && ['overdue', 'due_today', 'due_soon'].includes(x.status))
      .sort(urgency).slice(0, 5).map(x => ({ kind: 'pay', id: x.id, name: x.creditorName, phone: x.creditorPhone, amount: x.outstanding, dueDate: x.dueDate, daysLeft: x.daysLeft, status: x.status }));
    out.urgent = [...urgentRec, ...urgentPay].sort(urgency).slice(0, 8);
    out.badge = out.receivables.overdue.count + out.receivables.dueToday.count + out.payables.overdue.count + out.payables.dueToday.count;
  } else {
    out.badge = out.receivables.overdue.count + out.receivables.dueToday.count;
  }
  res.json(out);
});

router.get('/receivables', (req, res) => {
  const businessId = businessIdOf(req.user);
  res.json(acc.receivableList(db.read(), businessId));
});

router.get('/payables', requireRole('admin'), (req, res) => {
  res.json(acc.payableList(db.read(), req.user.id));
});

const NATURES = ['loan', 'expense', 'opening'];

router.post('/payables', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const creditorName = String(b.creditorName || '').trim();
  if (!creditorName) return res.status(400).json({ error: "Andika izina ry'uwo ugomba kwishyura." });
  const total = Math.round(Number(b.total));
  if (!total || total <= 0) return res.status(400).json({ error: 'Andika amafaranga y\'ideni (arenze 0).' });
  const nature = NATURES.includes(b.nature) ? b.nature : 'opening';
  const today = acc.todayKigali();
  const incurred = acc.isDateStr(b.incurredAt) && b.incurredAt <= today ? b.incurredAt : today;
  if (!acc.isDateStr(b.dueDate)) return res.status(400).json({ error: 'Andika itariki uzishyuriraho.' });
  const method = ['phone', 'bank'].includes(b.receiveMethod) ? b.receiveMethod : 'cash';
  const category = Object.keys(acc.EXPENSE_CATEGORIES).includes(b.expenseCategory) ? b.expenseCategory : 'other';

  const data = db.read();
  const pb = {
    id: db.genId('pay'), businessId: req.user.id, source: 'manual', nature,
    creditorName, creditorPhone: String(b.creditorPhone || '').trim(), creditorEmail: String(b.creditorEmail || '').trim(),
    description: String(b.description || '').trim().slice(0, 300),
    total, incurredAt: incurred === today ? new Date().toISOString() : acc.dateToNoonIso(incurred),
    dueDate: b.dueDate, receiveMethod: method,
    bankName: method === 'bank' ? String(b.bankName || '').trim() : '',
    expenseCategory: nature === 'expense' ? category : null,
    payments: [], createdAt: new Date().toISOString(), createdBy: req.user.id
  };
  data.payables = data.payables || [];
  data.payables.push(pb);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'payable', entityId: pb.id, details: { creditorName, total, nature, dueDate: pb.dueDate } });
  res.status(201).json(pb);
});

router.patch('/payables/:id', requireRole('admin'), async (req, res) => {
  const data = db.read();
  const pb = (data.payables || []).find(p => p.id === req.params.id && p.businessId === req.user.id && !p.voidedAt);
  if (!pb) return res.status(404).json({ error: 'Ideni ntiribonetse.' });
  const b = req.body || {};
  const before = { dueDate: pb.dueDate, creditorName: pb.creditorName };
  if (b.dueDate != null) {
    if (!acc.isDateStr(b.dueDate)) return res.status(400).json({ error: 'Itariki ntiyemewe.' });
    pb.dueDate = b.dueDate;
  }
  if (b.creditorName != null && String(b.creditorName).trim()) pb.creditorName = String(b.creditorName).trim();
  if (b.creditorPhone != null) pb.creditorPhone = String(b.creditorPhone).trim();
  if (b.creditorEmail != null) pb.creditorEmail = String(b.creditorEmail).trim();
  if (b.description != null) pb.description = String(b.description).trim().slice(0, 300);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'payable', entityId: pb.id, details: { before, after: { dueDate: pb.dueDate, creditorName: pb.creditorName } } });
  res.json(pb);
});

router.post('/payables/:id/pay', requireRole('admin'), async (req, res) => {
  const data = db.read();
  const pb = (data.payables || []).find(p => p.id === req.params.id && p.businessId === req.user.id && !p.voidedAt);
  if (!pb) return res.status(404).json({ error: 'Ideni ntiribonetse.' });
  const [row] = acc.payableList({ payables: [pb] }, req.user.id);
  const amount = Math.round(Number(req.body.amount));
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Andika amafaranga wishyuye (arenze 0).' });
  if (amount > row.outstanding) return res.status(400).json({ error: `Ideni risigaye ni ${row.outstanding} RWF gusa.` });
  const method = ['phone', 'bank'].includes(req.body.method) ? req.body.method : 'cash';
  let at = new Date().toISOString();
  if (acc.isDateStr(req.body.date) && req.body.date <= acc.todayKigali()) at = acc.dateToNoonIso(req.body.date);
  if (new Date(at) > new Date()) at = new Date().toISOString();
  const incAt = pb.incurredAt || pb.createdAt;
  if (incAt && new Date(at) < new Date(incAt)) at = incAt;
  pb.payments = pb.payments || [];
  pb.payments.push({ id: db.genId('pp'), amount, at, method, bankName: method === 'bank' ? String(req.body.bankName || '').trim() : '', note: String(req.body.note || '').trim().slice(0, 200), by: req.user.id });
  if (amount < row.outstanding && acc.isDateStr(req.body.nextDueDate)) pb.dueDate = req.body.nextDueDate;
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'payable', entityId: pb.id, details: { payment: amount, method } });
  res.json(pb);
});

// Gusiba ideni ryanditswe nabi - bishoboka gusa iyo nta bwishyu burakorwa (amateka asigara muri audit log)
router.delete('/payables/:id', requireRole('admin'), async (req, res) => {
  const data = db.read();
  const pb = (data.payables || []).find(p => p.id === req.params.id && p.businessId === req.user.id && !p.voidedAt);
  if (!pb) return res.status(404).json({ error: 'Ideni ntiribonetse.' });
  if (pb.source === 'procurement') return res.status(400).json({ error: "Iri deni rifitanye isano no kurangura, ntirisibwa hano." });
  if ((pb.payments || []).length) return res.status(400).json({ error: 'Ideni rifite ubwishyu ntirisibwa.' });
  pb.voidedAt = new Date().toISOString();
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'delete', entity: 'payable', entityId: pb.id, details: { creditorName: pb.creditorName, total: pb.total } });
  res.json({ ok: true });
});

module.exports = router;
