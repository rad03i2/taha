// إشعارات الهاتف خارج التطبيق (FCM عبر @capacitor/push-notifications) واستثناء البطارية (إضافة GLPower الأصلية).
import { PUSH } from './config.js';
import * as SY from './sync.js';
import { openSheet, closeSheet, icon } from './ui.js';
import { nav } from './nav.js';

const C = () => window.Capacitor;
const native = () => !!(C() && C().isNativePlatform && C().isNativePlatform());
const PN = () => C() && C().Plugins && C().Plugins.PushNotifications;
const W = () => C() && C().Plugins && C().Plugins.GLPower;
export const hasNative = () => native();
export const pushReady = () => PUSH && native() && !!PN();
export const powerReady = () => native() && !!W();

let wired = false;
export async function enablePush({ ask = true } = {}) {
  if (!pushReady() || !SY.user()) return 'unsupported';
  const p = PN();
  try {
    let perm = await p.checkPermissions();
    if (perm.receive !== 'granted') { if (!ask) return 'denied'; perm = await p.requestPermissions(); }
    if (perm.receive !== 'granted') return 'denied';
    // قناة بأعلى أهمية: صوت وهتز وظهور فوق الشاشة (heads-up)
    await p.createChannel({ id: 'gl-alerts', name: 'تنبيهات المولدة', description: 'التسديد والملاحظات وحركات الفريق', importance: 5, visibility: 1, vibration: true, lights: true });
    if (!wired) {
      wired = true;
      p.addListener('registration', (t) => { try { localStorage.setItem('gl.fcm', t.value); } catch (e) { /* لا شيء */ } SY.registerPush(t.value); });
      p.addListener('registrationError', (e) => console.warn('push registration error', e));
      p.addListener('pushNotificationActionPerformed', (a) => {
        const d = (a.notification && a.notification.data) || {};
        nav.go(d.subId ? `/sub/${d.subId}` : d.k === 'note' ? '/notes' : '/log');
      });
    }
    await p.register();
    return 'ok';
  } catch (e) { console.warn('enablePush', e); return 'error'; }
}

export const power = {
  async ignoring() { try { return !!(await W().isIgnoring()).value; } catch (e) { return false; } },
  request: () => W().request(),
  notifSettings: () => W().notificationSettings(),
  appSettings: () => W().appSettings(),
};

// نافذة تظهر مرة واحدة: السماح للتطبيق بالعمل في الخلفية دون تقييد البطارية ليصل الإشعار بسرعة
export async function askPowerOnce() {
  if (!powerReady() || !SY.user()) return;
  try { if (localStorage.getItem('gl.powerAsked')) return; } catch (e) { return; }
  if (await power.ignoring()) { try { localStorage.setItem('gl.powerAsked', '1'); } catch (e) { /* لا شيء */ } return; }
  const w = openSheet(`<h3 class="sh-title">وصول الإشعارات بسرعة</h3>
    <p class="muted pad-b">لتصلك إشعارات التسديد والملاحظات فورًا حتى والتطبيق مغلق أو الهاتف في وضع توفير البطارية، اسمح للتطبيق بالعمل في الخلفية دون تقييد.</p>
    <button class="btn primary block lg" data-go>${icon('battery')}السماح الآن</button>
    <button class="btn ghost block" data-later>لاحقًا</button>`);
  const done = () => { try { localStorage.setItem('gl.powerAsked', '1'); } catch (e) { /* لا شيء */ } closeSheet(); };
  w.querySelector('[data-go]').onclick = () => { done(); power.request(); };
  w.querySelector('[data-later]').onclick = done;
}

// بطاقة الإعدادات في «المزيد»
export async function pushCardHtml() {
  if (!native()) return '';
  const ign = powerReady() ? await power.ignoring() : false;
  const chip = (ok, t) => `<span class="chip ${ok ? 'paid' : 'debt'}">${t}</span>`;
  return `<div class="card sync">
    <div class="sync-h">${icon('bell')}<div><b>الإشعارات خارج التطبيق</b><small>تصلك على الهاتف حتى والتطبيق مغلق</small></div></div>
    <div class="sync-st">${chip(pushReady(), pushReady() ? 'الإشعارات مفعّلة في هذا الإصدار' : 'غير مفعّلة في هذا الإصدار')}${powerReady() ? chip(ign, ign ? 'يعمل في الخلفية دون تقييد' : 'البطارية قد تؤخّر الإشعارات') : ''}</div>
    <div class="btn-row">${pushReady() ? `<button class="btn soft" data-act="push-enable">${icon('bell')}تفعيل</button>` : ''}${powerReady() ? `<button class="btn soft" data-act="power-request">${icon('battery')}البطارية</button>` : ''}</div>
    ${powerReady() ? `<div class="btn-row"><button class="btn soft" data-act="notif-settings">إعدادات إشعارات الهاتف</button><button class="btn soft" data-act="app-settings">إعدادات التطبيق</button></div>` : ''}
  </div>`;
}
