// نقطة الدخول: التوجيه، الرسم، الأحداث، زر الرجوع، المظهر
import { debounce } from './util.js';
import * as S from './store.js';
import { applyDigits, closeSheet, sheetOpen, icon, toast } from './ui.js';
import { nav } from './nav.js';
import { routes, ui, resetViewState, cabinetList, subsList, loginView, syncCard } from './views.js';
import { actions, handleSubmit, holdInfo, holdDone } from './forms.js';
import * as SY from './sync.js';
import { initHold, hold } from './hold.js';
import { unlockAudio, wireTapSounds } from './fx.js';

const $view = document.getElementById('view');
const $tabs = document.getElementById('tabbar');
const TABS = [['home', 'الرئيسية', 'home', '/home'], ['subs', 'المشتركون', 'users', '/subs'], ['debts', 'الديون', 'wallet', '/debts'], ['notes', 'الملاحظات', 'note', '/notes'], ['more', 'المزيد', 'sliders', '/more']];
const ROOTS = new Set(['home', 'subs', 'debts', 'notes', 'more', '']);

function parse() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  return { name: name || 'home', id };
}

let lastRoute = '';
let current = null;
const scrolls = new Map(); const trail = [];
function renderTabs(active, hidden) {
  $tabs.hidden = hidden;
  $tabs.innerHTML = TABS.map(([k, t, ic, to]) => {
    const nb = k === 'notes' ? S.ix().notesOpen : k === 'more' ? S.unread() : 0;
    const badge = nb ? `<i class="badge">${nb}</i>` : '';
    return `<a class="tab ${k === active ? 'on' : ''}" href="#${to}"><span class="tab-ic">${icon(ic)}${badge}</span><span>${t}</span></a>`;
  }).join('');
  applyDigits($tabs);
}

function render(keepScroll) {
  const r = parse();
  const key = `${r.name}/${r.id || ''}`;
  const changed = key !== lastRoute;
  let y = keepScroll && !changed ? window.scrollY : 0;
  if (changed) {
    // العودة لصفحة سابقة تستعيد موضع التمرير فيها
    if (lastRoute) scrolls.set(lastRoute, window.scrollY);
    const back = trail.length > 1 && trail[trail.length - 2] === key;
    if (back) { trail.pop(); y = scrolls.get(key) || 0; } else { trail.push(key); if (trail.length > 60) trail.shift(); }
    resetViewState(); lastRoute = key;
  }
  const gate = SY.gateRequired();
  const fn = gate ? loginView : routes[r.name] || routes.home;
  if (!gate && r.name === 'log') S.clearUnread();
  const out = fn({ id: r.id });
  current = out;
  $view.innerHTML = out.html;
  $view.className = `view ${out.bare ? 'bare' : ''} ${changed ? 'enter' : ''}`;
  applyDigits($view);
  renderTabs(out.tab, !!out.bare);
  document.title = 'حسابات المولدة';
  window.scrollTo(0, y);
  mountLive(out.live);
  if (out.live === 'team' && !SY.teamList()) SY.loadTeam();
  applyTheme();
}

// دمج التحديثات المتتابعة في رسم واحد، وتأجيلها أثناء الكتابة أو الضغط المطوّل حتى لا تضيع لمسة المستخدم
let rafId = 0; let wantKeep = true; let wantSoft = true; let deferred = false;
const typing = () => { const a = document.activeElement; return !!(a && $view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
// soft=true للتحديثات القادمة من المزامنة: تُؤجَّل أثناء الكتابة أو الضغط المطوّل. أما أفعال المستخدم نفسه فتُرسم فورًا.
function schedule(keep = true, soft = false) {
  wantKeep = wantKeep && keep; wantSoft = wantSoft && soft;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0; const k = wantKeep; const sf = wantSoft; wantKeep = true; wantSoft = true;
    if (k && sf && (hold.active || typing())) { deferred = true; return; }
    deferred = false; render(k);
  });
}
const flushDeferred = () => setTimeout(() => { if (deferred && !hold.active && !typing()) schedule(true, false); }, 450);
document.addEventListener('focusout', flushDeferred);
document.addEventListener('pointerup', flushDeferred);

function mountLive(kind) {
  if (!kind) return;
  const q = document.getElementById('q');
  const list = document.getElementById('list');
  if (kind === 'import') {
    const ta = document.getElementById('imp-text'); const prev = document.getElementById('imp-prev');
    if (ta) ta.addEventListener('input', () => {
      const { rows, bad } = S.parseQuick(ta.value);
      prev.innerHTML = ta.value.trim() ? `<span class="chip paid">${rows.length} سطر صالح</span>${bad.length ? `<span class="chip debt">${bad.length} غير مفهوم</span>` : ''}` : '';
      applyDigits(prev);
    });
    return;
  }
  if (!q || !list) return;
  q.addEventListener('input', debounce(() => {
    ui.q = q.value; ui.limit = 60;
    list.innerHTML = kind === 'cab' ? cabinetList(list.dataset.cab) : subsList();
    applyDigits(list);
  }, 70));
}

function applyTheme() {
  const t = S.settings().theme;
  try { localStorage.setItem('gl.theme', t); } catch (e) { /* لا شيء */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const P = window.Capacitor && window.Capacitor.Plugins;
  try {
    if (P && P.StatusBar) { P.StatusBar.setStyle({ style: 'DARK' }); P.StatusBar.setBackgroundColor({ color: dark ? '#0A1424' : '#0A2342' }); }
  } catch (e) { /* لا شيء */ }
}

/* ───────── الأحداث ───────── */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (el.dataset.close && sheetOpen()) { const snap = { dataset: { ...el.dataset } }; closeSheet(); setTimeout(() => fn(snap), 230); return; }
  fn(el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'prompt') { const fd = new FormData(f); const ok = f._save(fd.get('v')); if (ok !== false) closeSheet(); return; }
  handleSubmit(f);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const inp = b.parentElement.querySelector('input');
  const v = parseFloat(String(inp.value).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632)) || 0;
  inp.value = Math.max(0.5, Math.round((v + Number(b.dataset.step)) * 2) / 2);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

window.addEventListener('hashchange', () => { while (closeSheet()); cancelAnimationFrame(rafId); rafId = 0; render(false); });
nav.rerender = () => schedule(true);
S.onChange((src) => schedule(true, src === 'remote'));

/* ───────── أندرويد: زر الرجوع ───────── */
function wireNative() {
  const C = window.Capacitor; const P = C && C.Plugins;
  if (!(C && C.isNativePlatform && C.isNativePlatform() && P && P.App)) return;
  let lastBack = 0;
  P.App.addListener('backButton', () => {
    if (closeSheet()) return;
    const r = parse();
    if (!ROOTS.has(r.name)) return history.back();
    if (r.name !== 'home' && r.name !== '') return nav.go('/home');
    const now = Date.now();
    if (now - lastBack < 1800) return P.App.exitApp();
    lastBack = now; toast('اضغط رجوع مرة أخرى للخروج');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) S.flush(); });
  P.App.addListener('pause', () => S.flush());
}

(async function boot() {
  await S.load();
  if (!location.hash) history.replaceState(null, '', '#/home');
  wireNative();
  unlockAudio(); wireTapSounds();
  initHold({ info: holdInfo, onDone: holdDone });
  SY.onStatus(() => {
    // بطاقة المزامنة تُحدَّث في مكانها دون إعادة رسم الصفحة
    const slot = document.getElementById('sync-slot');
    if (slot) { slot.innerHTML = syncCard(); applyDigits(slot); }
    if (parse().name === 'team' || SY.gateRequired() || document.querySelector('.welcome, .login')) schedule(true);
  });
  render(false);
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 260); }
  setTimeout(() => SY.start(), 250); // بعد أول رسم: لا نؤخر ظهور الشاشة
  window.__gl = { S, ui, nav, SY }; // للاختبار والتشخيص
})();
