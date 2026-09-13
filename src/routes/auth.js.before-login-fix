const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { notify, logAudit } = require('../services/notify');
const { JWT_SECRET } = require('../auth/middleware');

const router = express.Router();

// Kwiyandikisha nk'Admin (nyir'ubucuruzi). Guest ntabwo yiyandikisha ubwe -
// yongerwamo n'Admin (reba src/routes/admin.js -> POST /guests).
router.post('/register', async (req, res) => {
  const { name, email, phone, password, language } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'Uzuza amakuru yose asabwa (izina, email, telefoni, ijambo ry\'ibanga).' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Ijambo ry\'ibanga rigomba kuba nibura inyuguti 6.' });
  }

  const data = db.read();
  const exists = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Iyi email isanzwe yiyandikishije.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: db.genId('usr'),
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role: 'admin',
    parentAdminId: null,
    status: 'pending', // ategereza kwemezwa na superadmin
    language: language || 'rw',
    permissions: null,
    createdAt: new Date().toISOString()
  };
  data.users.push(user);
  await db.write(data);

  await logAudit({ actorId: user.id, action: 'register', entity: 'user', entityId: user.id, details: { role: 'admin' } });
  await notify({
    toRole: 'superadmin',
    type: 'system',
    message: `Umucuruzi mushya yiyandikishije: ${name} (${email}, ${phone}). Ategereje kwemezwa.`
  });

  res.status(201).json({ message: 'Wiyandikishije neza. Tegereza kwemezwa n\'uyobora sisitemu mbere yo kwinjira.' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Andika email n\'ijambo ry\'ibanga.' });

  const data = db.read();
  const user = data.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());

  const ip = req.ip;
  const recordAttempt = async (success) => {
    data.loginAttempts.push({ id: db.genId('att'), email: (email || '').toLowerCase(), success, ip, timestamp: new Date().toISOString() });
    await db.write(data);
  };

  if (!user) {
    await recordAttempt(false);
    await checkSuspiciousActivity(email, ip);
    return res.status(401).json({ error: 'Email cyangwa ijambo ry\'ibanga sibyo.' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    await recordAttempt(false);
    await logAudit({ actorId: user.id, action: 'login_failed', entity: 'user', entityId: user.id });
    await checkSuspiciousActivity(email, ip, user);
    return res.status(401).json({ error: 'Email cyangwa ijambo ry\'ibanga sibyo.' });
  }

  if (user.status === 'pending') return res.status(403).json({ error: 'ACCOUNT_PENDING' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
  if (user.status === 'locked') return res.status(403).json({ error: 'ACCOUNT_LOCKED' });

  await recordAttempt(true);
  await logAudit({ actorId: user.id, action: 'login', entity: 'user', entityId: user.id });

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      language: user.language, permissions: user.permissions
    }
  });
});

// Iyo hari amagerageza menshi y'ibanga atagenda neza, menyesha superadmin
// (kandi, niba email ihuye n'umukoresha uzwi, menyesha na admin wabo).
async function checkSuspiciousActivity(email, ip, user = null) {
  const data = db.read();
  const recent = data.loginAttempts.filter(a =>
    a.email === (email || '').toLowerCase() &&
    !a.success &&
    Date.now() - new Date(a.timestamp).getTime() < 10 * 60 * 1000
  );
  if (recent.length >= 3) {
    await notify({
      toRole: 'superadmin',
      type: 'security',
      message: `Kwinjira kutizewe: hari uwagerageje kwinjira inshuro nyinshi (${recent.length}) atabishoboye kuri email "${email}" (IP: ${ip}).`
    });
    if (user && user.role === 'admin') {
      await notify({
        toRole: 'admin',
        toUserId: user.id,
        type: 'security',
        message: `Umuntu yagerageje kwinjira muri konti yawe inshuro nyinshi atabishoboye. Niba atari wowe, hindura ijambo ry'ibanga vuba.`
      });
    }
  }
}

module.exports = router;
