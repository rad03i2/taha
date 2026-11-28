// واجهة الطباعة: اختيار الطابعة (بلوتوث)، معاينة الوصل، الطباعة والمشاركة كصورة.
import * as S from './store.js';
import { openSheet, closeSheet, icon, toast, hideToast, money as _m } from './ui.js';
import { loadFonts, payReceiptDoc, statementDoc, debtDoc, testDoc, toEscPos, toBase64 } from './receipt.js';
import { esc } from './util.js';
import { sfx } from './fx.js';

const C = () => window.Capacitor;
const native = () => !!(C() && C().isNativePlatform && C().isNativePlatform());
const P = () => C() && C().Plugins && C().Plugins.GLPrint;
export const canPrintNative = () => native() && !!P();

const saved = () => { try { return JSON.parse(localStorage.getItem('gl.printer') || 'null'); } catch (e) { return null; } };
export const printerSaved = () => !!saved();
export const printerName = () => (saved() ? saved().name || saved().address : '');

/* ───── اختيار الطابعة ───── */
const looksPrinter = (d) => d.printer || /mp\d|mpt|print|pos|rpp|bluetooth ?printer|thermal|^bt/i.test(d.name || '');
export async function pickPrinter(done) {
  if (!canPrintNative()) { toast('الطباعة تعمل من تطبيق أندرويد على الهاتف'); return; }
  let st = {};
  try { st = await P().state(); if (!st.granted) st = await P().requestPerm(); } catch (e) { st = {}; }
  if (!st.granted) { toast('يلزم السماح بإذن «الأجهزة القريبة» للاتصال بالطابعة'); return; }
  const w = openSheet(`<h3 class="sh-title">اختيار الطابعة</h3><div id="pr-body"><p class="muted sm">جارٍ البحث عن الأجهزة المقرونة…</p></div>`, { tall: true });
  const body = w.querySelector('#pr-body');
  const draw = async () => {
    let s2 = {}; try { s2 = await P().state(); } catch (e) { /* لا شيء */ }
    let list = [];
    if (s2.enabled) { try { list = (await P().devices()).devices || []; } catch (e) { /* لا شيء */ } }
    list.sort((a, b) => looksPrinter(b) - looksPrinter(a) || (a.name || '').localeCompare(b.name || ''));
    const cur = saved();
    body.innerHTML = `
      ${s2.enabled ? '' : `<div class="banner warn">${icon('alert')}<span>البلوتوث مغلق. فعّله من الهاتف ثم اضغط «تحديث».</span></div>`}
      <p class="hint">اقرن الطابعة أولًا من إعدادات بلوتوث الهاتف (شغّلها واختر اسمها، والرمز غالبًا <b>0000</b> أو <b>1234</b>)، ثم اخترها من هنا.</p>
      <div class="card list" style="box-shadow:none;padding:2px 12px">${list.length ? list.map((d) => `<button class="set pr-it ${cur && cur.address === d.address ? 'on' : ''}" data-addr="${esc(d.address)}" data-name="${esc(d.name)}">${icon('printer', 'set-ic')}<div class="grow"><b>${esc(d.name || 'جهاز بلا اسم')}</b><small>${looksPrinter(d) ? 'طابعة محتملة · ' : ''}${esc(d.address)}</small></div><span class="rad"></span></button>`).join('') : '<p class="muted sm" style="padding:14px 4px">لا توجد أجهزة مقرونة بعد.</p>'}</div>
      <div class="btn-row"><button class="btn soft" data-bt>${icon('link')}إعدادات البلوتوث</button><button class="btn soft" data-rf>${icon('clock')}تحديث</button></div>`;
    body.querySelectorAll('.pr-it').forEach((b) => { b.onclick = () => {
      const sel = { name: b.dataset.name, address: b.dataset.addr };
      try { localStorage.setItem('gl.printer', JSON.stringify(sel)); } catch (e) { /* لا شيء */ }
      sfx.ok(); closeSheet(); toast(`تم اختيار الطابعة: ${sel.name || sel.address}`); if (done) done(sel);
    }; });
    body.querySelector('[data-bt]').onclick = () => P().openSettings();
    body.querySelector('[data-rf]').onclick = draw;
  };
  draw();
}

/* ───── الطباعة ───── */
const friendly = (m) => {
  const t = String(m || '');
  if (t.includes('permission')) return 'يلزم السماح بإذن «الأجهزة القريبة»';
  if (t.includes('bluetooth off')) return 'البلوتوث مغلق. فعّله وأعد المحاولة';
  return 'تعذّر الاتصال بالطابعة. تأكد أنها مفتوحة وقريبة ومقرونة';
};
export async function doPrint(canvas) {
  if (!canPrintNative()) { toast('الطباعة تعمل من تطبيق أندرويد على الهاتف. يمكنك حفظ الوصل كصورة'); return false; }
  let pr = saved();
  if (!pr) { pickPrinter((sel) => { if (sel) doPrint(canvas); }); return false; }
  hideToast(); toast('جارٍ الطباعة…');
  try {
    await P().print({ address: pr.address, data: toBase64(toEscPos(canvas)) });
    sfx.ok(); toast('تمت الطباعة ✓'); return true;
  } catch (e) { toast(friendly(e && e.message)); return false; }
}

/* ───── مشاركة كصورة ───── */
async function shareImage(canvas, name) {
  const url = canvas.toDataURL('image/png'); const b64 = url.split(',')[1];
  try {
    const Pl = C() && C().Plugins;
    if (native() && Pl && Pl.Filesystem && Pl.Share) {
      const r = await Pl.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
      await Pl.Share.share({ title: name, url: r.uri, dialogTitle: 'مشاركة الوصل' });
      return;
    }
  } catch (e) { toast('تعذّرت المشاركة'); return; }
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ───── المعاينة ───── */
export function showPreview(canvas, title, fname) {
  const pr = printerName();
  const w = openSheet(`<h3 class="sh-title">${esc(title)}</h3>
    <div class="btn-row" style="margin-top:0"><button class="btn primary grow" data-p>${icon('printer')}طباعة</button><button class="btn soft grow" data-s>${icon('upload')}صورة</button></div>
    <p class="hint" style="text-align:center">${pr ? `الطابعة: <b>${esc(pr)}</b>` : 'لم تُحدَّد طابعة بعد'} · <button class="link" data-ch style="padding:0">${pr ? 'تغيير' : 'اختيار'}</button></p>
    <div class="paper"></div>`, { tall: true });
  w.querySelector('.paper').appendChild(canvas);
  w.querySelector('[data-p]').onclick = () => doPrint(canvas);
  w.querySelector('[data-s]').onclick = () => shareImage(canvas, fname || 'receipt.png');
  w.querySelector('[data-ch]').onclick = () => pickPrinter(() => { closeSheet(); showPreview(canvas, title, fname); });
}

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

export async function printReceipt(id) {
  const rc = S.live('receipts').find((r) => r.id === id); if (!rc) return toast('الوصل غير موجود');
  await loadFonts(); const c = payReceiptDoc(rc); if (!c) return toast('تعذّر إنشاء الوصل');
  showPreview(c, rc.kind === 'cancel' ? 'وصل إلغاء تسديد' : 'وصل استلام', `receipt-${stamp()}.png`);
}
export async function printStatement(subId) {
  const sub = S.ix().sub.get(subId); if (!sub) return;
  await loadFonts(); showPreview(statementDoc(sub), 'كشف حساب المشترك', `statement-${stamp()}.png`);
}
export async function printDebt(id) {
  const e = S.live('debts').find((x) => x.id === id); if (!e) return toast('القيد غير موجود');
  await loadFonts(); const c = debtDoc(e); if (c) showPreview(c, e.kind === 'debt' ? 'وصل دين' : 'وصل تسديد دين', `debt-${stamp()}.png`);
}
export async function printTest() { await loadFonts(); showPreview(testDoc(), 'طباعة تجريبية', 'test.png'); }

// قائمة «طباعة الوصل» في شاشة المشترك
export function printMenu(subId) {
  const sub = S.ix().sub.get(subId); if (!sub) return;
  const last = S.receiptsOf(subId)[0];
  const lastDebt = (S.ix().debtsBySub.get(subId) || []).slice().sort((a, b) => b.at - a.at)[0];
  const item = (ic, t, d, act, data) => `<button class="menu-i" data-act="${act}" data-close="1" ${data}>${icon(ic)}<span><b style="display:block">${t}</b><small>${d}</small></span></button>`;
  openSheet(`<h3 class="sh-title">طباعة وصل — ${esc(sub.name)}</h3><div class="menu">
    ${item('list', 'كشف حساب المشترك', 'الأشهر غير المسددة والديون وآخر الدفعات وتقويم السنة', 'print-statement', `data-id="${subId}"`)}
    ${last ? item('check', last.kind === 'cancel' ? 'وصل آخر عملية (إلغاء)' : 'وصل آخر دفعة', `${_m(Math.abs(last.amount))}`, 'print-receipt', `data-id="${last.id}"`) : ''}
    ${lastDebt ? item('wallet', lastDebt.kind === 'debt' ? 'وصل آخر دين' : 'وصل آخر تسديد دين', `${_m(lastDebt.amount)}`, 'print-debt', `data-id="${lastDebt.id}"`) : ''}
  </div>`);
}
