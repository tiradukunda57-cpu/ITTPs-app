const bcrypt = require('bcryptjs');
const db = require('./db');

// Irema konti ya Super Admin (nyir'application) ikoresheje amakuru ari muri .env,
// niba nta n'imwe ihari muri database. Iyi ni yo konti ifite uburenganzira bwose.
async function ensureSuperAdmin() {
  const data = db.read();
  const exists = data.users.find(u => u.role === 'superadmin');
  if (exists) return exists;

  const email = process.env.SUPERADMIN_EMAIL || 'tiradukunda57@gmail.com';
  const password = process.env.SUPERADMIN_PASSWORD;
  const phone = process.env.SUPERADMIN_PHONE || '0794619289';
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';

  if (!password) {
    console.warn('\n⚠️  SUPERADMIN_PASSWORD ntiyashyizwe muri .env. Superadmin ntiyaremwe.');
    console.warn('   Kopiya .env.example wite .env, wuzuze SUPERADMIN_PASSWORD, hanyuma ongera utangire server.\n');
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const superadmin = {
    id: db.genId('usr'),
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role: 'superadmin',
    parentAdminId: null,
    status: 'approved',
    language: 'rw',
    createdAt: new Date().toISOString()
  };
  data.users.push(superadmin);
  await db.write(data);
  console.log(`✅ Konti ya Super Admin yaremwe: ${email}`);
  return superadmin;
}

module.exports = { ensureSuperAdmin };
