const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit, notify } = require('../services/notify');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const data = db.read();
  const payments = data.payments
    .filter(p => p.businessId === req.user.id)
    .sort((a, b) => new Date(b.periodStart) - new Date(a.periodStart));
  res.json(payments);
});

// Admin yemeza ko yishyuye commission - agomba gukoresha numero ye yiyandikishije
// (security: kubuza undi muntu wese kwemeza ubwishyu bw'ubucuruzi atari ubwe).
router.post('/:id/confirm', async (req, res) => {
  const { phone, amountSent, reference } = req.body;
  if (!phone || amountSent == null || !reference) {
    return res.status(400).json({ error: 'Uzuza numero, amafaranga wohereje, na reference.' });
  }
  if (phone.replace(/\s/g, '') !== req.user.phone.replace(/\s/g, '')) {
    return res.status(403).json({ error: 'Numero utanze ntabwo ihuye n\'iyo wiyandikishije. Koresha numero yawe yiyandikishije.' });
  }

  const data = db.read();
  const payment = data.payments.find(p => p.id === req.params.id && p.businessId === req.user.id);
  if (!payment) return res.status(404).json({ error: 'Ubu bwishyu ntibubonetse.' });
  if (payment.status === 'confirmed') return res.status(400).json({ error: 'Ubu bwishyu bwaremejwe mbere.' });

  payment.confirmedAmount = Number(amountSent);
  payment.reference = reference;
  payment.confirmedAt = new Date().toISOString();

  if (payment.confirmedAmount >= payment.expectedAmount) {
    payment.status = 'confirmed';
  } else {
    payment.status = 'shortfall';
    payment.shortfall = payment.expectedAmount - payment.confirmedAmount;
  }

  await db.write(data);
  await logAudit({ actorId: req.user.id, action: 'confirm_payment', entity: 'payment', entityId: payment.id, details: payment });

  if (payment.status === 'confirmed') {
    await notify({
      toRole: 'superadmin',
      type: 'payment',
      message: `${req.user.name} yemeje ko yishyuye commission ${payment.confirmedAmount} RWF (byari bisabwa: ${payment.expectedAmount} RWF). Byahuye neza.`
    });
  } else {
    await notify({
      toRole: 'superadmin',
      type: 'payment',
      message: `${req.user.name} yemeje ubwishyu bwa ${payment.confirmedAmount} RWF ariko byari bisabwa ${payment.expectedAmount} RWF. Asigaje kwishyura ${payment.shortfall} RWF.`
    });
    await notify({
      toRole: 'admin',
      toUserId: req.user.id,
      type: 'payment',
      message: `Wemeje ubwishyu bwa ${payment.confirmedAmount} RWF, ariko commission yari ${payment.expectedAmount} RWF. Usigaje kwishyura ${payment.shortfall} RWF.`
    });
  }

  res.json(payment);
});

module.exports = router;
