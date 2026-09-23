const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, businessIdOf } = require('../auth/middleware');
const { logAudit } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

// ============================================================================
// "Kurangura" (Procurement / Restocking) - gukurikirana urugendo ibicuruzwa
// birangurwa (bigurwa) rugenda kuva ku wabiranguye (supplier) kugeza aho
// bigeze kuri business. Nyiri business (Admin) gusa ni we ubasha gutangira
// no kwemeza urwo rugendo.
//
// Uko bikorwa:
//  1) POST /  - Admin atangira urugendo: ibicuruzwa (bishya cyangwa bisanzwe
//     muri stock), aho bigiye (akarere/umujyi + umuhanda), intera (km),
//     amakuru y'umushoferi, amakuru y'uwabiranguye (supplier), n'uburyo bwo
//     kwishyura. Status itangira kuri 'pending' (biracyari mu nzira).
//  2) PATCH /:id/confirm - Igihe ibicuruzwa bigeze kuri business, Admin
//     yemeza - stock y'ibyo bicuruzwa (bisanzwe cyangwa bishya) yiyongeraho
//     ubwo bwinshi bwaranguwe mu buryo automatique, status igahita ihinduka
//     'confirmed', kandi igihe cyo kwemeza kigasozwa.
// ============================================================================

router.get('/', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const list = data.procurements
    .filter(p => p.businessId === businessId)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  res.json(list);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const {
    items, district, town, route, distanceKm,
    driverName, driverPhone, driverEmail, plateNumber,
    supplierName, supplierPhone, supplierEmail, supplierBusinessName, supplierLocation,
    paymentMethod, bankName
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Hitamo nibura igicuruzwa kimwe n'ubwinshi bwacyo." });
  }
  if (!driverName || !driverName.trim()) return res.status(400).json({ error: "Andika izina ry'umushoferi." });
  if (!supplierName || !supplierName.trim()) return res.status(400).json({ error: "Andika izina ry'uwaranguwe (supplier)." });

  const method = ['phone', 'bank', 'debt'].includes(paymentMethod) ? paymentMethod : 'cash';
  const bank = method === 'bank' ? (bankName || '').trim() : '';

  const lines = [];
  for (const it of items) {
    const qty = Number(it.qty);
    if (!qty || qty < 1) return res.status(400).json({ error: 'Buri gicuruzwa kigomba kugira ubwinshi bwemewe (burenze 0).' });
    lines.push({
      productId: it.productId || null,
      productName: (it.productName || '').trim(),
      unit: ['unit', 'kg', 'litre', 'metre'].includes(it.unit) ? it.unit : 'unit',
      qty,
      unitCost: it.unitCost != null && it.unitCost !== '' ? Number(it.unitCost) : null
    });
  }
  if (lines.some(l => !l.productId && !l.productName)) {
    return res.status(400).json({ error: 'Buri gicuruzwa kigomba kugira izina cyangwa guhitamo ikiri muri stock.' });
  }

  const businessId = businessIdOf(req.user);
  const now = new Date().toISOString();

  const procurement = {
    id: db.genId('prc'),
    businessId,
    items: lines,
    destination: { district: (district || '').trim(), town: (town || '').trim(), route: (route || '').trim() },
    distanceKm: distanceKm != null && distanceKm !== '' ? Number(distanceKm) : null,
    driver: { name: driverName.trim(), phone: (driverPhone || '').trim(), email: (driverEmail || '').trim(), plateNumber: (plateNumber || '').trim() },
    supplier: {
      name: supplierName.trim(),
      phone: (supplierPhone || '').trim(),
      email: (supplierEmail || '').trim(),
      businessName: (supplierBusinessName || '').trim(),
      location: (supplierLocation || '').trim()
    },
    paymentMethod: method,
    bankName: bank,
    status: 'pending',
    startedAt: now,
    confirmedAt: null,
    startedBy: req.user.id,
    startedByName: req.user.name
  };

  const data = db.read();
  data.procurements.push(procurement);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'procurement', entityId: procurement.id, details: { itemCount: lines.length, supplier: procurement.supplier.name } });

  res.status(201).json(procurement);
});

router.patch('/:id/confirm', requireRole('admin'), async (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const procurement = data.procurements.find(p => p.id === req.params.id && p.businessId === businessId);
  if (!procurement) return res.status(404).json({ error: 'Urwo rugendo ntirubonetse.' });
  if (procurement.status === 'confirmed') return res.status(400).json({ error: 'Ibi byari byaramaze kwemezwa.' });

  for (const line of procurement.items) {
    let product = line.productId ? data.products.find(p => p.id === line.productId && p.businessId === businessId) : null;
    if (!product && line.productName) {
      // Igicuruzwa gishya - reba niba hari kimwe gifite iryo zina, niba kidahari tukirema
      product = data.products.find(p => p.businessId === businessId && !p.deletedAt && p.name.toLowerCase() === line.productName.toLowerCase());
    }
    if (product) {
      product.stock += line.qty;
      line.productId = product.id;
      line.productName = product.name;
    } else {
      const newProduct = {
        id: db.genId('prd'),
        businessId,
        name: line.productName,
        price: line.unitCost || 0,
        stock: line.qty,
        unit: line.unit,
        deletedAt: null,
        createdAt: new Date().toISOString()
      };
      data.products.push(newProduct);
      line.productId = newProduct.id;
    }
  }

  procurement.status = 'confirmed';
  procurement.confirmedAt = new Date().toISOString();
  procurement.confirmedBy = req.user.id;
  procurement.confirmedByName = req.user.name;

  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'procurement', entityId: procurement.id, details: { confirmed: true } });

  res.json(procurement);
});

module.exports = router;
