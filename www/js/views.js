// الشاشات: كل دالة تعيد { html, tab } ويُركَّب الناتج في #view
import * as SY from './sync.js';
import { esc, fmtNum, ymNow, ymLabel, ymAdd, ymParse, MONTHS, timeAgo, normDigits } from './util.js';
import * as S from './store.js';
import { icon, money, moneyShort, ring, bar, empty, chip } from './ui.js';
import { GROUPS } from './fx.js';
import { PERMS } from './perms.js';

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
// تاريخ ووقت مصغّران يتسعان داخل مربع الشهر: سطر للتاريخ (سنة/شهر/يوم) وسطر للساعة
const stampLines = (ts) => {
  if (!ts) return '';
  const d = new Date(ts); const p = (n) => String(n).padStart(2, '0');
  return `<em class="at">${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}</em><em class="at">${p(d.getHours())}:${p(d.getMinutes())}</em>`;
};

export const ui = {
  ym: ymNow(), phase: {}, q: '', filter: 'all', gfilter: 'all', year: new Date().getFullYear(),
  notesTab: 'open', limit: 60, pyear: new Date().getFullYear(),
};
export const resetViewState = () => { ui.q = ''; ui.filter = 'all'; ui.limit = 60; };

const HUES = [212, 160, 28, 280, 340, 190, 100, 250];
export const avatar = (name) => {
  const ch = [...String(name || '؟').replace(/^ال/, '').trim()][0] || '؟';
  const h = HUES[(String(name || '').charCodeAt(0) || 0) % HUES.length];
  return `<span class="av" style="--h:${h}">${esc(ch)}</span>`;
};
export const statusChip = (sub) => { const s = S.statusOf(sub); return chip(s.k, s.text); };
export const NOTE_TYPES = {
  broken: { t: 'واير مقطوع', ic: 'cut', c: 'bad' },
  float: { t: 'جوزة طافية', ic: 'alert', c: 'warn' },
  faulty: { t: 'جوزة عاطلة', ic: 'alert', c: 'bad' },
  visit: { t: 'متابعة / زيارة', ic: 'user', c: 'info' },
  other: { t: 'ملاحظة', ic: 'note', c: 'info' },
};
export const CONN_STATES = { ok: 'سليمة', float: 'طافية', faulty: 'عاطلة', broken: 'مقطوع' };

const appbar = ({ title, sub = '', back = true, actions = '', extra = '' }) => `
<header class="appbar">
  <div class="ab-row">
    ${back ? `<button class="ab-btn" data-act="back" aria-label="رجوع">${icon('back')}</button>` : `<div class="brand">${icon('bolt')}</div>`}
    <div class="ab-title"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    <div class="ab-actions">${actions}</div>
  </div>
  ${extra}
</header>`;
const abBtn = (act, ic, label, extra = '') => `<button class="ab-btn" data-act="${act}" ${extra} aria-label="${esc(label)}">${icon(ic)}</button>`;
const bellBtn = () => { const n = S.unread(); return `<button class="ab-btn bell" data-act="go" data-to="/log" aria-label="الإشعارات">${icon('bell')}${n ? `<i class="badge">${n > 99 ? '99+' : n}</i>` : ''}</button>`; };
const tile = (ic, label, val) => `<div class="tile">${icon(ic)}<b>${val}</b><small>${label}</small></div>`;
const secH = (t, right = '') => `<div class="sec-h"><h2>${t}</h2>${right}</div>`;
const notFound = () => ({ tab: 'home', html: appbar({ title: 'غير موجود' }) + `<main class="body">${empty('info', 'هذا العنصر غير موجود', 'ربما حُذف.', '<a class="btn primary" href="#/home">الرئيسية</a>')}</main>` });
const noPriceBanner = () => {
  const now = ymNow();
  if (S.generators().some((g) => S.priceFor(now, g.id) > 0)) {
    // المدير: تذكير بتحديد تسعيرة الشهر الجديد (كل شهر يبدأ بتسعيرة)
    if (SY.isManager() && !S.priceOwn(now) && S.ix().prices.length) {
      const r = S.priceRecFor(now);
      return `<button class="banner info" data-act="go" data-to="/prices">${icon('tag')}<span>تسعيرة ${esc(ymLabel(now))} لم تُحدَّد بعد، وتُحسب الآن بسعر ${esc(ymLabel(r.ym))} (${money(r.price)}). اضغط للتأكيد أو التغيير.</span></button>`;
    }
    return '';
  }
  return SY.isManager()
    ? `<button class="banner warn" data-act="go" data-to="/prices">${icon('alert')}<span>سعر الأمبير غير محدد، فلن تُحسب المبالغ. اضغط لتحديد التسعيرة.</span></button>`
    : `<div class="banner warn">${icon('alert')}<span>سعر الأمبير غير محدد بعد. راجع المدير ليحدده.</span></div>`;
};

/* ───────── الرئيسية ───────── */
function onboarding() {
  return `
<div class="welcome">
  <div class="w-logo">${icon('bolt')}</div>
  <h1>حسابات المولدة</h1>
  <p>سجّل المشتركين والأمبيرات والأشهر والديون في مكان واحد، بدل الدفتر الورقي.</p>
  <form class="card w-form" data-form="onboard">
    <label class="field"><span>اسم المولدة</span><input name="name" value="المولدة 1" required autocomplete="off"></label>
    <label class="field"><span>سعر الأمبير (شهريًا)</span><input name="price" inputmode="decimal" placeholder="مثال: 7000" autocomplete="off"></label>
    <label class="field"><span>اسمك (يظهر في سجل النشاط)</span><input name="user" placeholder="اختياري" autocomplete="off"></label>
    <button class="btn primary block lg" type="submit">ابدأ الاستخدام</button>
  </form>
  <button class="btn ghost block" data-act="seed-demo">تجربة ببيانات تجريبية</button>
</div>`;
}

const genCard = (g, ym) => {
  const s = S.stats(S.subsOfGen(g.id), ym);
  const pct = s.expected ? s.collected / s.expected : 0;
  return `<a class="card gen" href="#/gen/${g.id}">
    <div class="gen-ic">${icon('gen')}</div>
    <div class="grow">
      <b>${esc(g.name)}</b>
      <small>${s.count} مشترك · ${fmtNum(s.amps)}${g.capacity > 0 ? ' / ' + fmtNum(g.capacity) : ''} أمبير${g.capacity > 0 && s.amps > g.capacity ? ' ⚠' : ''}</small>
      ${bar(pct, pct >= 1 ? 'ok' : '')}
      <div class="gen-foot"><span>محصّل ${Math.round(pct * 100)}%</span><span class="${s.debt ? 'bad' : 'ok'}">${s.debt ? 'ديون ' + moneyShort(s.debt) : 'لا ديون'}</span></div>
    </div>${icon('next', 'chev')}</a>`;
};

export function home() {
  const gens = S.generators();
  if (!gens.length) return { tab: 'home', html: onboarding(), bare: true };
  const ym = ui.ym;
  const st = S.stats(S.allSubs(), ym);
  const pct = st.expected ? st.collected / st.expected : 0;
  const hero = `
  <div class="hero">
    <div class="ymsw">
      <button data-act="ym" data-d="-1" aria-label="الشهر السابق">${icon('back')}</button>
      <span>${ymLabel(ym)}</span>
      <button data-act="ym" data-d="1" aria-label="الشهر التالي">${icon('next')}</button>
    </div>
    <div class="hero-main">
      ${ring(pct, 92)}
      <div class="hm-t"><small>المحصّل في الشهر</small><strong>${money(st.collected)}</strong><small>من أصل ${money(st.expected)}</small></div>
    </div>
    <div class="tiles">${tile('users', 'مشترك', st.count)}${tile('bolt', 'أمبير', fmtNum(st.amps))}${tile('wallet', 'ديون', moneyShort(st.debt))}</div>
  </div>`;
  const log = S.raw().log.slice(0, 5);
  const html = appbar({ title: 'حسابات المولدة', back: false, actions: abBtn('search', 'search', 'بحث') + bellBtn(), extra: hero }) + `
  <main class="body">
    ${noPriceBanner()}
    ${secH('المولدات', `<button class="link" data-act="add-gen">${icon('plus')}مولدة جديدة</button>`)}
    ${gens.map((g) => genCard(g, ym)).join('')}
    ${secH('إجراءات سريعة')}
    <div class="quick">
      <button class="q" data-act="add-sub">${icon('plus')}<span>مشترك جديد</span></button>
      <button class="q" data-act="pay-pick">${icon('check')}<span>تسجيل دفعة</span></button>
      <button class="q" data-act="add-note">${icon('note')}<span>ملاحظة</span></button>
      <button class="q" data-act="go" data-to="/books">${icon('wallet')}<span>حساباتي</span></button>
    </div>
    ${log.length ? secH('آخر النشاط', `<a class="link" href="#/log">الكل</a>`) + `<div class="card list">${log.map((l) => `<div class="li"><span class="dot"></span><div class="grow"><b>${esc(l.text)}</b><small>${timeAgo(l.at)}${l.by ? ' · ' + esc(l.by) : ''}</small></div></div>`).join('')}</div>` : ''}
  </main>`;
  return { tab: 'home', html };
}

/* ───────── المولدة ───────── */
export function generator({ id }) {
  const g = S.ix().gen.get(id);
  if (!g) return notFound();
  const phases = S.phasesOf(id);
  const pid = phases.find((p) => p.id === ui.phase[id])?.id || phases[0]?.id;
  const ym = ymNow();
  const seg = `<div class="seg">${phases.map((p) => `<button class="seg-b ${p.id === pid ? 'on' : ''}" data-act="phase" data-gen="${id}" data-id="${p.id}">${esc(p.name)}<small>${S.subsOfPhase(p.id).length}</small></button>`).join('')}</div>`;
  const cabs = S.cabinetsOf(pid);
  const ps = S.stats(S.subsOfPhase(pid), ym);
  const price = S.priceOfGen(id);
  const gs = S.stats(S.subsOfGen(id), ym);
  const cap = g.capacity > 0 ? g.capacity : 0;
  const over = cap && gs.amps > cap;
  const inv = `<div class="card inv">
    <div class="card-hr"><h3 class="card-h">جرد المولدة</h3><b class="${over ? 'bad' : ''}">${fmtNum(gs.amps)}${cap ? ' / ' + fmtNum(cap) : ''} أمبير</b></div>
    ${cap ? bar(gs.amps / cap, over ? 'bad' : gs.amps / cap > 0.9 ? 'warn' : 'ok') : '<p class="muted sm">حدد سعة المولدة من «خيارات» لتظهر نسبة الحمل.</p>'}
    ${over ? `<div class="banner warn">${icon('alert')}<span>الحمل تجاوز السعة بمقدار ${fmtNum(gs.amps - cap)} أمبير.</span></div>` : cap ? `<p class="muted sm">المتاح ${fmtNum(cap - gs.amps)} أمبير.</p>` : ''}
    <table class="inv-t"><thead><tr><th>الفيز</th><th>مشترك</th><th>أمبير</th><th>مسدد</th></tr></thead><tbody>
      ${phases.map((p) => { const st = S.stats(S.subsOfPhase(p.id), ym); return `<tr><td>${esc(p.name)}</td><td>${st.count}</td><td>${fmtNum(st.amps)}</td><td>${st.dueCount ? Math.round((st.paidCount / st.dueCount) * 100) : 0}%</td></tr>`; }).join('')}
      <tr class="tot"><td>الكل</td><td>${gs.count}</td><td>${fmtNum(gs.amps)}</td><td>${gs.dueCount ? Math.round((gs.paidCount / gs.dueCount) * 100) : 0}%</td></tr>
    </tbody></table></div>`;
  const html = appbar({
    title: g.name, sub: price > 0 ? `سعر الأمبير ${money(price)}` : 'سعر الأمبير غير محدد',
    actions: abBtn('gen-menu', 'more', 'خيارات', `data-id="${id}"`), extra: seg,
  }) + `
  <main class="body">
    ${inv}
    <div class="stats3">
      <div><b>${ps.count}</b><small>مشترك</small></div>
      <div><b>${fmtNum(ps.amps)}</b><small>أمبير</small></div>
      <div><b>${ps.dueCount ? Math.round((ps.paidCount / ps.dueCount) * 100) : 0}%</b><small>مسدد هذا الشهر</small></div>
    </div>
    ${secH('الكابينات', `<button class="link" data-act="add-cab" data-id="${pid}">${icon('plus')}كابينة</button>`)}
    ${cabs.length ? cabs.map((c) => cabCard(c, ym)).join('') : empty('box', 'لا توجد كابينات بعد', `أضف أول كابينة تحت ${phases.find((p) => p.id === pid)?.name || 'الفيز'}.`, `<button class="btn primary" data-act="add-cab" data-id="${pid}">${icon('plus')}إضافة كابينة</button>`)}
  </main>`;
  return { tab: 'home', html };
}
const cabCard = (c, ym) => {
  const s = S.stats(S.subsOfCab(c.id), ym);
  const pct = s.dueCount ? s.paidCount / s.dueCount : 0;
  return `<a class="card cab" href="#/cab/${c.id}">
    <div class="cab-ic">${icon('box')}</div>
    <div class="grow"><b>${esc(c.name)}</b><small>${s.count} مشترك · ${fmtNum(s.amps)} أمبير</small>${bar(pct, pct >= 1 ? 'ok' : '')}</div>
    <div class="cab-side">${s.debt ? `<span class="bad">${moneyShort(s.debt)}</span><small>ديون</small>` : `<span class="ok">${icon('check')}</span><small>${s.count ? 'مسدد' : 'فارغة'}</small>`}</div>
  </a>`;
};

/* ───────── الكابينة ───────── */
const matchQ = (sub, conn, q) => {
  if (!q) return true;
  const n = normDigits(q).trim();
  return sub.name.includes(q.trim()) || (/^\d+$/.test(n) && String(conn.no) === n);
};
const passFilter = (sub, f) => f === 'all' || S.statusOf(sub).k === f;

export function connCard(conn, subs) {
  const st = conn.state && conn.state !== 'ok' ? `<span class="chip warn sm">${CONN_STATES[conn.state]}</span>` : '';
  return `<div class="conn">
    <div class="conn-head">
      <div class="no"><small>جوزة</small>${conn.no}</div>
      <div class="grow"><b>${subs.length > 1 ? `${subs.length} مشتركين على الجوزة` : 'جوزة مستقلة'}</b>${st}</div>
      <button class="mini" data-act="add-partner" data-conn="${conn.id}">${icon('plus')}شريك</button>
      <button class="mini sq" data-act="conn-menu" data-id="${conn.id}" aria-label="خيارات">${icon('more')}</button>
    </div>
    ${subs.map((s) => subRow(s, true)).join('')}
  </div>`;
}
export function subRow(s, quick = false, path = false) {
  const st = S.statusOf(s);
  const due = S.dueOf(s);
  const pay = quick && st.k !== 'off'
    ? (st.k === 'paid' ? `<span class="pay-done" aria-label="مسدد">${icon('check')}</span>` : `<button class="pay-btn" data-act="quick-pay" data-id="${s.id}" aria-label="تسديد">${icon('check')}</button>`)
    : '';
  return `<div class="srow" data-act="open-sub" data-id="${s.id}">
    ${avatar(s.name)}
    <div class="grow"><b>${esc(s.name)}</b><small>${path ? esc(S.pathText(s)) + ' · ' : ''}${fmtNum(s.amps)} أمبير${due ? ' · ' + money(due) : ''}</small></div>
    ${chip(st.k, st.text)}${pay}
  </div>`;
}
export function cabinetList(cabId) {
  const q = ui.q; const f = ui.filter;
  const rows = S.connsOf(cabId).map((c) => ({ c, subs: S.subsOfConn(c.id) })).filter(({ c, subs }) => subs.some((s) => matchQ(s, c, q) && passFilter(s, f)));
  if (!rows.length) {
    const none = !S.subsOfCab(cabId).length;
    return empty(none ? 'users' : 'search', none ? 'لا يوجد مشتركون' : 'لا نتائج', none ? 'أضف أول مشترك في هذه الكابينة.' : 'جرّب كلمة أخرى أو غيّر التصفية.', none ? `<button class="btn primary" data-act="add-sub" data-cab="${cabId}">${icon('plus')}إضافة مشترك</button>` : '');
  }
  return rows.map(({ c, subs }) => connCard(c, subs)).join('');
}
export const FILTERS = [['all', 'الكل'], ['due', 'مستحق'], ['debt', 'متأخر'], ['paid', 'مسدد']];
export const filterChips = (cur) => `<div class="chips">${FILTERS.map(([k, t]) => `<button class="fc ${cur === k ? 'on' : ''}" data-act="filter" data-k="${k}">${t}</button>`).join('')}</div>`;

export function cabinet({ id }) {
  const cab = S.ix().cab.get(id);
  if (!cab) return notFound();
  const phase = S.ix().phase.get(cab.phaseId); const gen = S.ix().gen.get(phase.generatorId);
  const subs = S.subsOfCab(id); const st = S.stats(subs);
  const extra = `<div class="stats4">
    <div><b>${st.count}</b><small>مشترك</small></div><div><b>${fmtNum(st.amps)}</b><small>أمبير</small></div>
    <div><b>${st.paidCount}/${st.dueCount}</b><small>مسدد</small></div><div class="${st.debt ? 'bad' : ''}"><b>${moneyShort(st.debt)}</b><small>ديون</small></div></div>`;
  const html = appbar({ title: cab.name, sub: `${gen.name} › ${phase.name}`, actions: abBtn('cab-menu', 'more', 'خيارات', `data-id="${id}"`), extra }) + `
  <div class="toolbar">
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="ابحث بالاسم أو رقم الجوزة" value="${esc(ui.q)}" autocomplete="off"></label>
    ${filterChips(ui.filter)}
  </div>
  <main class="body" id="list" data-cab="${id}">${cabinetList(id)}</main>
  <button class="fab" data-act="add-sub" data-cab="${id}">${icon('plus')}<span>مشترك</span></button>`;
  return { tab: 'home', html, live: 'cab' };
}

export const dt = (ts) => {
  const d = new Date(ts); const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
export const receiptRow = (r) => {
  const cancel = r.kind === 'cancel';
  const months = (r.items || []).map((i) => ymLabel(i.ym)).join('، ');
  return `<div class="li"><span class="dot ${cancel ? 'bad' : 'ok'}"></span><div class="grow"><b>${cancel ? 'إلغاء تسديد' : 'استلام'} · ${esc(months)}</b><small>${esc(r.by || 'غير معروف')} · ${dt(r.at)}</small></div><b class="${cancel ? 'bad' : ''}">${money(r.amount)}</b></div>`;
};

/* ───────── المشترك ───────── */
export function subscriber({ id }) {
  const s = S.ix().sub.get(id);
  if (!s) return notFound();
  const { conn, cab, phase, gen } = S.pathOf(s);
  const d = S.debtOf(s); const due = S.dueOf(s); const st = S.statusOf(s);
  const now = ymNow(); const year = ui.year;
  const tiles = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    const k = S.monthState(s, ym);
    const r = k === 'paid' || k === 'partial' ? S.rec(id, ym) : null;
    const any = !r ? S.recAny(id, ym) : null;
    const cx = any && any.deleted && any.cx ? any.cx : null; // شهر أُلغي تسديده: من ألغاه ومتى
    const who = r ? { by: r.by, at: r.at } : cx;
    return `<button class="mt ${k} ${ym === now ? 'cur' : ''}" data-act="tile" data-id="${id}" data-ym="${ym}" data-k="${k}" data-silent="1" ${s.active === false ? 'disabled' : ''}>
      <b>${i + 1}</b><small>${MONTHS[i]}</small>${who ? `<em class="by ${cx ? 'cx' : ''}">${cx ? '✕ ' : ''}${esc(firstName(who.by) || '—')}</em>${stampLines(who.at)}` : ''}${k === 'paid' ? icon('check', 'mt-ic') : k === 'partial' ? '<i class="mt-half"></i>' : ''}</button>`;
  }).join('');
  const debts = (S.ix().debtsBySub.get(id) || []).slice().sort((a, b) => b.at - a.at);
  const notes = S.live('notes').filter((n) => n.subId === id || (n.connId && n.connId === s.connectionId)).sort((a, b) => b.createdAt - a.createdAt);
  const rcs = S.receiptsOf(id).slice(0, 12);
  const acts = S.logOf(id).slice(0, 10);
  const partners = S.subsOfConn(s.connectionId).filter((x) => x.id !== id);
  const extra = `<div class="sub-hero">
    <div class="pill"><small>جوزة</small><b>${conn?.no ?? '—'}</b></div>
    <div class="pill"><small>الأمبيرات</small><b>${fmtNum(s.amps)}</b></div>
    <div class="pill"><small>الحالة</small><b>${esc(st.text)}</b></div>
    ${s.phone ? `<a class="call" href="tel:${esc(s.phone)}" aria-label="اتصال">${icon('phone')}</a>` : ''}
  </div>`;
  const html = appbar({ title: s.name, sub: S.pathText(s), actions: abBtn('edit-sub', 'edit', 'تعديل', `data-id="${id}"`) + abBtn('sub-menu', 'more', 'خيارات', `data-id="${id}"`), extra }) + `
  <main class="body">
    ${s.active === false ? `<div class="banner info">${icon('info')}<span>هذا المشترك موقوف، ولا تُحسب عليه أشهر.</span></div>` : ''}
    <div class="card sum">
      <div><small>الاشتراك الشهري</small><b>${due ? money(due) : '—'}</b></div>
      <div class="${d.total ? 'bad' : 'ok'}"><small>إجمالي المتبقي</small><b>${money(d.total)}</b></div>
      ${d.total ? `<div class="sum-sub grow2">${d.months.length ? `${d.months.length} أشهر غير مسددة = ${money(d.monthsAmount)}` : ''}${d.months.length && d.manual ? ' · ' : ''}${d.manual ? `دين مسجّل ${money(d.manual)}` : ''}</div>` : ''}
      <button class="btn primary block lg grow2" data-act="pay" data-id="${id}" ${s.active === false ? 'disabled' : ''}>${icon('check')}تسجيل دفعة</button>
    </div>
    <div class="card">
      <div class="yr"><button data-act="year" data-d="-1" aria-label="السنة السابقة">${icon('back')}</button><b>${year}</b><button data-act="year" data-d="1" aria-label="السنة التالية">${icon('next')}</button></div>
      <div class="mgrid">${tiles}</div>
      <div class="legend"><span><i class="lg paid"></i>مسدد</span><span><i class="lg partial"></i>ناقص</span><span><i class="lg unpaid"></i>غير مسدد</span><span><i class="lg future"></i>قادم</span><span><i class="lg before"></i>قبل البداية</span></div>
      <p class="hint hold-hint">${icon('clock')}<span><b>اضغط مطولًا</b> (ثانية) على الشهر لتسديده أو إلغاء تسديده، ويظهر تحته اسم المنفّذ وتاريخه. النقر السريع على شهر غير مسدد يفتح نافذة الدفع (للمبلغ الناقص).</span></p>
    </div>
    ${partners.length ? `<div class="card"><h3 class="card-h">شركاء على نفس الجوزة</h3>${partners.map((p) => subRow(p)).join('')}</div>` : ''}
    <div class="card">
      <div class="card-hr"><h3 class="card-h">الديون المسجّلة</h3><b class="${d.manual ? 'bad' : 'ok'}">${money(d.manual)}</b></div>
      ${debts.length ? debts.slice(0, 5).map((x) => `<div class="li"><span class="dot ${x.kind === 'debt' ? 'bad' : 'ok'}"></span><div class="grow"><b>${x.kind === 'debt' ? 'دين' : 'تسديد'} ${money(x.amount)}</b><small>${esc(x.note || '')} ${timeAgo(x.at)}</small></div></div>`).join('') : '<p class="muted sm">لا توجد ديون مسجّلة.</p>'}
      <div class="btn-row"><button class="btn soft grow" data-act="add-debt" data-id="${id}">${icon('plus')}تسجيل دين</button>${d.manual ? `<button class="btn soft grow" data-act="pay-debt" data-id="${id}">${icon('check')}تسديد دين</button>` : ''}</div>
    </div>
    <div class="card">
      <div class="card-hr"><h3 class="card-h">الملاحظات</h3><button class="link" data-act="add-note" data-id="${id}">${icon('plus')}ملاحظة</button></div>
      ${notes.length ? notes.map(noteRow).join('') : '<p class="muted sm">لا توجد ملاحظات.</p>'}
    </div>
    ${rcs.length ? `<div class="card"><h3 class="card-h">سجل الاستلام</h3>${rcs.map(receiptRow).join('')}</div>` : ''}
    ${acts.length ? `<div class="card"><h3 class="card-h">سجل حركات المشترك</h3>${acts.map((l) => `<div class="li"><span class="dot"></span><div class="grow"><b>${esc(l.text)}</b><small>${l.by ? `<span class="who-b">${esc(l.by)}</span> · ` : ''}${timeAgo(l.at)}</small></div></div>`).join('')}</div>` : ''}
  </main>`;
  return { tab: 'home', html };
}


/* ───────── الحسابات: واردات وصادرات وقوائم الجهات ───────── */
const ymSwitch = (ym) => `<div class="ymsw"><button data-act="ym" data-d="-1" aria-label="الشهر السابق">${icon('back')}</button><span>${esc(ymLabel(ym))}</span><button data-act="ym" data-d="1" aria-label="الشهر التالي">${icon('next')}</button></div>`;
const ledgerRow = (e) => {
  const party = e.partyId ? S.live('parties').find((p) => p.id === e.partyId) : null;
  const tone = e.kind === 'in' ? 'ok' : e.kind === 'out' ? 'bad' : 'warn';
  const lab = { in: 'وارد', out: 'مصروف', owe: 'مطلوب' }[e.kind];
  return `<div class="li"><span class="dot ${tone}"></span><div class="grow"><b>${esc(e.cat || party?.name || lab)}${e.cat && party ? ' · ' + esc(party.name) : ''}</b><small>${lab}${e.note ? ' · ' + esc(e.note) : ''} · ${esc(e.by || '')} · ${dt(e.at)}</small></div><b class="${tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : ''}">${money(e.amount)}</b><button class="mini sq" data-act="ledger-del" data-id="${e.id}" aria-label="حذف">${icon('trash')}</button></div>`;
};
export function books() {
  const ym = ui.ym; const r = S.monthReport(ym);
  const parties = S.parties();
  const recv = Object.entries(r.byReceiver);
  const cats = Object.entries(r.outByCat).sort((a, b) => b[1] - a[1]);
  const html = appbar({ title: 'حساباتي', sub: 'الواردات والصادرات', back: true, extra: ymSwitch(ym) }) + `
  <main class="body">
    <div class="card books-sum">
      <div class="net ${r.net < 0 ? 'bad' : 'ok'}"><small>الصافي</small><b>${money(r.net)}</b></div>
      <div class="bs-g"><div><small>الواردات</small><b class="ok">${money(r.income)}</b></div><div><small>المصروفات</small><b class="bad">${money(r.out)}</b></div></div>
      <div class="bs-rows"><div><span>اشتراكات محصّلة</span><b>${money(r.subsIncome)}</b></div><div><span>واردات أخرى</span><b>${money(r.otherIn)}</b></div></div>
      <div class="btn-row"><button class="btn soft" data-act="ledger-add" data-kind="in">${icon('plus')}وارد</button><button class="btn soft" data-act="ledger-add" data-kind="out">${icon('plus')}مصروف</button></div>
    </div>
    ${recv.length ? `<div class="card"><h3 class="card-h">من استلم الاشتراكات هذا الشهر</h3>${recv.map(([n, v]) => `<div class="li"><span class="dot ok"></span><div class="grow"><b>${esc(n)}</b></div><b>${money(v)}</b></div>`).join('')}</div>` : ''}
    ${cats.length ? `<div class="card"><h3 class="card-h">المصروفات حسب النوع</h3>${cats.map(([n, v]) => `<div class="li"><span class="dot bad"></span><div class="grow"><b>${esc(n)}</b></div><b>${money(v)}</b></div>`).join('')}</div>` : ''}
    ${secH('قوائم الجهات', `<button class="link" data-act="party-add">${icon('plus')}قائمة</button>`)}
    ${parties.length ? `<div class="card list">${parties.map((p) => { const b = S.partyBalance(p.id); return `<a class="set" href="#/party/${p.id}">${icon('wallet', 'set-ic')}<div class="grow"><b>${esc(p.name)}</b><small>${b > 0 ? 'مطلوب منك ' + money(b) : b < 0 ? 'دفعت زيادة ' + money(-b) : 'لا مطلوب'}</small></div>${icon('next', 'chev')}</a>`; }).join('')}</div>` : `<p class="muted sm">أنشئ قائمة لكل جهة تطلبك: أبو الغاز، أبو الدهن، الصناعة، المحلات…</p>`}
    ${secH('حركات الشهر')}
    ${r.entries.length ? `<div class="card list">${r.entries.map(ledgerRow).join('')}</div>` : '<p class="muted sm">لا توجد حركات مسجّلة هذا الشهر.</p>'}
    <div class="card"><h3 class="card-h">إيصالات الاشتراكات (${r.receipts.length})</h3>${r.receipts.slice().sort((a, b) => b.at - a.at).slice(0, 15).map((x) => { const sb = S.ix().sub.get(x.subId); return `<div class="li"><span class="dot ${x.kind === 'cancel' ? 'bad' : 'ok'}"></span><div class="grow"><b>${esc(sb?.name || '—')}${x.kind === 'cancel' ? ' (إلغاء)' : ''}</b><small>${esc(x.by || 'غير معروف')} · ${dt(x.at)}</small></div><b class="${x.kind === 'cancel' ? 'bad' : ''}">${money(x.amount)}</b></div>`; }).join('') || '<p class="muted sm">لا توجد إيصالات.</p>'}</div>
  </main>`;
  return { tab: 'more', html };
}
export function party({ id }) {
  const p = S.live('parties').find((x) => x.id === id);
  if (!p) return notFound();
  const bal = S.partyBalance(id); const list = S.ledgerOf(id);
  const html = appbar({ title: p.name, sub: 'قائمة خاصة', actions: abBtn('party-del', 'trash', 'حذف القائمة', `data-id="${id}"`) }) + `
  <main class="body">
    <div class="card books-sum"><div class="net ${bal > 0 ? 'bad' : 'ok'}"><small>${bal >= 0 ? 'المطلوب منك' : 'دفعت زيادة'}</small><b>${money(Math.abs(bal))}</b></div>
      <div class="btn-row"><button class="btn soft" data-act="ledger-add" data-kind="owe" data-party="${id}">${icon('plus')}تسجيل مطلوب</button><button class="btn primary" data-act="ledger-add" data-kind="out" data-party="${id}">${icon('check')}تسديد</button></div></div>
    ${list.length ? `<div class="card list">${list.map(ledgerRow).join('')}</div>` : '<p class="muted sm">لا توجد حركات في هذه القائمة.</p>'}
  </main>`;
  return { tab: 'more', html };
}

/* ───────── الملاحظات ───────── */
const noteRow = (n) => {
  const t = NOTE_TYPES[n.type] || NOTE_TYPES.other;
  let where = '';
  if (n.subId) { const s = S.ix().sub.get(n.subId); if (s) where = `${s.name}`; }
  else if (n.connId) { const c = S.ix().conn.get(n.connId); if (c) where = `جوزة ${c.no} · ${S.ix().cab.get(c.cabinetId)?.name || ''}`; }
  return `<div class="note ${n.done ? 'done' : ''}">
    <span class="n-ic ${t.c}">${icon(t.ic)}</span>
    <div class="grow"><b>${esc(t.t)}</b><p>${esc(n.text)}</p><small>${where ? esc(where) + ' · ' : ''}${n.createdBy || n.by ? `<span class="who-b">${icon('user')}${esc(n.createdBy || n.by)}</span> · ` : ''}${timeAgo(n.createdAt)}${n.done && n.doneBy ? ` · أنهاها ${esc(n.doneBy)}` : ''}</small></div>
    <div class="n-act"><button class="mini sq" data-act="note-done" data-id="${n.id}" aria-label="${n.done ? 'إعادة فتح' : 'تم الحل'}">${icon(n.done ? 'undo' : 'check')}</button><button class="mini sq" data-act="note-del" data-id="${n.id}" aria-label="حذف">${icon('trash')}</button></div>
  </div>`;
};
export function notes() {
  const all = S.live('notes').sort((a, b) => b.createdAt - a.createdAt);
  const open = all.filter((n) => !n.done); const done = all.filter((n) => n.done);
  const list = ui.notesTab === 'open' ? open : done;
  const html = appbar({ title: 'الملاحظات', back: false, sub: `${open.length} مفتوحة` }) + `
  <div class="toolbar"><div class="seg light"><button class="seg-b ${ui.notesTab === 'open' ? 'on' : ''}" data-act="notes-tab" data-k="open">مفتوحة<small>${open.length}</small></button><button class="seg-b ${ui.notesTab === 'done' ? 'on' : ''}" data-act="notes-tab" data-k="done">منتهية<small>${done.length}</small></button></div></div>
  <main class="body">${list.length ? `<div class="card list">${list.map(noteRow).join('')}</div>` : empty('note', ui.notesTab === 'open' ? 'لا توجد ملاحظات مفتوحة' : 'لا توجد ملاحظات منتهية', 'سجّل الأعطال والمتابعات: واير مقطوع، جوزة طافية…')}</main>
  <button class="fab" data-act="add-note">${icon('plus')}<span>ملاحظة</span></button>`;
  return { tab: 'notes', html };
}

/* ───────── المشتركون ───────── */
const genChips = () => {
  const gens = S.generators();
  if (gens.length < 2) return '';
  return `<div class="chips">${[['all', 'كل المولدات'], ...gens.map((g) => [g.id, g.name])].map(([k, t]) => `<button class="fc ${ui.gfilter === k ? 'on' : ''}" data-act="gfilter" data-k="${k}">${esc(t)}</button>`).join('')}</div>`;
};
export function subsList() {
  const q = ui.q.trim(); const n = normDigits(q);
  let list = S.allSubs();
  if (ui.gfilter !== 'all') list = list.filter((s) => S.pathOf(s).gen?.id === ui.gfilter);
  list = list.filter((s) => (!q || s.name.includes(q) || (/^\d+$/.test(n) && String(S.pathOf(s).conn?.no) === n)) && passFilter(s, ui.filter));
  list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const shown = list.slice(0, ui.limit);
  if (!list.length) return empty('search', 'لا نتائج', 'غيّر البحث أو التصفية.');
  return `<div class="card list">${shown.map((s) => subRow(s, false, true)).join('')}</div>${list.length > shown.length ? `<button class="btn ghost block" data-act="more-subs">عرض المزيد (${list.length - shown.length})</button>` : ''}`;
}
export function subs() {
  const html = appbar({ title: 'المشتركون', back: false, sub: `${S.allSubs().length} مشترك`, actions: abBtn('add-sub', 'plus', 'مشترك جديد') }) + `
  <div class="toolbar">
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="ابحث بالاسم أو رقم الجوزة" value="${esc(ui.q)}" autocomplete="off"></label>
    ${genChips()}${filterChips(ui.filter)}
  </div>
  <main class="body" id="list">${subsList()}</main>`;
  return { tab: 'subs', html, live: 'subs' };
}

/* ───────── الديون ───────── */
export function debts() {
  let rows = S.allSubs().map((s) => ({ s, d: S.debtOf(s) })).filter((r) => r.d.total > 0);
  if (ui.gfilter !== 'all') rows = rows.filter((r) => S.pathOf(r.s).gen?.id === ui.gfilter);
  rows.sort((a, b) => b.d.total - a.d.total);
  const tot = rows.reduce((t, r) => t + r.d.total, 0);
  const man = rows.reduce((t, r) => t + r.d.manual, 0);
  const mon = tot - man;
  const extra = `<div class="hero slim"><div class="hero-main"><div class="hm-t"><small>إجمالي المتبقي على المشتركين</small><strong>${money(tot)}</strong></div></div>
    <div class="tiles two"><div class="tile"><small>أشهر غير مسددة</small><b>${moneyShort(mon)}</b></div><div class="tile"><small>ديون مسجّلة</small><b>${moneyShort(man)}</b></div></div></div>`;
  const html = appbar({ title: 'الديون', back: false, sub: `${rows.length} مشترك عليهم متبقي`, actions: abBtn('add-debt', 'plus', 'تسجيل دين'), extra }) + `
  <div class="toolbar">${genChips() || ''}</div>
  <main class="body">${rows.length ? `<div class="card list">${rows.slice(0, ui.limit).map(({ s, d }) => `<div class="srow" data-act="open-sub" data-id="${s.id}">${avatar(s.name)}<div class="grow"><b>${esc(s.name)}</b><small>${esc(S.pathText(s))}${d.months.length ? ` · ${d.months.length} أشهر` : ''}${d.manual ? ' · دين مسجّل' : ''}</small></div><b class="bad">${money(d.total)}</b></div>`).join('')}</div>${rows.length > ui.limit ? `<button class="btn ghost block" data-act="more-subs">عرض المزيد (${rows.length - ui.limit})</button>` : ''}` : empty('shield', 'لا توجد ديون', 'كل المشتركين مسددون. أحسنت!')}</main>`;
  return { tab: 'debts', html };
}

/* ───────── المزيد والإعدادات ───────── */
const setRow = (ic, t, sub, act, extra = '') => `<button class="set" data-act="${act}" ${extra}>${icon(ic, 'set-ic')}<div class="grow"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div>${icon('next', 'chev')}</button>`;
export function syncCard() {
  const dev = `<small class="mono">جهاز: ${esc(S.raw().deviceId.slice(0, 8))}</small>`;
  if (!SY.available()) return `<div class="card sync"><div class="sync-h">${icon('cloud')}<div><b>المزامنة غير مفعّلة</b><small>التطبيق يعمل على هذا الجهاز فقط</small></div></div>${dev}</div>`;
  const u = SY.user(); const s = SY.status();
  if (!u) return '';
  const line = s.state === 'err' ? `<span class="chip debt">${esc(s.err)}</span>` : s.state === 'sync' ? '<span class="chip">جارٍ المزامنة…</span>' : s.at ? `<span class="chip paid">متزامن · ${timeAgo(s.at)}</span>` : '<span class="chip">بانتظار المزامنة</span>';
  return `<div class="card sync">
    <div class="sync-h">${icon('cloud')}<div><b>${esc(u.display)}</b><small>${u.role === 'manager' ? 'مدير' : 'مشرف'} · @${esc(u.username)}</small></div></div>
    <div class="sync-st">${line}</div>
    <div class="btn-row"><button class="btn soft" data-act="sync-now">${icon('clock')}مزامنة الآن</button><button class="btn soft" data-act="logout">تسجيل الخروج</button></div>${dev}</div>`;
}

export function loginView() {
  const html = `
<div class="login">
  <div class="lg-top">
    <div class="w-logo">${icon('bolt')}</div>
    <h1>حسابات المولدة</h1>
    <p>سجّل الدخول بالحساب الذي أنشأه لك المدير</p>
  </div>
  <form class="card lg-card" data-form="login">
    <label class="field"><span>اسم المستخدم</span><input name="username" dir="ltr" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus></label>
    <label class="field"><span>كلمة المرور</span><input name="password" type="password" dir="ltr" autocomplete="current-password" required></label>
    <button class="btn primary block lg" type="submit">دخول</button>
  </form>
  <button class="mgr-link" data-act="setup-open" data-silent="1">${icon('shield')}إعداد المساحة (للمدير فقط)</button>
</div>`;
  return { tab: 'home', html, bare: true };
}

const userRow = (x) => `<div class="li"><span class="dot ${x.active ? 'ok' : 'bad'}"></span><div class="grow"><b>${esc(x.display)}</b><small>@${esc(x.username)} · ${x.role === 'manager' ? 'مدير' : x.active ? 'مشرف' : 'مشرف موقوف'}${x.role === 'supervisor' && PERMS.some((p) => (x.perms || {})[p.k] === false) ? ' · صلاحيات محدودة' : ''}</small></div>${x.role === 'manager' ? '' : `<button class="mini sq" data-act="user-menu" data-id="${x.id}" aria-label="خيارات">${icon('more')}</button>`}</div>`;
export function team() {
  if (!SY.isManager()) return notFound();
  const list = SY.teamList();
  const html = appbar({ title: 'إدارة المشرفين', sub: 'للمدير فقط', actions: abBtn('user-add', 'plus', 'مشرف جديد') }) + `
  <main class="body">
    <div class="card"><p class="muted sm">المشرف يرى نفس الشاشات عدا هذه الشاشة، وكل صلاحياته مفعّلة تلقائيًا. اضغط على ⋯ بجانب أي مشرف لتغيير صلاحياته أو كلمة مروره. التسعيرة يراها المشرف ولا يغيّرها.</p></div>
    ${list ? `<div class="card list">${list.map(userRow).join('')}</div>` : '<p class="muted sm">جارٍ التحميل…</p>'}
    <button class="btn primary block lg" data-act="user-add">${icon('plus')}مشرف جديد</button>
  </main>`;
  return { tab: 'more', html, live: 'team' };
}

/* ───────── التسعيرات (للمدير) ───────── */
export function prices() {
  const mgr = SY.isManager();
  const now = ymNow(); const year = ui.pyear;
  const cur = S.priceFor(now); const own = S.priceOwn(now);
  const st = S.stats(S.allSubs(), now);
  const hero = `<div class="hero slim"><div class="hero-main"><div class="hm-t"><small>سعر الأمبير في ${esc(ymLabel(now))}</small><strong>${cur > 0 ? money(cur) : 'غير محدد'}</strong><small>${own ? 'محدد لهذا الشهر' : cur > 0 ? 'موروث من الأشهر السابقة' : mgr ? 'حدده الآن لتُحسب المبالغ' : 'لم يحدده المدير بعد'}</small></div></div>
    <div class="tiles two"><div class="tile"><small>أمبيرات الشهر</small><b>${fmtNum(st.amps)}</b></div><div class="tile"><small>المتوقع تحصيله</small><b>${moneyShort(st.expected)}</b></div></div></div>`;
  const rows = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    const o = S.priceOwn(ym); const p = S.priceFor(ym); const r = S.priceRecFor(ym);
    const src = o ? `محدد${o.by ? ' بواسطة ' + esc(o.by) : ''}` : p > 0 ? (r ? `موروث من ${esc(MONTHS[ymParse(r.ym).m - 1])} ${ymParse(r.ym).y}` : 'السعر القديم') : 'غير محدد';
    const future = ym > now;
    return `<${mgr ? 'button' : 'div'} class="set prow ${o ? 'own' : ''} ${ym === now ? 'now' : ''} ${future ? 'fut' : ''}" ${mgr ? `data-act="price-edit" data-ym="${ym}"` : ''}>
      <span class="pm">${i + 1}</span>
      <div class="grow"><b>${MONTHS[i]}</b><small>${src}</small></div>
      <strong class="${p > 0 ? '' : 'bad'}">${p > 0 ? fmtNum(p) : '—'}</strong>${mgr ? icon('edit', 'chev') : ''}</${mgr ? 'button' : 'div'}>`;
  }).join('');
  const html = appbar({ title: 'التسعيرات', sub: mgr ? 'سعر الأمبير لكل شهر' : 'سعر الأمبير لكل شهر · للاطلاع فقط', extra: hero }) + `
  <main class="body">
    <div class="card"><p class="muted sm">${mgr ? 'لكل شهر تسعيرته. الشهر الذي لم تُحدَّد له تسعيرة يأخذ تسعيرة أقرب شهر سابق محدد. يمكنك تعديل تسعيرة أي شهر سابق. التسديدات المسجّلة سابقًا لا تتغير.' : 'هذه تسعيرة الأمبير لكل شهر للاطلاع فقط. التسعيرة يحددها المدير وحده.'}</p></div>
    <div class="card">
      <div class="yr"><button data-act="pyear" data-d="-1" aria-label="السنة السابقة">${icon('back')}</button><b>${year}</b><button data-act="pyear" data-d="1" aria-label="السنة التالية">${icon('next')}</button></div>
      <div class="list prices">${rows}</div>
    </div>
  </main>`;
  return { tab: 'more', html };
}

/* ───────── الأصوات ───────── */
export function sounds() {
  const st = S.settings();
  const vol = Math.round((st.volume ?? 0.8) * 100);
  const sw = (on) => `<span class="sw ${on ? 'on' : ''}"></span>`;
  const group = (g) => {
    const G = GROUPS[g]; const cur = st[G.key] || G.def;
    return `${secH(G.title)}<div class="card list">${G.list.map((o) => `<button class="set snd ${cur === o.id ? 'on' : ''}" data-act="snd-pick" data-g="${g}" data-id="${o.id}" data-silent="1"><span class="rad"></span><div class="grow"><b>${o.t}</b><small>${o.d}</small></div>${icon('play', 'chev')}</button>`).join('')}</div>`;
  };
  const html = appbar({ title: 'الأصوات', sub: 'اختر النمط الذي يعجبك وسيُسمعك إياه' }) + `
  <main class="body">
    <div class="card list">
      <button class="set" data-act="toggle-sound" data-silent="1">${icon('volume', 'set-ic')}<div class="grow"><b>الأصوات</b><small>${st.sound !== false ? 'مفعّلة' : 'متوقفة'}</small></div>${sw(st.sound !== false)}</button>
      <button class="set" data-act="toggle-haptic" data-silent="1">${icon('vibrate', 'set-ic')}<div class="grow"><b>الاهتزاز</b><small>${st.haptic !== false ? 'مفعّل' : 'متوقف'}</small></div>${sw(st.haptic !== false)}</button>
    </div>
    <div class="card"><div class="card-hr"><h3 class="card-h">مستوى الصوت</h3><b id="vol-v">${vol}%</b></div><input class="vol" type="range" min="20" max="100" step="5" value="${vol}" data-vol aria-label="مستوى الصوت"></div>
    ${group('touch')}${group('done')}${group('notify')}
    <p class="hint">أصوات الإشعارات التي تصل والتطبيق مغلق هي صوت إشعارات هاتفك نفسه، وتُغيَّر من إعدادات إشعارات الهاتف.</p>
  </main>`;
  return { tab: 'more', html };
}

export function more() {
  const st = S.settings();
  const gens = S.generators();
  const html = appbar({ title: 'المزيد', back: false, sub: 'الإعدادات والبيانات' }) + `
  <main class="body">
    ${secH('الحساب والتسعير')}
    <div class="card list">
      ${SY.user() ? '' : setRow('user', 'اسمك', esc(st.user || 'غير محدد'), 'set-user')}
      ${setRow('tag', 'التسعيرات', `${SY.isManager() ? 'سعر الأمبير لكل شهر' : 'للاطلاع فقط'} · الحالي ${S.priceFor(ymNow()) > 0 ? money(S.priceFor(ymNow())) : 'غير محدد'}`, 'go', 'data-to="/prices"')}
    </div>
    ${SY.isManager() && SY.user() ? `${secH('الفريق')}<div class="card list">${setRow('users', 'إدارة المشرفين', 'إنشاء حسابات المشرفين والتحكم بها', 'go', 'data-to="/team"')}</div>` : ''}
    ${SY.can('books') ? `${secH('حساباتي')}<div class="card list">${setRow('wallet', 'الواردات والصادرات', 'مصروفات المولدة وقوائم الجهات وتقرير الشهر', 'go', 'data-to="/books"')}</div>` : ''}
    ${secH('الهيكل')}
    <div class="card list">
      ${gens.map((g) => `<a class="set" href="#/gen/${g.id}">${icon('gen', 'set-ic')}<div class="grow"><b>${esc(g.name)}</b><small>${S.subsOfGen(g.id).length} مشترك</small></div>${icon('next', 'chev')}</a>`).join('')}
      ${SY.can('subs') ? setRow('plus', 'إضافة مولدة', '', 'add-gen') : ''}
    </div>
    ${secH('العرض')}
    <div class="card list">
      ${setRow('volume', 'الأصوات', st.sound !== false ? 'مفعّلة · اضغط لاختيار النمط' : 'متوقفة', 'go', 'data-to="/sounds"')}
      ${setRow('moon', 'المظهر', { auto: 'تلقائي', light: 'فاتح', dark: 'داكن' }[st.theme], 'cycle-theme')}
    </div>
    ${secH('البيانات')}
    <div class="card list">
      ${SY.can('subs') ? setRow('list', 'إدخال سريع من نص', 'انسخ الأسماء من الدفتر دفعة واحدة', 'go', 'data-to="/import"') : ''}
      ${SY.can('data') ? setRow('upload', 'نسخة احتياطية (تصدير)', 'ملف JSON تحفظه أو ترسله', 'export') + setRow('download', 'استعادة نسخة', 'استيراد ملف نسخة احتياطية', 'import-file') : ''}
      ${setRow('clock', 'سجل النشاط', 'من فعل ماذا ومتى', 'go', 'data-to="/log"')}
      ${gens.length ? '' : setRow('bolt', 'بيانات تجريبية', 'للتجربة فقط', 'seed-demo')}
    </div>
    ${secH('المزامنة السحابية')}
    <div id="sync-slot">${syncCard()}</div>
    <div id="push-slot"></div>
    <p class="foot">حسابات المولدة · الإصدار 1.1</p>
  </main>`;
  return { tab: 'more', html };
}

export function log() {
  const l = S.raw().log;
  const html = appbar({ title: 'سجل النشاط', sub: `${l.length} عملية` }) + `<main class="body">${l.length ? `<div class="card list">${l.slice(0, 200).map((x) => `<div class="li"><span class="dot"></span><div class="grow"><b>${esc(x.text)}</b><small>${new Date(x.at).toLocaleString('en-GB')}${x.by ? ' · ' + esc(x.by) : ''}</small></div></div>`).join('')}</div>` : empty('clock', 'لا يوجد نشاط بعد', '')}</main>`;
  return { tab: 'more', html };
}

/* ───────── الإدخال السريع ───────── */
export function importView() {
  const cabs = [];
  for (const g of S.generators()) for (const p of S.phasesOf(g.id)) for (const c of S.cabinetsOf(p.id)) cabs.push({ g, p, c });
  const html = appbar({ title: 'إدخال سريع', sub: 'انقل الدفتر دفعة واحدة' }) + `
  <main class="body">
    ${cabs.length ? `<form class="card" data-form="import">
      <label class="field"><span>الكابينة</span><select name="cab">${cabs.map(({ g, p, c }) => `<option value="${c.id}">${esc(g.name)} › ${esc(p.name)} › ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>الأسماء (سطر لكل مشترك)</span>
        <textarea name="text" rows="9" id="imp-text" placeholder="26 أحمد صالح 6&#10;27 إبراهيم طه 4&#10;29 محمود علي 3&#10;29 حمد جاسم 2"></textarea></label>
      <p class="hint">الصيغة: <b>رقم الجوزة</b> ثم <b>الاسم</b> ثم <b>الأمبيرات</b>. تكرار نفس الرقم يضيف شريكًا على نفس الجوزة.</p>
      <div id="imp-prev" class="imp-prev"></div>
      <button class="btn primary block lg" type="submit">استيراد</button>
    </form>` : `<div class="card">${empty('box', 'أنشئ كابينة أولًا', 'يحتاج الإدخال السريع إلى كابينة.', '<a class="btn primary" href="#/home">الرئيسية</a>')}</div>`}
  </main>`;
  return { tab: 'more', html, live: 'import' };
}

export const routes = {
  home, gen: generator, cab: cabinet, sub: subscriber, notes, subs, debts, more, log, import: importView, books, party, team, prices, sounds,
};
export { ymAdd, ymParse };
