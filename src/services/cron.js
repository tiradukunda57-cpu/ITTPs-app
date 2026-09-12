const cron = require('node-cron');
const db = require('../db');
const { notify, logAudit } = require('./notify');
const { requestMomoCollection } = require('./momo');

const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.05);
const COMMISSION_PHONE = process.env.COMMISSION_PHONE || '0794619289';

// --- Umurimo wa 1: buri munsi, bara 5% by'ibyagurishijwe kuri buri bucuruzi ---
async function generateDailyCommissions() {
  const data = db.read();
  const admins = data.users.filter(u => u.role === 'admin' && u.status === 'approved');
  const now = Date.now();

  for (const admin of admins) {
    const daySales = data.sales.filter(s =>
      s.businessId === admin.id &&
      now - new Date(s.timestamp).getTime() <= 24 * 3600 * 1000
    );
    const totalSales = daySales.reduce((s, x) => s + x.total, 0);
    if (totalSales <= 0) continue; // nta cyagurishijwe, nta commission

    const expectedAmount = Math.round(totalSales * COMMISSION_RATE);
    const payment = {
      id: db.genId('pay'),
      businessId: admin.id,
      periodStart: new Date(now - 24 * 3600 * 1000).toISOString(),
      periodEnd: new Date(now).toISOString(),
      totalSales,
      expectedAmount,
      confirmedAmount: null,
      status: 'pending',
      reference: null,
      createdAt: new Date().toISOString(),
      confirmedAt: null
    };
    const freshData = db.read();
    freshData.payments.push(payment);
    await db.write(freshData);

    await requestMomoCollection({ phone: admin.phone, amount: expectedAmount, reference: payment.id });

    await notify({
      toRole: 'admin',
      toUserId: admin.id,
      type: 'payment',
      phone: admin.phone,
      message: `Wagurishije ibicuruzwa bingana na ${totalSales} RWF mu masaha 24 ashize. Ugomba kwishyura commission ya ${(COMMISSION_RATE * 100)}% (${expectedAmount} RWF) ku numero ${COMMISSION_PHONE} mu masaha 24, hanyuma ukemeze hano muri application.`
    });
    await notify({
      toRole: 'superadmin',
      type: 'payment',
      message: `${admin.name} agomba kwishyura commission ya ${expectedAmount} RWF (5% bya ${totalSales} RWF yagurishije). Ategerejwe kwemeza mu masaha 24.`
    });
  }
}

// --- Umurimo wa 2: reba ubwishyu budaremejwe mu masaha 24, ufunge konti ---
async function checkOverduePayments() {
  const data = db.read();
  const now = Date.now();
  let changed = false;

  for (const payment of data.payments) {
    if (payment.status !== 'pending') continue;
    const ageMs = now - new Date(payment.createdAt).getTime();
    if (ageMs > 24 * 3600 * 1000) {
      payment.status = 'missed';
      changed = true;

      const admin = data.users.find(u => u.id === payment.businessId);
      if (admin && admin.status !== 'blocked') {
        admin.status = 'locked';
      }

      await logAudit({ actorId: 'system', action: 'payment_missed', entity: 'payment', entityId: payment.id });
      await notify({
        toRole: 'superadmin',
        type: 'payment',
        message: `${admin ? admin.name : payment.businessId} ntiyemeje ubwishyu bwa commission (${payment.expectedAmount} RWF) mu masaha 24. Konti ye yahagaritswe by'agateganyo.`
      });
    }
  }

  if (changed) await db.write(data);
}

function startCronJobs() {
  // Buri munsi saa sita z'ijoro (00:00) - bara commission z'umunsi ushize
  cron.schedule('0 0 * * *', () => {
    generateDailyCommissions().catch(e => console.error('generateDailyCommissions error:', e));
  });

  // Buri saha - reba niba hari ubwishyu bwarengeje amasaha 24 budaremejwe
  cron.schedule('0 * * * *', () => {
    checkOverduePayments().catch(e => console.error('checkOverduePayments error:', e));
  });

  console.log('Cron jobs zatangiye: commission (buri munsi 00:00), reconciliation (buri saha).');
}

module.exports = { startCronJobs, generateDailyCommissions, checkOverduePayments };
