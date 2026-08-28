/* Bước 1 KOL/KOC: đọc toàn bộ thỏa thuận trong một trang cuộn. Phải cuộn tới
   CUỐI mới mở khóa ô đồng ý; tích ô mới bật nút "Tiếp tục". Tách file riêng vì
   CSP 'self' chặn inline script. */
(function () {
  "use strict";
  var doc = document.querySelector("[data-kol-doc]");
  var accept = document.getElementById("kol-accept");
  var cont = document.getElementById("kol-continue");
  var hint = document.querySelector("[data-scroll-hint]");
  if (!doc || !accept || !cont) return;

  var daDoc = false;
  function moKhoa() {
    if (daDoc) return;
    daDoc = true;
    accept.disabled = false;
    if (hint) hint.hidden = true;
  }
  function kiemTraCuoi() {
    if (doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 28) moKhoa();
  }
  doc.addEventListener("scroll", kiemTraCuoi);
  // Nội dung ngắn không cần cuộn → mở khóa luôn.
  if (doc.scrollHeight <= doc.clientHeight + 28) moKhoa();

  accept.addEventListener("change", function () {
    cont.disabled = !accept.checked;
  });
})();
