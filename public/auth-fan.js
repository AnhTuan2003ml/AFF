/*
 * Xòe quạt sản phẩm (coverflow) ở panel giới thiệu đăng nhập/đăng ký: thẻ giữa
 * nổi & thẳng, 2 bên xòe nghiêng dần (hiển thị 5 thẻ). Có nút ‹ ›, chấm chỉ số,
 * hover để nhấc thẻ lên, kéo/vuốt để cuộn, tự lướt theo vòng tròn. Tự chứa, CSP.
 */
(function () {
  "use strict";
  var root = document.querySelector("[data-axf]");
  if (!root) return;
  var stage = root.querySelector("[data-axf-stage]");
  var dotsBox = document.querySelector("[data-axf-dots]");
  var prevBtn = root.querySelector("[data-axf-prev]");
  var nextBtn = root.querySelector("[data-axf-next]");
  var endpoint = root.getAttribute("data-endpoint") || "/app/promo-products?list=best";
  var SIDE = 2; // số thẻ mỗi bên → tổng hiển thị 5
  var STEP_MS = 4200;

  function vnd(v) { return new Intl.NumberFormat("vi-VN").format(v) + " ₫"; }

  fetch(endpoint, { credentials: "same-origin", headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var products = ((d && d.products) || []).filter(function (p) { return p && p.imageUrl; });
      if (!products.length) return;

      var slots = products.map(function (p, i) {
        var slot = document.createElement("div");
        slot.className = "axf-slot";
        var card = document.createElement("article");
        card.className = "axf-card";
        var media = document.createElement("div");
        media.className = "axf-card-media";
        if (p.cashbackRatePercent) {
          var badge = document.createElement("span");
          badge.className = "axf-badge";
          badge.textContent = "Hoàn +" + p.cashbackRatePercent + "%";
          media.appendChild(badge);
        }
        var img = document.createElement("img");
        img.src = p.imageUrl; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
        media.appendChild(img);
        card.appendChild(media);
        var body = document.createElement("div");
        body.className = "axf-body";
        var nm = document.createElement("p");
        nm.className = "axf-name"; nm.textContent = p.name || "";
        body.appendChild(nm);
        var pr = document.createElement("p");
        pr.className = "axf-price"; pr.textContent = p.priceVnd ? vnd(p.priceVnd) : "";
        body.appendChild(pr);
        card.appendChild(body);
        slot.appendChild(card);
        slot.addEventListener("click", function () { if (!dragMoved) go(i, true); });
        stage.appendChild(slot);
        return slot;
      });

      var dots = products.map(function (p, i) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "axf-dot";
        b.setAttribute("aria-label", "Sản phẩm " + (i + 1));
        b.addEventListener("click", function () { go(i, true); });
        dotsBox.appendChild(b);
        return b;
      });

      var n = products.length;
      var active = 0;
      var timer = null;

      function layout() {
        var spread = Math.min(150, Math.max(90, root.clientWidth * 0.3));
        for (var i = 0; i < n; i++) {
          var d = i - active;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          var abs = Math.abs(d);
          var slot = slots[i];
          if (abs > SIDE) {
            slot.style.opacity = "0";
            slot.style.pointerEvents = "none";
            slot.style.zIndex = "0";
            slot.style.transform = "translate(-50%,-50%) translateX(" + (d > 0 ? 1 : -1) * spread * 2.6 + "px) scale(.55)";
            continue;
          }
          slot.style.opacity = "1";
          slot.style.pointerEvents = "auto";
          slot.style.zIndex = String(100 - abs);
          slot.style.transform =
            "translate(-50%,-50%) translateX(" + (d * spread) + "px)" +
            " translateY(" + (abs * 16) + "px)" +
            " rotate(" + (d * 9) + "deg)" +
            " scale(" + (1 - abs * 0.1) + ")";
        }
        dots.forEach(function (dd, k) { dd.classList.toggle("is-active", k === active); });
      }

      function go(i, user) { active = ((i % n) + n) % n; layout(); if (user) restart(); }
      function restart() { stop(); if (n > 1) timer = window.setInterval(function () { if (!document.hidden) go(active + 1); }, STEP_MS); }
      function stop() { if (timer) window.clearInterval(timer); timer = null; }

      if (prevBtn) prevBtn.addEventListener("click", function () { go(active - 1, true); });
      if (nextBtn) nextBtn.addEventListener("click", function () { go(active + 1, true); });

      // Kéo/vuốt để cuộn.
      var down = false, startX = 0, dragMoved = false;
      root.addEventListener("pointerdown", function (e) { down = true; dragMoved = false; startX = e.clientX; stop(); });
      window.addEventListener("pointermove", function (e) {
        if (!down) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 45) { go(active + (dx < 0 ? 1 : -1), true); dragMoved = true; startX = e.clientX; }
      });
      window.addEventListener("pointerup", function () { if (down) { down = false; restart(); window.setTimeout(function () { dragMoved = false; }, 0); } });

      // Lăn chuột ngang cũng cuộn.
      var wheelLock = false;
      root.addEventListener("wheel", function (e) {
        var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!delta) return;
        e.preventDefault();
        if (wheelLock) return;
        wheelLock = true;
        go(active + (delta > 0 ? 1 : -1), true);
        window.setTimeout(function () { wheelLock = false; }, 260);
      }, { passive: false });

      root.addEventListener("mouseenter", stop);
      root.addEventListener("mouseleave", restart);
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else restart(); });
      window.addEventListener("resize", layout);

      layout();
      restart();
    })
    .catch(function () { /* lỗi nạp thì panel vẫn còn thương hiệu + khẩu hiệu */ });
})();
