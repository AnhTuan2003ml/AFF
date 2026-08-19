/* Bảng vàng: cập nhật chấm chỉ báo khi lướt giữa 2 slide (top người mua / top
   bán chạy); bấm chấm để chuyển. */
(function () {
  "use strict";
  var wrap = document.querySelector("[data-lbwrap]");
  if (!wrap) return;
  var track = wrap.querySelector("[data-lbwrap-track]");
  var dots = wrap.querySelector("[data-lbwrap-dots]");
  if (!track || !dots) return;

  function update() {
    var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    Array.prototype.forEach.call(dots.children, function (d, idx) {
      d.classList.toggle("is-active", idx === i);
    });
  }
  var raf = null;
  track.addEventListener("scroll", function () {
    if (raf) return;
    raf = window.requestAnimationFrame(function () { raf = null; update(); });
  });
  Array.prototype.forEach.call(dots.children, function (d, idx) {
    d.addEventListener("click", function () {
      track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
    });
  });
})();
