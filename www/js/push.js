// تنبيهات خارج التطبيق (أندرويد): خدمة أصلية في الخلفية تسمع قناة Supabase اللحظية وتعرض إشعارات الهاتف. بلا Firebase.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import * as SY from './sync.js';
import * as S from './store.js';
import { openSheet, closeSheet, icon } from './ui.js';
import { timeAgo } from './util.js';
import { nav } from './nav.js';

const C = () => window.Capacitor;
const native = () => !!(C() && C().isNativePlatform && C().isNativePlatform());
const W = () => C() && C().Plugins && C().Plugins.GLPower;
const esc2 = (s) => s.replace(/[<>&"]/g, '');
export const hasNative = () => native();
export const powerReady = () => native() && !!W();

const watchOn = () => S.settings().watch !== false;

// تشغيل خدمة التنبيهات (بعد الدخول وعند كل فتح للتطبيق). تطلب إذن الإشعارات أول مرة.
export async function startWatch({ ask = true } = {}) {
  if (!powerReady() || !SY.user() || !watchOn()) return 'off';
  try {
    let g = await W().notifState();
    if (!g.granted && ask) g = await W().requestNotif();
    if (!g.granted) return 'denied';
    await W().startWatch({ url: SUPABASE_URL, key: SUPABASE_KEY, token: SY.cfg().token, ws: SY.user().ws, name: SY.user().display });
    return 'ok';
  } catch (e) { console.warn('startWatch', e); return 'error'; }
}
export const stopWatch = () => { try { return W().stopWatch(); } catch (e) { return null; } };

// النقر على إشعار يفتح الشاشة المناسبة
export async function takeRoute() {
  if (!powerReady()) return;
  try { const r = (await W().takeRoute()).route; if (r) nav.go(r); } catch (e) { /* لا شيء */ }
}

export const power = {
  async ignoring() { try { return !!(await W().isIgnoring()).value; } catch (e) { return false; } },
  request: () => W().request(),
  test: () => W().testNotify({ delay: 10 }),
  notifSettings: () => W().notificationSettings(),
  appSettings: () => W().appSettings(),
};

// نافذة تظهر مرة واحدة: السماح للتطبيق بالعمل في الخلفية دون تقييد البطارية
export async function askPowerOnce() {
  if (!powerReady() || !SY.user()) return;
  try { if (localStorage.getItem('gl.powerAsked')) return; } catch (e) { return; }
  if (await power.ignoring()) { try { localStorage.setItem('gl.powerAsked', '1'); } catch (e) { /* لا شيء */ } return; }
  const w = openSheet(`<h3 class="sh-title">وصول التنبيهات بسرعة</h3>
    <p class="muted pad-b">لتصلك تنبيهات التسديد والملاحظات فورًا حتى والتطبيق مغلق أو الهاتف في وضع توفير البطارية، اسمح للتطبيق بالعمل في الخلفية دون تقييد.</p>
    <button class="btn primary block lg" data-go>${icon('battery')}السماح الآن</button>
    <button class="btn ghost block" data-later>لاحقًا</button>`);
  const done = () => { try { localStorage.setItem('gl.powerAsked', '1'); } catch (e) { /* لا شيء */ } closeSheet(); };
  w.querySelector('[data-go]').onclick = () => { done(); power.request(); };
  w.querySelector('[data-later]').onclick = done;
}

// بطاقة الإعدادات في «المزيد»
export async function pushCardHtml() {
  if (!powerReady()) return '';
  const ign = await power.ignoring();
  let granted = false; try { granted = !!(await W().notifState()).granted; } catch (e) { /* لا شيء */ }
  const on = watchOn();
  let st = {}; try { st = await W().watchStatus(); } catch (e) { /* إصدار قديم */ }
  const err = String(st.status || '').startsWith('err:');
  const chip = (ok, t) => `<span class="chip ${ok ? 'paid' : 'debt'}">${t}</span>`;
  const diag = !on ? '' : [
    chip(!!st.running, st.running ? 'الخدمة تعمل' : 'الخدمة غير شغّالة'),
    chip(!!st.live, st.live ? 'اتصال لحظي' : 'لا اتصال لحظي بعد'),
    st.notifEnabled === false ? chip(false, 'الإشعارات معطّلة من إعدادات الهاتف') : '',
    st.chan === 0 ? chip(false, 'قناة التنبيهات محجوبة') : (st.chan > 0 && st.chan < 4 ? chip(false, 'قناة التنبيهات بلا صوت/ظهور') : ''),
    st.last ? chip(!err, err ? `خطأ في الفحص: ${esc2(String(st.status).slice(4, 60))}` : `آخر فحص ${timeAgo(st.last)}`) : '',
  ].join('');
  return `<div class="card sync">
    <div class="sync-h">${icon('bell')}<div><b>التنبيهات خارج التطبيق</b><small>تصلك على الهاتف حتى والتطبيق مغلق</small></div></div>
    <div class="sync-st">${chip(on, on ? 'مفعّلة' : 'متوقفة')}${diag}${chip(granted, granted ? 'إذن الإشعارات ممنوح' : 'إذن الإشعارات غير ممنوح')}${chip(ign, ign ? 'يعمل دون تقييد البطارية' : 'البطارية قد تؤخّر التنبيهات')}</div>
    <div class="btn-row"><button class="btn soft" data-act="watch-toggle">${icon('bell')}${on ? 'إيقاف' : 'تفعيل'}</button><button class="btn soft" data-act="power-request">${icon('battery')}البطارية</button></div>
    ${on && st.events ? `<div class="evlog">${st.events.split('\n').slice(0, 8).map((x) => esc2(x)).join('<br>')}</div>` : ''}
    ${on ? `<div class="btn-row"><button class="btn soft" data-act="notif-test">${icon('bell')}إشعار تجريبي بعد 10 ثوانٍ</button></div>` : ''}
    ${on ? `<div class="btn-row"><button class="btn soft" data-act="watch-restart">${icon('clock')}إعادة تشغيل الخدمة وفحص الآن</button></div>` : ''}
    <div class="btn-row"><button class="btn soft" data-act="notif-settings">إعدادات إشعارات الهاتف</button><button class="btn soft" data-act="app-settings">إعدادات التطبيق</button></div>
  </div>`;
}
