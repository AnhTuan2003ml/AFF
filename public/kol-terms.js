/* Bước 1 KOL/KOC: đọc toàn bộ thỏa thuận bằng cách cuộn CẢ TRANG (một mạch).
   Cuộn tới CUỐI (mốc [data-terms-end] lọt vào màn hình) mới mở khóa ô đồng ý;
   tích ô mới bật nút "Tiếp tục". Nút mũi tên: bấm là cuộn thẳng tới cuối.
   Tách file riêng vì CSP 'self' chặn inline script. */
(function () {
  "use strict";
  var accept = document.getElementById("kol-accept");
  var cont = document.getElementById("kol-continue");
  var hint = document.querySelector("[data-scroll-hint]");
  var end = document.querySelector("[data-terms-end]");
  var jump = document.querySelector("[data-jump-end]");
  var form = document.getElementById("kol-agree-form");
  if (!accept || !cont) return;

  var daDoc = false;
  function moKhoa() {
    if (daDoc) return;
    daDoc = true; // mở khóa checkbox chỉ một lần (không khóa lại khi cuộn lên)
    accept.disabled = false;
    if (hint) hint.hidden = true;
  }

  // Đã đọc tới cuối khi mốc cuối (hoặc khối xác nhận) lọt vào màn hình.
  var target = end || form;
  function kiemTra() {
    if (!target) return;
    var r = target.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var toiCuoi = r.top <= vh - 36 && r.bottom >= 0;
    if (toiCuoi) moKhoa();
    // Mũi tên bám theo vị trí: tới cuối thì ẩn, cuộn lên lại hiện.
    if (jump) jump.hidden = toiCuoi;
  }
  window.addEventListener("scroll", kiemTra, { passive: true });
  window.addEventListener("resize", kiemTra);
  kiemTra();

  // Mũi tên xuống: bấm là cuộn thẳng tới cuối điều khoản (chỗ checkbox).
  if (jump && form) {
    jump.addEventListener("click", function () {
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      // Cuộn mượt có thể chưa phát scroll ngay — kiểm tra thêm sau khi cuộn xong.
      setTimeout(kiemTra, 500);
      setTimeout(kiemTra, 900);
    });
  }

  accept.addEventListener("change", function () {
    cont.disabled = !accept.checked;
  });
})();
