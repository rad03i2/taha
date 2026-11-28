// المؤثرات: أصوات نقر وإشعار (تُولَّد بـ WebAudio بلا ملفات) واهتزاز لمسي. للأنماط خيارات متعددة تُختار من شاشة «الأصوات».
import { settings } from './store.js';

let ctx = null;
const soundOn = () => settings().sound !== false;
const hapticOn = () => settings().haptic !== false;
const gainK = () => Math.max(0.05, Math.min(1.25, (settings().volume ?? 0.8) / 0.8));

function ac() {
  if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// نغمة قصيرة بغلاف صوتي ناعم (بلا طقطقة)
function tone(f, at = 0, dur = 0.12, { type = 'sine', vol = 0.06, to = 0, bell = false } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at; const v0 = vol * gainK();
  const mk = (freq, v) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  };
  mk(f, v0);
  if (bell) mk(f * 2.01, v0 * 0.35);
}

/* ───── الأنماط ───── */
export const GROUPS = {
  touch: {
    key: 'sndTouch', title: 'صوت اللمس', def: 'soft',
    list: [
      { id: 'soft', t: 'ناعم', d: 'نقرة خفيفة هادئة' },
      { id: 'pop', t: 'فقاعة', d: 'فقاعة قصيرة مرحة' },
      { id: 'wood', t: 'خشبي', d: 'طَقّة خشب دافئة' },
      { id: 'click', t: 'نقرة حادة', d: 'كزر ميكانيكي' },
      { id: 'bell', t: 'جرس صغير', d: 'رنّة رقيقة' },
      { id: 'zap', t: 'كهرباء', d: 'شرارة قصيرة تناسب المولدة' },
      { id: 'off', t: 'بدون صوت لمس', d: 'تبقى أصوات النجاح والإشعار' },
    ],
  },
  done: {
    key: 'sndDone', title: 'صوت النجاح', def: 'cheer',
    list: [
      { id: 'cheer', t: 'نجاح', d: 'نغمتان صاعدتان' },
      { id: 'coin', t: 'عملة', d: 'رنّة نقود سريعة' },
      { id: 'magic', t: 'سحري', d: 'سلّم نغمات صاعد' },
    ],
  },
  notify: {
    key: 'sndNotify', title: 'صوت الإشعار داخل التطبيق', def: 'chime',
    list: [
      { id: 'chime', t: 'ثلاثي', d: 'ثلاث نغمات صاعدة' },
      { id: 'ding', t: 'دينغ', d: 'نغمتان هادئتان' },
      { id: 'bell', t: 'جرس', d: 'رنّة جرس طويلة' },
      { id: 'alert', t: 'تنبيه سريع', d: 'ثلاث نبضات قصيرة' },
    ],
  },
};

const PLAY = {
  touch: {
    soft: () => tone(1500, 0, 0.035, { type: 'triangle', vol: 0.035, to: 1100 }),
    pop: () => tone(320, 0, 0.07, { vol: 0.07, to: 760 }),
    wood: () => { tone(190, 0, 0.05, { type: 'triangle', vol: 0.09, to: 120 }); tone(380, 0, 0.03, { type: 'sine', vol: 0.04 }); },
    click: () => tone(2400, 0, 0.012, { type: 'square', vol: 0.022 }),
    bell: () => tone(1760, 0, 0.14, { vol: 0.045, bell: true }),
    zap: () => tone(1100, 0, 0.055, { type: 'sawtooth', vol: 0.025, to: 260 }),
    off: () => {},
  },
  done: {
    cheer: () => { tone(880, 0, 0.12, { vol: 0.07, bell: true }); tone(1318, 0.09, 0.24, { vol: 0.07, bell: true }); },
    coin: () => { tone(1568, 0, 0.07, { type: 'square', vol: 0.03 }); tone(2093, 0.07, 0.3, { type: 'square', vol: 0.03 }); },
    magic: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.075, 0.2, { vol: 0.06, bell: true })),
  },
  notify: {
    chime: () => { tone(988, 0, 0.16, { vol: 0.08, bell: true }); tone(1319, 0.12, 0.16, { vol: 0.08, bell: true }); tone(1760, 0.24, 0.34, { vol: 0.08, bell: true }); },
    ding: () => { tone(1319, 0, 0.2, { vol: 0.08, bell: true }); tone(1047, 0.16, 0.36, { vol: 0.08, bell: true }); },
    bell: () => tone(1568, 0, 0.9, { vol: 0.09, bell: true }),
    alert: () => [0, 0.14, 0.28].forEach((t) => tone(1200, t, 0.08, { type: 'triangle', vol: 0.08 })),
  },
};
const pick = (g) => (PLAY[g][settings()[GROUPS[g].key]] ? settings()[GROUPS[g].key] : GROUPS[g].def);

let lastTap = 0;
export const sfx = {
  tap() { if (!soundOn()) return; const n = performance.now(); if (n - lastTap < 45) return; lastTap = n; PLAY.touch[pick('touch')](); },
  ok() { if (soundOn()) PLAY.done[pick('done')](); },
  undo() { if (soundOn()) tone(520, 0, 0.1, { type: 'triangle', vol: 0.06, to: 380 }); },
  err() { if (soundOn()) tone(220, 0, 0.14, { type: 'square', vol: 0.03 }); },
  notify() { if (soundOn()) PLAY.notify[pick('notify')](); },
  tick(p) { if (soundOn() && pick('touch') !== 'off') tone(420 + p * 560, 0, 0.04, { type: 'triangle', vol: 0.03 }); },
  // معاينة نمط من الشاشة (تُشغَّل حتى لو كان الصوت العام موقوفًا)
  preview(group, id) { if (PLAY[group] && PLAY[group][id]) PLAY[group][id](); },
};

export function haptic(kind = 'light') {
  if (!hapticOn()) return;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) {
      if (kind === 'success') return void H.notification({ type: 'SUCCESS' });
      if (kind === 'warn') return void H.notification({ type: 'WARNING' });
      return void H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
    }
    if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [14, 50, 22] : kind === 'warn' ? [30, 40, 30] : kind === 'medium' ? 18 : 8);
  } catch (e) { /* لا شيء */ }
}

// تفعيل الصوت عند أول لمسة (متصفحات/WebView تمنعه قبل ذلك)
export function unlockAudio() {
  const go = () => { ac(); document.removeEventListener('pointerdown', go, true); };
  document.addEventListener('pointerdown', go, true);
}

// صوت نقر موحّد لكل عنصر تفاعلي
const TAPPABLE = 'button, a[href], [data-act], .tab, label.mchip, label.tchip';
export function wireTapSounds() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest(TAPPABLE);
    if (!t || t.disabled || t.dataset.silent) return;
    sfx.tap();
  }, true);
}
