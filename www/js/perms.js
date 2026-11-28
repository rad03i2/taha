// صلاحيات المشرف. المدير يملك كل شيء. كل صلاحية مفعّلة تلقائيًا للمشرف الجديد، ويستطيع المدير إيقاف ما يشاء.
export const PERMS = [
  { k: 'pay', t: 'تسجيل التسديد وإلغاؤه', d: 'استلام الدفعات وإلغاء تسديد الأشهر' },
  { k: 'subs', t: 'المشتركون والهيكل', d: 'إضافة وتعديل وحذف المشتركين والجوزات والكابينات والمولدات' },
  { k: 'debts', t: 'الديون', d: 'تسجيل الديون وتسديدها' },
  { k: 'notes', t: 'الملاحظات', d: 'إضافة الملاحظات وإنهاؤها وحذفها' },
  { k: 'books', t: 'الواردات والصادرات', d: 'شاشة «حساباتي» وقوائم الجهات وتقرير الشهر' },
  { k: 'data', t: 'النسخ الاحتياطي والاستيراد', d: 'تصدير واستعادة البيانات والبيانات التجريبية' },
];

// الإجراء (data-act) ← الصلاحية المطلوبة. العناصر المقابلة تُخفى من الواجهة ويُمنع تنفيذها.
export const ACT = {
  'quick-pay': 'pay', pay: 'pay', 'pay-pick': 'pay',
  'add-sub': 'subs', 'add-partner': 'subs', 'edit-sub': 'subs', 'sub-menu': 'subs', 'toggle-active': 'subs', 'del-sub': 'subs',
  'add-gen': 'subs', 'gen-menu': 'subs', 'edit-gen': 'subs', 'edit-phases': 'subs', 'del-gen': 'subs',
  'add-cab': 'subs', 'cab-menu': 'subs', 'edit-cab': 'subs', 'del-cab': 'subs', 'conn-menu': 'subs', 'del-conn': 'subs',
  'add-debt': 'debts', 'pay-debt': 'debts',
  'add-note': 'notes', 'note-done': 'notes', 'note-del': 'notes',
  'ledger-add': 'books', 'ledger-del': 'books', 'party-add': 'books', 'party-del': 'books',
  export: 'data', 'import-file': 'data', 'seed-demo': 'data',
};
// النموذج (data-form) ← الصلاحية
export const FORM = { pay: 'pay', sub: 'subs', gen: 'subs', phases: 'subs', cab: 'subs', conn: 'subs', import: 'subs', debt: 'debts', note: 'notes', ledger: 'books', party: 'books' };
// المسار ← الصلاحية
export const ROUTE = { books: 'books', party: 'books', import: 'subs' };
// نوع السجل المتزامن ← الصلاحية (نفس الجدول في schema.sql)
export const KIND = { records: 'pay', receipts: 'pay', subscribers: 'subs', connections: 'subs', cabinets: 'subs', phases: 'subs', generators: 'subs', debts: 'debts', notes: 'notes', ledger: 'books', parties: 'books' };
