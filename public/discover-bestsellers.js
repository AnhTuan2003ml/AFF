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

  var TITLES = {
    recommend: "Đề xuất từ Shopee",
    best: "Bán chạy nhất trên Shopee",
    exclusive: "Ưu đãi độc quyền cho bạn",
  };

  // Mỗi danh mục giữ trang riêng — quay lại vẫn ở đúng trang đang xem.
  var listState = {
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
    var card = el("article", "discover-card discover-card-product");
    var media = el("div", "discover-card-media");
    if (product.imageUrl) {
      var img = document.createElement("img");
      img.src = product.imageUrl;
      img.alt = product.name;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.setAttribute("data-discover-image", "");
      media.appendChild(img);
    } else {
      var placeholder = el("div", "discover-card-placeholder");
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.appendChild(el("span", "", "▣"));
      media.appendChild(placeholder);
    }
    var LABELS = { best: "Bán chạy", exclusive: "Độc quyền", recommend: "Đề xuất" };
    var badges = el("div", "discover-card-badges");
    badges.appendChild(
      el("span", "discover-category-badge", LABELS[listKey] || "Đề xuất")
    );
    badges.appendChild(
      el("span", "discover-platform-badge platform-shopee", "Shopee")
    );
    media.appendChild(badges);
    if (product.cashbackRatePercent) {
      media.appendChild(
        el("span", "discover-cashback-badge", "Hoàn +" + product.cashbackRatePercent + "%")
      );
    }
    card.appendChild(media);

    var body = el("div", "discover-card-body");
    body.appendChild(el("h2", "", product.name));
    var metaParts = [];
    if (product.shopName) metaParts.push(product.shopName);
    if (product.salesCount) {
      metaParts.push("Đã bán " + new Intl.NumberFormat("vi-VN").format(product.salesCount));
    }
    if (metaParts.length) {
      body.appendChild(el("p", "discover-card-description", metaParts.join(" · ")));
    }
    var priceBox = el("div", "discover-price-box");
    var priceLine = el("div");
    priceLine.appendChild(
      el("strong", "", product.priceVnd ? formatVnd(product.priceVnd) : "Xem giá trên sàn")
    );
    priceBox.appendChild(priceLine);
    var refund = el("p");
    refund.appendChild(el("span", "", "Nhận về Ví ShopTik:"));
    refund.appendChild(
      el("b", "", product.cashbackAmountVnd ? "+" + formatVnd(product.cashbackAmountVnd) : "Kiểm tra khi mua")
    );
    priceBox.appendChild(refund);
    body.appendChild(priceBox);
    card.appendChild(body);

    var footer = el("footer", "discover-card-footer");
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
        endpoint + "?list=" + listKey + "&page=" + targetPage,
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

  function setLiveActive(listKey) {
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
    if (title) title.textContent = TITLES[listKey];
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
