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
