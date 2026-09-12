const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, businessIdOf } = require('../auth/middleware');
const { logAudit } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

// Guest yemerewe kubona ibicuruzwa (kugira ngo abashe kugurisha), ariko ntabwo
// yemerewe kongeramo/guhindura/gusiba - ibyo ni ibya Admin gusa.

router.get('/', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const products = data.products.filter(p => p.businessId === businessId && !p.deletedAt);
  res.json(products);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { name, price, stock } = req.body;
  if (!name || price == null || stock == null) {
    return res.status(400).json({ error: 'Uzuza izina, igiciro, n\'ubwinshi.' });
  }
  if (price < 0 || stock < 0) return res.status(400).json({ error: 'Igiciro n\'ubwinshi bigomba kuba byiza (birenze 0).' });

  const data = db.read();
  const product = {
    id: db.genId('prd'),
    businessId: req.user.id,
    name,
    price: Number(price),
    stock: Number(stock),
    deletedAt: null,
    createdAt: new Date().toISOString()
  };
  data.products.push(product);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'product', entityId: product.id, details: { name } });
  res.status(201).json(product);
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const data = db.read();
  const product = data.products.find(p => p.id === req.params.id && p.businessId === req.user.id);
  if (!product) return res.status(404).json({ error: 'Igicuruzwa ntikibonetse.' });

  const before = { ...product };
  const { name, price, stock } = req.body;
  if (name != null) product.name = name;
  if (price != null) product.price = Number(price);
  if (stock != null) product.stock = Number(stock);

  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'product', entityId: product.id, details: { before, after: product } });
  res.json(product);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const data = db.read();
  const product = data.products.find(p => p.id === req.params.id && p.businessId === req.user.id);
  if (!product) return res.status(404).json({ error: 'Igicuruzwa ntikibonetse.' });

  product.deletedAt = new Date().toISOString(); // soft delete - superadmin arabibona
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'delete', entity: 'product', entityId: product.id });
  res.json({ message: 'Igicuruzwa cyasibwe.' });
});

module.exports = router;
