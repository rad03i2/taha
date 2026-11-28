// رسم الوصولات صورةً (384 نقطة = عرض الطباعة في ورق 58 ملم) بخط Cairo، لتُحوَّل إلى أوامر ESC/POS وتُطبع على الطابعة الحرارية.
import * as S from './store.js';
import { fmtNum, ymLabel, ymNow, ymParse, MONTHS, CUR } from './util.js';

export const W = 384;
const M = 12;
const FONT = (w, s) => `${w} ${s}px Cairo, "Noto Sans Arabic", sans-serif`;
const p2 = (n) => String(n).padStart(2, '0');
const dateStr = (ts) => { const d = new Date(ts); return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`; };
const timeStr = (ts) => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const money = (n) => `${fmtNum(n)} ${CUR}`;
const BOLT = 'M13.2 2.5 5.2 13.6h5.6l-1 7.9 8-11.1h-5.6z';

export async function loadFonts() {
  try { await Promise.all([document.fonts.load(FONT(500, 22), 'مرحبا 0123'), document.fonts.load(FONT(700, 22), 'مرحبا 0123'), document.fonts.load(FONT(800, 22), 'مرحبا 0123')]); } catch (e) { /* نكمل بالخط البديل */ }
}

class Doc {
  constructor() {
    this.H = 4200;
    this.c = document.createElement('canvas'); this.c.width = W; this.c.height = this.H;
    this.x = this.c.getContext('2d', { willReadFrequently: true });
    this.x.fillStyle = '#fff'; this.x.fillRect(0, 0, W, this.H);
    this.x.fillStyle = '#000'; this.x.strokeStyle = '#000';
    this.x.direction = 'rtl'; this.x.textBaseline = 'alphabetic';
    this.y = 6;
  }
  gap(n = 8) { this.y += n; return this; }
  font(w, s) { this.x.font = FONT(w, s); }
  width(str, w, s) { this.font(w, s); return this.x.measureText(str).width; }
  wrap(str, w, s, max) {
    this.font(w, s);
    const words = String(str).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
    for (const wd of words) {
      const t = cur ? `${cur} ${wd}` : wd;
      if (cur && this.x.measureText(t).width > max) { lines.push(cur); cur = wd; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  // نص (يلتف تلقائيًا). align: right | left | center
  text(str, { size = 22, weight = 600, align = 'right', lh = 1.5, max = W - 2 * M, color = '#000' } = {}) {
    const x = this.x; x.fillStyle = color;
    for (const ln of this.wrap(str, weight, size, max)) {
      this.font(weight, size);
      x.textAlign = align;
      x.fillText(ln, align === 'right' ? W - M : align === 'left' ? M : W / 2, this.y + size * 1.02);
      this.y += size * lh;
    }
    x.fillStyle = '#000';
    return this;
  }
  // سطر: تسمية يمينًا وقيمة يسارًا (تنزل القيمة لسطر ثانٍ إن ضاق المكان)
  row(label, value, { size = 21, lw = 600, vw = 800, vsize } = {}) {
    const x = this.x; const vs = vsize || size;
    const wl = this.width(label, lw, size); const wv = this.width(value, vw, vs);
    if (wl + wv + 14 > W - 2 * M) {
      this.text(label, { size, weight: lw, lh: 1.35 });
      this.text(value, { size: vs, weight: vw, lh: 1.45 });
      return this;
    }
    this.font(lw, size); x.textAlign = 'right'; x.fillText(label, W - M, this.y + size * 1.02);
    this.font(vw, vs); x.textAlign = 'left'; x.fillText(value, M, this.y + size * 1.02);
    this.y += Math.max(size, vs) * 1.42;
    return this;
  }
  dash(g = 7) { const x = this.x; this.y += g; x.save(); x.lineWidth = 2; x.setLineDash([6, 5]); x.beginPath(); x.moveTo(M, this.y); x.lineTo(W - M, this.y); x.stroke(); x.restore(); this.y += g + 2; return this; }
  solid(w = 3, g = 6) { const x = this.x; this.y += g; x.fillRect(M, this.y, W - 2 * M, w); this.y += w + g; return this; }
  // شريط أسود بنص أبيض
  band(str, size = 25) {
    const x = this.x; const h = Math.round(size * 1.7);
    this.y += 4; x.fillRect(0, this.y, W, h);
    x.fillStyle = '#fff'; this.font(800, size); x.textAlign = 'center'; x.fillText(str, W / 2, this.y + h / 2 + size * 0.36);
    x.fillStyle = '#000'; this.y += h + 8; return this;
  }
  // عنوان فرعي بخط عريض مع خط سفلي
  head(str, size = 22) { this.text(str, { size, weight: 800, lh: 1.25 }); const x = this.x; x.fillRect(M, this.y + 1, W - 2 * M, 2); this.y += 8; return this; }
  logo(title, sub) {
    const x = this.x; const s = 58; const cx = W / 2; const top = this.y + 2;
    x.beginPath(); x.roundRect(cx - s / 2, top, s, s, 16); x.fill();
    x.save(); x.translate(cx - s / 2 + 11, top + 9); x.scale(1.4, 1.4); x.fillStyle = '#fff'; x.fill(new Path2D(BOLT)); x.restore();
    x.fillStyle = '#000'; this.y = top + s + 6;
    this.text(title, { size: 31, weight: 800, align: 'center', lh: 1.3 });
    if (sub) this.text(sub, { size: 20, weight: 600, align: 'center', lh: 1.35 });
    return this;
  }
  // مربع المبلغ الكبير
  amount(label, value, { size = 42 } = {}) {
    const x = this.x; const h = size + 52; const top = this.y + 6;
    x.save(); x.lineWidth = 4; x.beginPath(); x.roundRect(M + 2, top, W - 2 * M - 4, h, 16); x.stroke(); x.restore();
    this.font(700, 20); x.textAlign = 'center'; x.fillText(label, W / 2, top + 28);
    const num = fmtNum(value);
    this.font(800, size); const wn = x.measureText(num).width; this.font(700, 22); const wc = x.measureText(CUR).width;
    const start = (W - (wn + wc + 8)) / 2;
    x.direction = 'ltr'; x.textAlign = 'left';
    this.font(800, size); x.fillText(num, start + wc + 8, top + h - 14);
    this.font(700, 22); x.fillText(CUR, start, top + h - 16);
    x.direction = 'rtl'; this.y = top + h + 8; return this;
  }
  // شبكة أشهر السنة: 6 × 2
  year(sub, year) {
    const x = this.x; const cw = 56; const gap = 4; const ch = 46; const top0 = this.y + 4;
    const start = (W - (6 * cw + 5 * gap)) / 2;
    for (let i = 0; i < 12; i++) {
      const ym = `${year}-${p2(i + 1)}`; const k = S.monthState(sub, ym);
      const col = i % 6; const row = Math.floor(i / 6);
      const cx = W - start - col * (cw + gap) - cw; const cy = top0 + row * (ch + gap);
      x.save();
      if (k === 'paid') { x.beginPath(); x.roundRect(cx, cy, cw, ch, 9); x.fill(); x.fillStyle = '#fff'; }
      else if (k === 'partial') { x.lineWidth = 3; x.beginPath(); x.roundRect(cx, cy, cw, ch, 9); x.stroke(); x.beginPath(); x.rect(cx + 1.5, cy + ch / 2 + 4, cw - 3, ch / 2 - 5.5); x.fill(); }
      else if (k === 'unpaid') { x.lineWidth = 4; x.beginPath(); x.roundRect(cx + 1, cy + 1, cw - 2, ch - 2, 9); x.stroke(); }
      else { x.lineWidth = 2; x.setLineDash([4, 4]); x.beginPath(); x.roundRect(cx + 1, cy + 1, cw - 2, ch - 2, 9); x.stroke(); x.setLineDash([]); }
      this.font(800, 22); x.textAlign = 'center'; x.direction = 'ltr';
      const numY = k === 'partial' ? cy + 27 : cy + ch / 2 + 8;
      if (k === 'partial') { x.fillStyle = '#000'; }
      x.fillText(String(i + 1), cx + cw / 2, numY);
      x.restore();
    }
    this.y = top0 + 2 * ch + gap + 8;
    // مفتاح الرموز
    const items = [['paid', 'مسدد'], ['partial', 'ناقص'], ['unpaid', 'غير مسدد'], ['off', 'خارج المدة']];
    let rx = W - M;
    this.font(600, 17); x.textAlign = 'right';
    for (const [k, t] of items) {
      const bx = rx - 16; const by = this.y + 3;
      x.save();
      if (k === 'paid') { x.fillRect(bx, by, 16, 16); }
      else if (k === 'partial') { x.lineWidth = 2; x.strokeRect(bx + 1, by + 1, 14, 14); x.fillRect(bx + 1, by + 9, 14, 6); }
      else if (k === 'unpaid') { x.lineWidth = 3; x.strokeRect(bx + 1.5, by + 1.5, 13, 13); }
      else { x.lineWidth = 2; x.setLineDash([3, 3]); x.strokeRect(bx + 1, by + 1, 14, 14); }
      x.restore();
      x.direction = 'rtl'; x.textAlign = 'right';
      const tw = this.width(t, 600, 17);
      this.font(600, 17); x.fillText(t, bx - 6, this.y + 17);
      rx = bx - 6 - tw - 12;
    }
    this.y += 28; return this;
  }
  sig(label, w = 165) {
    const x = this.x; this.y += 30;
    x.fillRect(W - M - w, this.y, w, 2);
    this.font(600, 17); x.textAlign = 'right'; x.fillText(label, W - M, this.y + 22);
    this.y += 26; return this;
  }
  sig2(a, b) {
    const x = this.x; this.y += 34; const w = 150;
    x.fillRect(W - M - w, this.y, w, 2); x.fillRect(M, this.y, w, 2);
    this.font(600, 17); x.textAlign = 'center';
    x.fillText(a, W - M - w / 2, this.y + 22); x.fillText(b, M + w / 2, this.y + 22);
    this.y += 28; return this;
  }
  zig() {
    const x = this.x; this.y += 4; const n = 24; const w = W / n;
    x.beginPath(); for (let i = 0; i < n; i++) { x.moveTo(i * w, this.y); x.lineTo(i * w + w / 2, this.y + 9); x.lineTo((i + 1) * w, this.y); }
    x.fill(); this.y += 16; return this;
  }
  done() {
    const h = Math.ceil(this.y + 10);
    const out = document.createElement('canvas'); out.width = W; out.height = h;
    const o = out.getContext('2d', { willReadFrequently: true }); o.fillStyle = '#fff'; o.fillRect(0, 0, W, h); o.drawImage(this.c, 0, 0, W, h, 0, 0, W, h);
    return out;
  }
}

/* ───── أجزاء مشتركة ───── */
const who = () => S.settings().user || '';
function header(d, title, genName) {
  d.zig().logo('حسابات المولدة', genName || '').gap(2).band(title);
}
function subBlock(d, sub) {
  const { conn, gen } = S.pathOf(sub);
  d.text(sub.name, { size: 28, weight: 800, lh: 1.3 });
  d.gap(2);
  d.row('رقم الجوزة', String(conn ? conn.no : '—'), { size: 21, vsize: 26 });
  d.row('الأمبيرات', fmtNum(sub.amps), { size: 21, vsize: 24 });
  const loc = S.pathText(sub);
  if (loc) d.text(`الموقع: ${loc}`, { size: 19, weight: 600, lh: 1.4 });
  if (sub.phone) d.row('الهاتف', sub.phone, { size: 20 });
  return gen;
}
function footer(d, extra) {
  d.dash().text('شكرًا لتعاملكم معنا', { size: 22, weight: 800, align: 'center', lh: 1.35 });
  if (extra) d.text(extra, { size: 17, weight: 500, align: 'center', lh: 1.4 });
  d.text(`طُبع في ${dateStr(Date.now())}  ${timeStr(Date.now())}`, { size: 16, weight: 500, align: 'center', lh: 1.4 });
  d.zig().gap(4);
}
const shortId = (id) => String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || '——';
function stateBlock(d, sub) {
  const t = S.debtOf(sub);
  d.dash().head('حالة الحساب الآن');
  if (t.total > 0) {
    d.row('إجمالي المتبقي على المشترك', money(t.total), { size: 20, vsize: 24 });
    if (t.months.length) d.row(`أشهر غير مسددة (${t.months.length})`, money(t.monthsAmount), { size: 19, vw: 700 });
    if (t.manual > 0) d.row('دين مسجّل', money(t.manual), { size: 19, vw: 700 });
  } else d.text('✓ لا يوجد دين، الحساب مسدد بالكامل', { size: 21, weight: 800, align: 'center', lh: 1.5 });
}

/* ───── وصل استلام (أو إلغاء) ───── */
export function payReceiptDoc(rc) {
  const sub = S.ix().sub.get(rc.subId); if (!sub) return null;
  const cancel = rc.kind === 'cancel';
  const d = new Doc(); const gen = S.pathOf(sub).gen;
  header(d, cancel ? 'وصل إلغاء تسديد' : 'وصل استلام', gen && gen.name);
  d.row('رقم الوصل', shortId(rc.id), { size: 21, vsize: 24 });
  d.row('التاريخ', `${dateStr(rc.at)}  ${timeStr(rc.at)}`, { size: 20, vw: 700 });
  d.row('المستلم', rc.by || 'غير معروف', { size: 21, vsize: 23 });
  d.dash();
  subBlock(d, sub);
  d.dash().head(cancel ? 'الأشهر الملغاة' : 'تفاصيل الأشهر');
  // رأس الجدول
  const x = d.x; const header3 = () => { d.font(700, 17); x.textAlign = 'right'; x.fillText('الشهر', W - M, d.y + 17); x.textAlign = 'right'; x.fillText('المستحق', 190, d.y + 17); x.textAlign = 'left'; x.fillText(cancel ? 'الملغى' : 'المدفوع', M, d.y + 17); d.y += 26; };
  header3();
  let remainSum = 0;
  for (const it of rc.items || []) {
    const r = S.recAny(sub.id, it.ym); const due = r ? r.due || 0 : S.dueOf(sub, it.ym);
    const paidNow = S.paidOf(sub.id, it.ym); const rem = Math.max(0, due - paidNow);
    d.font(700, 20); x.textAlign = 'right'; x.fillText(ymLabel(it.ym), W - M, d.y + 21);
    x.direction = 'ltr'; d.font(600, 20); x.textAlign = 'right'; x.fillText(fmtNum(due), 190, d.y + 21);
    x.textAlign = 'left'; d.font(800, 21); x.fillText(fmtNum(Math.abs(it.amount)), M, d.y + 21); x.direction = 'rtl';
    d.y += 30;
    if (!cancel && rem > 0) { d.text(`ناقص — المتبقي من هذا الشهر ${money(rem)}`, { size: 17, weight: 700, lh: 1.3 }); remainSum += rem; }
  }
  d.solid(2, 4);
  d.amount(cancel ? 'المبلغ الملغى' : 'المبلغ المستلم', Math.abs(rc.amount));
  if (!cancel && remainSum > 0) d.row('المتبقي على هذه الأشهر', money(remainSum), { size: 20, vw: 800 });
  stateBlock(d, sub);
  const lastYm = (rc.items && rc.items.length ? rc.items[rc.items.length - 1].ym : ymNow());
  d.dash().head(`أشهر سنة ${ymParse(lastYm).y}`).year(sub, ymParse(lastYm).y);
  d.sig2('توقيع المستلم', 'توقيع المشترك');
  footer(d, 'يُحتفظ بهذا الوصل لإثبات الدفع');
  return d.done();
}

/* ───── كشف حساب المشترك ───── */
export function statementDoc(sub) {
  const d = new Doc(); const gen = S.pathOf(sub).gen; const now = Date.now();
  header(d, 'كشف حساب', gen && gen.name);
  d.row('التاريخ', `${dateStr(now)}  ${timeStr(now)}`, { size: 20, vw: 700 });
  d.row('أعدّه', who() || '—', { size: 21, vsize: 23 });
  d.dash();
  subBlock(d, sub);
  const price = S.priceFor(ymNow(), gen && gen.id); const due = S.dueOf(sub);
  d.dash().head('الاشتراك');
  d.row(`سعر الأمبير (${MONTHS[ymParse(ymNow()).m - 1]})`, money(price), { size: 19 });
  d.row('الاشتراك الشهري', money(due), { size: 20, vw: 800 });
  const t = S.debtOf(sub);
  d.gap(2);
  if (t.total > 0) d.amount('إجمالي المتبقي', t.total); else { d.gap(4); d.text('✓ الحساب مسدد بالكامل', { size: 26, weight: 800, align: 'center', lh: 1.5 }); }
  if (t.months.length) {
    d.dash().head(`الأشهر غير المسددة (${t.months.length})`);
    const x = d.x; const list = t.months.slice(0, 12);
    for (const ym of list) {
      const rem = S.remainOf(sub, ym); const part = S.monthState(sub, ym) === 'partial';
      d.font(700, 20); x.textAlign = 'right'; x.fillText(ymLabel(ym) + (part ? '  (ناقص)' : ''), W - M, d.y + 21);
      x.direction = 'ltr'; d.font(800, 21); x.textAlign = 'left'; x.fillText(fmtNum(rem), M, d.y + 21); x.direction = 'rtl'; d.y += 30;
    }
    if (t.months.length > list.length) d.text(`… و${t.months.length - list.length} أشهر أخرى`, { size: 18, weight: 600, lh: 1.4 });
    d.solid(2, 3);
    d.row('مجموع الأشهر', money(t.monthsAmount), { size: 20, vw: 800 });
  }
  const debts = (S.ix().debtsBySub.get(sub.id) || []).slice().sort((a, b) => b.at - a.at);
  if (debts.length) {
    d.dash().head('الديون المسجّلة');
    const x = d.x;
    for (const e of debts.slice(0, 6)) {
      d.font(700, 19); x.textAlign = 'right'; x.fillText(`${e.kind === 'debt' ? 'دين' : 'تسديد'}  ${dateStr(e.at)}`, W - M, d.y + 20);
      x.direction = 'ltr'; d.font(800, 20); x.textAlign = 'left'; x.fillText((e.kind === 'debt' ? '+' : '−') + fmtNum(e.amount), M, d.y + 20); x.direction = 'rtl'; d.y += 28;
      if (e.note) d.text(e.note, { size: 16, weight: 500, lh: 1.3 });
    }
    d.solid(2, 3);
    d.row('رصيد الدين المسجّل', money(t.manual), { size: 20, vw: 800 });
  }
  const rcs = S.receiptsOf(sub.id).filter((r) => r.kind === 'pay').slice(0, 5);
  if (rcs.length) {
    d.dash().head('آخر الدفعات');
    const x = d.x;
    for (const r of rcs) {
      d.font(700, 18); x.textAlign = 'right'; x.fillText(`${dateStr(r.at)}  ${timeStr(r.at).slice(0, 5)}`, W - M, d.y + 19);
      x.direction = 'ltr'; d.font(800, 20); x.textAlign = 'left'; x.fillText(fmtNum(r.amount), M, d.y + 19); x.direction = 'rtl'; d.y += 26;
      d.text(`المستلم: ${r.by || '—'}`, { size: 15, weight: 500, lh: 1.25 });
    }
  }
  const y = ymParse(ymNow()).y;
  d.dash().head(`أشهر سنة ${y}`).year(sub, y);
  d.sig('توقيع المسؤول');
  footer(d, 'كشف الحساب حتى لحظة الطباعة');
  return d.done();
}

/* ───── وصل دين / تسديد دين ───── */
export function debtDoc(e) {
  const sub = S.ix().sub.get(e.subId); if (!sub) return null;
  const isDebt = e.kind === 'debt'; const gen = S.pathOf(sub).gen;
  const d = new Doc();
  header(d, isDebt ? 'وصل دين' : 'وصل تسديد دين', gen && gen.name);
  d.row('رقم الوصل', shortId(e.id), { size: 21, vsize: 24 });
  d.row('التاريخ', `${dateStr(e.at)}  ${timeStr(e.at)}`, { size: 20, vw: 700 });
  d.row(isDebt ? 'سُجّل بواسطة' : 'المستلم', e.by || '—', { size: 21, vsize: 23 });
  d.dash();
  subBlock(d, sub);
  d.dash();
  d.amount(isDebt ? 'مبلغ الدين' : 'المبلغ المسدَّد من الدين', e.amount);
  if (e.note) { d.head('السبب / الملاحظة', 20); d.text(e.note, { size: 21, weight: 600, lh: 1.5 }); }
  d.dash().head('الرصيد');
  d.row('رصيد الدين المسجّل الآن', money(Math.max(0, S.manualBalance(sub.id))), { size: 20, vw: 800 });
  stateBlock(d, sub);
  d.sig2(isDebt ? 'توقيع المشترك (إقرار)' : 'توقيع المستلم', isDebt ? 'توقيع المسجِّل' : 'توقيع المشترك');
  footer(d, isDebt ? 'أقرّ المشترك بالمبلغ أعلاه' : '');
  return d.done();
}

/* ───── وصل تجريبي ───── */
export function testDoc() {
  const d = new Doc(); const now = Date.now();
  header(d, 'طباعة تجريبية');
  d.text('إن ظهر هذا الوصل واضحًا فالطابعة جاهزة.', { size: 21, weight: 700, align: 'center', lh: 1.5 });
  d.dash();
  d.row('التاريخ', `${dateStr(now)}  ${timeStr(now)}`, { size: 20, vw: 700 });
  d.row('المبلغ', money(28000), { size: 21, vsize: 24 });
  d.amount('المبلغ المستلم', 1250000);
  d.text('أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ 0123456789', { size: 20, weight: 600, align: 'center', lh: 1.5 });
  footer(d, 'حسابات المولدة');
  return d.done();
}

/* ───── ESC/POS ───── */
// يحوّل اللوحة (عرضها 384) إلى أوامر طباعة نقطية على دفعات من 64 سطرًا (متوافقة مع الطابعات الصغيرة)
export function toEscPos(canvas) {
  const w = canvas.width; const h = canvas.height; const bpr = w / 8;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = [0x1b, 0x40, 0x1b, 0x61, 0x01]; // تهيئة + توسيط
  for (let y0 = 0; y0 < h; y0 += 64) {
    const rows = Math.min(64, h - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, bpr & 255, bpr >> 8, rows & 255, rows >> 8);
    for (let y = y0; y < y0 + rows; y++) {
      for (let xb = 0; xb < bpr; xb++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const i = (y * w + xb * 8 + bit) * 4;
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (px[i + 3] > 40 && lum < 150) b |= 0x80 >> bit;
        }
        out.push(b);
      }
    }
  }
  out.push(0x1b, 0x4a, 0x80, 0x1b, 0x4a, 0x50); // تغذية الورق لقطعه
  return Uint8Array.from(out);
}
export function toBase64(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
