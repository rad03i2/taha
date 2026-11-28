// تحديث التطبيق من GitHub Releases: يبحث عن إصدار أحدث، ينزّل ملف APK ثم يفتح مثبّت أندرويد.
import { BUILD } from './version.js';

const REPO = 'rad03i2/taha';
const C = () => window.Capacitor;
const native = () => !!(C() && C().isNativePlatform && C().isNativePlatform());
const W = () => C() && C().Plugins && C().Plugins.GLPower;
export const canInstallNative = () => native() && !!W();
export const currentBuild = () => BUILD;

// يرجع معلومات آخر إصدار منشور ومقارنته بالإصدار المثبّت
export async function checkUpdate() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  const build = parseInt(String(j.tag_name || '').replace(/\D/g, ''), 10) || 0;
  const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
  return { build, newer: !!apk && build > BUILD, url: apk ? apk.browser_download_url : '', size: apk ? apk.size : 0, notes: String(j.body || '').trim(), at: j.published_at };
}

// تنزيل ثم تثبيت. onProgress(pct). يرجع 'installing' أو 'permission' (المستخدم يحتاج السماح بالتثبيت ثم يعيد الضغط)
export async function downloadAndInstall(url, onProgress) {
  if (!canInstallNative()) { window.open(url, '_blank'); return 'external'; }
  const h = await W().addListener('updateProgress', (e) => onProgress && onProgress(e.pct));
  try { await W().downloadApk({ url }); } finally { try { h.remove(); } catch (e) { /* لا شيء */ } }
  return install();
}
export async function install() {
  const r = await W().installApk();
  return r.needPermission ? 'permission' : 'installing';
}

// فحص تلقائي هادئ عند فتح التطبيق (مرة كل 6 ساعات)
export async function silentCheck() {
  try {
    const last = +localStorage.getItem('gl.updChk') || 0;
    if (Date.now() - last < 6 * 3600 * 1000) return null;
    localStorage.setItem('gl.updChk', String(Date.now()));
    const u = await checkUpdate();
    return u.newer ? u : null;
  } catch (e) { return null; }
}
