// النماذج (النوافذ السفلية) والإجراءات
import * as SY from './sync.js';
import { esc, fmtNum, ymNow, ymLabel, ymAdd, ymParse, ymOf, MONTHS, normDigits, parseNum, CUR } from './util.js';
import * as S from './store.js';
import { icon, money, openSheet, closeSheet, closeAllSheets, confirmBox, toast, hideToast, empty } from './ui.js';
import { nav } from './nav.js';
import { dt, ui, subRow, NOTE_TYPES, CONN_STATES, avatar } from './views.js';
import { sfx, haptic, GROUPS } from './fx.js';
import { PERMS } from './perms.js';
import { startWatch, stopWatch, askPowerOnce, power } from './push.js';
import { checkUpdate, downloadAndInstall, install, currentBuild } from './update.js';

const allCabinets = () => {
  const out = [];
  for (const g of S.generators()) for (const p of S.phasesOf(g.id)) for (const c of S.cabinetsOf(p.id)) out.push({ g, p, c });
  return out;
};
const menuItem = (ic, t, act, data = '', danger = false) => `<button class="menu-i ${danger ? 'danger' : ''}" data-act="${act}" data-close="1" ${data}>${icon(ic)}<span>${t}</span></button>`;
const menuSheet = (title, items) => openSheet(`<h3 class="sh-title">${esc(title)}</h3><div class="menu">${items.join('')}</div>`);

/* ───────── محرّر حقل واحد ───────── */
function promptSheet({ title, label, value = '', mode = 'text', hint = '', onSave }) {
  const w = openSheet(`<form data-form="prompt"><h3 class="sh-title">${esc(title)}</h3>
    <label class="field"><span>${esc(label)}</span><input name="v" value="${esc(value)}" inputmode="${mode}" autocomplete="off" autofocus></label>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    <button class="btn primary block lg" type="submit">حفظ</button></form>`);
  w.querySelector('form')._save = onSave;
}

/* ───────── المشترك ───────── */
const monthSel = (ym) => {
  const { y, m } = ymParse(ym); const cy = new Date().getFullYear();
  const years = []; for (let i = cy - 4; i <= cy + 1; i++) years.push(i);
  return `<div class="two"><select name="sm">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${i + 1} · ${n}</option>`).join('')}</select>
    <select name="sy">${years.map((yy) => `<option ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}</select></div>`;
};

export function subSheet({ cabinetId, connectionId, subId } = {}) {
  const I = S.ix();
  const sub = subId ? I.sub.get(subId) : null;
  const conn = connectionId ? I.conn.get(connectionId) : null;
  const needCab = !sub && !conn && !cabinetId;
  const cabs = allCabinets();
  if (needCab && !cabs.length) { toast('أنشئ كابينة أولًا'); return; }
  const cabId = cabinetId || cabs[0]?.c.id;
  const phaseId = I.cab.get(cabId)?.phaseId;
  const showNo = !sub && !conn;
  const title = sub ? 'تعديل المشترك' : conn ? `شريك على الجوزة ${conn.no}` : 'مشترك جديد';
  const w = openSheet(`<form data-form="sub" data-sub="${subId || ''}" data-conn="${connectionId || ''}" data-cab="${cabId || ''}">
    <h3 class="sh-title">${title}</h3>
    ${needCab ? `<label class="field"><span>الكابينة</span><select name="cab">${cabs.map(({ g, p, c }) => `<option value="${c.id}" ${c.id === cabId ? 'selected' : ''}>${esc(g.name)} › ${esc(p.name)} › ${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field"><span>الاسم الرباعي</span><input name="name" value="${esc(sub?.name || '')}" autocomplete="off" required ${sub ? '' : 'autofocus'}></label>
    <div class="two">
      <div class="field"><span>الأمبيرات</span><div class="stepper"><button type="button" data-step="-1" aria-label="أنقص">−</button><input name="amps" inputmode="decimal" value="${sub ? fmtNum(sub.amps) : '1'}"><button type="button" data-step="1" aria-label="زِد">+</button></div></div>
      ${showNo ? `<label class="field"><span>رقم الجوزة</span><input name="no" inputmode="numeric" value="${phaseId ? S.nextNo(phaseId) : ''}" autocomplete="off"></label>` : `<label class="field"><span>الهاتف</span><input name="phone" inputmode="tel" value="${esc(sub?.phone || '')}" autocomplete="off"></label>`}
    </div>
    ${showNo ? `<p class="hint good" id="no-hint" hidden></p><label class="field"><span>الهاتف (اختياري)</span><input name="phone" inputmode="tel" autocomplete="off"></label>` : ''}
    <details class="adv"><summary>${icon('calendar')}الحساب يبدأ من</summary>${monthSel(sub?.startYM || ymNow())}<p class="hint">الأشهر قبل هذا التاريخ لا تُحسب ديونًا. للمشترك القديم اختر شهر بدء الدفتر.</p></details>
    <button class="btn primary block lg" type="submit">${sub ? 'حفظ التعديلات' : 'إضافة'}</button>
  </form>`, {
    onMount: (el) => {
      const form = el.querySelector('form');
      const noEl = form.elements.no; const hint = el.querySelector('#no-hint'); const cabSel = form.elements.cab;
      const check = () => {
        if (!noEl) return;
        const cid = cabSel ? cabSel.value : form.dataset.cab;
        const n = parseInt(normDigits(noEl.value), 10);
        const ex = S.connsOf(cid).find((c) => c.no === n);
        const subsOn = ex ? S.subsOfConn(ex.id) : [];
        hint.hidden = !ex;
        hint.textContent = ex ? `الجوزة ${n} موجودة (${subsOn.map((s) => s.name).join('، ')}) — سيُضاف كشريك على نفس الجوزة.` : '';
      };
      if (cabSel) cabSel.addEventListener('change', () => { noEl.value = S.nextNo(S.ix().cab.get(cabSel.value).phaseId); check(); });
      if (noEl) noEl.addEventListener('input', check);
    },
  });
  return w;
}

const forms = {};
forms.sub = (fd, form) => {
  const name = (fd.get('name') || '').trim();
  const amps = parseNum(fd.get('amps'));
  if (!name) return toast('اكتب اسم المشترك');
  if (!(amps > 0)) return toast('اكتب عدد الأمبيرات');
  const startYM = ymOf(fd.get('sy'), fd.get('sm'));
  const phone = (fd.get('phone') || '').trim();
  const subId = form.dataset.sub; const connId = form.dataset.conn;
  if (subId) {
    S.upd('subscribers', subId, { name, amps, phone, startYM });
    S.logAct(`تعديل مشترك: ${name}`, subId, 'sub');
    toast('تم الحفظ');
  } else {
    const cabinetId = fd.get('cab') || form.dataset.cab;
    const no = parseInt(normDigits(fd.get('no') || ''), 10) || undefined;
    const ex = connId ? null : S.connsOf(cabinetId).find((c) => c.no === no);
    S.addSubscriber({ name, amps, phone, startYM, cabinetId, connectionId: connId || ex?.id, no });
    toast(connId || ex ? 'أُضيف الشريك على نفس الجوزة' : 'تمت إضافة المشترك');
  }
  closeSheet();
};

/* ───────── الدفع ───────── */
export function paySheet(subId, preYm) {
  const s = S.ix().sub.get(subId);
  if (!s) return;
  const unpaid = S.unpaidMonths(s);
  const future = [1, 2, 3].map((i) => ymAdd(ymNow(), i)).filter((m) => S.monthState(s, m) !== 'paid');
  const months = [...unpaid, ...future];
  const due = S.dueOf(s);
  const first = preYm && months.includes(preYm) ? preYm : unpaid[0] || future[0];
  const chip = (m) => {
    const part = S.monthState(s, m) === 'partial';
    const tag = part ? `<small>متبقي ${fmtNum(S.remainOf(s, m))}</small>` : unpaid.includes(m) ? '' : '<small>مقدّم</small>';
    return `<label class="mchip ${unpaid.includes(m) ? 'late' : ''}"><input type="checkbox" name="ym" value="${m}" ${m === first ? 'checked' : ''}><span>${esc(ymLabel(m))}${tag}</span></label>`;
  };
  const w = openSheet(`<form data-form="pay" data-id="${subId}">
    <h3 class="sh-title">تسجيل دفعة</h3>
    <div class="who">${avatar(s.name)}<div class="grow"><b>${esc(s.name)}</b><small>${fmtNum(s.amps)} أمبير${due ? ' · ' + money(due) + ' شهريًا' : ''}</small></div></div>
    ${due ? '' : `<div class="banner warn">${icon('alert')}<span>سعر الأمبير غير محدد، فلن يُحسب مبلغ. حدده من «المزيد».</span></div>`}
    <div class="field"><span>اختر الأشهر</span>
      <div class="mchips">${months.map(chip).join('')}</div>
      ${unpaid.length > 1 ? `<button type="button" class="link" data-all>تحديد كل المتأخر (${unpaid.length})</button>` : ''}
    </div>
    ${due ? `<label class="field"><span>المبلغ المستلم (${CUR})</span><input name="amount" id="pay-amt" inputmode="decimal" autocomplete="off"></label>
    <div class="total"><span id="pay-rest-l">المطلوب</span><b id="pay-total">${money(due)}</b></div>` : ''}
    <button class="btn primary block lg" type="submit">${icon('check')}تسجيل الدفعة</button>
  </form>`, {
    onMount: (el) => {
      const form = el.querySelector('form');
      const amt = form.querySelector('#pay-amt');
      const checked = () => [...form.querySelectorAll('input[name=ym]:checked')].map((i) => i.value);
      const need = () => S.totalRemain(subId, checked());
      const show = () => {
        const n = checked().length;
        form.querySelector('button[type=submit]').disabled = !n;
        if (!amt) return;
        const total = need(); const got = parseNum(amt.value);
        const L = el.querySelector('#pay-rest-l'); const T = el.querySelector('#pay-total');
        if (got > 0 && got < total) { L.textContent = 'سيتبقى عليه'; T.textContent = `${fmtNum(total - got)} ${CUR}`; T.className = 'bad'; }
        else if (got > total) { L.textContent = 'المبلغ أكبر من المطلوب'; T.textContent = `${fmtNum(total)} ${CUR}`; T.className = 'bad'; }
        else { L.textContent = 'المطلوب'; T.textContent = `${fmtNum(total)} ${CUR}`; T.className = ''; }
      };
      const reset = () => { if (amt) amt.value = need() || ''; show(); };
      form.addEventListener('change', (e) => { if (e.target.name === 'ym') reset(); });
      if (amt) amt.addEventListener('input', show);
      const all = form.querySelector('[data-all]');
      if (all) all.onclick = () => { unpaid.forEach((m) => { form.querySelector(`input[value="${m}"]`).checked = true; }); reset(); };
      reset();
    },
  });
  return w;
}
forms.pay = (fd, form) => {
  const yms = fd.getAll('ym');
  if (!yms.length) return toast('اختر شهرًا واحدًا على الأقل');
  const id = form.dataset.id;
  const sub = S.ix().sub.get(id);
  if (!S.dueOf(sub)) { const prev = S.payMonths(id, yms); closeSheet(); toast('تم تسجيل الدفعة', { undo: () => S.restoreRecords(prev) }); return; }
  const total = S.totalRemain(id, yms);
  const amount = parseNum(fd.get('amount'));
  if (!(amount > 0)) return toast('اكتب المبلغ المستلم');
  if (amount > total) return toast(`المبلغ أكبر من المطلوب (${fmtNum(total)})`);
  const r = S.payAmount(id, yms, amount);
  closeSheet();
  toast(r.short ? `استلمت ${fmtNum(r.total)} — يتبقى ${fmtNum(r.short)}` : `تم استلام ${fmtNum(r.total)} — ${sub.name}`, { undo: () => S.restoreRecords(r.prev) });
};
function quickPay(subId) {
  const s = S.ix().sub.get(subId);
  const d = S.debtOf(s);
  if (!d.months.length) return paySheet(subId);
  if (d.months.length === 1 && S.monthState(s, d.months[0]) === 'unpaid') {
    const prev = S.payMonths(subId, d.months);
    toast(`تم تسديد ${ymLabel(d.months[0])} — ${s.name}`, { undo: () => S.restoreRecords(prev) });
  } else paySheet(subId);
}

/* ───────── الديون ───────── */
export function debtSheet({ subId, kind }) {
  const s = S.ix().sub.get(subId);
  if (!s) return;
  const bal = S.manualBalance(subId);
  openSheet(`<form data-form="debt" data-id="${subId}" data-kind="${kind}">
    <h3 class="sh-title">${kind === 'debt' ? 'تسجيل دين' : 'تسديد من الدين'}</h3>
    <div class="who">${avatar(s.name)}<div class="grow"><b>${esc(s.name)}</b><small>الدين المسجّل الحالي ${money(bal)}</small></div></div>
    <label class="field"><span>المبلغ (${CUR})</span><input name="amount" inputmode="decimal" value="${kind === 'payment' ? bal : ''}" autocomplete="off" required autofocus></label>
    <label class="field"><span>السبب / ملاحظة</span><input name="note" placeholder="${kind === 'debt' ? 'مثال: رصيد قديم، سلفة…' : 'اختياري'}" autocomplete="off"></label>
    <button class="btn ${kind === 'debt' ? 'danger' : 'primary'} block lg" type="submit">${kind === 'debt' ? 'تسجيل الدين' : 'تسجيل التسديد'}</button>
  </form>`);
}
forms.debt = (fd, form) => {
  const amount = parseNum(fd.get('amount'));
  if (!(amount > 0)) return toast('اكتب المبلغ');
  S.addDebtEntry({ subId: form.dataset.id, kind: form.dataset.kind, amount, note: (fd.get('note') || '').trim() });
  closeSheet();
  toast('تم الحفظ');
};

/* ───────── الملاحظات ───────── */
export function noteSheet({ subId, connId } = {}) {
  const s = subId ? S.ix().sub.get(subId) : null;
  const w = openSheet(`<form data-form="note" data-sub="${subId || ''}" data-conn="${connId || ''}">
    <h3 class="sh-title">ملاحظة جديدة</h3>
    <div class="field"><span>النوع</span><div class="tchips">${Object.entries(NOTE_TYPES).map(([k, t], i) => `<label class="tchip"><input type="radio" name="type" value="${k}" ${i === 0 ? 'checked' : ''}><span>${icon(t.ic)}${esc(t.t)}</span></label>`).join('')}</div></div>
    <label class="field"><span>التفاصيل</span><textarea name="text" rows="3" placeholder="اكتب الملاحظة…" autofocus></textarea></label>
    <div class="field"><span>مرتبطة بـ</span>
      <button type="button" class="pick" data-pick>${icon('link')}<b id="pick-t">${s ? esc(s.name) : 'بدون ربط (اضغط لاختيار مشترك)'}</b></button>
      <input type="hidden" name="subId" value="${subId || ''}"></div>
    <button class="btn primary block lg" type="submit">حفظ الملاحظة</button>
  </form>`, {
    onMount: (el) => {
      el.querySelector('[data-pick]').onclick = () => pickSubscriber((sub) => {
        el.querySelector('[name=subId]').value = sub.id;
        el.querySelector('#pick-t').textContent = sub.name;
      });
    },
  });
  return w;
}
forms.note = (fd, form) => {
  const text = (fd.get('text') || '').trim();
  if (!text) return toast('اكتب تفاصيل الملاحظة');
  const subId = fd.get('subId') || undefined;
  const connId = !subId && form.dataset.conn ? form.dataset.conn : undefined;
  S.add('notes', { type: fd.get('type'), text, subId, connId, done: false });
  S.logAct(`أضاف ملاحظة (${NOTE_TYPES[fd.get('type')].t}): ${text.length > 70 ? text.slice(0, 70) + '…' : text}`, subId, 'note');
  closeSheet();
  toast('تمت إضافة الملاحظة');
};

/* ───────── اختيار مشترك / بحث ───────── */
export function pickSubscriber(cb, title = 'اختر المشترك') {
  const draw = (q) => {
    const n = normDigits(q.trim());
    let list = S.allSubs();
    if (q.trim()) list = list.filter((s) => s.name.includes(q.trim()) || (/^\d+$/.test(n) && String(S.pathOf(s).conn?.no) === n));
    list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return list.length ? list.slice(0, 40).map((s) => subRow(s, false, true).replace('data-act="open-sub"', `data-pick-id="${s.id}"`)).join('') : empty('search', 'لا نتائج', '');
  };
  const w = openSheet(`<h3 class="sh-title">${esc(title)}</h3>
    <label class="search">${icon('search')}<input id="pq" type="search" placeholder="ابحث بالاسم أو رقم الجوزة" autocomplete="off" autofocus></label>
    <div class="pick-list list" id="pl">${draw('')}</div>`, { tall: true });
  const out = w.querySelector('#pl');
  w.querySelector('#pq').addEventListener('input', (e) => { out.innerHTML = draw(e.target.value); });
  out.addEventListener('click', (e) => {
    const r = e.target.closest('[data-pick-id]'); if (!r) return;
    const sub = S.ix().sub.get(r.dataset.pickId);
    closeSheet();
    cb(sub);
  });
}

/* ───────── الهيكل ───────── */
export function generatorSheet(g) {
  openSheet(`<form data-form="gen" data-id="${g?.id || ''}">
    <h3 class="sh-title">${g ? 'تعديل المولدة' : 'مولدة جديدة'}</h3>
    <label class="field"><span>اسم المولدة</span><input name="name" value="${esc(g?.name || '')}" placeholder="مثال: المولدة الجديدة" autocomplete="off" required autofocus></label>
    <label class="field"><span>سعة المولدة (أمبير)</span><input name="capacity" inputmode="decimal" value="${g?.capacity > 0 ? g.capacity : ''}" placeholder="مثال: 100" autocomplete="off"></label>
    <p class="hint">كل مولدة تحصل تلقائيًا على 3 فيزات، ويمكنك تغيير أسمائها لاحقًا. سعر الأمبير يُحدَّد من شاشة «التسعيرات».</p>
    <button class="btn primary block lg" type="submit">${g ? 'حفظ' : 'إضافة المولدة'}</button></form>`);
}
forms.gen = (fd, form) => {
  const name = (fd.get('name') || '').trim(); if (!name) return toast('اكتب الاسم');
  const capacity = parseNum(fd.get('capacity'));
  if (form.dataset.id) { S.upd('generators', form.dataset.id, { name, capacity: capacity > 0 ? capacity : null }); toast('تم الحفظ'); closeSheet(); }
  else { const g = S.addGenerator({ name }); if (capacity > 0) S.upd('generators', g.id, { capacity }); closeSheet(); toast('تمت إضافة المولدة'); nav.go(`/gen/${g.id}`); }
};
function phasesSheet(genId) {
  const ps = S.phasesOf(genId);
  openSheet(`<form data-form="phases" data-id="${genId}"><h3 class="sh-title">أسماء الفيزات</h3>
    ${ps.map((p) => `<label class="field"><span>${esc(p.name)}</span><input name="p_${p.id}" value="${esc(p.name)}" autocomplete="off"></label>`).join('')}
    <button class="btn primary block lg" type="submit">حفظ</button></form>`);
}
forms.phases = (fd, form) => {
  S.phasesOf(form.dataset.id).forEach((p) => { const v = (fd.get('p_' + p.id) || '').trim(); if (v && v !== p.name) S.upd('phases', p.id, { name: v }); });
  closeSheet(); toast('تم الحفظ');
};
export function cabinetSheet({ phaseId, cab }) {
  openSheet(`<form data-form="cab" data-phase="${phaseId || ''}" data-id="${cab?.id || ''}">
    <h3 class="sh-title">${cab ? 'تعديل الكابينة' : 'كابينة جديدة'}</h3>
    <label class="field"><span>اسم الكابينة</span><input name="name" value="${esc(cab?.name || '')}" placeholder="مثال: كابينة الشهاب (1)" autocomplete="off" required autofocus></label>
    <button class="btn primary block lg" type="submit">${cab ? 'حفظ' : 'إضافة الكابينة'}</button></form>`);
}
forms.cab = (fd, form) => {
  const name = (fd.get('name') || '').trim(); if (!name) return toast('اكتب الاسم');
  if (form.dataset.id) S.upd('cabinets', form.dataset.id, { name });
  else { const c = S.addCabinet({ phaseId: form.dataset.phase, name }); closeSheet(); toast('تمت إضافة الكابينة'); return nav.go(`/cab/${c.id}`); }
  closeSheet(); toast('تم الحفظ');
};
function connSheet(id) {
  const c = S.ix().conn.get(id);
  openSheet(`<form data-form="conn" data-id="${id}"><h3 class="sh-title">الجوزة ${c.no}</h3>
    <label class="field"><span>رقم الجوزة</span><input name="no" inputmode="numeric" value="${c.no}" autocomplete="off"></label>
    <div class="field"><span>الحالة الفنية</span><div class="tchips">${Object.entries(CONN_STATES).map(([k, t]) => `<label class="tchip"><input type="radio" name="state" value="${k}" ${(c.state || 'ok') === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
    <button class="btn primary block lg" type="submit">حفظ</button>
    <button class="btn danger-ghost block" type="button" data-act="del-conn" data-id="${id}" data-close="1">${icon('trash')}حذف الجوزة ومشتركيها</button></form>`);
}
forms.conn = (fd, form) => {
  const no = parseInt(normDigits(fd.get('no')), 10);
  if (!no) return toast('رقم غير صالح');
  S.upd('connections', form.dataset.id, { no, state: fd.get('state') });
  closeSheet(); toast('تم الحفظ');
};
/* ───────── التسعيرات ───────── */
export function priceSheet(ym) {
  const own = S.priceOwn(ym); const cur = S.priceFor(ym);
  const gens = S.generators();
  const r = S.priceRecFor(ym);
  const w = openSheet(`<form data-form="price" data-ym="${ym}">
    <h3 class="sh-title">تسعيرة ${esc(ymLabel(ym))}</h3>
    <label class="field"><span>سعر الأمبير الواحد (${CUR})</span><input name="price" inputmode="decimal" value="${cur > 0 ? cur : ''}" placeholder="مثال: 9000" autocomplete="off" autofocus required></label>
    ${gens.length > 1 ? `<details class="adv"><summary>${icon('gen')}سعر خاص لمولدة معينة (اختياري)</summary>
      ${gens.map((g) => `<label class="field"><span>${esc(g.name)}</span><input name="g_${g.id}" inputmode="decimal" value="${own?.byGen?.[g.id] > 0 ? own.byGen[g.id] : ''}" placeholder="اتركه فارغًا لاستعمال السعر العام" autocomplete="off"></label>`).join('')}</details>` : ''}
    <p class="hint">${own ? 'هذا الشهر له تسعيرة محددة.' : r ? `هذا الشهر يرث سعر ${esc(ymLabel(r.ym))} حاليًا.` : 'لا توجد تسعيرة سابقة.'} الأشهر التالية غير المحددة تأخذ هذا السعر تلقائيًا. التسديدات المسجّلة سابقًا لا تتغير.</p>
    <button class="btn primary block lg" type="submit">${icon('check')}حفظ التسعيرة</button>
    ${own ? `<button class="btn danger-ghost block" type="button" data-act="price-clear" data-ym="${ym}" data-close="1">إزالة التحديد (يرجع للموروث)</button>` : ''}
  </form>`);
  return w;
}
forms.price = (fd, form) => {
  const price = parseNum(fd.get('price'));
  if (!(price > 0)) return toast('اكتب سعر الأمبير');
  const byGen = {};
  S.generators().forEach((g) => { const v = parseNum(fd.get('g_' + g.id)); if (v > 0) byGen[g.id] = v; });
  S.setPrice(form.dataset.ym, price, byGen);
  closeSheet(); toast(`تم حفظ تسعيرة ${ymLabel(form.dataset.ym)}`);
};

// الضغط المطوّل على شهر: تسديد (أو إلغاء إن كان مسددًا)
export function holdInfo(el) {
  const { id, ym, k } = el.dataset;
  if (k === 'before' || !SY.can('pay')) return null;
  const { m } = ymParse(ym);
  return { id, ym, m, cancel: k === 'paid' };
}
export function holdDone({ id, ym, cancel }) {
  const s = S.ix().sub.get(id); if (!s) return;
  if (cancel) {
    const prev = S.unpayMonth(id, ym);
    if (prev) toast(`أُلغي تسديد ${ymLabel(ym)}`, { undo: () => S.restoreRecords(prev), quiet: true });
  } else {
    const prev = S.payMonths(id, [ym]);
    toast(`تم تسديد ${ymLabel(ym)} — ${s.name}`, { undo: () => S.restoreRecords(prev), quiet: true });
  }
}

/* ───────── الصلاحيات ───────── */
const permRows = (perms) => PERMS.map((p) => `<label class="permrow"><input type="checkbox" name="p_${p.k}" ${perms[p.k] !== false ? 'checked' : ''}><span class="sw"></span><div class="grow"><b>${esc(p.t)}</b><small>${esc(p.d)}</small></div></label>`).join('');
const readPerms = (fd) => Object.fromEntries(PERMS.map((p) => [p.k, fd.get('p_' + p.k) !== null]));
function permsSheet(x) {
  openSheet(`<form data-form="perms" data-id="${x.id}"><h3 class="sh-title">صلاحيات ${esc(x.display)}</h3>
    <p class="hint">الصلاحية الموقوفة تُخفي الأزرار المقابلة عنده، ويرفض الخادم أي تغيير منها. التسعيرة يراها ولا يغيّرها دائمًا.</p>
    <div class="permlist">${permRows(x.perms || {})}</div>
    <button class="btn primary block lg" type="submit">${icon('check')}حفظ الصلاحيات</button></form>`);
}
forms.perms = async (fd, form) => {
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try { await SY.updateUser(form.dataset.id, { perms: readPerms(fd) }); closeSheet(); toast('تم حفظ الصلاحيات'); } catch (e) { toast(e.message); btn.disabled = false; }
};

/* ───────── تحديث التطبيق ───────── */
const mb = (n) => `${(n / 1048576).toFixed(1)} م.ب`;
export function updateSheet(u) {
  hideToast();
  const w = openSheet(`<h3 class="sh-title">تحديث جديد متوفر</h3>
    <div class="card" style="box-shadow:none;background:var(--surface2)"><div class="card-hr"><b>الإصدار ${u.build}</b><small>أنت على ${currentBuild() || 'غير معروف'} · ${mb(u.size)}</small></div>
      ${u.notes ? `<p class="muted sm" style="white-space:pre-wrap;max-height:130px;overflow:auto">${esc(u.notes.slice(0, 700))}</p>` : ''}</div>
    <div id="upd-prog" hidden><div class="bar"><i style="width:0%"></i></div><p class="hint" id="upd-t"></p></div>
    <button class="btn primary block lg" id="upd-go">${icon('download')}تنزيل وتثبيت</button>
    <button class="btn ghost block" id="upd-later">لاحقًا</button>`);
  const go = w.querySelector('#upd-go'); const prog = w.querySelector('#upd-prog'); const txt = w.querySelector('#upd-t');
  w.querySelector('#upd-later').onclick = () => closeSheet();
  const fin = (r) => {
    go.disabled = false;
    if (r === 'permission') { txt.textContent = 'فعّل «السماح بالتثبيت من هذا المصدر» ثم ارجع واضغط تثبيت.'; go.innerHTML = `${icon('check')}تثبيت`; go.onclick = async () => { try { fin(await install()); } catch (e) { toast('تعذّر التثبيت'); } }; }
    else { txt.textContent = r === 'external' ? 'فُتح رابط التنزيل في المتصفح.' : 'اضغط «تثبيت» في نافذة أندرويد لإكمال التحديث.'; go.innerHTML = `${icon('check')}تم`; go.onclick = () => closeSheet(); }
  };
  go.onclick = async () => {
    go.disabled = true; prog.hidden = false; txt.textContent = 'جارٍ التنزيل…';
    try {
      const r = await downloadAndInstall(u.url, (pct) => { prog.querySelector('i').style.width = pct + '%'; txt.textContent = `جارٍ التنزيل… ${pct}%`; });
      prog.querySelector('i').style.width = '100%';
      fin(r);
    } catch (e) { go.disabled = false; txt.textContent = 'تعذّر التنزيل. تحقق من الاتصال وأعد المحاولة.'; }
  };
}

forms.prompt = (fd, form) => { const ok = form._save(fd.get('v')); if (ok !== false) closeSheet(); };

/* ───────── الإعدادات والبيانات ───────── */
async function shareFile(name, text) {
  const C = window.Capacitor; const P = C && C.Plugins;
  try {
    if (C && C.isNativePlatform && C.isNativePlatform() && P && P.Filesystem && P.Share) {
      const r = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, url: r.uri, dialogTitle: 'حفظ النسخة الاحتياطية' });
      return;
    }
  } catch (e) { toast('تعذّر المشاركة'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function importFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const txt = await f.text(); JSON.parse(txt);
      if (await confirmBox({ title: 'استعادة النسخة؟', text: 'ستُستبدل كل البيانات الحالية ببيانات الملف.', ok: 'استعادة', danger: true })) {
        S.importJSON(txt); toast('تمت الاستعادة'); nav.go('/home');
      }
    } catch (e) { toast('ملف غير صالح'); }
  };
  inp.click();
}
forms.onboard = (fd) => {
  const pr = parseNum(fd.get('price'));
  if (pr > 0) S.setPrice(ymNow(), pr);
  S.setSetting('user', (fd.get('user') || '').trim());
  S.setSetting('onboarded', true);
  const g = S.addGenerator({ name: (fd.get('name') || 'المولدة 1').trim(), price: 0 });
  toast('جاهز! أضف الآن أول كابينة');
  nav.go(`/gen/${g.id}`);
};
forms.import = (fd) => {
  const { rows } = S.parseQuick(fd.get('text'));
  if (!rows.length) return toast('لا توجد أسطر صالحة');
  const n = S.importRows(fd.get('cab'), rows, ymNow());
  toast(`تم استيراد ${n} مشترك`);
  nav.go(`/cab/${fd.get('cab')}`);
};

/* ───────── الإجراءات ───────── */
const CATS = ['دهن', 'غاز', 'صيانة', 'رواتب', 'قطع غيار', 'أخرى'];
function ledgerSheet({ kind, partyId }) {
  const party = partyId ? S.live('parties').find((p) => p.id === partyId) : null;
  const title = { in: 'تسجيل وارد', out: party ? `تسديد إلى ${party.name}` : 'تسجيل مصروف', owe: `مطلوب لـ ${party?.name || ''}` }[kind];
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`<form data-form="ledger" data-kind="${kind}" data-party="${partyId || ''}">
    <h3 class="sh-title">${esc(title)}</h3>
    <label class="field"><span>المبلغ (${CUR})</span><input name="amount" inputmode="decimal" autocomplete="off" required autofocus></label>
    ${party ? '' : `<label class="field"><span>${kind === 'in' ? 'مصدر الوارد' : 'نوع المصروف'}</span><input name="cat" list="cats" placeholder="${kind === 'in' ? 'مثال: اشتراك خارجي' : 'مثال: دهن'}" autocomplete="off"></label>${kind === 'out' ? `<datalist id="cats">${CATS.map((c) => `<option value="${c}">`).join('')}</datalist>` : ''}`}
    <label class="field"><span>ملاحظة</span><input name="note" autocomplete="off"></label>
    <label class="field"><span>التاريخ</span><input type="date" name="date" value="${today}"></label>
    <button class="btn primary block lg" type="submit">${icon('check')}حفظ</button></form>`);
}
forms.ledger = (fd, form) => {
  const amount = parseNum(fd.get('amount'));
  if (!(amount > 0)) return toast('اكتب المبلغ');
  const ds = fd.get('date'); const d = ds && ds !== new Date().toISOString().slice(0, 10) ? new Date(`${ds}T12:00:00`).getTime() : Date.now();
  S.addLedger({ kind: form.dataset.kind, amount, cat: (fd.get('cat') || '').trim(), partyId: form.dataset.party || null, note: (fd.get('note') || '').trim(), at: Number.isFinite(d) ? d : Date.now() });
  closeSheet(); toast('تم الحفظ');
};
forms.login = async (fd, form) => {
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try { await SY.login(String(fd.get('username')).trim(), String(fd.get('password'))); toast('أهلًا ' + (SY.user()?.display || '')); nav.go('/home'); startWatch({ ask: true }).then(() => setTimeout(askPowerOnce, 1500)); } catch (e) { toast(e.message); } finally { btn.disabled = false; }
};
forms.setup = async (fd, form) => {
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try { await SY.setup({ name: String(fd.get('name')).trim(), display: String(fd.get('display')).trim(), username: String(fd.get('username')).trim(), password: String(fd.get('password')) }); closeSheet(); toast('تم إنشاء المساحة'); nav.go('/home'); } catch (e) { toast(e.message); btn.disabled = false; }
};
forms['user-new'] = async (fd, form) => {
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try { await SY.createSupervisor({ username: String(fd.get('username')).trim(), password: String(fd.get('password')), display: String(fd.get('display')).trim(), perms: readPerms(fd) }); closeSheet(); toast('تم إنشاء الحساب'); } catch (e) { toast(e.message); btn.disabled = false; }
};
forms.party = (fd) => {
  const name = (fd.get('name') || '').trim(); if (!name) return toast('اكتب اسم القائمة');
  const p = S.addParty(name); closeSheet(); nav.go(`/party/${p.id}`);
};

export const actions = {
  'ledger-add': (el) => ledgerSheet({ kind: el.dataset.kind, partyId: el.dataset.party }),
  'ledger-del': async (el) => { if (await confirmBox({ title: 'حذف هذه الحركة؟', ok: 'حذف', danger: true })) S.upd('ledger', el.dataset.id, { deleted: true }); },
  'party-add': () => openSheet(`<form data-form="party"><h3 class="sh-title">قائمة جديدة</h3><label class="field"><span>اسم الجهة</span><input name="name" placeholder="مثال: أبو الغاز، الصناعة، محلات محمود" autocomplete="off" required autofocus></label><button class="btn primary block lg" type="submit">إنشاء</button></form>`),
  'party-del': async (el) => { if (await confirmBox({ title: 'حذف القائمة؟', text: 'تُحذف حركاتها أيضًا.', ok: 'حذف', danger: true })) { const id = el.dataset.id; S.live('ledger').filter((e) => e.partyId === id).forEach((e) => S.upd('ledger', e.id, { deleted: true })); S.upd('parties', id, { deleted: true }); nav.back(); } },
  'sync-now': () => { SY.syncNow({ loud: true }); toast('جارٍ المزامنة…'); },
  logout: async () => { if (await confirmBox({ title: 'تسجيل الخروج؟', text: 'تبقى بياناتك على الجهاز، وتحتاج للدخول مجددًا.', ok: 'خروج' })) { await SY.logout(); nav.go('/home'); } },
  'setup-open': () => openSheet(`<form data-form="setup"><h3 class="sh-title">إنشاء المساحة والمدير</h3>
    <p class="hint">تُنفَّذ مرة واحدة فقط من جهاز المدير (حسن). بعدها ينشئ المشرفين من «المزيد ← إدارة المشرفين».</p>
    <label class="field"><span>اسم المولدة / المساحة</span><input name="name" autocomplete="off"></label>
    <label class="field"><span>اسمك</span><input name="display" autocomplete="off" required></label>
    <label class="field"><span>اسم المستخدم (إنجليزي)</span><input name="username" dir="ltr" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" required></label>
    <label class="field"><span>كلمة المرور (6 أحرف فأكثر)</span><input name="password" type="password" dir="ltr" autocomplete="new-password" required></label>
    <button class="btn primary block lg" type="submit">إنشاء</button></form>`),
  'user-add': () => openSheet(`<form data-form="user-new"><h3 class="sh-title">مشرف جديد</h3>
    <label class="field"><span>الاسم الذي يظهر في السجلات</span><input name="display" autocomplete="off" required autofocus></label>
    <label class="field"><span>اسم المستخدم (إنجليزي)</span><input name="username" dir="ltr" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" required></label>
    <label class="field"><span>كلمة المرور (6 أحرف فأكثر)</span><input name="password" dir="ltr" autocomplete="off" required></label>
    <details class="adv"><summary>${icon('shield')}الصلاحيات (كلها مفعّلة تلقائيًا)</summary>${permRows({})}</details>
    <p class="hint">سلّم الاسم وكلمة المرور للمشرف ليدخل بهما من جهازه. تستطيع تعديل صلاحياته لاحقًا.</p>
    <button class="btn primary block lg" type="submit">إنشاء الحساب</button></form>`),
  'user-menu': (el) => {
    const x = (SY.teamList() || []).find((u) => u.id === el.dataset.id); if (!x) return;
    menuSheet(x.display, [menuItem('shield', 'الصلاحيات', 'user-perms', `data-id="${x.id}"`), menuItem('edit', 'تعديل الاسم', 'user-rename', `data-id="${x.id}"`), menuItem('hash', 'تغيير كلمة المرور', 'user-pass', `data-id="${x.id}"`), menuItem(x.active ? 'x' : 'check', x.active ? 'إيقاف الحساب' : 'تفعيل الحساب', 'user-toggle', `data-id="${x.id}"`, x.active)]);
  },
  'user-rename': (el) => { const x = SY.teamList().find((u) => u.id === el.dataset.id); promptSheet({ title: 'تعديل الاسم', label: 'الاسم', value: x.display, onSave: (v) => { SY.updateUser(x.id, { display: v.trim() }).then(() => toast('تم الحفظ')).catch((e) => toast(e.message)); } }); },
  'user-pass': (el) => promptSheet({ title: 'كلمة مرور جديدة', label: 'كلمة المرور (6 أحرف فأكثر)', hint: 'سيُسجَّل خروج المشرف من أجهزته ويدخل بالكلمة الجديدة.', onSave: (v) => { SY.updateUser(el.dataset.id, { password: v.trim() }).then(() => toast('تم تغيير كلمة المرور')).catch((e) => toast(e.message)); } }),
  'user-toggle': async (el) => { const x = SY.teamList().find((u) => u.id === el.dataset.id); if (x.active && !(await confirmBox({ title: `إيقاف ${x.display}؟`, text: 'لن يستطيع الدخول أو المزامنة حتى تعيد تفعيله.', ok: 'إيقاف', danger: true }))) return; SY.updateUser(x.id, { active: !x.active }).then(() => toast(x.active ? 'تم الإيقاف' : 'تم التفعيل')).catch((e) => toast(e.message)); },
  back: () => nav.back(),
  go: (el) => nav.go(el.dataset.to),
  'sheet-close': () => closeSheet(),
  search: () => pickSubscriber((s) => nav.go(`/sub/${s.id}`), 'بحث عن مشترك'),
  ym: (el) => { ui.ym = ymAdd(ui.ym, +el.dataset.d); nav.rerender(); },
  year: (el) => { ui.year += +el.dataset.d; nav.rerender(); },
  phase: (el) => { ui.phase[el.dataset.gen] = el.dataset.id; nav.rerender(); },
  filter: (el) => { ui.filter = el.dataset.k; nav.rerender(); },
  gfilter: (el) => { ui.gfilter = el.dataset.k; nav.rerender(); },
  'notes-tab': (el) => { ui.notesTab = el.dataset.k; nav.rerender(); },
  'more-subs': () => { ui.limit += 60; nav.rerender(); },
  'open-sub': (el) => nav.go(`/sub/${el.dataset.id}`),
  tile: (el) => {
    const { id, ym } = el.dataset; const s = S.ix().sub.get(id);
    const k = S.monthState(s, ym);
    if (k === 'before') return toast('هذا الشهر قبل بداية حساب المشترك');
    if (!SY.can('pay')) return toast('ليست لديك صلاحية التسديد');
    if (k === 'paid') return toast('اضغط مطولًا (ثانية) لإلغاء تسديد هذا الشهر', { quiet: true });
    const ok = S.unpaidMonths(s).includes(ym) || [1, 2, 3].map((i) => ymAdd(ymNow(), i)).includes(ym);
    if (!ok) return toast('اضغط مطولًا (ثانية) لتسديد هذا الشهر مقدّمًا', { quiet: true });
    paySheet(id, ym);
  },
  'price-edit': (el) => { if (SY.isManager()) priceSheet(el.dataset.ym); },
  'price-clear': (el) => { if (SY.isManager()) { S.clearPrice(el.dataset.ym); toast('أُزيل تحديد التسعيرة'); } },
  'snd-pick': (el) => {
    const G = GROUPS[el.dataset.g]; if (!G) return;
    S.setSetting(G.key, el.dataset.id);
    sfx.preview(el.dataset.g, el.dataset.id);
  },
  'update-check': async (el) => {
    toast('جارٍ البحث عن تحديث…');
    try {
      const u = await checkUpdate();
      if (u.newer) updateSheet(u); else toast(`أنت على آخر إصدار (${currentBuild() || u.build})`);
    } catch (e) { toast('تعذّر الاتصال بـ GitHub'); }
  },
  'notif-test': async () => { try { await power.test(); toast('اخرج من التطبيق الآن وانتظر 10 ثوانٍ'); setTimeout(() => nav.rerender(), 14000); } catch (e) { toast('هذه الميزة تحتاج التحديث الأخير'); } },
  'watch-restart': async () => { const r = await startWatch({ ask: true }); toast(r === 'ok' ? 'أُعيد تشغيل الخدمة' : 'لم يُمنح إذن الإشعارات'); setTimeout(() => nav.rerender(), 2500); },
  'watch-toggle': async () => {
    const on = S.settings().watch === false;
    S.setSetting('watch', on);
    if (on) { const r = await startWatch({ ask: true }); toast(r === 'ok' ? 'تم تفعيل التنبيهات' : 'لم يُمنح إذن الإشعارات. فعّله من إعدادات إشعارات الهاتف'); } else { stopWatch(); toast('أُوقفت التنبيهات خارج التطبيق'); }
  },
  'power-request': () => power.request(),
  'notif-settings': () => power.notifSettings(),
  'app-settings': () => power.appSettings(),
  'user-perms': (el) => { const x = (SY.teamList() || []).find((u) => u.id === el.dataset.id); if (x) permsSheet(x); },
  pyear: (el) => { ui.pyear += +el.dataset.d; nav.rerender(); },
  'toggle-sound': () => { S.setSetting('sound', S.settings().sound === false); if (S.settings().sound !== false) sfx.ok(); },
  'toggle-haptic': () => { S.setSetting('haptic', S.settings().haptic === false); if (S.settings().haptic !== false) haptic('success'); },
  'quick-pay': (el) => quickPay(el.dataset.id),
  pay: (el) => paySheet(el.dataset.id),
  'pay-pick': () => pickSubscriber((s) => paySheet(s.id), 'من الذي دفع؟'),
  'add-gen': () => generatorSheet(),
  'add-cab': (el) => cabinetSheet({ phaseId: el.dataset.id }),
  'add-sub': (el) => subSheet({ cabinetId: el.dataset.cab }),
  'add-partner': (el) => { const c = S.ix().conn.get(el.dataset.conn); subSheet({ cabinetId: c.cabinetId, connectionId: c.id }); },
  'edit-sub': (el) => subSheet({ subId: el.dataset.id }),
  'add-note': (el) => noteSheet({ subId: el.dataset.id }),
  'add-debt': (el) => (el.dataset.id ? debtSheet({ subId: el.dataset.id, kind: 'debt' }) : pickSubscriber((s) => debtSheet({ subId: s.id, kind: 'debt' }), 'على من الدين؟')),
  'pay-debt': (el) => debtSheet({ subId: el.dataset.id, kind: 'payment' }),
  'note-done': (el) => { const n = S.raw().notes.find((x) => x.id === el.dataset.id); S.upd('notes', n.id, { done: !n.done, doneAt: Date.now(), doneBy: S.settings().user || '' }); S.logAct(`${n.done ? 'أُعيد فتح' : 'أُنهيت'} ملاحظة: ${n.text.length > 50 ? n.text.slice(0, 50) + '…' : n.text}`, n.subId, 'note'); toast(n.done ? 'أُنهيت الملاحظة' : 'أُعيد فتحها'); },
  'note-del': async (el) => { if (await confirmBox({ title: 'حذف الملاحظة؟', ok: 'حذف', danger: true })) S.upd('notes', el.dataset.id, { deleted: true }); },
  'gen-menu': (el) => {
    const id = el.dataset.id;
    menuSheet('خيارات المولدة', [menuItem('edit', 'تعديل الاسم والسعة', 'edit-gen', `data-id="${id}"`), menuItem('list', 'تعديل أسماء الفيزات', 'edit-phases', `data-id="${id}"`), menuItem('trash', 'حذف المولدة', 'del-gen', `data-id="${id}"`, true)]);
  },
  'edit-gen': (el) => generatorSheet(S.ix().gen.get(el.dataset.id)),
  'edit-phases': (el) => phasesSheet(el.dataset.id),
  'del-gen': async (el) => { if (await confirmBox({ title: 'حذف المولدة؟', text: 'سيُحذف كل ما تحتها: الفيزات والكابينات والمشتركون.', ok: 'حذف', danger: true })) { S.removeEntity('generators', el.dataset.id); nav.go('/home'); } },
  'cab-menu': (el) => {
    const id = el.dataset.id;
    menuSheet('خيارات الكابينة', [menuItem('edit', 'تعديل الاسم', 'edit-cab', `data-id="${id}"`), menuItem('list', 'إدخال سريع إلى هذه الكابينة', 'go', 'data-to="/import"'), menuItem('trash', 'حذف الكابينة', 'del-cab', `data-id="${id}"`, true)]);
  },
  'edit-cab': (el) => cabinetSheet({ cab: S.ix().cab.get(el.dataset.id) }),
  'del-cab': async (el) => { if (await confirmBox({ title: 'حذف الكابينة؟', text: 'سيُحذف مشتركوها أيضًا.', ok: 'حذف', danger: true })) { S.removeEntity('cabinets', el.dataset.id); nav.back(); } },
  'conn-menu': (el) => connSheet(el.dataset.id),
  'del-conn': async (el) => { if (await confirmBox({ title: 'حذف الجوزة؟', text: 'سيُحذف كل مشتركيها.', ok: 'حذف', danger: true })) S.removeEntity('connections', el.dataset.id); },
  'sub-menu': (el) => {
    const id = el.dataset.id; const s = S.ix().sub.get(id);
    menuSheet(s.name, [
      menuItem('plus', 'إضافة شريك على نفس الجوزة', 'add-partner', `data-conn="${s.connectionId}"`),
      menuItem('shield', s.active === false ? 'إعادة تفعيل المشترك' : 'إيقاف المشترك', 'toggle-active', `data-id="${id}"`),
      menuItem('trash', 'حذف المشترك', 'del-sub', `data-id="${id}"`, true)]);
  },
  'toggle-active': (el) => { const s = S.ix().sub.get(el.dataset.id); S.upd('subscribers', s.id, { active: s.active === false }); S.logAct(`${s.active === false ? 'تفعيل' : 'إيقاف'} مشترك: ${s.name}`, s.id, 'sub'); },
  'del-sub': async (el) => { const s = S.ix().sub.get(el.dataset.id); if (await confirmBox({ title: `حذف ${s.name}؟`, text: 'سيُحذف سجله وأشهره.', ok: 'حذف', danger: true })) { S.removeSubscriber(s.id); nav.back(); } },
  'set-user': () => promptSheet({ title: 'اسمك', label: 'الاسم', value: S.settings().user, onSave: (v) => S.setSetting('user', v.trim()) }),
  'cycle-theme': () => { const o = ['auto', 'light', 'dark']; S.setSetting('theme', o[(o.indexOf(S.settings().theme) + 1) % 3]); },
  export: () => shareFile(`generator-backup-${new Date().toISOString().slice(0, 10)}.json`, S.exportJSON()),
  'import-file': () => importFile(),
  'seed-demo': async () => { if (!S.generators().length || await confirmBox({ title: 'تحميل بيانات تجريبية؟', text: 'ستُضاف إلى بياناتك الحالية.', ok: 'تحميل' })) { S.seedDemo(); nav.go('/home'); toast('تم تحميل بيانات تجريبية'); } },
};

export function handleSubmit(form) {
  const name = form.dataset.form;
  const fn = forms[name];
  if (!fn) return;
  fn(new FormData(form), form);
}
export { closeAllSheets };
