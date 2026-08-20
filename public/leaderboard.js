/* Bảng vàng: bộ chuyển "Người mua / Bán chạy" (segmented) đồng bộ với vuốt
   ngang. Bấm nút hoặc vuốt đều đổi bảng; nút active cập nhật theo vị trí cuộn. */
(function () {
  "use strict";
  var viewport = document.querySelector("[data-lb2-viewport]");
  var seg = document.querySelector("[data-lb2-seg]");
  if (!viewport || !seg) return;
  var tabs = seg.querySelectorAll("[data-lb2-tab]");

  function setActive(i) {
    Array.prototype.forEach.call(tabs, function (t, idx) {
      t.classList.toggle("is-active", idx === i);
    });
  }
  var raf = null;
  viewport.addEventListener("scroll", function () {
    if (raf) return;
    raf = window.requestAnimationFrame(function () {
      raf = null;
      setActive(Math.round(viewport.scrollLeft / Math.max(1, viewport.clientWidth)));
    });
  });
  Array.prototype.forEach.call(tabs, function (t, idx) {
    t.addEventListener("click", function () {
      viewport.scrollTo({ left: idx * viewport.clientWidth, behavior: "smooth" });
      setActive(idx);
    });
  });
})();

// Ảnh avatar/sản phẩm lỗi → thay bằng chữ cái đầu của tên (giữ podium gọn gàng).
(function () {
  "use strict";
  Array.prototype.forEach.call(
    document.querySelectorAll(".lb2-avatar-img img"),
    function (img) {
      img.addEventListener("error", function () {
        var av = img.closest(".lb2-avatar");
        var spot = img.closest(".lb2-spot");
        var nm = spot && spot.querySelector(".lb2-name");
        var ch = nm ? nm.textContent.trim().charAt(0).toUpperCase() : "?";
        if (!av) return;
        av.classList.remove("lb2-avatar-img");
        av.textContent = ch;
      });
    },
  );
})();
