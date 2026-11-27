// المزامنة السحابية (Supabase عبر دوال RPC). الأحدث يفوز لكل سجل (updatedAt).
import * as S from './store.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const available = () => !!(SUPABASE_URL && SUPABASE_KEY);
export const cfg = () => S.syncState().cfg;
export const role = () => (cfg() ? cfg().role : 'admin'); // بدون مزامنة = مدير محلي
export const isAdmin = () => role() === 'admin';

const st = { state: 'idle', at: 0, err: '', busy: false };
const subs = new Set();
export const status = () => ({ ...st, connected: !!cfg() });
export const onStatus = (f) => { subs.add(f); return () => subs.delete(f); };
const set = (p) => { Object.assign(st, p); subs.forEach((f) => f()); };

const rand = (n) => {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => a[x % a.length]).join('');
};

async function rpc(fn, body, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) { const e = new Error(txt.slice(0, 200)); e.status = r.status; throw e; }
    return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(t); }
}

const friendly = (e) => {
  if (e.name === 'AbortError') return 'انتهت مهلة الاتصال';
  if (e.message && e.message.includes('forbidden')) return 'الرمز لم يعد صالحًا';
  if (e instanceof TypeError) return 'لا يوجد اتصال بالإنترنت';
  return 'تعذّرت المزامنة';
};

/* ───── إنشاء/انضمام ───── */
export async function createWorkspace(name) {
  const ws = `w${rand(9)}`; const admin = rand(24); const collector = rand(24);
  await rpc('create_workspace', { p_id: ws, p_admin: admin, p_collector: collector, p_name: name || '' });
  S.setSyncCfg({ ws, key: admin, role: 'admin', collectorKey: collector, name: name || '' });
  await syncNow();
  return { admin: `${ws}.${admin}`, collector: `${ws}.${collector}` };
}
export const inviteCodes = () => {
  const c = cfg(); if (!c || c.role !== 'admin') return null;
  return { admin: `${c.ws}.${c.key}`, collector: `${c.ws}.${c.collectorKey}` };
};
export async function join(code) {
  const m = String(code || '').trim().toLowerCase().match(/^([a-z0-9]{6,40})\.([a-z0-9]{16,64})$/);
  if (!m) throw new Error('الرمز غير صحيح');
  let r;
  try { r = await rpc('sync_whoami', { p_ws: m[1], p_key: m[2] }); } catch (e) { throw new Error(friendly(e)); }
  if (r !== 'admin' && r !== 'collector') throw new Error('الرمز غير صحيح أو منتهٍ');
  S.setSyncCfg({ ws: m[1], key: m[2], role: r, name: '' });
  await syncNow();
}
export function leave() { S.setSyncCfg(null); set({ state: 'idle', err: '', at: 0 }); }

/* ───── الدفع والسحب ───── */
async function push() {
  const c = cfg();
  for (let guard = 0; guard < 40; guard++) {
    const items = S.dirtyItems(300);
    if (!items.length) return;
    await rpc('sync_push', { p_ws: c.ws, p_key: c.key, p_items: items.map(({ kind, id, ts, data }) => ({ kind, id, ts, data })) });
    S.markPushed(items);
  }
}
async function pull() {
  const c = cfg();
  for (let guard = 0; guard < 40; guard++) {
    const since = S.syncState().lastPull || '1970-01-01T00:00:00Z';
    const r = await rpc('sync_pull', { p_ws: c.ws, p_key: c.key, p_since: since });
    if (!r || !r.n) return;
    S.applyRemote(r.items);
    S.setLastPull(r.cursor);
    if (r.n < 2000) return;
  }
}

let again = false;
export async function syncNow() {
  if (!available() || !cfg()) return;
  if (st.busy) { again = true; return; }
  set({ busy: true, state: 'sync', err: '' });
  try {
    await push();
    await pull();
    await push(); // ما نتج عن الدمج
    set({ busy: false, state: 'ok', at: Date.now(), err: '' });
  } catch (e) {
    set({ busy: false, state: 'err', err: friendly(e) });
  }
  if (again) { again = false; setTimeout(syncNow, 300); }
}

/* ───── التشغيل التلقائي ───── */
let pushTimer = null; let poll = null;
const schedulePush = () => {
  if (!cfg() || !available()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 1200);
};
export function start() {
  if (!available()) return;
  S.onChange(() => { if (S.dirtyItems(1).length) schedulePush(); });
  poll = setInterval(() => { if (!document.hidden && cfg()) syncNow(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  window.addEventListener('online', syncNow);
  syncNow();
}
