// Băng chuyền sản phẩm. Nạp từ endpoint của từng băng (data-endpoint, mặc định
// GET /app/promo-products), cuộn ngang (scroll-snap), nút ‹ ›, chấm trang.
// Cuộn/tự xoay theo TỪNG SẢN PHẨM (không phải từng trang 4 thẻ); tới sản phẩm
// cuối thì lặp vòng khép kín về sản phẩm đầu (nhân bản vài thẻ đầu ra cuối rồi
// nhảy vô hình) — cả desktop lẫn mobile. Mỗi sản phẩm là MỘT chấm. Cho phép kéo
// chuột như vuốt tay. HỖ TRỢ NHIỀU BĂNG trên cùng trang. Nút mua đi qua
// preview → purchase → /go/:clickId (link affiliate hệ thống, subId đối soát).
(function () {
  "use strict";

  // Ngôn ngữ hiển thị lấy từ thuộc tính lang của <html> (server đặt theo cookie).
  var LANG = document.documentElement.lang === "en" ? "en" : "vi";
  function T(vi, en) { return LANG === "en" ? en : vi; }

  function formatVnd(value) {
    return new Intl.NumberFormat("vi-VN").format(value) + " ₫";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
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
      var err = new Error(
        (payload && payload.error && payload.error.message) ||
          "Hệ thống đang bận. Vui lòng thử lại."
      );
      err.status = response.status;
      throw err;
    }
    return payload;
  }

  async function buyProduct(product, buy, label) {
    if (buy.disabled) return;
    // Mobile: điều hướng ngay tab hiện tại thay vì mở tab about:blank mới.
    var isMobile = window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
    var purchaseWindow = isMobile ? null : window.open("about:blank", "_blank");
    buy.disabled = true;
    var original = label.textContent;
    label.textContent = T("Đang tạo link mua…", "Creating buy link…");
    try {
      var preview = await postJson("/api/v1/products/preview", { productUrl: product.productUrl });
      var purchase = await postJson("/api/v1/products/purchase", { previewId: preview.previewId });
      if (!purchase.buyUrl) throw new Error("Chưa tạo được link mua hoàn tiền.");
      if (purchaseWindow) { purchaseWindow.opener = null; purchaseWindow.location.href = purchase.buyUrl; }
      else { window.location.href = purchase.buyUrl; }
      label.textContent = original;
    } catch (error) {
      if (purchaseWindow) purchaseWindow.close();
      // Khách chưa đăng nhập bấm Mua → đẩy sang trang đăng nhập.
      if (error && error.status === 401) {
        window.location.assign("/dang-nhap?next=" + encodeURIComponent("/app"));
        return;
      }
      label.textContent = T("Thử lại", "Retry");
      window.setTimeout(function () { label.textContent = original; }, 2500);
    } finally {
      buy.disabled = false;
    }
  }

  function initCarousel(root) {
    var viewport = root.querySelector("[data-promo-viewport]");
    var track = root.querySelector("[data-promo-track]");
    var prevBtn = root.querySelector("[data-promo-prev]");
    var nextBtn = root.querySelector("[data-promo-next]");
    var progressEl = root.querySelector("[data-promo-progress]");
    if (!viewport || !track) return;
    var endpoint = root.getAttribute("data-endpoint") || "/app/promo-products";
    // Chế độ "xòe quạt" (trang đăng nhập): 5 thẻ đầu, xếp hình quạt bằng CSS,
    // không cuộn/tự xoay.
    var fanMode = root.hasAttribute("data-promo-fan");

    var AUTO_MS = 5000;
    var autoTimer = null;
    var paused = false;
    var resumeTimer = null;

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
        if (!fanMode) window.setTimeout(setup, 30);
      });
      media.appendChild(img);
      if (product.cashbackRatePercent) {
        media.appendChild(el("span", "promo-card-badge", T("Hoàn +", "+") + product.cashbackRatePercent + "%"));
      }
      card.appendChild(media);

      var body = el("div", "promo-card-body");
      body.appendChild(el("p", "promo-card-name", product.name));
      var priceRow = el("p", "promo-card-price");
      if (product.priceVnd) priceRow.appendChild(el("strong", "", formatVnd(product.priceVnd)));
      if (product.cashbackAmountVnd) priceRow.appendChild(el("span", "", "+" + formatVnd(product.cashbackAmountVnd)));
      body.appendChild(priceRow);

      var buy = el("button", "promo-card-buy");
      buy.type = "button";
      var label = el("b", "", T("Mua và nhận hoàn tiền", "Buy & earn cashback"));
      var arrow = el("span", "", "↗");
      arrow.setAttribute("aria-hidden", "true");
      buy.appendChild(label);
      buy.appendChild(arrow);
      buy.addEventListener("click", function () { buyProduct(product, buy, label); });
      body.appendChild(buy);
      card.appendChild(body);
      return card;
    }

    // ----- Kích thước & danh sách thẻ thật (bỏ thẻ nhân bản) -----
    function realCards() {
      return Array.prototype.filter.call(track.children, function (c) {
        return !c.hasAttribute("data-promo-clone");
      });
    }
    function gapPx() {
      var cs = window.getComputedStyle(track);
      return parseFloat(cs.columnGap || cs.gap || "14") || 14;
    }
    function cardStep() {
      var cards = realCards();
      if (!cards.length) return viewport.clientWidth || 1;
      return cards[0].getBoundingClientRect().width + gapPx();
    }
    // Quãng đường một vòng = tổng bề rộng các thẻ thật (kể cả khoảng cách trước
    // thẻ nhân bản đầu tiên) = n × bước.
    function loopWidth() {
      var n = realCards().length;
      return n ? n * cardStep() : 0;
    }
    // Có gì để cuộn/lặp không? (nội dung tràn khỏi khung nhìn)
    function loopable() {
      return loopWidth() > viewport.clientWidth + gapPx() + 2;
    }

    function clearClones() {
      Array.prototype.slice
        .call(track.querySelectorAll("[data-promo-clone]"))
        .forEach(function (c) { c.remove(); });
    }
    function buildClones() {
      clearClones();
      if (!loopable()) return;
      var cards = realCards();
      var need = Math.min(cards.length, Math.ceil(viewport.clientWidth / cardStep()) + 1);
      for (var i = 0; i < need; i += 1) {
        var clone = cards[i].cloneNode(true);
        clone.setAttribute("data-promo-clone", "1");
        clone.setAttribute("aria-hidden", "true");
        clone.tabIndex = -1;
        track.appendChild(clone);
      }
    }

    function currentIndex() {
      var n = realCards().length;
      if (!n) return 0;
      return ((Math.round(viewport.scrollLeft / cardStep()) % n) + n) % n;
    }

    // Nhảy vô hình khi cuộn vào vùng thẻ nhân bản: trừ đúng một vòng để về đầu.
    function normalizeLoop() {
      if (!loopable()) return;
      var w = loopWidth();
      if (w <= 0) return;
      if (viewport.scrollLeft >= w - 1) viewport.scrollLeft = viewport.scrollLeft - w;
      else if (viewport.scrollLeft < 0) viewport.scrollLeft = viewport.scrollLeft + w;
    }

    // ----- Chấm chỉ báo: mỗi sản phẩm MỘT chấm -----
    function buildDots() {
      if (!progressEl) return;
      var n = realCards().length;
      if (n <= 1 || !loopable()) { progressEl.innerHTML = ""; progressEl.hidden = true; return; }
      progressEl.hidden = false;
      if (progressEl.children.length !== n) {
        progressEl.innerHTML = "";
        for (var i = 0; i < n; i += 1) {
          var dot = document.createElement("span");
          dot.dataset.index = String(i);
          progressEl.appendChild(dot);
        }
      }
      syncActiveDot();
    }
    function syncActiveDot() {
      if (!progressEl || !progressEl.children.length) return;
      var cur = currentIndex();
      Array.prototype.forEach.call(progressEl.children, function (d, i) {
        d.classList.toggle("is-active", i === cur);
      });
    }
    if (progressEl) {
      progressEl.addEventListener("click", function (e) {
        var t = e.target;
        if (t && t.dataset && t.dataset.index != null) goToIndex(Number(t.dataset.index));
      });
    }

    function goToIndex(i) {
      viewport.scrollTo({ left: i * cardStep(), behavior: "smooth" });
      window.setTimeout(function () { normalizeLoop(); syncActiveDot(); }, 430);
      pauseFor(4500);
    }
    // Tiến/lùi đúng MỘT sản phẩm; tới cuối thì đi tiếp vào thẻ nhân bản rồi nhảy
    // vô hình về đầu (cảm giác vòng tròn khép kín).
    function stepBy(dir) {
      viewport.scrollTo({ left: viewport.scrollLeft + dir * cardStep(), behavior: "smooth" });
      window.setTimeout(function () { normalizeLoop(); syncActiveDot(); }, 430);
    }

    function startAuto() {
      stopAuto();
      autoTimer = window.setInterval(function () {
        if (paused || document.hidden || !loopable()) return;
        stepBy(1);
      }, AUTO_MS);
    }
    function stopAuto() { if (autoTimer) window.clearInterval(autoTimer); autoTimer = null; }

    function pauseFor(ms) {
      paused = true;
      if (resumeTimer) window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(function () { paused = false; }, ms || 4500);
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { stepBy(-1); pauseFor(4500); });
    if (nextBtn) nextBtn.addEventListener("click", function () { stepBy(1); pauseFor(4500); });
    root.addEventListener("mouseenter", function () { paused = true; });
    root.addEventListener("mouseleave", function () { if (!dragging) paused = false; });
    root.addEventListener("focusin", function () { paused = true; });
    root.addEventListener("focusout", function () { paused = false; });

    // Kéo bằng chuột (desktop) giống vuốt tay trên điện thoại.
    var dragging = false, dragStartX = 0, dragStartLeft = 0, dragMoved = false;
    viewport.addEventListener("pointerdown", function (e) {
      paused = true;
      if (resumeTimer) window.clearTimeout(resumeTimer);
      if (e.pointerType === "mouse" && loopable()) {
        dragging = true;
        dragMoved = false;
        dragStartX = e.clientX;
        dragStartLeft = viewport.scrollLeft;
        viewport.classList.add("is-grabbing");
      }
    });
    window.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 3) dragMoved = true;
      viewport.scrollLeft = dragStartLeft - dx;
      normalizeLoop();
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove("is-grabbing");
      var step = cardStep();
      viewport.scrollTo({ left: Math.round(viewport.scrollLeft / step) * step, behavior: "smooth" });
      window.setTimeout(function () { normalizeLoop(); syncActiveDot(); }, 320);
      pauseFor(4500);
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    // Chặn click "Mua" bắn ra ngay sau khi kéo.
    viewport.addEventListener("click", function (e) {
      if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
    }, true);

    // Vuốt cảm ứng: tạm dừng tự xoay, chạy lại sau vài giây.
    viewport.addEventListener("touchstart", function () {
      paused = true;
      if (resumeTimer) window.clearTimeout(resumeTimer);
    }, { passive: true });
    viewport.addEventListener("touchend", function () { pauseFor(4500); });

    // Desktop: lăn chuột — mỗi nấc đúng một sản phẩm (không kẹt ở mép vì có vòng lặp).
    var wheelLock = false;
    viewport.addEventListener("wheel", function (e) {
      if (!loopable()) return;
      var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      stepBy(delta > 0 ? 1 : -1);
      pauseFor(3500);
      window.setTimeout(function () { wheelLock = false; }, 300);
    }, { passive: false });

    var scrollThrottle = null;
    viewport.addEventListener("scroll", function () {
      if (scrollThrottle) return;
      scrollThrottle = window.setTimeout(function () {
        scrollThrottle = null;
        if (!dragging) normalizeLoop();
        syncActiveDot();
      }, 90);
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) return;
      resizeTimer = window.setTimeout(function () {
        resizeTimer = null;
        if (fanMode) return;
        buildClones();
        buildDots();
        viewport.classList.toggle("is-draggable", loopable());
        syncActiveDot();
      }, 180);
    });

    function setup() {
      if (fanMode) return;
      buildClones();
      buildDots();
      viewport.classList.toggle("is-draggable", loopable());
      syncActiveDot();
      startAuto();
    }

    // Băng "quan tâm chưa mua": thẻ đã render sẵn từ server. Bỏ fetch, chỉ gắn
    // điều khiển (mũi tên/chấm/vuốt/kéo/tự xoay) để giống hệt băng "Đề xuất".
    if (root.hasAttribute("data-promo-static")) {
      // Nút "Hoàn tất mua" → chạy thẳng luồng mua (preview → purchase → link
      // affiliate), không điều hướng về trang đơn.
      Array.prototype.forEach.call(track.querySelectorAll("[data-instant-buy]"), function (btn) {
        var label = btn.querySelector("b") || btn;
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          buyProduct({ productUrl: btn.dataset.productUrl }, btn, label);
        });
      });
      if (realCards().length) {
        root.hidden = false;
        window.setTimeout(setup, 80);
      }
      return;
    }

    fetch(endpoint, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        var products = (data && data.products) || [];
        if (!products.length) return;
        products.forEach(function (product) { if (product.imageUrl) track.appendChild(renderCard(product)); });
        if (!realCards().length) return;
        root.hidden = false;
        if (fanMode) { while (track.children.length > 5) track.removeChild(track.lastElementChild); return; }
        window.setTimeout(setup, 80);
      })
      .catch(function (error) {
        console.warn("[promo-carousel] không nạp được " + endpoint + ":", (error && error.message) || error);
      });
  }

  var roots = document.querySelectorAll("[data-promo-carousel]");
  Array.prototype.forEach.call(roots, initCarousel);
})();
