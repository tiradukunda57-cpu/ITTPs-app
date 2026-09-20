const express = require('express');
const db = require('../db');
const { requireAuth, businessIdOf } = require('../auth/middleware');
const { logAudit } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

// ============================================================================
// "Kohereza Ibicuruzwa" (Field Dispatch) - gukurikirana ibicuruzwa uhereye igihe
// byavuye muri stock (byatanzwe umukozi ajya kubicuruza hanze), kugeza igihe
// uwo mukozi agarutse akerekana ibyo yagurishije n'ibyo yagaruye.
//
// Uko bikorwa:
//  1) Umukozi/Admin atanga ibicuruzwa (POST /) - stock ihita igabanuka, dispatch
//     igashyirwa kuri status 'pending'.
//  2) Igihe umukozi agarutse (PATCH /:id/return) - andika ibisigaye (returned)
//     kuri buri gicuruzwa n'amafaranga yose yinjiye - stock y'ibisigaye
//     isubizwamo, dispatch igahita ishyirwa kuri status 'returned', kandi
//     amafaranga ategerejwe (expected) agacuzwa n'ayo umukozi avuze yinjiye
//     kugira ngo admin abashe kubona niba hari itandukaniro (variance).
// ============================================================================

router.get('/', (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const list = data.dispatches
    .filter(d => d.businessId === businessId)
    .sort((a, b) => new Date(b.dispatchedAt) - new Date(a.dispatchedAt));
  res.json(list);
});

router.post('/', async (req, res) => {
  const { vendorName, vendorEmail, vendorContact, items } = req.body;
  const name = (vendorName || '').trim();
  if (!name) return res.status(400).json({ error: "Andika izina ry'umukozi ugiye kubicuruza." });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Hitamo nibura igicuruzwa kimwe n\'ubwinshi bwacyo.' });
  }

  const businessId = businessIdOf(req.user);
  const data = db.read();

  // Twizere mbere ko ibicuruzwa byose bihari, hanyuma tugabanye stock hamwe.
  const lines = [];
  for (const it of items) {
    const qty = Number(it.qty);
    if (!it.productId || !qty || qty < 1) {
      return res.status(400).json({ error: 'Buri gicuruzwa kigomba kugira ubwinshi bwemewe (burenze 0).' });
    }
    const product = data.products.find(p => p.id === it.productId && p.businessId === businessId && !p.deletedAt);
    if (!product) return res.status(404).json({ error: 'Hari igicuruzwa kitabonetse.' });
    if (qty > product.stock) {
      return res.status(400).json({ error: `${product.name}: ibisigaye ni ${product.stock} gusa.` });
    }
    lines.push({ product, qty });
  }

  const now = new Date().toISOString();
  const dispatchItems = lines.map(({ product, qty }) => {
    product.stock -= qty;
    return {
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      qtyTaken: qty,
      qtyReturned: null,
      qtySold: null
    };
  });

  const dispatch = {
    id: db.genId('dsp'),
    businessId,
    vendorName: name,
    vendorEmail: (vendorEmail || '').trim(),
    vendorContact: (vendorContact || '').trim(),
    items: dispatchItems,
    status: 'pending',
    dispatchedAt: now,
    returnedAt: null,
    amountCollected: null,
    expectedAmount: null,
    variance: null,
    dispatchedBy: req.user.id,
    dispatchedByName: req.user.name
  };
  data.dispatches.push(dispatch);
  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'create', entity: 'dispatch', entityId: dispatch.id, details: { vendorName: name, itemCount: dispatchItems.length } });

  res.status(201).json(dispatch);
});

router.patch('/:id/return', async (req, res) => {
  const businessId = businessIdOf(req.user);
  const data = db.read();
  const dispatch = data.dispatches.find(d => d.id === req.params.id && d.businessId === businessId);
  if (!dispatch) return res.status(404).json({ error: 'Ibyoherejwe ntibibonetse.' });
  if (dispatch.status === 'returned') return res.status(400).json({ error: 'Ibi byari byaramaze kugarurwa.' });

  const { items, amountCollected } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Andika ibisigaye kuri buri gicuruzwa.' });

  const returnedMap = new Map(items.map(it => [it.productId, Number(it.qtyReturned) || 0]));

  let expectedAmount = 0;
  for (const line of dispatch.items) {
    const qtyReturned = Math.max(0, Math.min(line.qtyTaken, returnedMap.get(line.productId) ?? 0));
    const qtySold = line.qtyTaken - qtyReturned;
    line.qtyReturned = qtyReturned;
    line.qtySold = qtySold;
    expectedAmount += qtySold * line.unitPrice;

    // Ibisigaye bisubizwa muri stock
    const product = data.products.find(p => p.id === line.productId && p.businessId === businessId);
    if (product) product.stock += qtyReturned;
  }

  const collected = Number(amountCollected);
  const finalCollected = isNaN(collected) || collected < 0 ? expectedAmount : collected;

  dispatch.status = 'returned';
  dispatch.returnedAt = new Date().toISOString();
  dispatch.amountCollected = finalCollected;
  dispatch.expectedAmount = expectedAmount;
  dispatch.variance = finalCollected - expectedAmount; // negative = hari amafaranga abuze
  dispatch.returnedBy = req.user.id;
  dispatch.returnedByName = req.user.name;

  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'update', entity: 'dispatch', entityId: dispatch.id, details: { amountCollected: finalCollected, expectedAmount, variance: dispatch.variance } });

  res.json(dispatch);
});

module.exports = router;
