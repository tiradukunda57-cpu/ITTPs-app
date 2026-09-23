// Igice cy'imibikire y'amakuru (database).
//
// Iyi verisiyo IKORESHA PostgreSQL (nka database y'ukuri, ibikwa burundu) niba
// hari DATABASE_URL muri environment variables (nk'uko biteganyijwe kuri Render).
// Niba DATABASE_URL idahari (urugero: ukoresha kuri computer yawe wenyine mu
// gutwiga - "npm run dev"), isubira gukoresha dosiye ya JSON (data/db.json)
// nk'uko byari bimeze mbere.
//
// IYI NI YO MPAMVU YATUMYE AMAKURU YAWE ASENYUKA KURI RENDER: kuri "free plan",
// disk ya seriveri ntibika burundu - buri gihe seriveri ihagaze igasubira gukora
// (spin down/up), amakuru yabikiwe kuri diski arasibwa. Ubu amakuru azabikwa
// muri PostgreSQL nta kibazo na kimwe kizabaho n'iyo seriveri ye yagira uko yigaragaza.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY_DB = {
  users: [],
  products: [],
  sales: [],
  dispatches: [],
  procurements: [],
  auditLog: [],
  payments: [],
  loginAttempts: [],
  notifications: []
};

let cache = null;   // Imibiko y'amakuru iri muri memory (yihuse gusoma)
let pgPool = null;  // Umuyoboro wa PostgreSQL (niba uhari)
let writing = Promise.resolve(); // Kwandika kimwe kimwe (serialized), kwirinda amakosa

function cloneEmpty() { return JSON.parse(JSON.stringify(EMPTY_DB)); }

function ensureCollections(obj) {
  for (const key of Object.keys(EMPTY_DB)) {
    if (!obj[key]) obj[key] = [];
  }
  return obj;
}

function ensureFileDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

// Igomba guhamagarwa rimwe (await db.init()) mbere yuko server itangira.
async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await pgPool.query(`CREATE TABLE IF NOT EXISTS app_state (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    const { rows } = await pgPool.query('SELECT data FROM app_state WHERE id = 1');
    if (rows.length) {
      cache = ensureCollections(rows[0].data);
    } else {
      cache = cloneEmpty();
      await pgPool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [JSON.stringify(cache)]);
    }
    console.log("🗄️  Database: PostgreSQL (amakuru abikwa burundu, ntazasenyuka seriveri ​igarutse).");
  } else {
    ensureFileDb();
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      cache = ensureCollections(JSON.parse(raw));
    } catch (e) {
      cache = cloneEmpty();
    }
    console.warn("⚠️  DATABASE_URL ntiyabonetse - dukoresha dosiye JSON y'agateganyo. Kuri Render, shyiramo DATABASE_URL kugira ngo amakuru abikwe burundu.");
  }
}

function read() {
  if (!cache) cache = cloneEmpty(); // safety net niba init() itaje kubanza (ntibigomba kubaho)
  return cache;
}

function write(data) {
  cache = data;
  writing = writing.then(async () => {
    if (pgPool) {
      await pgPool.query('UPDATE app_state SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(data)]);
    } else {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    }
  }).catch(err => console.error("Habaye ikibazo cyo kubika muri database:", err));
  return writing;
}

function genId(prefix = '') {
  return (prefix ? prefix + '_' : '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

module.exports = { init, read, write, genId, DB_PATH };
