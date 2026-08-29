/* Bước 1 KOL/KOC: đọc toàn bộ thỏa thuận bằng cách cuộn CẢ TRANG (một mạch).
   Cuộn tới CUỐI (mốc [data-terms-end] lọt vào màn hình) mới mở khóa ô đồng ý;
   tích ô mới bật nút "Tiếp tục". Tách file riêng vì CSP 'self' chặn inline. */
(function () {
  "use strict";
  var accept = document.getElementById("kol-accept");
  var cont = document.getElementById("kol-continue");
  var hint = document.querySelector("[data-scroll-hint]");
  var end = document.querySelector("[data-terms-end]");
  if (!accept || !cont) return;

  var daDoc = false;
  function moKhoa() {
    if (daDoc) return;
    daDoc = true;
    accept.disabled = false;
    if (hint) hint.hidden = true;
  }

  if (end && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        if (entries[0] && entries[0].isIntersecting) {
          moKhoa();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(end);
  } else {
    // Trình duyệt cũ: mở khóa khi cuộn gần cuối trang.
    var check = function () {
      if (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 80
      ) {
        moKhoa();
        window.removeEventListener("scroll", check);
      }
    };
    window.addEventListener("scroll", check);
    check();
  }

  accept.addEventListener("change", function () {
    cont.disabled = !accept.checked;
  });
})();
