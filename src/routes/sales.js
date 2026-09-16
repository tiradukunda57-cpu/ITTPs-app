const express = require('express');
const db = require('../db');
const { requireAuth, businessIdOf } = require('../auth/middleware');
const { logAudit } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

// Admin na Guest bombi bemerewe kugurisha (kwandika igurisha).
router.post('/', async (req, res) => {
  const { productId, qty, customerName, customerPhone, customerEmail, paymentMethod, bankName, amountPaid } = req.body;
  const quantity = Number(qty);
  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({ error: 'Hitamo igicuruzwa n\'umubare wemewe.' });
  }
  const custName = (customerName || '').trim();
  if (!custName) {
    return res.status(400).json({ error: 'Andika izina ry\'umukiriya.' });
  }
  const custPhone = (customerPhone || '').trim();
  const custEmail = (customerEmail || '').trim();
  const method = ['phone', 'bank'].includes(paymentMethod) ? paymentMethod : 'cash';
  const bank = method === 'bank' ? (bankName || '').trim() : '';

  const businessId = businessIdOf(req.user);
  const data = db.read();
  const product = data.products.find(p => p.id === productId && p.businessId === businessId && !p.deletedAt);
  if (!product) return res.status(404).json({ error: 'Igicuruzwa ntikibonetse.' });
  if (quantity > product.stock) {
    return res.status(400).json({ error: `Ibisigaye ni ${product.stock} gusa.` });
  }

  product.stock -= quantity;
  const total = product.price * quantity;
  let paid = amountPaid !== undefined && amountPaid !== null && amountPaid !== '' ? Number(amountPaid) : total;
  if (isNaN(paid) || paid < 0) paid = total;
  const now = new Date().toISOString();
  const isFullyPaid = paid >= total;

  const sale = {
    id: db.genId('sale'),
    businessId,
    productId: product.id,
    productName: product.name,
    qty: quantity,
    unitPrice: product.price,
    total,
    customerName: custName,
    customerPhone: custPhone,
    customerEmail: custEmail,
    paymentMethod: method,
    bankName: bank,
    amountPaid: paid,
    balance: paid - total,
    paymentStatus: isFullyPaid ? 'paid' : 'debt', // 'paid' = yarishyuye byose, 'debt' = afite ideni
    givenAt: now,          // igihe ibicuruzwa byatanzwe
    paidAt: isFullyPaid ? now : null, // igihe cyishyuriweho byose (null niba ari ideni rikiri gutegurwa)
    soldBy: req.user.id,
    soldByName: req.user.name,
    timestamp: now
  };
  data.sales.push(sale);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'sale', entityId: sale.id, details: { productName: product.name, qty: quantity, total, customerName: custName, paymentMethod: method, paymentStatus: sale.paymentStatus } });

  res.status(201).json(sale);
});

// Kwishyura ideni ryari risigaye (settle a debt / add a later payment)
router.patch('/:id/settle', async (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const sale = data.sales.find(s => s.id === req.params.id && s.businessId === businessId);
  if (!sale) return res.status(404).json({ error: 'Igurisha ntiribonetse.' });
  if (sale.paymentStatus === 'paid') return res.status(400).json({ error: 'Iri gurisha ryari rimaze kwishyurwa byose.' });

  const extra = Number(req.body.amount);
  if (!extra || extra <= 0) return res.status(400).json({ error: 'Andika amafaranga yishyuwe (agomba kuba arenze 0).' });

  sale.amountPaid += extra;
  sale.balance = sale.amountPaid - sale.total;
  if (sale.amountPaid >= sale.total) {
    sale.paymentStatus = 'paid';
    sale.paidAt = new Date().toISOString();
  }
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'sale', entityId: sale.id, details: { settlePayment: extra, newStatus: sale.paymentStatus } });

  res.json(sale);
});

router.get('/', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const sales = data.sales
    .filter(s => s.businessId === businessId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sales);
});

router.get('/summary', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const products = data.products.filter(p => p.businessId === businessId && !p.deletedAt);
  const sales = data.sales.filter(s => s.businessId === businessId);

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalItemsSold = sales.reduce((s, x) => s + x.qty, 0);
  const totalStock = products.reduce((s, p) => s + p.stock, 0);
  const lowStock = products.filter(p => p.stock <= 5);

  const now = Date.now();
  const DAY = 24 * 3600 * 1000;

  const revenueInWindow = (ms) => sales
    .filter(s => now - new Date(s.timestamp).getTime() <= ms)
    .reduce((sum, s) => sum + s.total, 0);

  const revenueToday = revenueInWindow(DAY);
  const revenueThisWeek = revenueInWindow(7 * DAY);
  const revenueThisMonth = revenueInWindow(30 * DAY);
  const averageSaleValue = sales.length ? totalRevenue / sales.length : 0;

  // Ibicuruzwa 5 byagurishijwe cyane (ku mafaranga yinjiye)
  const byProduct = {};
  sales.forEach(s => {
    if (!byProduct[s.productName]) byProduct[s.productName] = { name: s.productName, qty: 0, revenue: 0 };
    byProduct[s.productName].qty += s.qty;
    byProduct[s.productName].revenue += s.total;
  });
  const topProducts = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Amafaranga yinjiye ku munsi, iminsi 7 ishize (kugira ngo tuyerekane ku ishusho)
  const dailyRevenue = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - i * DAY;
    const dayEnd = dayStart - DAY;
    const label = new Date(dayStart).toLocaleDateString('en-GB', { weekday: 'short' });
    const amount = sales
      .filter(s => {
        const t = new Date(s.timestamp).getTime();
        return t <= dayStart && t > dayEnd;
      })
      .reduce((sum, s) => sum + s.total, 0);
    dailyRevenue.push({ label, amount });
  }

  // Uwagurishije (admin cyangwa guest bahari muri iki kigo) - amafaranga na sales count
  const bySeller = {};
  sales.forEach(s => {
    const key = s.soldByName || '—';
    if (!bySeller[key]) bySeller[key] = { name: key, salesCount: 0, revenue: 0 };
    bySeller[key].salesCount += 1;
    bySeller[key].revenue += s.total;
  });
  const salesBySeller = Object.values(bySeller).sort((a, b) => b.revenue - a.revenue);

  res.json({
    totalRevenue, totalItemsSold, totalStock, lowStock,
    revenueToday, revenueThisWeek, revenueThisMonth, averageSaleValue,
    topProducts, dailyRevenue, salesBySeller,
    totalSalesCount: sales.length,
    totalProductsCount: products.length
  });
});

module.exports = router;
