// Băng chuyền sản phẩm. Nạp từ endpoint của từng băng (data-endpoint, mặc định
// GET /app/promo-products), cuộn ngang (scroll-snap), nút ‹ ›, chấm trang, tự
// xoay mỗi 5s, dừng khi hover/focus. HỖ TRỢ NHIỀU BĂNG trên cùng trang (mỗi
// mục Đề xuất/Bán chạy/Độc quyền là một băng riêng). Nút mua đi qua
// preview → purchase → /go/:clickId (link affiliate hệ thống, subId đối soát).
(function () {
  "use strict";

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
    var purchaseWindow = window.open("about:blank", "_blank");
    buy.disabled = true;
    var original = label.textContent;
    label.textContent = "Đang tạo link mua…";
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
      label.textContent = "Thử lại";
      window.setTimeout(function () { label.textContent = original; }, 2500);
    } finally {
      buy.disabled = false;
    }
  }

  function initCarousel(root) {
    var viewport = root.querySelector("[data-promo-viewport]");
    var track = root.querySelector("[data-promo-track]");
    var dotsBox = root.querySelector("[data-promo-dots]");
    var prevBtn = root.querySelector("[data-promo-prev]");
    var nextBtn = root.querySelector("[data-promo-next]");
    var progressEl = root.querySelector("[data-promo-progress]");
    if (!viewport || !track) return;
    var endpoint = root.getAttribute("data-endpoint") || "/app/promo-products";

    var AUTO_MS = 5000;
    var autoTimer = null;
    var paused = false;

    function renderCard(product) {
      var card = el("article", "promo-card");
      var media = el("div", "promo-card-media");
      var img = document.createElement("img");
      img.src = product.imageUrl;
      img.alt = product.name;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () { card.remove(); syncDots(); });
      media.appendChild(img);
      if (product.cashbackRatePercent) {
        media.appendChild(el("span", "promo-card-badge", "Hoàn +" + product.cashbackRatePercent + "%"));
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
      var label = el("b", "", "Mua và nhận hoàn tiền");
      var arrow = el("span", "", "↗");
      arrow.setAttribute("aria-hidden", "true");
      buy.appendChild(label);
      buy.appendChild(arrow);
      buy.addEventListener("click", function () { buyProduct(product, buy, label); });
      body.appendChild(buy);
      card.appendChild(body);
      return card;
    }

    function pageWidth() { return viewport.clientWidth; }
    function pageCount() { return Math.max(1, Math.round(track.scrollWidth / pageWidth())); }
    function currentPage() { return Math.round(viewport.scrollLeft / pageWidth()); }

    function goTo(page) {
      var pages = pageCount();
      var target = ((page % pages) + pages) % pages;
      viewport.scrollTo({ left: target * pageWidth(), behavior: "smooth" });
      setActiveDot(target);
      window.setTimeout(highlightDot, 400);
    }

    function syncDots() {
      if (!dotsBox) return;
      var pages = pageCount();
      dotsBox.innerHTML = "";
      if (pages <= 1) { dotsBox.hidden = true; return; }
      dotsBox.hidden = false;
      for (var i = 0; i < pages; i += 1) {
        var dot = el("button", "promo-dot");
        dot.type = "button";
        dot.setAttribute("aria-label", "Trang " + (i + 1));
        dot.dataset.page = String(i);
        dot.addEventListener("click", function (event) { goTo(Number(event.currentTarget.dataset.page)); });
        dotsBox.appendChild(dot);
      }
      highlightDot();
    }

    function setActiveDot(page) {
      if (!dotsBox) return;
      Array.prototype.forEach.call(dotsBox.children, function (dot, i) {
        dot.classList.toggle("is-active", i === page);
      });
    }
    function highlightDot() { setActiveDot(currentPage()); }

    function startAuto() {
      stopAuto();
      autoTimer = window.setInterval(function () {
        if (paused || document.hidden) return;
        if (pageCount() <= 1) return;
        goTo(currentPage() + 1);
      }, AUTO_MS);
    }
    function stopAuto() { if (autoTimer) window.clearInterval(autoTimer); autoTimer = null; }

    if (prevBtn) prevBtn.addEventListener("click", function () { goTo(currentPage() - 1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goTo(currentPage() + 1); });
    root.addEventListener("mouseenter", function () { paused = true; });
    root.addEventListener("mouseleave", function () { paused = false; });
    root.addEventListener("focusin", function () { paused = true; });
    root.addEventListener("focusout", function () { paused = false; });
    // Vuốt tay: tạm dừng tự xoay khi đang chạm/kéo, chạy lại sau vài giây.
    var resumeTimer = null;
    function pauseFor(ms) { paused = true; if (resumeTimer) window.clearTimeout(resumeTimer); resumeTimer = window.setTimeout(function () { paused = false; }, ms || 4500); }
    viewport.addEventListener("pointerdown", function () { paused = true; if (resumeTimer) window.clearTimeout(resumeTimer); });
    viewport.addEventListener("touchstart", function () { paused = true; if (resumeTimer) window.clearTimeout(resumeTimer); }, { passive: true });
    window.addEventListener("pointerup", function () { pauseFor(4500); });

    // Chỉ báo dạng chấm "..." dưới sản phẩm (mỗi chấm = một trang, chấm đang
    // xem kéo dài thành viên thuốc cam). Bấm chấm để nhảy trang.
    function updateProgress() {
      if (!progressEl) return;
      var pages = pageCount();
      if (pages <= 1) { progressEl.innerHTML = ""; progressEl.hidden = true; return; }
      progressEl.hidden = false;
      if (progressEl.children.length !== pages) {
        progressEl.innerHTML = "";
        for (var i = 0; i < pages; i += 1) {
          var dot = document.createElement("span");
          dot.dataset.page = String(i);
          progressEl.appendChild(dot);
        }
      }
      var cur = currentPage();
      Array.prototype.forEach.call(progressEl.children, function (d, i) {
        d.classList.toggle("is-active", i === cur);
      });
    }
    if (progressEl) {
      progressEl.addEventListener("click", function (e) {
        var t = e.target;
        if (t && t.dataset && t.dataset.page != null) goTo(Number(t.dataset.page));
      });
    }

    // Bề rộng một sản phẩm (thẻ + khoảng cách) để bước từng sản phẩm.
    function cardStep() {
      var first = track.children[0];
      if (!first) return viewport.clientWidth;
      var w = first.getBoundingClientRect().width;
      var gap = parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || "14") || 14;
      return w + gap;
    }
    function stepCard(dir) {
      viewport.scrollTo({ left: viewport.scrollLeft + dir * cardStep(), behavior: "smooth" });
      window.setTimeout(updateProgress, 320);
    }

    // Desktop: trỏ chuột vào rồi LĂN CHUỘT — mỗi nấc chuyển ĐÚNG MỘT sản phẩm.
    // Lăn LÊN = sản phẩm trước, lăn XUỐNG = sản phẩm sau. Tới mép thì trả lại
    // cuộn trang bình thường (không kẹt).
    var wheelLock = false;
    viewport.addEventListener("wheel", function (e) {
      var max = viewport.scrollWidth - viewport.clientWidth;
      if (max <= 0) return;
      var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      var atStart = viewport.scrollLeft <= 0;
      var atEnd = viewport.scrollLeft >= max - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return; // tới mép: cuộn trang
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      stepCard(delta > 0 ? 1 : -1);
      pauseFor(3500);
      window.setTimeout(function () { wheelLock = false; }, 280);
    }, { passive: false });

    var scrollThrottle = null;
    viewport.addEventListener("scroll", function () {
      updateProgress();
      if (scrollThrottle) return;
      scrollThrottle = window.setTimeout(function () { scrollThrottle = null; highlightDot(); }, 80);
    });
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) return;
      resizeTimer = window.setTimeout(function () { resizeTimer = null; syncDots(); updateProgress(); }, 150);
    });

    // Băng "quan tâm chưa mua": thẻ đã render sẵn từ server. Bỏ fetch, chỉ gắn
    // điều khiển (mũi tên/chấm/vuốt/tự xoay) để giống hệt băng "Đề xuất".
    if (root.hasAttribute("data-promo-static")) {
      Array.prototype.forEach.call(track.querySelectorAll("img"), function (img) {
        img.addEventListener("error", function () {
          var card = img.closest(".promo-card");
          if (card) { card.remove(); syncDots(); updateProgress(); }
        });
      });
      if (track.children.length) {
        root.hidden = false;
        window.setTimeout(function () { syncDots(); updateProgress(); startAuto(); }, 80);
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
        if (!track.children.length) return;
        root.hidden = false;
        window.setTimeout(function () { syncDots(); updateProgress(); startAuto(); }, 80);
      })
      .catch(function (error) {
        console.warn("[promo-carousel] không nạp được " + endpoint + ":", (error && error.message) || error);
      });
  }

  var roots = document.querySelectorAll("[data-promo-carousel]");
  Array.prototype.forEach.call(roots, initCarousel);
})();
