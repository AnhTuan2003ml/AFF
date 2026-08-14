// Băng chuyền sản phẩm bán chạy trên trang Tìm sản phẩm. Nạp từ
// GET /app/promo-products, cuộn ngang (scroll-snap), nút ‹ ›, chấm trang, tự
// xoay mỗi 5s và dừng khi hover/focus. Nút mua đi qua preview → purchase →
// /go/:clickId (link affiliate hệ thống, subId đối soát được).
(function () {
  "use strict";

  var root = document.querySelector("[data-promo-carousel]");
  if (!root) return;

  var viewport = root.querySelector("[data-promo-viewport]");
  var track = root.querySelector("[data-promo-track]");
  var dotsBox = root.querySelector("[data-promo-dots]");
  var prevBtn = root.querySelector("[data-promo-prev]");
  var nextBtn = root.querySelector("[data-promo-next]");

  var AUTO_MS = 5000;
  var autoTimer = null;
  var paused = false;

  function formatVnd(value) {
    return new Intl.NumberFormat("vi-VN").format(value) + " ₫";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderCard(product) {
    var card = el("article", "promo-card");

    var media = el("div", "promo-card-media");
    var img = document.createElement("img");
    img.src = product.imageUrl;
    img.alt = product.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () {
      card.remove();
      syncDots();
    });
    media.appendChild(img);
    if (product.cashbackRatePercent) {
      media.appendChild(
        el("span", "promo-card-badge", "Hoàn +" + product.cashbackRatePercent + "%")
      );
    }
    card.appendChild(media);

    var body = el("div", "promo-card-body");
    body.appendChild(el("p", "promo-card-name", product.name));
    var priceRow = el("p", "promo-card-price");
    if (product.priceVnd) priceRow.appendChild(el("strong", "", formatVnd(product.priceVnd)));
    if (product.cashbackAmountVnd) {
      priceRow.appendChild(el("span", "", "+" + formatVnd(product.cashbackAmountVnd)));
    }
    body.appendChild(priceRow);

    var buy = el("button", "promo-card-buy");
    buy.type = "button";
    var label = el("b", "", "Mua và nhận hoàn tiền");
    var arrow = el("span", "", "↗");
    arrow.setAttribute("aria-hidden", "true");
    buy.appendChild(label);
    buy.appendChild(arrow);
    buy.addEventListener("click", function () {
      buyProduct(product, buy, label);
    });
    body.appendChild(buy);
    card.appendChild(body);
    return card;
  }

  async function postJson(path, body) {
    var csrf = document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content");
    var response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: JSON.stringify(body),
    });
    var payload = await response.json().catch(function () { return null; });
    if (!response.ok) {
      throw new Error(
        (payload && payload.error && payload.error.message) ||
          "Hệ thống đang bận. Vui lòng thử lại."
      );
    }
    return payload;
  }

  async function buyProduct(product, buy, label) {
    if (buy.disabled) return;
    var purchaseWindow = window.open("about:blank", "_blank");
    buy.disabled = true;
    var original = label.textContent;
    label.textContent = "Đang tạo link mua…";
    try {
      var preview = await postJson("/api/v1/products/preview", {
        productUrl: product.productUrl,
      });
      var purchase = await postJson("/api/v1/products/purchase", {
        previewId: preview.previewId,
      });
      if (!purchase.buyUrl) throw new Error("Chưa tạo được link mua hoàn tiền.");
      if (purchaseWindow) {
        purchaseWindow.opener = null;
        purchaseWindow.location.href = purchase.buyUrl;
      } else {
        window.location.href = purchase.buyUrl;
      }
      label.textContent = original;
    } catch (error) {
      if (purchaseWindow) purchaseWindow.close();
      label.textContent = "Thử lại";
      window.setTimeout(function () { label.textContent = original; }, 2500);
    } finally {
      buy.disabled = false;
    }
  }

  // ── Điều hướng cuộn ngang theo "trang" = chiều rộng viewport ──────────
  function pageWidth() {
    return viewport.clientWidth;
  }

  function pageCount() {
    return Math.max(1, Math.round(track.scrollWidth / pageWidth()));
  }

  function currentPage() {
    return Math.round(viewport.scrollLeft / pageWidth());
  }

  function goTo(page) {
    var pages = pageCount();
    var target = ((page % pages) + pages) % pages;
    viewport.scrollTo({ left: target * pageWidth(), behavior: "smooth" });
    // Tô chấm ngay theo đích, không đợi scroll settle (mượt hơn cho người dùng).
    setActiveDot(target);
    window.setTimeout(highlightDot, 400);
  }

  function syncDots() {
    var pages = pageCount();
    dotsBox.innerHTML = "";
    if (pages <= 1) {
      dotsBox.hidden = true;
      return;
    }
    dotsBox.hidden = false;
    for (var i = 0; i < pages; i += 1) {
      var dot = el("button", "promo-dot");
      dot.type = "button";
      dot.setAttribute("aria-label", "Trang " + (i + 1));
      dot.dataset.page = String(i);
      dot.addEventListener("click", function (event) {
        goTo(Number(event.currentTarget.dataset.page));
      });
      dotsBox.appendChild(dot);
    }
    highlightDot();
  }

  function setActiveDot(page) {
    Array.prototype.forEach.call(dotsBox.children, function (dot, i) {
      dot.classList.toggle("is-active", i === page);
    });
  }

  function highlightDot() {
    setActiveDot(currentPage());
  }

  function startAuto() {
    stopAuto();
    autoTimer = window.setInterval(function () {
      if (paused || document.hidden) return;
      var pages = pageCount();
      if (pages <= 1) return;
      goTo(currentPage() + 1);
    }, AUTO_MS);
  }

  function stopAuto() {
    if (autoTimer) window.clearInterval(autoTimer);
    autoTimer = null;
  }

  prevBtn.addEventListener("click", function () { goTo(currentPage() - 1); });
  nextBtn.addEventListener("click", function () { goTo(currentPage() + 1); });
  root.addEventListener("mouseenter", function () { paused = true; });
  root.addEventListener("mouseleave", function () { paused = false; });
  root.addEventListener("focusin", function () { paused = true; });
  root.addEventListener("focusout", function () { paused = false; });

  // Tô chấm trực tiếp trên scroll (toggle vài class — rẻ), không phụ thuộc
  // requestAnimationFrame (bị đóng băng khi tab ẩn).
  var scrollThrottle = null;
  viewport.addEventListener("scroll", function () {
    if (scrollThrottle) return;
    scrollThrottle = window.setTimeout(function () {
      scrollThrottle = null;
      highlightDot();
    }, 80);
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) return;
    resizeTimer = window.setTimeout(function () {
      resizeTimer = null;
      syncDots();
    }, 150);
  });

  fetch("/app/promo-products", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then(function (response) {
      // Phải chặn ở đây: phản hồi lỗi (429 rate limit, 500, hết phiên...) vẫn
      // là JSON hợp lệ nhưng KHÔNG có mảng products, nên nếu cứ .json() thì
      // mọi sự cố đều bị hiểu nhầm thành "kho trống" và băng chuyền lặng lẽ
      // biến mất — không có cách nào biết vì sao.
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      var products = (data && data.products) || [];
      if (!products.length) {
        console.info("[promo-carousel] kho sản phẩm đang trống nên ẩn băng chuyền.");
        return;
      }
      products.forEach(function (product) {
        if (product.imageUrl) track.appendChild(renderCard(product));
      });
      if (!track.children.length) return;
      root.hidden = false;
      // Chờ layout ổn định rồi tính số trang (setTimeout chạy cả khi tab ẩn,
      // khác requestAnimationFrame bị đóng băng).
      window.setTimeout(function () {
        syncDots();
        startAuto();
      }, 80);
    })
    .catch(function (error) {
      /* Không nạp được thì vẫn ẩn băng chuyền, nhưng nói rõ lý do ra console
         để lần sau không phải đoán xem "mục Đang hot" đi đâu mất. */
      console.warn(
        "[promo-carousel] không nạp được /app/promo-products:",
        (error && error.message) || error,
      );
    });
})();
