// أدوات مساعدة عامة: معرّفات، تهريب نصوص، تواريخ الأشهر، تنسيق الأرقام
// العملة ثابتة: الدينار العراقي
export const CUR = 'د.ع';

export const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

export const pad = (n) => String(n).padStart(2, '0');
export const ymOf = (y, m) => `${y}-${pad(m)}`;
export const ymNow = () => { const d = new Date(); return ymOf(d.getFullYear(), d.getMonth() + 1); };
export const ymParse = (s) => { const [y, m] = String(s).split('-').map(Number); return { y, m }; };
export const ymIdx = (s) => { const { y, m } = ymParse(s); return y * 12 + m - 1; };
export const ymFromIdx = (i) => ymOf(Math.floor(i / 12), (i % 12) + 1);
export const ymAdd = (s, n) => ymFromIdx(ymIdx(s) + n);
export const ymLabel = (s) => { const { y, m } = ymParse(s); return `${MONTHS[m - 1]} ${y}`; };
export const ymRange = (a, b) => { const r = []; for (let i = ymIdx(a); i <= ymIdx(b); i++) r.push(ymFromIdx(i)); return r; };

// تحويل الأرقام العربية/الفارسية إلى لاتينية للتحليل
export const normDigits = (s) =>
  String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٫،]/g, '.')
    .replace(/٬/g, '');
export const parseNum = (s) => { const n = parseFloat(normDigits(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

export const fmtNum = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const timeAgo = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'أمس';
  if (d < 30) return `قبل ${d} يوم`;
  return new Date(ts).toLocaleDateString('en-GB');
};

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
