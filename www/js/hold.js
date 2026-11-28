// الضغط المطوّل على شهر المشترك: دائرة تقدّم في منتصف الشاشة تكتمل خلال ثانية واحدة، ثم يُنفَّذ التسديد/الإلغاء.
import { icon } from './ui.js';
import { sfx, haptic } from './fx.js';
import { MONTHS } from './util.js';

const HOLD_MS = 1000;   // مدة الإكمال
const SHOW_AT = 130;    // لا تظهر الدائرة للنقرة السريعة
const SLOP = 14;        // حركة الإصبع المسموحة بالبكسل
const C = 2 * Math.PI * 52;

export const hold = { active: false, justDone: 0 };
let el = null; let st = null; let raf = 0; let lastTick = 0;

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'hold'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="hold-card"><svg viewBox="0 0 120 120"><circle class="hb" cx="60" cy="60" r="52"/><circle class="hf" cx="60" cy="60" r="52" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>
    <div class="hold-in"><span class="hold-ic">${icon('check')}</span><b></b><small></small></div></div>`;
  document.body.appendChild(el);
  return el;
}
const bar = () => el.querySelector('.hf');
const setP = (p) => bar().setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(1));

function frame() {
  if (!st) return;
  const p = Math.min(1, (performance.now() - st.t0) / HOLD_MS);
  if (!st.shown && performance.now() - st.t0 >= SHOW_AT) { st.shown = true; el.classList.add('on'); }
  if (st.shown) {
    setP(p);
    if (performance.now() - lastTick > 110) { lastTick = performance.now(); sfx.tick(p); }
  }
  if (p >= 1) return finish();
  raf = requestAnimationFrame(frame);
}

function finish() {
  const s = st; st = null; hold.active = false; hold.justDone = Date.now();
  cancelAnimationFrame(raf);
  el.classList.add('done');
  setP(1);
  haptic('success'); sfx.ok();
  try { s.onDone(s.info); } catch (e) { /* لا شيء */ }
  setTimeout(() => { el.classList.remove('on', 'done', 'cancel'); setP(0); }, 520);
}

function cancel() {
  if (!st) return;
  st = null; hold.active = false; cancelAnimationFrame(raf);
  if (el) { el.classList.remove('on', 'done'); setP(0); }
}

export function initHold({ info, onDone }) {
  const SEL = '.mt[data-act="tile"]:not([disabled])';
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || st) return;
    const t = e.target.closest(SEL); if (!t) return;
    const i = info(t); if (!i) return; // أشهر لا تقبل الضغط المطوّل
    ensure();
    const { m } = i;
    el.classList.toggle('cancel', i.cancel);
    el.querySelector('b').textContent = MONTHS[m - 1];
    el.querySelector('small').textContent = i.cancel ? 'استمر لإلغاء التسديد' : 'استمر للتسديد';
    el.querySelector('.hold-ic').innerHTML = icon(i.cancel ? 'undo' : 'check');
    setP(0);
    st = { t0: performance.now(), x: e.clientX, y: e.clientY, info: i, onDone, shown: false };
    hold.active = true; lastTick = 0;
    haptic('light');
    raf = requestAnimationFrame(frame);
  });
  document.addEventListener('pointermove', (e) => {
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > SLOP) cancel();
  });
  ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, cancel));
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.mt')) e.preventDefault(); });
  // النقرة التي تلي ضغطة مطوّلة منتهية لا تُعامَل كنقرة عادية
  document.addEventListener('click', (e) => {
    if (Date.now() - hold.justDone < 700 && e.target.closest && e.target.closest('.mt')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}
