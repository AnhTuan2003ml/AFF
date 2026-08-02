// Áp theme đã lưu TRƯỚC khi trang vẽ để không chớp màu.
// Tách thành file riêng vì CSP script-src 'self' chặn script inline.
// Nếu <html> đã có data-theme (vd auth page force light) thì không ghi đè.
(function () {
  try {
    var html = document.documentElement;
    if (html.getAttribute("data-theme")) return;
    var saved = localStorage.getItem("aff-theme");
    var system = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    html.setAttribute("data-theme", saved === "light" || saved === "dark" ? saved : system);
  } catch (e) {}
})();
