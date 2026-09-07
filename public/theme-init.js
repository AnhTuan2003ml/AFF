// Áp theme TRƯỚC khi trang vẽ để không chớp màu.
// Tách thành file riêng vì CSP script-src 'self' chặn script inline.
// Nếu <html> đã có data-theme (trang nào đó cố tình ép) thì không ghi đè.
// Không còn nút gạt tay: mặc định mọi trang đi THEO MÁY
// (prefers-color-scheme); data-theme-auto để app.js biết mà đổi live khi
// hệ điều hành chuyển sáng/tối.
(function () {
  try {
    var html = document.documentElement;
    if (html.getAttribute("data-theme")) return;
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.setAttribute("data-theme", dark ? "dark" : "light");
    html.setAttribute("data-theme-auto", "1");
  } catch (e) {}
})();