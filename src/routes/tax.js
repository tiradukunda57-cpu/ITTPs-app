const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, businessIdOf } = require('../auth/middleware');
const { logAudit } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

// ============================================================================
// "Imisoro (RRA)" - gukurikirana umusoro w'ubucuruzwa, TIN, igihe cyo kwishyura,
// n'amande (fines).
//
// ICYITONDERWA (IMPORTANT): iyi dashboard NI IGIKORESHO CYO KWIBUTSA NO KUBARA
// BY'AGATEGANYO (estimate/reminder tool) gusa - ntabwo ihuza mu buryo bwa
// automatique na sisitemu ya RRA cyangwa EBM by'ukuri, kandi ntabwo isimbura
// gutumiza umujyanama mu by'imisoro (accountant) cyangwa gusuzuma kuri RRA
// ubwabo (rra.gov.rw). Imibare n'amatariki bigaragara hano ni ay'agateganyo
// (based on RRA's published turnover-based tax regime as of 2026) - nyiri
// business agomba kubyemeza ku giti cye cyangwa akabaza RRA/umujyanama.
// ============================================================================

// Amafaranga y'umusoro ku bucuruzwa buto (micro-enterprise flat tax), nk'uko
// RRA ibiteganya (turnover y'umwaka).
function computeEstimatedTax(regime, annualTurnover) {
  const t = Number(annualTurnover) || 0;
  if (regime === 'exempt') return 0;
  if (regime === 'micro') {
    if (t <= 2000000) return 0;
    if (t <= 4000000) return 60000;
    if (t <= 7000000) return 120000;
    if (t <= 10000000) return 210000;
    return 300000; // kugeza 12,000,000
  }
  if (regime === 'lumpsum') return Math.round(t * 0.03); // 3% ya turnover
  if (regime === 'real') return Math.round(t * 0.18); // agateganyo ka VAT 18% (ntibisobanura input VAT)
  return 0;
}

function defaultProfile() {
  const now = new Date();
  const nextMarch31 = new Date(now.getFullYear() + (now.getMonth() > 2 ? 1 : 0), 2, 31).toISOString();
  return {
    tinNumber: '',
    businessType: '',
    startDate: '',
    regime: 'micro', // exempt | micro | lumpsum | real
    filingFrequency: 'annual', // annual | quarterly | monthly
    periodStartDate: now.toISOString(),
    nextDueDate: nextMarch31
  };
}

function getBusinessOwner(data, businessId) {
  return data.users.find(u => u.id === businessId);
}

function advanceDueDate(dueDateIso, frequency) {
  const d = new Date(dueDateIso);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function turnoverSince(data, businessId, sinceIso) {
  const since = new Date(sinceIso).getTime();
  const salesTotal = data.sales
    .filter(s => s.businessId === businessId && new Date(s.timestamp).getTime() >= since)
    .reduce((sum, s) => sum + (s.amountPaid != null ? s.amountPaid : s.total), 0);
  const dispatchTotal = (data.dispatches || [])
    .filter(d => d.businessId === businessId && d.status === 'returned' && new Date(d.returnedAt).getTime() >= since)
    .reduce((sum, d) => sum + (d.amountCollected || 0), 0);
  return salesTotal + dispatchTotal;
}

router.get('/profile', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const owner = getBusinessOwner(data, businessId);
  const profile = (owner && owner.taxProfile) || defaultProfile();

  const turnover = turnoverSince(data, businessId, profile.periodStartDate);
  const estimatedTax = computeEstimatedTax(profile.regime, turnover);
  const now = Date.now();
  const due = new Date(profile.nextDueDate).getTime();
  const daysRemaining = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  let status = 'ok';
  if (daysRemaining < 0) status = 'overdue';
  else if (daysRemaining <= 7) status = 'due_soon';

  res.json({ profile, turnover, estimatedTax, daysRemaining, status });
});

router.patch('/profile', requireRole('admin'), async (req, res) => {
  const { tinNumber, businessType, startDate, regime, filingFrequency, nextDueDate } = req.body;
  const data = db.read();
  const owner = getBusinessOwner(data, req.user.id);
  if (!owner) return res.status(404).json({ error: 'Business ntibonetse.' });

  const current = owner.taxProfile || defaultProfile();
  owner.taxProfile = {
    ...current,
    tinNumber: tinNumber != null ? tinNumber.trim() : current.tinNumber,
    businessType: businessType != null ? businessType.trim() : current.businessType,
    startDate: startDate || current.startDate,
    regime: ['exempt', 'micro', 'lumpsum', 'real'].includes(regime) ? regime : current.regime,
    filingFrequency: ['annual', 'quarterly', 'monthly'].includes(filingFrequency) ? filingFrequency : current.filingFrequency,
    nextDueDate: nextDueDate ? new Date(nextDueDate).toISOString() : current.nextDueDate
  };

  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'taxProfile', entityId: owner.id, details: owner.taxProfile });
  res.json(owner.taxProfile);
});

router.get('/payments', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const list = (data.taxPayments || [])
    .filter(p => p.businessId === businessId)
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  res.json(list);
});

router.post('/payments', requireRole('admin'), async (req, res) => {
  const { amountPaid, note } = req.body;
  const amt = Number(amountPaid);
  if (!amt || amt < 0) return res.status(400).json({ error: 'Andika amafaranga yishyuwe.' });

  const data = db.read();
  const owner = getBusinessOwner(data, req.user.id);
  if (!owner) return res.status(404).json({ error: 'Business ntibonetse.' });
  const profile = owner.taxProfile || defaultProfile();

  const record = {
    id: db.genId('tax'),
    businessId: req.user.id,
    regime: profile.regime,
    period: profile.periodStartDate,
    dueDate: profile.nextDueDate,
    amountPaid: amt,
    note: (note || '').trim(),
    paidAt: new Date().toISOString(),
    paidBy: req.user.id,
    paidByName: req.user.name
  };
  data.taxPayments = data.taxPayments || [];
  data.taxPayments.push(record);

  // Vugurura profile: tangira igihe gishya cyo kubarwaho, ugendekeza itariki y'ubukurikira
  owner.taxProfile = {
    ...profile,
    periodStartDate: new Date().toISOString(),
    nextDueDate: advanceDueDate(profile.nextDueDate, profile.filingFrequency)
  };

  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'taxPayment', entityId: record.id, details: { amountPaid: amt } });
  res.status(201).json({ payment: record, profile: owner.taxProfile });
});

// ---------------- Amande (Fines) ----------------

router.get('/fines', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const list = (data.fines || [])
    .filter(f => f.businessId === businessId)
    .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  res.json(list);
});

router.post('/fines', requireRole('admin'), async (req, res) => {
  const { reason, amount, issuedAt, reference } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: "Andika impamvu y'amande." });
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Andika amafaranga y\'amande.' });

  const data = db.read();
  const fine = {
    id: db.genId('fine'),
    businessId: req.user.id,
    reason: reason.trim(),
    reference: (reference || '').trim(),
    amount: amt,
    issuedAt: issuedAt ? new Date(issuedAt).toISOString() : new Date().toISOString(),
    status: 'unpaid',
    paidAt: null
  };
  data.fines = data.fines || [];
  data.fines.push(fine);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'fine', entityId: fine.id, details: { reason: fine.reason, amount: amt } });
  res.status(201).json(fine);
});

router.patch('/fines/:id/pay', requireRole('admin'), async (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const fine = (data.fines || []).find(f => f.id === req.params.id && f.businessId === businessId);
  if (!fine) return res.status(404).json({ error: "Iryo hande ntiribonetse." });
  fine.status = 'paid';
  fine.paidAt = new Date().toISOString();
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'fine', entityId: fine.id, details: { paid: true } });
  res.json(fine);
});

module.exports = router;
