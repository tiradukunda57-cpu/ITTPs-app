const db = require('../db');
const { sendSMS } = require('./sms');

// Kohereza notification: iyandikwa muri database (kugira ngo igaragare kuri dashboard)
// hanyuma, niba hari numero ya telefoni, hakagerageza kohereza SMS (simulated niba
// nta credentials za SMS provider zihari - reba src/services/sms.js).
async function notify({ toRole, toUserId = null, type, message, phone = null }) {
  const data = db.read();
  const notification = {
    id: db.genId('ntf'),
    toRole,      // 'superadmin' | 'admin' | 'guest'
    toUserId,    // niba iri notification igenewe umuntu umwe cyane cyane
    type,        // 'security' | 'payment' | 'system'
    message,
    read: false,
    timestamp: new Date().toISOString()
  };
  data.notifications.push(notification);
  await db.write(data);

  if (phone) {
    await sendSMS(phone, message);
  }
  return notification;
}

async function logAudit({ actorId, action, entity, entityId, details = {} }) {
  const data = db.read();
  data.auditLog.push({
    id: db.genId('aud'),
    actorId,
    action,       // 'create' | 'update' | 'delete' | 'login' | 'login_failed' | 'approve' | 'block' | ...
    entity,       // 'product' | 'sale' | 'user' | 'payment'
    entityId,
    details,
    timestamp: new Date().toISOString()
  });
  await db.write(data);
}

module.exports = { notify, logAudit };
