// المخزن: كل البيانات في الذاكرة + حفظ تلقائي في IndexedDB.
// كل سجل له id فريد وتاريخ تعديل وعلامة حذف ناعم، ليصلح للمزامنة السحابية لاحقًا.
import { uid, ymNow, ymIdx, ymRange, normDigits, parseNum } from './util.js';

const DB_NAME = 'generator-ledger';
const STORE = 'kv';
const KEY = 'db';
const LS_KEY = 'gl.db.v1';

let db = null;
let idx = null;
let saveTimer = null;
const listeners = new Set();

const blank = () => ({
  v: 1,
  deviceId: uid(),
  createdAt: Date.now(),
  settings: { pricePerAmp: 0, currency: 'د.ع', digits: 'latin', theme: 'auto', user: '', onboarded: false },
  generators: [],
  phases: [],
  cabinets: [],
  connections: [],
  subscribers: [],
  records: {},
  debts: [],
  notes: [],
  log: [],
});

/* ───────── التخزين ───────── */
const openIdb = () =>
  new Promise((res, rej) => {
    if (!globalThis.indexedDB) return rej(new Error('no-idb'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

async function readRaw() {
  try {
    const d = await openIdb();
    const v = await new Promise((res, rej) => {
      const q = d.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    if (v) return v;
  } catch (e) { /* نكمل على localStorage */ }
  try { return localStorage.getItem(LS_KEY); } catch (e) { return null; }
}

async function writeRaw(json) {
  try {
    const d = await openIdb();
    await new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(json, KEY);
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
    return;
  } catch (e) { /* نجرب localStorage */ }
  try { localStorage.setItem(LS_KEY, json); } catch (e) { /* لا شيء */ }
}

export async function load() {
  const raw = await readRaw();
  db = blank();
  if (raw) {
    try { db = migrate(JSON.parse(raw)); } catch (e) { db = blank(); }
  }
  idx = null;
  return db;
}

function migrate(d) {
  const b = blank();
  const out = { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) } };
  for (const k of ['generators', 'phases', 'cabinets', 'connections', 'subscribers', 'debts', 'notes', 'log']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (!out.records || typeof out.records !== 'object') out.records = {};
  return out;
}

export const flush = () => { clearTimeout(saveTimer); saveTimer = null; if (db) return writeRaw(JSON.stringify(db)); };
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); };

function changed() {
  idx = null;
  scheduleSave();
  listeners.forEach((f) => f());
}
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ───────── أساسيات ───────── */
export const settings = () => db.settings;
export const raw = () => db;
export const live = (k) => db[k].filter((x) => !x.deleted);
const stamp = (o) => { o.updatedAt = Date.now(); o.by = db.settings.user || ''; return o; };

export function setSetting(k, v) { db.settings[k] = v; changed(); }
export function add(k, o) {
  const rec = stamp({ id: uid(), createdAt: Date.now(), ...o });
  db[k].push(rec);
  changed();
  return rec;
}
export function upd(k, id, patch) {
  const o = db[k].find((x) => x.id === id);
  if (!o) return null;
  Object.assign(o, patch);
  stamp(o);
  changed();
  return o;
}
export function logAct(text) {
  db.log.unshift({ id: uid(), at: Date.now(), by: db.settings.user || '', text });
  if (db.log.length > 400) db.log.length = 400;
}

/* ───────── الفهرس ───────── */
function build() {
  const I = {
    gen: new Map(), phase: new Map(), cab: new Map(), conn: new Map(), sub: new Map(),
    phasesByGen: new Map(), cabsByPhase: new Map(), connsByCab: new Map(), subsByConn: new Map(),
    debtsBySub: new Map(), notesOpen: 0,
  };
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const g of live('generators')) I.gen.set(g.id, g);
  for (const p of live('phases')) if (I.gen.has(p.generatorId)) { I.phase.set(p.id, p); push(I.phasesByGen, p.generatorId, p); }
  for (const c of live('cabinets')) if (I.phase.has(c.phaseId)) { I.cab.set(c.id, c); push(I.cabsByPhase, c.phaseId, c); }
  for (const c of live('connections')) if (I.cab.has(c.cabinetId)) { I.conn.set(c.id, c); push(I.connsByCab, c.cabinetId, c); }
  for (const s of live('subscribers')) if (I.conn.has(s.connectionId)) { I.sub.set(s.id, s); push(I.subsByConn, s.connectionId, s); }
  for (const d of live('debts')) push(I.debtsBySub, d.subId, d);
  for (const n of live('notes')) if (!n.done) I.notesOpen++;
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt - b.createdAt);
  [I.phasesByGen, I.cabsByPhase].forEach((m) => m.forEach((a) => a.sort(byOrder)));
  I.connsByCab.forEach((a) => a.sort((x, y) => (x.no ?? 0) - (y.no ?? 0) || x.createdAt - y.createdAt));
  I.subsByConn.forEach((a) => a.sort((x, y) => x.createdAt - y.createdAt));
  return I;
}
export const ix = () => idx || (idx = build());

export const generators = () => [...ix().gen.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
export const phasesOf = (genId) => ix().phasesByGen.get(genId) || [];
export const cabinetsOf = (phaseId) => ix().cabsByPhase.get(phaseId) || [];
export const connsOf = (cabId) => ix().connsByCab.get(cabId) || [];
export const subsOfConn = (connId) => ix().subsByConn.get(connId) || [];
export const allSubs = () => [...ix().sub.values()];
export const subsOfCab = (cabId) => connsOf(cabId).flatMap((c) => subsOfConn(c.id));
export const subsOfPhase = (pid) => cabinetsOf(pid).flatMap((c) => subsOfCab(c.id));
export const subsOfGen = (gid) => phasesOf(gid).flatMap((p) => subsOfPhase(p.id));

export function pathOf(sub) {
  const I = ix();
  const conn = I.conn.get(sub.connectionId);
  const cab = conn && I.cab.get(conn.cabinetId);
  const phase = cab && I.phase.get(cab.phaseId);
  const gen = phase && I.gen.get(phase.generatorId);
  return { conn, cab, phase, gen };
}
export const pathText = (sub) => {
  const { cab, phase, gen } = pathOf(sub);
  const showGen = ix().gen.size > 1;
  return [showGen && gen && gen.name, phase && phase.name, cab && cab.name].filter(Boolean).join(' › ');
};

/* ───────── الأسعار والاستحقاق ───────── */
export function priceOfGen(genId) {
  const g = ix().gen.get(genId);
  return g && g.price > 0 ? g.price : db.settings.pricePerAmp || 0;
}
export const dueOf = (sub) => Math.round((sub.amps || 0) * priceOfGen(pathOf(sub).gen?.id));

export function rec(subId, ym) {
  const r = db.records[`${subId}|${ym}`];
  return r && !r.deleted ? r : null;
}
export function monthState(sub, ym) {
  if (rec(sub.id, ym)) return 'paid';
  if (ymIdx(ym) < ymIdx(sub.startYM || ymNow())) return 'before';
  if (ymIdx(ym) > ymIdx(ymNow())) return 'future';
  return 'unpaid';
}
export function unpaidMonths(sub) {
  const now = ymNow();
  const start = sub.startYM || now;
  if (ymIdx(start) > ymIdx(now)) return [];
  return ymRange(start, now).filter((m) => !rec(sub.id, m));
}
export function manualBalance(subId) {
  return (ix().debtsBySub.get(subId) || []).reduce((t, d) => t + (d.kind === 'payment' ? -d.amount : d.amount), 0);
}
export function debtOf(sub) {
  const months = sub.active === false ? [] : unpaidMonths(sub);
  const monthsAmount = months.length * dueOf(sub);
  const manual = Math.max(0, manualBalance(sub.id));
  return { months, monthsAmount, manual, total: monthsAmount + manual };
}
// حالة عامة للعرض في القوائم
export function statusOf(sub) {
  if (sub.active === false) return { k: 'off', text: 'موقوف' };
  const d = debtOf(sub);
  const n = d.months.length;
  if (n === 0 && d.manual === 0) return { k: 'paid', text: 'مسدد', n };
  if (n === 0) return { k: 'debt', text: 'دين مسجّل', n };
  if (n === 1 && d.months[0] === ymNow()) return { k: 'due', text: 'مستحق', n };
  return { k: 'debt', text: `متأخر ${n} ${n > 10 ? 'شهرًا' : n > 2 ? 'أشهر' : n === 2 ? 'شهران' : 'شهر'}`, n };
}

export function stats(subs, ym = ymNow()) {
  const s = { count: subs.length, amps: 0, expected: 0, collected: 0, paidCount: 0, dueCount: 0, debt: 0, debtMonths: 0, manual: 0, debtors: 0 };
  for (const sub of subs) {
    if (sub.active === false) continue;
    s.amps += sub.amps || 0;
    const st = monthState(sub, ym);
    if (st !== 'before') { s.expected += dueOf(sub); s.dueCount++; }
    if (st === 'paid') { s.collected += rec(sub.id, ym).paid; s.paidCount++; }
    const d = debtOf(sub);
    s.debt += d.total; s.debtMonths += d.months.length; s.manual += d.manual;
    if (d.total > 0) s.debtors++;
  }
  return s;
}

/* ───────── العمليات ───────── */
export function nextNo(phaseId) {
  let max = 0;
  for (const cab of cabinetsOf(phaseId)) for (const c of connsOf(cab.id)) max = Math.max(max, c.no || 0);
  return max + 1;
}

export function addGenerator({ name, price }) {
  const g = add('generators', { name, price: price || null, order: ix().gen.size });
  ['فيز 1', 'فيز 2', 'فيز 3'].forEach((n, i) => add('phases', { generatorId: g.id, name: n, order: i }));
  logAct(`إضافة مولدة: ${name}`);
  return g;
}
export function addCabinet({ phaseId, name }) {
  const c = add('cabinets', { phaseId, name, order: cabinetsOf(phaseId).length });
  logAct(`إضافة كابينة: ${name}`);
  return c;
}
export function addSubscriber({ name, amps, phone, startYM, cabinetId, connectionId, no, note }) {
  let conn = connectionId ? ix().conn.get(connectionId) : null;
  if (!conn) {
    const phaseId = ix().cab.get(cabinetId)?.phaseId;
    conn = add('connections', { cabinetId, no: no || nextNo(phaseId), state: 'ok' });
  }
  const sub = add('subscribers', { connectionId: conn.id, name, amps: amps || 0, phone: phone || '', startYM: startYM || ymNow(), active: true, note: note || '' });
  logAct(connectionId ? `إضافة شريك على الجوزة ${conn.no}: ${name}` : `إضافة مشترك: ${name} (جوزة ${conn.no})`);
  return sub;
}

export function payMonths(subId, yms) {
  const sub = ix().sub.get(subId);
  if (!sub) return;
  const due = dueOf(sub);
  const prev = {};
  for (const ym of yms) {
    const k = `${subId}|${ym}`;
    prev[k] = db.records[k] ? { ...db.records[k] } : null;
    db.records[k] = { id: k, subId, ym, due, paid: due, at: Date.now(), by: db.settings.user || '', updatedAt: Date.now(), deleted: false };
  }
  logAct(`تسديد ${yms.length} ${yms.length > 2 ? 'أشهر' : 'شهر'} — ${sub.name}`);
  changed();
  return prev;
}
export function unpayMonth(subId, ym) {
  const k = `${subId}|${ym}`;
  const r = db.records[k];
  if (!r || r.deleted) return;
  r.deleted = true; r.updatedAt = Date.now();
  logAct(`إلغاء تأشير شهر ${ym} — ${ix().sub.get(subId)?.name || ''}`);
  changed();
}
export function restoreRecords(prev) {
  for (const [k, v] of Object.entries(prev)) {
    if (v) db.records[k] = v;
    else if (db.records[k]) { db.records[k].deleted = true; db.records[k].updatedAt = Date.now(); }
  }
  changed();
}

export function addDebtEntry({ subId, kind, amount, note }) {
  const d = add('debts', { subId, kind, amount, note: note || '', at: Date.now() });
  const name = ix().sub.get(subId)?.name || '';
  logAct(kind === 'debt' ? `تسجيل دين ${amount} على ${name}` : `تسديد من الدين ${amount} — ${name}`);
  return d;
}

export function removeEntity(kind, id) {
  const stamp2 = (k, pred) => db[k].forEach((x) => { if (!x.deleted && pred(x)) { x.deleted = true; x.updatedAt = Date.now(); } });
  const I = ix();
  if (kind === 'generators') {
    const phases = new Set((I.phasesByGen.get(id) || []).map((p) => p.id));
    const cabs = new Set([...phases].flatMap((p) => (I.cabsByPhase.get(p) || []).map((c) => c.id)));
    const conns = new Set([...cabs].flatMap((c) => (I.connsByCab.get(c) || []).map((x) => x.id)));
    stamp2('subscribers', (s) => conns.has(s.connectionId));
    stamp2('connections', (c) => cabs.has(c.cabinetId));
    stamp2('cabinets', (c) => phases.has(c.phaseId));
    stamp2('phases', (p) => p.generatorId === id);
  } else if (kind === 'cabinets') {
    const conns = new Set((I.connsByCab.get(id) || []).map((x) => x.id));
    stamp2('subscribers', (s) => conns.has(s.connectionId));
    stamp2('connections', (c) => c.cabinetId === id);
  } else if (kind === 'connections') {
    stamp2('subscribers', (s) => s.connectionId === id);
  }
  stamp2(kind, (x) => x.id === id);
  changed();
}
export function removeSubscriber(id) {
  const s = ix().sub.get(id);
  if (!s) return;
  const siblings = subsOfConn(s.connectionId).filter((x) => x.id !== id);
  upd('subscribers', id, { deleted: true });
  if (!siblings.length) upd('connections', s.connectionId, { deleted: true });
  logAct(`حذف مشترك: ${s.name}`);
}

/* ───────── النسخ الاحتياطي ───────── */
export const exportJSON = () => JSON.stringify({ ...db, exportedAt: Date.now() }, null, 1);
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== 'object' || !Array.isArray(d.generators) || !Array.isArray(d.subscribers)) throw new Error('ملف غير صالح');
  db = migrate(d);
  db.settings.onboarded = true;
  logAct('استيراد نسخة احتياطية');
  changed();
}
export function wipe() {
  const s = db.settings;
  db = blank();
  db.settings = { ...db.settings, user: s.user, theme: s.theme, digits: s.digits, currency: s.currency };
  changed();
}

/* ───────── استيراد نصي سريع ───────── */
// سطر مثل:  26 محمود الكعبي 6
export function parseQuick(text) {
  const rows = [];
  const bad = [];
  for (const line0 of String(text || '').split(/\r?\n/)) {
    const line = normDigits(line0).replace(/[|\t;,]+/g, ' ').trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:A|a|أمبير|امبير)?$/);
    if (m && m[2].replace(/[\d\s]/g, '').length >= 2) rows.push({ no: parseInt(m[1], 10), name: m[2].trim(), amps: parseFloat(m[3]) });
    else bad.push(line0.trim());
  }
  return { rows, bad };
}
export function importRows(cabinetId, rows, startYM) {
  const byNo = new Map(connsOf(cabinetId).map((c) => [c.no, c]));
  let n = 0;
  for (const r of rows) {
    const conn = byNo.get(r.no);
    const sub = addSubscriber({ name: r.name, amps: r.amps, cabinetId, connectionId: conn?.id, no: r.no, startYM });
    if (!conn) { const c = ix().conn.get(sub.connectionId); byNo.set(r.no, c); }
    n++;
  }
  logAct(`استيراد سريع: ${n} مشترك`);
  return n;
}

/* ───────── بيانات تجريبية ───────── */
export function seedDemo() {
  const now = ymNow();
  const { y, m } = { y: +now.slice(0, 4), m: +now.slice(5) };
  const ago = (k) => { const i = y * 12 + m - 1 - k; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
  db.settings.pricePerAmp = 7000;
  db.settings.onboarded = true;
  const g1 = addGenerator({ name: 'المولدة القديمة', price: 0 });
  const g2 = addGenerator({ name: 'المولدة الجديدة', price: 0 });
  const p = phasesOf(g1.id);
  const cabA = addCabinet({ phaseId: p[0].id, name: 'كابينة الشهاب (1)' });
  const cabB = addCabinet({ phaseId: p[0].id, name: 'كابينة الشهاب (2)' });
  const cabC = addCabinet({ phaseId: p[1].id, name: 'كابينة السوق' });
  addCabinet({ phaseId: phasesOf(g2.id)[0].id, name: 'كابينة المدرسة' });
  const people = [
    ['أحمد صالح العبيدي', 6], ['إبراهيم خالد طه', 4], ['محمد علي الحمداني', 4], ['محمود جاسم الزبيدي', 3], ['سعد كريم الجبوري', 5],
    ['يوسف حسن الدليمي', 2], ['علي حمزة الساعدي', 3], ['حيدر عباس الربيعي', 2], ['كاظم نعيم المالكي', 1], ['مصطفى رعد التميمي', 3],
    ['عمر فارس العزاوي', 4], ['حسين ماجد الخفاجي', 2],
  ];
  const mk = (cab, list, startNo) => list.map(([name, amps], i) => addSubscriber({ name, amps, cabinetId: cab.id, no: startNo + i, startYM: ago(5) }));
  const sa = mk(cabA, people.slice(0, 6), 26);
  const sb = mk(cabB, people.slice(6, 9), 40);
  const sc = mk(cabC, people.slice(9), 60);
  // شريك على نفس الجوزة
  addSubscriber({ name: 'رياض نوري السامرائي', amps: 2, cabinetId: cabA.id, connectionId: sa[3].connectionId, startYM: ago(3) });
  addSubscriber({ name: 'ليث أمجد الشمري', amps: 1, cabinetId: cabA.id, connectionId: sa[3].connectionId, startYM: ago(1) });
  // محاكاة تسديد
  const all = [...sa, ...sb, ...sc];
  all.forEach((s, i) => {
    const list = [];
    const lag = i % 5; // عدد الأشهر المتأخرة
    for (let k = 5; k >= lag; k--) list.push(ago(k));
    if (i % 7 === 0) list.pop();
    if (list.length) payMonths(s.id, list.filter((a) => ymIdx(a) >= ymIdx(s.startYM)));
  });
  addDebtEntry({ subId: sa[1].id, kind: 'debt', amount: 50000, note: 'سلفة صيانة' });
  addDebtEntry({ subId: sb[0].id, kind: 'debt', amount: 120000, note: 'رصيد قديم' });
  addDebtEntry({ subId: sb[0].id, kind: 'payment', amount: 20000, note: 'دفعة' });
  add('notes', { type: 'broken', text: 'واير مقطوع قرب العمود الثاني', connId: sa[2].connectionId, done: false });
  add('notes', { type: 'float', text: 'الجوزة طافية — يحتاج فحص', connId: sb[1].connectionId, done: false });
  add('notes', { type: 'visit', text: 'يريد إضافة شريك الأسبوع القادم', subId: sc[0].id, done: false });
  logAct('تحميل بيانات تجريبية');
  changed();
}

export { parseNum };
