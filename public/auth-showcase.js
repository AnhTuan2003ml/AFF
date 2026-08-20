/*
 * Showcase 1 sản phẩm nổi bật ở panel giới thiệu (đăng nhập/đăng ký): nạp danh
 * sách sản phẩm, hiển thị TỪNG sản phẩm to (ảnh + tên + giá + badge hoàn tiền)
 * và tự đổi theo vòng tròn, có chấm chỉ số bấm được. Crossfade bằng WAAPI (chạy
 * cả khi hệ điều hành giảm chuyển động). Tự chứa, hợp CSP.
 */
(function () {
  "use strict";
  var root = document.querySelector("[data-axs]");
  if (!root) return;
  var media = root.querySelector(".axs-card-media");
  var imgEl = root.querySelector("[data-axs-img]");
  var nameEl = root.querySelector("[data-axs-name]");
  var priceEl = root.querySelector("[data-axs-price]");
  var cbEl = root.querySelector("[data-axs-cb]");
  var badgeEl = root.querySelector("[data-axs-cashback]");
  var dotsBox = root.querySelector("[data-axs-dots]");
  var endpoint = root.getAttribute("data-endpoint") || "/app/promo-products?list=best";
  var STEP_MS = 4200;

  function vnd(v) { return new Intl.NumberFormat("vi-VN").format(v) + " ₫"; }

  fetch(endpoint, { credentials: "same-origin", headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var products = ((d && d.products) || []).filter(function (p) { return p && p.imageUrl; });
      if (!products.length) return;

      products.forEach(function (p, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "axs-dot";
        b.setAttribute("aria-label", "Sản phẩm " + (i + 1));
        b.addEventListener("click", function () { go(i, true); });
        dotsBox.appendChild(b);
      });
      var dots = Array.prototype.slice.call(dotsBox.children);

      function fill(p) {
        if (nameEl) nameEl.textContent = p.name || "";
        if (priceEl) priceEl.textContent = p.priceVnd ? vnd(p.priceVnd) : "";
        if (cbEl) {
          if (p.cashbackAmountVnd) { cbEl.textContent = "hoàn +" + vnd(p.cashbackAmountVnd); cbEl.hidden = false; }
          else cbEl.hidden = true;
        }
        if (badgeEl) {
          if (p.cashbackRatePercent) { badgeEl.textContent = "Hoàn +" + p.cashbackRatePercent + "%"; badgeEl.hidden = false; }
          else badgeEl.hidden = true;
        }
      }

      var cur = 0;
      imgEl.src = products[0].imageUrl;
      fill(products[0]);
      dots[0].classList.add("is-active");

      var timer = null;
      function go(i, user) {
        var n = products.length;
        i = ((i % n) + n) % n;
        if (i === cur) { if (user) restart(); return; }
        cur = i;
        var p = products[cur];
        var swap = function () { imgEl.src = p.imageUrl; fill(p); };
        if (media.animate) {
          var out = media.animate([{ opacity: 1 }, { opacity: 0.15 }], { duration: 200, fill: "forwards" });
          out.onfinish = function () { swap(); media.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 320, fill: "forwards" }); };
        } else { swap(); }
        dots.forEach(function (dd, k) { dd.classList.toggle("is-active", k === cur); });
        if (user) restart();
      }
      function restart() { stop(); if (products.length > 1) timer = window.setInterval(function () { if (!document.hidden) go(cur + 1); }, STEP_MS); }
      function stop() { if (timer) window.clearInterval(timer); timer = null; }
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else restart(); });
      restart();
    })
    .catch(function () { /* lỗi nạp thì panel vẫn còn thương hiệu + khẩu hiệu */ });
})();
