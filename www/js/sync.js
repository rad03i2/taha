// الحسابات والمزامنة السحابية (Supabase عبر دوال RPC). الأحدث يفوز لكل سجل (updatedAt).
import * as S from './store.js';
import { toast, banner } from './ui.js';
import { nav } from './nav.js';
import { SUPABASE_URL, SUPABASE_KEY, PUSH } from './config.js';

export const available = () => !!(SUPABASE_URL && SUPABASE_KEY);
export const cfg = () => S.syncState().cfg;
export const user = () => (cfg() ? cfg().user : null);
export const gateRequired = () => available() && !cfg();
export const role = () => (cfg() ? cfg().user.role : 'manager'); // بدون سحابة = مدير محلي
export const isManager = () => role() === 'manager';
// صلاحيات المشرف: المدير (أو الوضع المحلي) يملك الكل، والمشرف كل شيء ما لم يوقفه المدير
export const perms = () => (cfg() && cfg().user.perms) || {};
export const can = (k) => !available() || !cfg() || isManager() || perms()[k] !== false;

const st = { state: 'idle', at: 0, err: '', busy: false };
const subs = new Set();
export const status = () => ({ ...st, connected: !!cfg() });
export const onStatus = (f) => { subs.add(f); return () => subs.delete(f); };
const notify = () => subs.forEach((f) => f());
// لا نُبلغ المستمعين إلا عند تغيّر فعلي (لتفادي إعادة رسم الشاشة مع كل استطلاع)
const set = (p) => {
  const was = JSON.stringify([st.state, st.err, st.busy]);
  Object.assign(st, p);
  if (was !== JSON.stringify([st.state, st.err, st.busy])) notify();
};

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

// المفاتيح الجديدة (sb_publishable_…) ليست JWT فلا تُرسل في Authorization؛ المفاتيح القديمة (eyJ…) تُرسل.
const HEADERS = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(SUPABASE_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_KEY}` } : {}) };

async function rpc(fn, body, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: HEADERS,
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
  if (e && (e.message || '').includes('forbidden') && cfg()) { rt.close(); S.setSyncCfg(null); set({ state: 'idle', err: '' }); return true; }
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
  rt.open(); syncNow();
}
export async function setup({ name, display, username, password }) {
  let r;
  try { r = await rpc('setup_workspace', { p_name: name, p_username: username, p_password: password, p_display: display }); } catch (e) { throw new Error(friendly(e)); }
  adopt(r);
  rt.open(); syncNow();
}
// رمز جهاز الإشعارات (FCM): يُسجَّل لحساب المستخدم الحالي فقط
export const registerPush = (fcm) => (cfg() ? authed('push_register', { p_fcm: fcm }).catch(() => {}) : null);
// يرسل إشعارًا لهواتف بقية الفريق عبر دالة Edge (لا يحمل بيانات حساسة سوى نص الحركة)
function notifyPhones(items) {
  if (!PUSH || !cfg()) return;
  const me = S.settings().user || ''; const now = Date.now();
  const mine = items.filter((i) => i.kind === 'log' && i.data && i.data.by === me && now - (i.data.at || 0) < 120000);
  if (!mine.length) return;
  const f = mine[0].data;
  fetch(`${SUPABASE_URL}/functions/v1/push`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ p_token: cfg().token, title: me || 'حسابات المولدة', body: mine.length > 1 ? `${mine.length} حركات جديدة — آخرها: ${f.text}` : f.text, data: { subId: f.subId || '', k: f.k || '' } }),
  }).catch(() => {});
}
export async function logout() {
  try { const t = localStorage.getItem('gl.fcm'); if (cfg() && t) await authed('push_unregister', { p_fcm: t }); } catch (e) { /* نتجاهل */ }
  try { if (cfg()) await authed('logout', {}); } catch (e) { /* نتجاهل */ }
  rt.close(); S.setSyncCfg(null); team = null; set({ state: 'idle', err: '', at: 0 });
}
export async function refreshMe() {
  if (!cfg()) return;
  try {
    const u = await authed('me', {});
    if (u && (u.role !== cfg().user.role || u.display !== cfg().user.display || JSON.stringify(u.perms || {}) !== JSON.stringify(cfg().user.perms || {}))) {
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
export const createSupervisor = ({ username, password, display, perms = {} }) => teamCall('user_create', { p_username: username, p_password: password, p_display: display, p_perms: perms });
export const updateUser = (id, { display = null, password = null, active = null, perms = null }) => teamCall('user_update', { p_user: id, p_display: display, p_password: password, p_active: active, p_perms: perms });

/* ───── الدفع والسحب ───── */
async function push() {
  for (let guard = 0; guard < 40; guard++) {
    const items = S.dirtyItems(300);
    if (!items.length) return;
    await authed('sync_push', { p_items: items.map(({ kind, id, ts, data }) => ({ kind, id, ts, data })) });
    S.markPushed(items);
    rt.ping();
    notifyPhones(items);
  }
}
// إشعار بما سجّله الآخرون: بنفس شكل إشعارات الهاتف، وبالنقر ينتقل لما تغيّر
function announce(list) {
  const first = list[0]; const names = [...new Set(list.map((x) => x.by))];
  const many = list.length > 1;
  const go = () => {
    if (!many && first.subId && S.ix().sub.get(first.subId)) return nav.go(`/sub/${first.subId}`);
    if (!many && first.k === 'note') return nav.go('/notes');
    nav.go('/log');
  };
  banner({
    title: names.slice(0, 2).join(' و') + (names.length > 2 ? '…' : ''),
    body: many ? `${list.length} حركات جديدة — آخرها: ${first.text}` : first.text,
    ic: first.k === 'pay' ? 'wallet' : first.k === 'note' ? 'note' : 'bolt',
    onTap: go,
  });
  S.addUnread(list.length);
}
async function pull() {
  const first = !S.syncState().lastPull;
  for (let guard = 0; guard < 40; guard++) {
    const since = S.syncState().lastPull || '1970-01-01T00:00:00Z';
    const r = await authed('sync_pull', { p_since: since });
    if (!r || !r.n) return;
    const res = S.applyRemote(r.items, { notify: !first });
    S.setLastPull(r.cursor);
    if (res.fresh.length) announce(res.fresh);
    if (r.n < 2000) return;
  }
}

/* ───── قناة لحظية (Supabase Realtime Broadcast) ─────
   لا تحمل بيانات: مجرد «إشارة» تُرسل بعد كل دفع ليسحب الآخرون التغيير فورًا. البيانات نفسها تمر عبر الدوال المحمية فقط.
   اسم القناة يتضمن معرّف المساحة العشوائي فلا يعرفه إلا أعضاؤها. إن تعذّرت القناة يعمل الاستطلاع الدوري وحده. */
const rt = (() => {
  let ws = null; let joined = false; let ref = 0; let hb = null; let retry = null; let wait = 1500;
  const topic = () => `realtime:gl-${cfg()?.user?.ws || ''}`;
  const send = (t, event, payload) => { try { ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) })); } catch (e) { /* لا شيء */ } };
  const close = () => { clearInterval(hb); clearTimeout(retry); joined = false; if (ws) { const w = ws; ws = null; w.onclose = null; w.onerror = null; try { w.close(); } catch (e) { /* لا شيء */ } } };
  const open = () => {
    if (ws || !available() || !cfg() || !cfg().user?.ws || document.hidden || typeof WebSocket === 'undefined') return;
    try { ws = new WebSocket(`${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`); } catch (e) { ws = null; return; }
    const me = ws;
    me.onopen = () => {
      send(topic(), 'phx_join', { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [] } });
      hb = setInterval(() => send('phoenix', 'heartbeat', {}), 25000);
    };
    me.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (d.event === 'phx_reply' && d.topic === topic()) { joined = d.payload?.status === 'ok'; if (joined) { wait = 1500; syncNow(); } }
      else if (d.event === 'broadcast') syncNow();
    };
    const lost = () => { if (ws !== me) return; close(); retry = setTimeout(open, wait); wait = Math.min(wait * 2, 30000); };
    me.onclose = lost; me.onerror = lost;
  };
  return {
    open, close,
    get joined() { return joined; },
    ping() { if (joined && ws) send(topic(), 'broadcast', { type: 'broadcast', event: 'ping', payload: {} }); },
  };
})();

let again = false; let skip = 0;
export async function syncNow(opt = {}) {
  if (!available() || !cfg()) return;
  if (st.busy) { again = true; return; }
  st.busy = true;
  if (opt.loud || st.state !== 'ok') set({ state: 'sync', err: '' });
  try {
    await push();
    await pull();
    await push();
    skip = 0;
    st.busy = false; st.at = Date.now();
    set({ state: 'ok', err: '' });
    if (opt.loud) notify();
  } catch (e) {
    st.busy = false;
    if (!expired(e)) { skip = 4; set({ state: 'err', err: friendly(e) }); }
  }
  if (again) { again = false; setTimeout(syncNow, 150); }
}

/* ───── التشغيل التلقائي ───── */
let pushTimer = null; let ticks = 0;
const POLL_MS = 3000; // استطلاع سريع أثناء فتح التطبيق: أي تغيير عند الآخرين يصلك خلال ثوانٍ
const schedulePush = () => {
  if (!cfg() || !available()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 200);
};
export function start() {
  if (!available()) return;
  S.onChange(() => { if (cfg() && S.dirtyItems(1).length) schedulePush(); });
  setInterval(() => {
    if (document.hidden || !cfg()) return;
    if (skip > 0) { skip--; return; }
    ticks++;
    if (!rt.joined || ticks % 4 === 0) syncNow(); // مع القناة اللحظية يكفي استطلاع احتياطي كل 12 ثانية
    if (ticks % 20 === 0) refreshMe();
    if (!rt.joined) rt.open();
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) rt.close(); else { skip = 0; rt.open(); syncNow(); refreshMe(); } });
  window.addEventListener('online', () => { skip = 0; rt.open(); syncNow(); });
  window.addEventListener('offline', () => rt.close());
  rt.open(); refreshMe(); syncNow();
}
