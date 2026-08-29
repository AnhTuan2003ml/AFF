/* Tab Voucher ở Khám phá — độc lập với lưới sản phẩm.
   - Bấm tab Voucher: ẩn lưới tĩnh + livelist, hiện danh sách mã giảm giá.
   - Bấm tab khác: ẩn voucher, trả lại lưới.
   - "Copy" chép mã; "Dùng ngay" mở link Shopee (đã giải mã sẵn ở server). */
(function () {
  "use strict";
  var page = document.querySelector("[data-discover-page]") || document;
  var voucherBtn = document.querySelector("[data-discover-voucher]");
  var section = document.querySelector("[data-voucher-section]");
  var grid = document.querySelector("[data-voucher-grid]");
  var status = document.querySelector("[data-voucher-status]");
  if (!voucherBtn || !section || !grid) return;

  var normalGrid = document.querySelector("[data-discover-grid]");
  var live = document.querySelector("[data-bestseller]");
  var filterEmpty = document.querySelector("[data-discover-filter-empty]");
  var loadedShopee = false;
  var active = false;
  var platformTabs = Array.prototype.slice.call(
    (document.querySelector("[data-voucher-platform]") || document).querySelectorAll(
      "[data-platform-tab]"
    )
  );
  var eyebrow = document.querySelector("[data-voucher-eyebrow]");
  var activePlatform = "shopee";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Logo ShopTik dùng khi voucher không có ảnh.
  var FALLBACK_LOGO = "/assets/images/icon.png";

  function renderVoucher(v) {
    var card = el("article", "voucher-card");

    // CỘT TRÁI: ảnh (fallback logo ShopTik nếu voucher không có ảnh).
    var img = document.createElement("img");
    img.src = v.logo_url || FALLBACK_LOGO;
    img.alt = v.shop_name || "Shopee";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.className = "voucher-logo";
    function toFallback() {
      if (img.src.indexOf(FALLBACK_LOGO) === -1) {
        img.src = FALLBACK_LOGO;
        img.classList.add("is-placeholder");
      }
    }
    img.addEventListener("error", toFallback);
    // Shopee trả ảnh placeholder "không có ảnh" (168px, ~2KB) với HTTP 200 —
    // không bắt được bằng onerror; nhận diện bằng kích thước nhỏ.
    img.addEventListener("load", function () {
      if (img.naturalWidth && img.naturalWidth <= 170) toFallback();
    });
    card.appendChild(img);

    // CỘT PHẢI: thông tin + nút dùng ngay bên dưới.
    var info = el("div", "voucher-info-col");
    if (v.label) {
      var label = el("span", "voucher-label", v.label);
      if (v.label_color) label.style.color = v.label_color;
      info.appendChild(label);
    }
    info.appendChild(el("b", "voucher-shop", v.shop_name || "Shopee"));
    info.appendChild(el("p", "voucher-title", v.title));
    if (v.expiry_text) info.appendChild(el("p", "voucher-expiry", v.expiry_text));

    var actions = el("div", "voucher-actions");
    var copy = el("button", "voucher-btn voucher-btn-copy");
    copy.type = "button";
    copy.textContent = "Mã: " + v.code;
    copy.addEventListener("click", function () {
      try {
        navigator.clipboard.writeText(v.code);
      } catch (e) {}
      var old = copy.textContent;
      copy.textContent = "Đã chép ✓";
      window.setTimeout(function () {
        copy.textContent = old;
      }, 1400);
    });
    actions.appendChild(copy);

    var use = el("a", "voucher-btn voucher-btn-use", "Dùng ngay ↗");
    use.href = v.use_url;
    use.target = "_blank";
    use.rel = "noopener noreferrer nofollow";
    use.addEventListener("click", function () {
      try {
        navigator.clipboard.writeText(v.code);
      } catch (e) {}
    });
    actions.appendChild(use);
    info.appendChild(actions);

    card.appendChild(info);
    return card;
  }

  function loadShopee() {
    if (loadedShopee) return;
    loadedShopee = true;
    if (status) {
      status.hidden = false;
      status.textContent = "Đang tải mã giảm giá…";
    }
    fetch("/app/discover/vouchers", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (activePlatform !== "shopee") return;
        var list = (data && data.data) || [];
        grid.textContent = "";
        if (!list.length) {
          if (status) {
            status.hidden = false;
            status.textContent = "Chưa có voucher. Vui lòng quay lại sau.";
          }
          return;
        }
        if (status) status.hidden = true;
        list.forEach(function (v) {
          grid.appendChild(renderVoucher(v));
        });
      })
      .catch(function () {
        loadedShopee = false;
        if (status) {
          status.hidden = false;
          status.textContent = "Không tải được voucher. Thử lại sau.";
        }
      });
  }

  // Voucher THEO SÀN. Shopee lấy từ server; Lazada chưa có nguồn API voucher
  // (feed affiliate Lazada không cấp voucher) → hiển thị "đang cập nhật".
  function loadActive() {
    grid.textContent = "";
    if (eyebrow) {
      eyebrow.textContent =
        activePlatform === "lazada" ? "MÃ GIẢM GIÁ LAZADA" : "MÃ GIẢM GIÁ SHOPEE";
    }
    if (activePlatform === "lazada") {
      if (status) {
        status.hidden = false;
        status.textContent = "Voucher Lazada đang được cập nhật. Vui lòng quay lại sau.";
      }
      return;
    }
    loadedShopee = false;
    loadShopee();
  }

  platformTabs.forEach(function (button) {
    button.addEventListener("click", function () {
      var platform = button.getAttribute("data-platform-tab");
      if (platform === activePlatform) return;
      activePlatform = platform;
      platformTabs.forEach(function (b) {
        var on = b.getAttribute("data-platform-tab") === platform;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      loadActive();
    });
  });

  function showVoucher() {
    active = true;
    voucherBtn.classList.add("active");
    voucherBtn.setAttribute("aria-pressed", "true");
    // Bỏ chọn mọi tab khác.
    page
      .querySelectorAll("[data-discover-category],[data-discover-livelist]")
      .forEach(function (b) {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
    if (normalGrid) normalGrid.hidden = true;
    if (live) live.hidden = true;
    if (filterEmpty) filterEmpty.hidden = true;
    section.hidden = false;
    try {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {}
    loadActive();
  }

  function hideVoucher() {
    if (!active) return;
    active = false;
    voucherBtn.classList.remove("active");
    voucherBtn.setAttribute("aria-pressed", "false");
    section.hidden = true;
  }

  voucherBtn.addEventListener("click", showVoucher);
  // Bấm bất kỳ tab khác → rời voucher (lưới do bestsellers.js lo hiện lại).
  page
    .querySelectorAll("[data-discover-category],[data-discover-livelist]")
    .forEach(function (b) {
      b.addEventListener("click", function () {
        hideVoucher();
        if (normalGrid && b.hasAttribute("data-discover-category"))
          normalGrid.hidden = false;
      });
    });
})();
