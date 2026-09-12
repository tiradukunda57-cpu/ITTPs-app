const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Ntabwo winjiye. Banza winjire.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const data = db.read();
    const user = data.users.find(u => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'Konti ntibonetse.' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
    if (user.status === 'locked') return res.status(403).json({ error: 'ACCOUNT_LOCKED' });
    if (user.status === 'pending') return res.status(403).json({ error: 'ACCOUNT_PENDING' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Ijambo ryo kwinjira ntiryemewe cyangwa ryarangiye igihe.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Ntabwo wemerewe gukora iki gikorwa.' });
    }
    next();
  };
}

// Business scope: superadmin doesn't have a businessId of their own (they see everything).
// admin's businessId === their own user id. guest's businessId === their parentAdminId.
function businessIdOf(user) {
  if (user.role === 'admin') return user.id;
  if (user.role === 'guest') return user.parentAdminId;
  return null; // superadmin
}

module.exports = { requireAuth, requireRole, businessIdOf, JWT_SECRET };
