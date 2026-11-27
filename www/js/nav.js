// تنقّل بسيط: hash router + إعادة رسم يضبطها app.js
export const nav = {
  go(path) { if (location.hash === '#' + path) nav.rerender(); else location.hash = '#' + path; },
  replace(path) { location.replace('#' + path); },
  back() { history.length > 1 ? history.back() : nav.go('/home'); },
  rerender() {},
};
