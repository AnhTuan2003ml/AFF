/*
 * Quảng cáo sản phẩm làm NỀN panel giới thiệu (trang đăng nhập/đăng ký): nạp
 * danh sách sản phẩm, xếp thành các lớp ảnh phủ toàn panel và TỰ ĐỔI theo vòng
 * tròn (sản phẩm cuối → quay lại sản phẩm đầu). Crossfade bằng WAAPI để vẫn
 * chạy khi hệ điều hành bật "giảm chuyển động". Tự chứa, hợp CSP.
 */
(function () {
  "use strict";
  var bg = document.querySelector("[data-auth-ad]");
  if (!bg) return;
  var chip = document.querySelector("[data-auth-ad-chip]");
  var nameEl = document.querySelector("[data-auth-ad-name]");
  var cbEl = document.querySelector("[data-auth-ad-cashback]");
  var endpoint = bg.getAttribute("data-endpoint") || "/app/promo-products?list=best";
  var STEP_MS = 4200;
  var FADE_MS = 700;

  fetch(endpoint, { credentials: "same-origin", headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var products = ((data && data.products) || []).filter(function (p) { return p && p.imageUrl; });
      if (!products.length) return;

      var slides = products.map(function (p, idx) {
        var slide = document.createElement("div");
        slide.className = "auth-ad-slide";
        var img = document.createElement("img");
        img.src = p.imageUrl;
        img.alt = "";
        img.loading = idx === 0 ? "eager" : "lazy";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function () { slide.dataset.dead = "1"; });
        slide.appendChild(img);
        bg.appendChild(slide);
        return slide;
      });

      function setChip(p) {
        if (!chip) return;
        if (nameEl) nameEl.textContent = p.name || "";
        if (cbEl) {
          if (p.cashbackRatePercent) { cbEl.textContent = "Hoàn +" + p.cashbackRatePercent + "%"; cbEl.hidden = false; }
          else cbEl.hidden = true;
        }
        chip.hidden = false;
      }

      var cur = 0;
      slides[0].style.opacity = "1";
      setChip(products[0]);

      if (slides.length < 2) return;

      var timer = null;
      function fade(el, from, to) {
        el.style.opacity = String(to);
        if (el.animate) el.animate([{ opacity: from }, { opacity: to }], { duration: FADE_MS, easing: "ease", fill: "forwards" });
      }
      function step() {
        var prev = cur;
        // bỏ qua ảnh lỗi, đi vòng tròn về đầu khi tới cuối
        for (var tries = 0; tries < slides.length; tries++) {
          cur = (cur + 1) % slides.length;
          if (slides[cur].dataset.dead !== "1") break;
        }
        if (cur === prev) return;
        fade(slides[prev], 1, 0);
        fade(slides[cur], 0, 1);
        setChip(products[cur]);
      }
      function start() { stop(); timer = window.setInterval(function () { if (!document.hidden) step(); }, STEP_MS); }
      function stop() { if (timer) window.clearInterval(timer); timer = null; }
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
      start();
    })
    .catch(function () { /* nền lỗi thì panel vẫn còn màu nền + lớp phủ */ });
})();
