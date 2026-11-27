// نقطة الدخول: التوجيه، الرسم، الأحداث، زر الرجوع، المظهر
import { debounce } from './util.js';
import * as S from './store.js';
import { applyDigits, closeSheet, sheetOpen, icon, toast } from './ui.js';
import { nav } from './nav.js';
import { routes, ui, resetViewState, cabinetList, subsList } from './views.js';
import { actions, handleSubmit } from './forms.js';
import * as SY from './sync.js';

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

function renderTabs(active, hidden) {
  $tabs.hidden = hidden;
  $tabs.innerHTML = TABS.map(([k, t, ic, to]) => {
    const badge = k === 'notes' && S.ix().notesOpen ? `<i class="badge">${S.ix().notesOpen}</i>` : '';
    return `<a class="tab ${k === active ? 'on' : ''}" href="#${to}"><span class="tab-ic">${icon(ic)}${badge}</span><span>${t}</span></a>`;
  }).join('');
  applyDigits($tabs);
}

function render(keepScroll) {
  const r = parse();
  const key = `${r.name}/${r.id || ''}`;
  const changed = key !== lastRoute;
  if (changed) { resetViewState(); lastRoute = key; }
  const fn = routes[r.name] || routes.home;
  const y = keepScroll && !changed ? window.scrollY : 0;
  const out = fn({ id: r.id });
  current = out;
  $view.innerHTML = out.html;
  $view.className = `view ${out.bare ? 'bare' : ''}`;
  applyDigits($view);
  renderTabs(out.tab, !!out.bare);
  document.title = 'حسابات المولدة';
  if (changed) window.scrollTo(0, 0); else window.scrollTo(0, y);
  mountLive(out.live);
  applyTheme();
}

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
  }, 120));
}

function applyTheme() {
  const t = S.settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const P = window.Capacitor && window.Capacitor.Plugins;
  try {
    if (P && P.StatusBar) { P.StatusBar.setStyle({ style: 'DARK' }); P.StatusBar.setBackgroundColor({ color: dark ? '#0A1424' : '#0A2342' }); }
  } catch (e) { /* لا شيء */ }
}

/* ───────── الأحداث ───────── */
const ADMIN_ONLY = new Set(['add-gen', 'gen-menu', 'edit-gen', 'edit-phases', 'del-gen', 'add-cab', 'cab-menu', 'del-cab', 'add-sub', 'add-partner', 'edit-sub', 'del-sub', 'edit-conn', 'del-conn', 'add-conn', 'set-price', 'set-currency', 'wipe', 'import-file', 'seed-demo', 'sub-menu', 'conn-menu']);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (!SY.isAdmin() && ADMIN_ONLY.has(el.dataset.act)) return toast('هذه العملية للمدير فقط');
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

window.addEventListener('hashchange', () => { while (closeSheet()); render(false); });
nav.rerender = () => render(true);
S.onChange(() => render(true));

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
  SY.onStatus(() => { if (parse().name === 'more') render(true); });
  render(false);
  SY.start();
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 400); }
  window.__gl = { S, ui, nav, SY }; // للاختبار والتشخيص
})();
