/* Bước 1 KOL/KOC: bật nút "Tiếp tục" khi người dùng tích đồng ý thỏa thuận.
   Tách ra file riêng vì CSP 'self' chặn inline script. */
(function () {
  "use strict";
  var c = document.getElementById("kol-accept");
  var b = document.getElementById("kol-continue");
  if (!c || !b) return;
  function sync() {
    b.disabled = !c.checked;
  }
  c.addEventListener("change", sync);
  sync();
})();
