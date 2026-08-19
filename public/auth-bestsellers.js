/*
 * Quảng bá ở panel trái trang đăng nhập/đăng ký: nạp TOP sản phẩm bán chạy từ
 * endpoint công khai /app/promo-products (list=best) rồi hiển thị dạng cuộn
 * ngang. Bấm một sản phẩm → mời tạo tài khoản. Không có dữ liệu thì tự ẩn.
 */
(function () {
  "use strict";
  var host = document.querySelector("[data-auth-bestsellers]");
  if (!host) return;
  var track = host.querySelector("[data-auth-bestsellers-track]");
  if (!track) return;

  function fmtVnd(v) { return new Intl.NumberFormat("vi-VN").format(v) + " ₫"; }

  fetch("/app/promo-products?list=best&limit=12", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var products = (data && data.products) || [];
      products.forEach(function (p) {
        if (!p.imageUrl) return;
        var card = document.createElement("a");
        card.className = "auth-bs-card";
        card.href = "/dang-ky";

        var img = document.createElement("img");
        img.src = p.imageUrl;
        img.alt = p.name || "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";

        var body = document.createElement("div");
        body.className = "auth-bs-body";
        var name = document.createElement("span");
        name.className = "auth-bs-name";
        name.textContent = p.name || "Sản phẩm";
        var meta = document.createElement("div");
        meta.className = "auth-bs-meta";
        if (p.priceVnd) {
          var price = document.createElement("b");
          price.textContent = fmtVnd(p.priceVnd);
          meta.appendChild(price);
        }
        if (p.cashbackRatePercent) {
          var cb = document.createElement("span");
          cb.className = "auth-bs-cb";
          cb.textContent = "Hoàn " + p.cashbackRatePercent + "%";
          meta.appendChild(cb);
        }
        body.appendChild(name);
        body.appendChild(meta);
        card.appendChild(img);
        card.appendChild(body);
        track.appendChild(card);
      });
      if (track.children.length) host.hidden = false;
    })
    .catch(function () { /* giữ ẩn */ });
})();
