require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./src/db');
const { ensureSuperAdmin } = require('./src/seed');
const { startCronJobs } = require('./src/services/cron');

const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const salesRoutes = require('./src/routes/sales');
const dispatchRoutes = require('./src/routes/dispatches');
const procurementRoutes = require('./src/routes/procurements');
const adminRoutes = require('./src/routes/admin');
const superadminRoutes = require('./src/routes/superadmin');
const paymentRoutes = require('./src/routes/payments');
const notificationRoutes = require('./src/routes/notifications');

const app = express();
app.use(cors());
app.use(express.json());

// Locales (frontend izabikuramo amagambo y'ururimi runaka)
app.get('/api/locales/:lang', (req, res) => {
  try {
    const locale = require(`./src/locales/${req.params.lang}.json`);
    res.json(locale);
  } catch (e) {
    res.status(404).json({ error: 'Ururimi ntirubonetse.' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/dispatches', dispatchRoutes);
app.use('/api/procurements', procurementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Frontend (static files) - ikora kuri mudasobwa na telefoni (responsive)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;

async function start() {
  await db.init();
  await ensureSuperAdmin();
  startCronJobs();
  app.listen(PORT, () => {
    console.log(`\n🚀 Igitabo cy'Ubucuruzi kirimo gukora kuri http://localhost:${PORT}\n`);
  });
}

if (require.main === module) start();

module.exports = app;
