// مكوّنات الواجهة المشتركة: أيقونات، نوافذ سفلية، إشعارات، أرقام
import { esc, fmtNum, CUR } from './util.js';
import { settings } from './store.js';
import { sfx, haptic } from './fx.js';

const P = {
  home: '<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8"/><path d="M10 20v-5.2h4V20"/>',
  users: '<circle cx="9" cy="8.2" r="3.3"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><circle cx="17.2" cy="9.2" r="2.4"/><path d="M16.6 14.4c2.4.2 4 1.7 4.4 4.4"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3.2"/><path d="M3 10.2h18"/><circle cx="16.6" cy="14.6" r="1.2" fill="currentColor"/>',
  note: '<path d="M6.5 3.5h8.2l3.8 3.8V19a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8.5 11.5h7M8.5 15.5h5"/>',
  sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.3"/><circle cx="8" cy="17" r="2.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  back: '<path d="m9 5 7 7-7 7"/>',
  next: '<path d="m15 5-7 7 7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.4 4.4L19 7.4"/>',
  bolt: '<path d="M13.2 2.5 5.2 13.6h5.6l-1 7.9 8-11.1h-5.6z" fill="currentColor"/>',
  phone: '<path d="M6.6 3.5h2.8l1.5 4-2 1.6a11 11 0 0 0 5.3 5.3l1.6-2 4 1.5v2.8a2 2 0 0 1-2.1 2A15.5 15.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"/>',
  edit: '<path d="M4 20h4L19.2 8.8a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7"/><path d="M10 11v5M14 11v5"/>',
  box: '<rect x="4" y="3.5" width="16" height="17" rx="2.6"/><path d="M12 3.5v17"/><circle cx="9.3" cy="12" r=".9" fill="currentColor"/><circle cx="14.7" cy="12" r=".9" fill="currentColor"/>',
  gen: '<rect x="3" y="8" width="18" height="10" rx="2.4"/><path d="M7 8V5.2h10V8M7.5 18v2M16.5 18v2"/><path d="m12.6 10.6-2 3h3l-2 3" />',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6V12l3 2"/>',
  cloud: '<path d="M7.2 18.2a4.4 4.4 0 0 1-.6-8.8 6 6 0 0 1 11.3 1.6 3.6 3.6 0 0 1-.9 7.2z"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
  upload: '<path d="M12 15.5V4.5M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  alert: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.2M12 17h.01"/>',
  cut: '<path d="M4 12h5l2-5 2 10 2-5h5"/>',
  user: '<circle cx="12" cy="8.3" r="3.6"/><path d="M5 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  hash: '<path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h15.5M4 15h15.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1"/>',
  more: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="17.5" r=".9" fill="currentColor"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a4.5 4.5 0 0 1 0 9H11"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2.4"/><path d="M7 14h10v6H7z"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.2 6.2a1.4 1.4 0 0 1-2 0z"/><circle cx="8.3" cy="8.3" r="1.3" fill="currentColor"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2.4"/><path d="M21 11v3"/><path d="M8 11v3M12 11v3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  vibrate: '<rect x="8" y="3.5" width="8" height="17" rx="2.4"/><path d="M4.5 8v8M19.5 8v8"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

/* ───────── الأرقام ───────── */
// الأرقام لاتينية دائمًا؛ تُبقى الدالة لأن الشاشات تستدعيها
export function applyDigits() {}
export const money = (n) => `${fmtNum(n)} ${CUR}`;
export const moneyShort = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e6) return `${fmtNum(n / 1e6)} مليون`;
  if (a >= 1e4) return `${fmtNum(n / 1e3)} ألف`;
  return fmtNum(n);
};

/* ───────── الإشعارات ───────── */
let toastEl = null; let toastTimer = null;
export const hideToast = () => { clearTimeout(toastTimer); if (toastEl) toastEl.classList.remove('show'); };
export function toast(msg, opt = {}) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
  toastEl.innerHTML = `<span>${esc(msg)}</span>${opt.undo ? `<button class="toast-undo" type="button">${icon('undo')}تراجع</button>` : ''}${opt.extra ? `<button class="toast-undo toast-extra" type="button">${icon(opt.extra.ic)}${esc(opt.extra.label)}</button>` : ''}`;
  applyDigits(toastEl);
  const btn = toastEl.querySelector('.toast-undo');
  if (btn) btn.onclick = () => { clearTimeout(toastTimer); toastEl.classList.remove('show'); opt.undo(); };
  const ex = toastEl.querySelector('.toast-extra');
  if (ex) ex.onclick = () => { clearTimeout(toastTimer); toastEl.classList.remove('show'); opt.extra.fn(); };
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), opt.undo || opt.extra ? 6500 : 2400);
  if (opt.undo && !opt.quiet) { haptic('light'); sfx.ok(); }
}

/* ───────── إشعار داخلي بشكل إشعارات آيفون ───────── */
let nb = null; let nbTimer = null; let nbTap = null;
const hideNb = () => { clearTimeout(nbTimer); if (nb) nb.classList.remove('show'); };
export function banner({ title, body, ic = 'bolt', onTap, silent = false }) {
  if (!nb) {
    nb = document.createElement('div'); nb.className = 'nb'; nb.setAttribute('role', 'status');
    document.body.appendChild(nb);
    let y0 = 0; let dy = 0; let down = false;
    nb.addEventListener('pointerdown', (e) => { down = true; y0 = e.clientY; dy = 0; clearTimeout(nbTimer); nb.style.transition = 'none'; });
    nb.addEventListener('pointermove', (e) => { if (!down) return; dy = Math.min(0, e.clientY - y0); nb.style.transform = `translate(-50%, ${dy}px)`; });
    const end = () => {
      if (!down) return; down = false; nb.style.transition = ''; nb.style.transform = '';
      if (dy < -28) return hideNb();
      if (Math.abs(dy) < 6 && nbTap) { const f = nbTap; hideNb(); f(); return; }
      nbTimer = setTimeout(hideNb, 2500);
    };
    nb.addEventListener('pointerup', end); nb.addEventListener('pointercancel', end);
  }
  nbTap = onTap || null;
  nb.innerHTML = `<div class="nb-ic">${icon(ic)}</div><div class="nb-t"><div class="nb-h"><b>${esc(title)}</b><small>الآن</small></div><p>${esc(body)}</p></div>`;
  applyDigits(nb);
  nb.classList.remove('show'); void nb.offsetWidth; nb.classList.add('show');
  clearTimeout(nbTimer); nbTimer = setTimeout(hideNb, 5000);
  if (!silent) { sfx.notify(); haptic('success'); }
}

/* ───────── النوافذ السفلية ───────── */
const stack = [];
export function openSheet(html, { onMount, tall } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet${tall ? ' tall' : ''}" role="dialog"><div class="grab"></div><div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  applyDigits(wrap);
  stack.push(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  if (onMount) onMount(wrap);
  const f = wrap.querySelector('[autofocus]');
  if (f) setTimeout(() => f.focus(), 280);
  return wrap;
}
export function closeSheet() {
  const wrap = stack.pop();
  if (!wrap) return false;
  wrap.classList.remove('in');
  setTimeout(() => wrap.remove(), 220);
  if (!stack.length) document.body.classList.remove('noscroll');
  return true;
}
export const sheetOpen = () => stack.length > 0;
export const closeAllSheets = () => { while (closeSheet()); };

export function confirmBox({ title, text, ok = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const wrap = openSheet(`
      <h3 class="sh-title">${esc(title)}</h3>
      ${text ? `<p class="muted pad-b">${esc(text)}</p>` : ''}
      <div class="btn-row">
        <button class="btn ${danger ? 'danger' : 'primary'} grow" data-yes type="button">${esc(ok)}</button>
        <button class="btn ghost grow" data-no type="button">إلغاء</button>
      </div>`);
    const fin = (v) => { if (done) return; done = true; closeSheet(); resolve(v); };
    wrap.querySelector('[data-yes]').onclick = () => fin(true);
    wrap.querySelector('[data-no]').onclick = () => fin(false);
    wrap.querySelector('.scrim').addEventListener('click', () => { if (!done) { done = true; resolve(false); } });
  });
}

/* ───────── مكوّنات صغيرة ───────── */
export const ring = (pct, size = 76, label = '') => {
  const r = (size - 10) / 2; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, pct || 0));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><b>${label || Math.round(p * 100) + '%'}</b></div>`;
};
export const bar = (pct, tone = '') => `<div class="bar ${tone}"><i style="width:${Math.round(Math.max(0, Math.min(1, pct || 0)) * 100)}%"></i></div>`;
export const empty = (ic, title, text, action = '') => `<div class="empty">${icon(ic, 'big')}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const chip = (k, text) => `<span class="chip ${k}">${esc(text)}</span>`;
