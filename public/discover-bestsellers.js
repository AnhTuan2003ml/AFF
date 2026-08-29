// Danh mục sống trong "◇ Danh mục" của trang Khám phá: "Đề xuất"
// (list=recommend) và "Bán chạy nhất" (list=best). Mỗi mục phân trang RIÊNG
// (20 sp/trang) từ GET /app/discover/offer-products?list=..&page=N — server
// đọc cache DB, trang chưa có thì nhờ profile-worker gọi Shopee (FETCHING →
// poll tới khi READY). Nút mua dùng chung [data-discover-buy] của
// discover.js (ủy quyền sự kiện) → link affiliate hệ thống kèm subId.
(function () {
  "use strict";

  var root = document.querySelector("[data-bestseller]");
  var page = document.querySelector("[data-discover-page]");
  if (!root || !page) return;

  var endpoint = root.getAttribute("data-endpoint");
  var endpointLazada = root.getAttribute("data-endpoint-lazada");
  var endpoints = { shopee: endpoint, lazada: endpointLazada };
  var PLATFORM_NAMES = { shopee: "Shopee", lazada: "Lazada" };
  // Sàn do CẤP 1 (discover.js) quyết định — đọc từ data-discover-platform.
  function currentPlatform() {
    return page.dataset.discoverPlatform === "lazada" ? "lazada" : "shopee";
  }
  var grid = root.querySelector("[data-bestseller-grid]");
  var statusBox = root.querySelector("[data-bestseller-status]");
  var loadingBox = root.querySelector("[data-bestseller-loading]");
  var pagination = root.querySelector("[data-bestseller-pagination]");
  var title = root.querySelector("[data-bestseller-title]");
  var liveButtons = Array.prototype.slice.call(
    page.querySelectorAll("[data-discover-livelist]")
  );
  var categoryButtons = Array.prototype.slice.call(
    page.querySelectorAll("[data-discover-category]")
  );
  var normalGrid = page.querySelector("[data-discover-grid]");
  var filterEmpty = page.querySelector("[data-discover-filter-empty]");

  var TITLE_SHOPEE = {
    hot: "🔥 Deal Hot",
    recommend: "Đề xuất",
    best: "Bán chạy nhất",
    exclusive: "Ưu đãi độc quyền",
  };
  // Lazada: "hot" đóng vai "Hoa hồng cao" (feed sắp theo hoa hồng).
  var TITLE_LAZADA = {
    hot: "🔥 Hoa hồng cao",
    recommend: "Đề xuất",
    best: "Bán chạy nhất",
  };
  function titleFor(listKey) {
    var platform = currentPlatform();
    var base =
      (platform === "lazada" ? TITLE_LAZADA : TITLE_SHOPEE)[listKey] ||
      "Sản phẩm";
    return base + " trên " + (PLATFORM_NAMES[platform] || "Shopee");
  }

  // Mỗi danh mục giữ trang riêng — quay lại vẫn ở đúng trang đang xem.
  var listState = {
    hot: { page: 1, known: 0, hasMore: true },
    recommend: { page: 1, known: 0, hasMore: true },
    best: { page: 1, known: 0, hasMore: true },
    exclusive: { page: 1, known: 0, hasMore: true },
  };
  var activeList = null;
  var pollTimer = null;
  var pollDeadline = 0;
  var requestSeq = 0;

  function formatVnd(value) {
    return new Intl.NumberFormat("vi-VN").format(value) + " ₫";
  }

  function setStatus(message) {
    statusBox.textContent = message || "";
    statusBox.hidden = !message;
  }

  // Loading im lặng: chỉ spinner, không thông báo "đang lấy từ Shopee…".
  function setLoading(on) {
    if (loadingBox) loadingBox.hidden = !on;
    if (on) {
      grid.setAttribute("aria-busy", "true");
    } else {
      grid.removeAttribute("aria-busy");
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Dùng đúng hệ class thẻ của trang Khám phá để giao diện đồng nhất.
  function renderCard(product, listKey) {
    // Dùng ĐÚNG hệ class px-product-* như thẻ tĩnh (discover.css không nạp ở
    // trang này — styling thật đến từ luxury-ui.css .px-product-*).
    var card = el("article", "discover-card discover-card-product px-product-card");
    var media = el("div", "discover-card-media px-product-media");
    var FALLBACK_LOGO = "/assets/images/icon.png";
    var img = document.createElement("img");
    img.src = product.imageUrl || FALLBACK_LOGO;
    img.alt = product.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.setAttribute("data-discover-image", "");
    function toFallback() {
      if (img.src.indexOf(FALLBACK_LOGO) === -1) {
        img.src = FALLBACK_LOGO;
        img.classList.add("is-placeholder");
      }
    }
    // Ảnh Shopee hỏng/404 → logo ShopTik. Ảnh placeholder "không có ảnh" của
    // Shopee (nhỏ, HTTP 200) không bắt được bằng onerror → dò kích thước.
    img.addEventListener("error", toFallback);
    img.addEventListener("load", function () {
      if (img.naturalWidth && img.naturalWidth <= 170) toFallback();
    });
    media.appendChild(img);
    var LABELS = { hot: "🔥 Hot", best: "Bán chạy", exclusive: "Độc quyền", recommend: "Đề xuất" };
    var badges = el("div", "discover-card-badges");
    badges.appendChild(
      el("span", "discover-category-badge", LABELS[listKey] || "Đề xuất")
    );
    var plat = currentPlatform();
    badges.appendChild(
      el(
        "span",
        "discover-platform-badge platform-" + plat,
        PLATFORM_NAMES[plat] || "Shopee"
      )
    );
    media.appendChild(badges);
    // Badge % giảm voucher (góc trên phải ảnh) — nổi bật deal Hot.
    if (product.discountPercent) {
      media.appendChild(
        el("span", "discover-discount-badge", "-" + product.discountPercent + "%")
      );
    }
    if (product.cashbackRatePercent) {
      media.appendChild(
        el("span", "discover-cashback-badge", "Hoàn +" + product.cashbackRatePercent + "%")
      );
    }
    card.appendChild(media);

    var body = el("div", "discover-card-body px-product-body");
    if (product.shopName) {
      body.appendChild(el("span", "px-product-category", product.shopName));
    }
    body.appendChild(el("h2", "", product.name));
    var priceBox = el("div", "discover-price-box px-price-box");
    var priceLine = el("div");
    priceLine.appendChild(
      el("strong", "", product.priceVnd ? formatVnd(product.priceVnd) : "Xem giá trên sàn")
    );
    // Voucher/HOT: giá gốc gạch ngang để thấy giảm bao nhiêu.
    if (product.originalPriceVnd && product.originalPriceVnd > (product.priceVnd || 0)) {
      priceLine.appendChild(el("del", "", formatVnd(product.originalPriceVnd)));
    }
    priceBox.appendChild(priceLine);
    var refund = el("p");
    refund.appendChild(el("span", "", "Hoàn về ví"));
    refund.appendChild(
      el("b", "", product.cashbackAmountVnd ? "+" + formatVnd(product.cashbackAmountVnd) : "Kiểm tra khi mua")
    );
    priceBox.appendChild(refund);
    body.appendChild(priceBox);
    card.appendChild(body);

    var footer = el("footer", "discover-card-footer px-product-footer");
    var buy = el("button", "discover-primary-action");
    buy.type = "button";
    buy.setAttribute("data-discover-buy", "");
    buy.setAttribute("data-product-url", product.productUrl);
    var label = el("b", "", "Mua và nhận hoàn tiền");
    label.setAttribute("data-buy-label", "");
    buy.appendChild(label);
    var arrow = el("span", "", "↗");
    arrow.setAttribute("aria-hidden", "true");
    buy.appendChild(arrow);
    footer.appendChild(buy);
    card.appendChild(footer);
    return card;
  }

  function renderPagination() {
    var state = listState[activeList];
    pagination.innerHTML = "";
    pagination.hidden = false;

    var addButton = function (text, targetPage, options) {
      options = options || {};
      var button = el("button", "page-item " + (options.className || "page-page"), text);
      button.type = "button";
      if (options.active) button.classList.add("active");
      if (options.disabled) {
        button.disabled = true;
      } else {
        button.addEventListener("click", function () {
          loadPage(activeList, targetPage);
        });
      }
      pagination.appendChild(button);
    };

    addButton("‹", state.page - 1, { className: "page-prev", disabled: state.page <= 1 });
    var maxPage = Math.max(state.known, state.page, state.hasMore ? state.page + 1 : state.page);
    var start = Math.max(1, Math.min(state.page - 2, maxPage - 4));
    var end = Math.min(maxPage, start + 4);
    for (var p = start; p <= end; p += 1) {
      addButton(String(p), p, { active: p === state.page });
    }
    addButton("›", state.page + 1, {
      className: "page-next",
      disabled: !state.hasMore && state.page >= maxPage,
    });
  }

  function stopPolling() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  async function loadPage(listKey, targetPage, isPoll) {
    if (targetPage < 1) return;
    if (!isPoll) {
      stopPolling();
      listState[listKey].page = targetPage;
      setStatus("");
      setLoading(true);
      renderPagination();
    }
    var seq = ++requestSeq;
    var data;
    try {
      var response = await fetch(
        endpoints[currentPlatform()] + "?list=" + listKey + "&page=" + targetPage,
        { credentials: "same-origin", headers: { accept: "application/json" } }
      );
      data = await response.json();
      if (!response.ok) throw new Error((data && data.error && data.error.message) || "Lỗi tải dữ liệu.");
    } catch (error) {
      if (seq !== requestSeq) return;
      setLoading(false);
      setStatus("Không tải được dữ liệu. Kiểm tra mạng rồi thử lại.");
      return;
    }
    if (seq !== requestSeq || listKey !== activeList) return;
    if (data.page !== listState[listKey].page) return;

    if (data.status === "FETCHING") {
      // Trang chưa có trong DB — worker đang lấy từ Shopee. Chỉ hiển thị
      // spinner im lặng (không thông báo chờ), poll ngầm tới khi xong.
      if (!pollDeadline || !isPoll) pollDeadline = Date.now() + 90_000;
      if (Date.now() > pollDeadline) {
        setLoading(false);
        setStatus("Chưa tải được trang này. Vui lòng thử lại sau ít phút.");
        return;
      }
      setLoading(true);
      pollTimer = window.setTimeout(function () {
        loadPage(listKey, data.page, true);
      }, 4000);
      return;
    }

    setLoading(false);
    if (data.status !== "READY") {
      grid.innerHTML = "";
      setStatus(data.message || "Danh mục này đang tạm nghỉ. Vui lòng quay lại sau.");
      pagination.hidden = true;
      return;
    }

    var state = listState[listKey];
    state.known = Math.max(state.known, data.knownPages || 0, data.page);
    state.hasMore = data.products.length >= (data.pageSize || 20);
    grid.innerHTML = "";
    if (data.products.length === 0) {
      setStatus("Đã hết danh sách.");
    } else {
      setStatus("");
      data.products.forEach(function (product) {
        grid.appendChild(renderCard(product, listKey));
      });
    }
    renderPagination();
    if (!isPoll && data.page !== 1) {
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  var lastPlatform = "shopee";
  function setLiveActive(listKey) {
    // Đổi sàn → dữ liệu khác hẳn, đưa mọi mục về trang 1.
    if (currentPlatform() !== lastPlatform) {
      Object.keys(listState).forEach(function (key) {
        listState[key] = { page: 1, known: 0, hasMore: true };
      });
      lastPlatform = currentPlatform();
    }
    activeList = listKey;
    liveButtons.forEach(function (button) {
      var isActive = button.getAttribute("data-discover-livelist") === listKey;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    // Nút danh mục thường mất trạng thái chọn khi sang danh mục sống.
    categoryButtons.forEach(function (button) {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    });
    if (normalGrid) normalGrid.hidden = true;
    if (filterEmpty) filterEmpty.hidden = true;
    root.hidden = false;
    if (title) title.textContent = titleFor(listKey);
    // Đưa tiêu đề mục vào tầm nhìn ngay khi mở.
    try {
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {}
    loadPage(listKey, listState[listKey].page);
  }


  function leaveLive() {
    if (activeList === null) return;
    activeList = null;
    stopPolling();
    liveButtons.forEach(function (button) {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    });
    root.hidden = true;
    if (normalGrid) normalGrid.hidden = false;
  }

  liveButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setLiveActive(button.getAttribute("data-discover-livelist"));
    });
  });

  // Bấm danh mục thường (kể cả "Tất cả") → rời danh mục sống, trả lưới cũ.
  categoryButtons.forEach(function (button) {
    button.addEventListener("click", leaveLive);
  });
})();
