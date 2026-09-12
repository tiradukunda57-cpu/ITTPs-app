const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit, notify } = require('../services/notify');
const { computeInsights, generateNarrative } = require('../services/analytics');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// --- Kuyobora Guest (abakoresha bongewemo n'Admin) ---

router.get('/guests', (req, res) => {
  const data = db.read();
  const guests = data.users
    .filter(u => u.role === 'guest' && u.parentAdminId === req.user.id)
    .map(({ passwordHash, ...safe }) => safe);
  res.json(guests);
});

router.post('/guests', async (req, res) => {
  const { name, email, phone, password, language } = req.body;
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'Uzuza amakuru yose asabwa.' });
  }
  const data = db.read();
  const exists = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Iyi email isanzwe ikoreshwa.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const guest = {
    id: db.genId('usr'),
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role: 'guest',
    parentAdminId: req.user.id,
    status: 'approved', // guest yongewemo n'admin, ntagomba gutegereza superadmin
    language: language || req.user.language || 'rw',
    createdAt: new Date().toISOString()
  };
  data.users.push(guest);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'user', entityId: guest.id, details: { role: 'guest' } });

  const { passwordHash: _, ...safe } = guest;
  res.status(201).json(safe);
});

router.patch('/guests/:id/block', async (req, res) => {
  const data = db.read();
  const guest = data.users.find(u => u.id === req.params.id && u.parentAdminId === req.user.id);
  if (!guest) return res.status(404).json({ error: 'Umukoresha ntabonetse.' });
  guest.status = guest.status === 'blocked' ? 'approved' : 'blocked';
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: guest.status === 'blocked' ? 'block' : 'unblock', entity: 'user', entityId: guest.id });
  res.json({ status: guest.status });
});

// --- Ibyasibwe (trash) by'ubu bucuruzi ---
router.get('/trash', (req, res) => {
  const data = db.read();
  const products = data.products.filter(p => p.businessId === req.user.id && p.deletedAt);
  res.json({ products });
});

// --- Amateka y'ibyakozwe (audit log) - kubicuruzwa/amagurisha byabo n'aba guest babo ---
router.get('/audit-log', (req, res) => {
  const data = db.read();
  const teamIds = [req.user.id, ...data.users.filter(u => u.parentAdminId === req.user.id).map(u => u.id)];
  const log = data.auditLog
    .filter(a => teamIds.includes(a.actorId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 200);
  res.json(log);
});

// --- AI Business insights ---
router.get('/insights', async (req, res) => {
  const data = db.read();
  const products = data.products.filter(p => p.businessId === req.user.id);
  const sales = data.sales.filter(s => s.businessId === req.user.id);
  const insights = computeInsights(products, sales);
  const narrative = await generateNarrative(insights, req.user.language);
  res.json({ ...insights, narrative });
});

// --- Notifications ---
router.get('/notifications', (req, res) => {
  const data = db.read();
  const notes = data.notifications
    .filter(n => (n.toRole === 'admin' && n.toUserId === req.user.id))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100);
  res.json(notes);
});

module.exports = router;
