// ============================================================================
// Kwibutsa amadeni automatically (receivables = abakiriya batugomba,
// payables = amadeni tugomba abandi).
//  * Itariki yo kwishyura ifatwa nk'itariki yo mu Rwanda (UTC+2).
//  * Ibyibutso bitangwa ku byiciro: iminsi 7, 3, 1 mbere, umunsi nyirizina,
//    hanyuma buri cyumweru ideni rimaze kurenza itariki.
//  * Idempotent: buri cyiciro cya buri deni gitanga ikimenyetso (key) rimwe gusa,
//    bityo gukora kenshi (cron + lazy) ntibisubiramo. Iyo itariki ihinduwe,
//    ibyibutso bitangira bushya (key irimo itariki).
//  * Kubera ko seriveri y'ubuntu ishobora gusinzira, ikorwa kandi igihe cyose
//    nyiri business afunguye dashboard (GET /api/debts/summary).
// ============================================================================
const db = require('../db');
const acc = require('./accounting');

function stageFor(daysLeft) {
  if (daysLeft == null) return null;
  if (daysLeft < 0) return `od${Math.floor((-daysLeft - 1) / 7)}`;
  if (daysLeft === 0) return 'd0';
  if (daysLeft <= 1) return 'd1';
  if (daysLeft <= 3) return 'd3';
  if (daysLeft <= 7) return 'd7';
  return null;
}

async function generateDebtReminders(businessId) {
  const data = db.read();
  const admin = (data.users || []).find(u => u.id === businessId);
  if (!admin) return 0;
  const existing = new Set((data.notifications || []).filter(n => n.key && n.toUserId === businessId).map(n => n.key));
  const now = new Date().toISOString();
  let added = 0;

  const make = (kind, item) => {
    if (item.outstanding <= 0 || !item.dueDate) return;
    const stage = stageFor(item.daysLeft);
    if (!stage) return;
    const key = `debt:${kind}:${item.id}:${item.dueDate}:${stage}`;
    if (existing.has(key)) return;
    const who = kind === 'rec' ? item.customerName : item.creditorName;
    const params = { who: who || '', amount: item.outstanding, date: item.dueDate, days: Math.abs(item.daysLeft) };
    const state = item.daysLeft < 0 ? 'over' : item.daysLeft === 0 ? 'today' : 'soon';
    const rw = kind === 'rec'
      ? (state === 'over' ? `Ideni rya ${params.who} (${params.amount} RWF) ryarengeje itariki ${params.date} ho iminsi ${params.days}. Mwibutse kwishyura.`
        : state === 'today' ? `Uyu munsi ni wo mwumvikanye ko ${params.who} yishyura ${params.amount} RWF. Muhamagare mumwishyuze.`
        : `Hasigaye iminsi ${params.days} ngo ${params.who} yishyure ${params.amount} RWF (${params.date}).`)
      : (state === 'over' ? `Ideni ugomba ${params.who} (${params.amount} RWF) ryarengeje itariki ${params.date} ho iminsi ${params.days}. Ryishyure vuba.`
        : state === 'today' ? `Uyu munsi ni wo wiyemeje kwishyura ${params.who} ${params.amount} RWF.`
        : `Hasigaye iminsi ${params.days} ngo wishyure ${params.who} ${params.amount} RWF (${params.date}).`);
    data.notifications.push({
      id: db.genId('ntf'), toRole: 'admin', toUserId: businessId, type: 'debt', message: rw,
      i18n: { key: `debt.rem.${kind}.${state}`, params }, link: 'debts', key, read: false, timestamp: now
    });
    existing.add(key);
    added++;
  };

  acc.receivableList(data, businessId).forEach(x => make('rec', x));
  acc.payableList(data, businessId).forEach(x => make('pay', x));
  if (added) await db.write(data);
  return added;
}

async function generateAllDebtReminders() {
  const data = db.read();
  const admins = data.users.filter(u => u.role === 'admin' && u.status !== 'blocked');
  for (const a of admins) {
    try { await generateDebtReminders(a.id); } catch (e) { console.error('debt reminders error', a.id, e.message); }
  }
}

module.exports = { generateDebtReminders, generateAllDebtReminders, stageFor };
