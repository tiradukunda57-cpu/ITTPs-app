const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, requireRole, JWT_SECRET } = require('../auth/middleware');
const { logAudit, notify } = require('../services/notify');

const router = express.Router();
router.use(requireAuth, requireRole('superadmin'));

function safeUser(u) {
  const { passwordHash, ...safe } = u;
  return safe;
}

// --- Kwemeza abacuruzi (Admin) bashya ---
router.get('/pending-admins', (req, res) => {
  const data = db.read();
  res.json(data.users.filter(u => u.role === 'admin' && u.status === 'pending').map(safeUser));
});

router.get('/businesses', (req, res) => {
  const data = db.read();
  const businesses = data.users
    .filter(u => u.role === 'admin')
    .map(admin => {
      const products = data.products.filter(p => p.businessId === admin.id);
      const sales = data.sales.filter(s => s.businessId === admin.id);
      const guests = data.users.filter(u => u.parentAdminId === admin.id);
      return {
        ...safeUser(admin),
        productCount: products.filter(p => !p.deletedAt).length,
        deletedProductCount: products.filter(p => p.deletedAt).length,
        salesCount: sales.length,
        totalRevenue: sales.reduce((s, x) => s + x.total, 0),
        guestCount: guests.length
      };
    });
  res.json(businesses);
});

// Superadmin arebera ubucuruzi bumwe byuzuye - harimo n'ibyasibwe (audit/support view)
router.get('/businesses/:id', (req, res) => {
  const data = db.read();
  const admin = data.users.find(u => u.id === req.params.id && u.role === 'admin');
  if (!admin) return res.status(404).json({ error: 'Ubucuruzi ntibubonetse.' });

  const products = data.products.filter(p => p.businessId === admin.id); // harimo n'ibyasibwe
  const sales = data.sales.filter(s => s.businessId === admin.id);
  const guests = data.users.filter(u => u.parentAdminId === admin.id).map(safeUser);
  const auditLog = data.auditLog.filter(a => [admin.id, ...guests.map(g => g.id)].includes(a.actorId));
  const payments = data.payments.filter(p => p.businessId === admin.id);

  res.json({ admin: safeUser(admin), products, sales, guests, auditLog, payments });
});

router.patch('/users/:id/approve', async (req, res) => {
  const data = db.read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Ntabonetse.' });
  user.status = 'approved';
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'approve', entity: 'user', entityId: user.id });
  await notify({ toRole: 'admin', toUserId: user.id, type: 'system', message: 'Konti yawe yemejwe! Ubu ushobora kwinjira.' });
  res.json(safeUser(user));
});

router.patch('/users/:id/block', async (req, res) => {
  const data = db.read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Ntabonetse.' });
  user.status = user.status === 'blocked' ? 'approved' : 'blocked';
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: user.status === 'blocked' ? 'block' : 'unblock', entity: 'user', entityId: user.id });
  res.json(safeUser(user));
});

router.patch('/users/:id/unlock', async (req, res) => {
  const data = db.read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Ntabonetse.' });
  user.status = 'approved';
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'unlock', entity: 'user', entityId: user.id });
  res.json(safeUser(user));
});

// Guhindura/gusiba ikintu icyo aricyo cyose (superadmin afite full access, nk'uko byasabwe)
router.patch('/products/:id', async (req, res) => {
  const data = db.read();
  const product = data.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Ntabonetse.' });
  Object.assign(product, req.body);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'product', entityId: product.id, details: { by: 'superadmin' } });
  res.json(product);
});

router.delete('/products/:id', async (req, res) => {
  const data = db.read();
  const product = data.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Ntabonetse.' });
  data.products = data.products.filter(p => p.id !== req.params.id);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'hard_delete', entity: 'product', entityId: req.params.id, details: { by: 'superadmin' } });
  res.json({ message: 'Byasibwe burundu.' });
});

// "Kwinjira nk'uwo" (support/impersonation) - kugira ngo superadmin abashe kubarebera
// niba bagize ikibazo, nk'uko byasabwe. Ibi bikorwa byose byanditswe muri audit log.
router.post('/impersonate/:id', async (req, res) => {
  const data = db.read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Ntabonetse.' });

  await logAudit({ actorId: req.user.id, action: 'impersonate', entity: 'user', entityId: user.id });
  const token = jwt.sign({ id: user.id, role: user.role, impersonatedBy: req.user.id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: safeUser(user) });
});

// Notifications zose (harimo alerts z'umutekano)
router.get('/notifications', (req, res) => {
  const data = db.read();
  const notes = data.notifications
    .filter(n => n.toRole === 'superadmin')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 200);
  res.json(notes);
});

router.get('/audit-log', (req, res) => {
  const data = db.read();
  res.json(data.auditLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500));
});

module.exports = router;
