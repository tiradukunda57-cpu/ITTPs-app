// Igice cy'imibikire y'amakuru (database).
// Dukoresha dosiye ya JSON kugira ngo sisitemu ibashe gukorera kuri computer
// iyariyo yose nta gushiraho database ikomeye (Postgres/MySQL) bisaba. Iyi dosiye
// (data/db.json) niyo "database" - niba wifuza kuyimurira kuri sisitemu ikomeye
// nyuma (iyo ubucuruzi bwiyongereye), ushobora guhindura iyi module gusa nta
// guhindura ibindi bice by'application (routes ntizihinduka).

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY_DB = {
  users: [],
  products: [],
  sales: [],
  auditLog: [],
  payments: [],
  loginAttempts: [],
  notifications: []
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function read() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    // Uzuza collections zishobora kuba zidahari (upgrade-safe)
    for (const key of Object.keys(EMPTY_DB)) {
      if (!parsed[key]) parsed[key] = [];
    }
    return parsed;
  } catch (e) {
    console.error('Habaye ikibazo cyo gusoma database, dusubiye kuri database y\'ubusa:', e);
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
}

// Write yoroheje (locking rudimentary) - ihagije kuri app ikoreshwa n'itsinda rito/ubucuruzi buto.
// Kuri scale nini, hindura iyi module ikoreshe database nyayo (Postgres/MySQL/SQLite).
let writing = Promise.resolve();
function write(data) {
  writing = writing.then(() => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  });
  return writing;
}

function genId(prefix = '') {
  return (prefix ? prefix + '_' : '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

module.exports = { read, write, genId, DB_PATH };
