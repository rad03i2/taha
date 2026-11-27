// الحسابات والمزامنة السحابية (Supabase عبر دوال RPC). الأحدث يفوز لكل سجل (updatedAt).
import * as S from './store.js';
import { toast } from './ui.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const available = () => !!(SUPABASE_URL && SUPABASE_KEY);
export const cfg = () => S.syncState().cfg;
export const user = () => (cfg() ? cfg().user : null);
export const gateRequired = () => available() && !cfg();
export const role = () => (cfg() ? cfg().user.role : 'manager'); // بدون سحابة = مدير محلي
export const isManager = () => role() === 'manager';

const st = { state: 'idle', at: 0, err: '', busy: false };
const subs = new Set();
export const status = () => ({ ...st, connected: !!cfg() });
export const onStatus = (f) => { subs.add(f); return () => subs.delete(f); };
const notify = () => subs.forEach((f) => f());
const set = (p) => { Object.assign(st, p); notify(); };

const MSG = {
  'bad credentials': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  locked: 'تم قفل الحساب مؤقتًا بعد محاولات خاطئة. حاول بعد 15 دقيقة',
  disabled: 'هذا الحساب موقوف. راجع المدير',
  'username taken': 'اسم المستخدم مستعمل، اختر غيره',
  'bad username': 'اسم المستخدم: حروف إنجليزية صغيرة وأرقام (3 إلى 30)',
  'weak password': 'كلمة المرور قصيرة (6 أحرف على الأقل)',
  'manager only': 'هذه العملية للمدير فقط',
  forbidden: 'انتهت الجلسة، سجّل الدخول من جديد',
};
const friendly = (e) => {
  if (e.name === 'AbortError') return 'انتهت مهلة الاتصال';
  if (e instanceof TypeError) return 'لا يوجد اتصال بالإنترنت';
  const k = Object.keys(MSG).find((m) => (e.message || '').includes(m));
  return k ? MSG[k] : 'تعذّر الاتصال بالخادم';
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
    if (!r.ok) {
      let m = txt; try { m = JSON.parse(txt).message || txt; } catch (e) { /* نص خام */ }
      const e = new Error(String(m).slice(0, 200)); e.status = r.status; throw e;
    }
    return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(t); }
}
const authed = (fn, body) => rpc(fn, { p_token: cfg().token, ...body });

function expired(e) {
  if (e && (e.message || '').includes('forbidden') && cfg()) { S.setSyncCfg(null); set({ state: 'idle', err: '' }); return true; }
  return false;
}

/* ───── الدخول والخروج ───── */
function adopt(r) {
  if (!r || r.error) throw new Error(r?.error || 'bad credentials');
  S.setSyncCfg({ token: r.token, user: r.user });
  S.setSetting('user', r.user.display);
}
export async function login(username, password) {
  let r;
  try { r = await rpc('login', { p_username: username, p_password: password }); } catch (e) { throw new Error(friendly(e)); }
  try { adopt(r); } catch (e) { throw new Error(friendly(e)); }
  syncNow();
}
export async function setup({ name, display, username, password }) {
  let r;
  try { r = await rpc('setup_workspace', { p_name: name, p_username: username, p_password: password, p_display: display }); } catch (e) { throw new Error(friendly(e)); }
  adopt(r);
  syncNow();
}
export async function logout() {
  try { if (cfg()) await authed('logout', {}); } catch (e) { /* نتجاهل */ }
  S.setSyncCfg(null); team = null; set({ state: 'idle', err: '', at: 0 });
}
export async function refreshMe() {
  if (!cfg()) return;
  try {
    const u = await authed('me', {});
    if (u && (u.role !== cfg().user.role || u.display !== cfg().user.display)) {
      S.setSyncCfg({ ...cfg(), user: u }); S.setSetting('user', u.display);
    }
  } catch (e) { expired(e); }
}

/* ───── إدارة المشرفين (للمدير) ───── */
let team = null;
export const teamList = () => team;
export async function loadTeam() {
  if (!cfg() || !isManager()) return;
  try { team = await authed('users_list', {}); notify(); } catch (e) { if (!expired(e)) { toast(friendly(e)); } }
}
const teamCall = async (fn, body) => {
  try { const r = await authed(fn, body); await loadTeam(); return r; } catch (e) { if (expired(e)) throw new Error(MSG.forbidden); throw new Error(friendly(e)); }
};
export const createSupervisor = ({ username, password, display }) => teamCall('user_create', { p_username: username, p_password: password, p_display: display });
export const updateUser = (id, { display = null, password = null, active = null }) => teamCall('user_update', { p_user: id, p_display: display, p_password: password, p_active: active });

/* ───── الدفع والسحب ───── */
async function push() {
  for (let guard = 0; guard < 40; guard++) {
    const items = S.dirtyItems(300);
    if (!items.length) return;
    await authed('sync_push', { p_items: items.map(({ kind, id, ts, data }) => ({ kind, id, ts, data })) });
    S.markPushed(items);
  }
}
async function pull() {
  const first = !S.syncState().lastPull;
  for (let guard = 0; guard < 40; guard++) {
    const since = S.syncState().lastPull || '1970-01-01T00:00:00Z';
    const r = await authed('sync_pull', { p_since: since });
    if (!r || !r.n) return;
    const res = S.applyRemote(r.items, { notify: !first });
    S.setLastPull(r.cursor);
    if (res.fresh.length) { toast(`${res.fresh[0].by}: ${res.fresh[0].text}${res.fresh.length > 1 ? ` (+${res.fresh.length - 1})` : ''}`); S.addUnread(res.fresh.length); }
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
    await push();
    set({ busy: false, state: 'ok', at: Date.now(), err: '' });
  } catch (e) {
    set({ busy: false });
    if (!expired(e)) set({ state: 'err', err: friendly(e) });
  }
  if (again) { again = false; setTimeout(syncNow, 300); }
}

/* ───── التشغيل التلقائي ───── */
let pushTimer = null; let ticks = 0;
const schedulePush = () => {
  if (!cfg() || !available()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 1200);
};
export function start() {
  if (!available()) return;
  S.onChange(() => { if (cfg() && S.dirtyItems(1).length) schedulePush(); });
  setInterval(() => { if (!document.hidden && cfg()) { syncNow(); if (++ticks % 6 === 0) refreshMe(); } }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncNow(); refreshMe(); } });
  window.addEventListener('online', syncNow);
  refreshMe(); syncNow();
}
