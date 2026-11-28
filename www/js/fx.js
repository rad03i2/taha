// المؤثرات: أصوات نقر وإشعار (تُولَّد بـ WebAudio بلا ملفات) واهتزاز لمسي.
import { settings } from './store.js';

let ctx = null;
const soundOn = () => settings().sound !== false;
const hapticOn = () => settings().haptic !== false;

function ac() {
  if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// نغمة قصيرة بغلاف صوتي ناعم (بلا طقطقة)
function tone(f, at = 0, dur = 0.12, { type = 'sine', vol = 0.06, to = 0, bell = false } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const mk = (freq, v) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  };
  mk(f, vol);
  if (bell) mk(f * 2.01, vol * 0.35);
}

let lastTap = 0;
export const sfx = {
  tap() { if (!soundOn()) return; const n = performance.now(); if (n - lastTap < 45) return; lastTap = n; tone(1500, 0, 0.035, { type: 'triangle', vol: 0.035, to: 1100 }); },
  ok() { if (!soundOn()) return; tone(880, 0, 0.12, { vol: 0.07, bell: true }); tone(1318, 0.09, 0.24, { vol: 0.07, bell: true }); },
  undo() { if (!soundOn()) return; tone(520, 0, 0.1, { type: 'triangle', vol: 0.06, to: 380 }); },
  err() { if (!soundOn()) return; tone(220, 0, 0.14, { type: 'square', vol: 0.03 }); },
  notify() { if (!soundOn()) return; tone(988, 0, 0.16, { vol: 0.08, bell: true }); tone(1319, 0.12, 0.16, { vol: 0.08, bell: true }); tone(1760, 0.24, 0.34, { vol: 0.08, bell: true }); },
  tick(p) { if (!soundOn()) return; tone(420 + p * 560, 0, 0.04, { type: 'triangle', vol: 0.03 }); },
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
