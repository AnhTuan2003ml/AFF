/**
 * Luồng mua hoàn tiền trên màn hình chính — đúng hai bước người dùng thấy:
 *
 * 1. Chọn sàn → dán link → "Tra cứu" → POST /api/v1/products/preview
 *    → hiện ảnh, tên, giá bán, hóa đơn hoàn tiền (kèm previewId).
 * 2. Bấm "Mua ngay"              → POST /api/v1/products/purchase
 *    → nhận buyUrl (/go/:clickId) và mở tab mới đã gắn mã Affiliate.
 */
(() => {
  "use strict";

  const finder = document.querySelector("[data-product-finder]");
  if (!(finder instanceof HTMLFormElement)) return;
  const buyFlow = finder.closest("[data-buy-flow]");
  const platformTabs = buyFlow?.querySelector(".platform-tabs");

  // Sàn nào đã có tài khoản Affiliate thật (mua được ngay) — sàn còn lại vẫn
  // tra cứu/xem trước bình thường, chỉ nút Mua ngay hiện "Sắp mở".
  const platformPurchaseFlags = (() => {
    const flow = document.querySelector("[data-buy-flow]");
    const raw = flow?.getAttribute("data-platform-purchase");
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();

  const $ = (selector) => document.querySelector(selector);
  const urlInput = finder.querySelector("[data-product-url]");
  const platformInput = finder.querySelector("[data-platform-input]");
  const pasteButton = finder.querySelector("[data-product-paste]");
  const submitButton = finder.querySelector("[data-product-submit]");
  const submitText = finder.querySelector("[data-product-submit-text]");
  const csrfInput = finder.querySelector("input[name='_csrf']");

  const emptyState = $("[data-product-empty]");
  const loading = $("[data-product-loading]");
  const errorBox = $("[data-product-error]");
  const errorTitle = $("[data-product-error-title]");
  const errorMessage = $("[data-product-error-message]");
  const retryButton = $("[data-product-retry]");
  const result = $("[data-product-result]");
  const el = {
    platform: $("[data-product-platform]"),
    image: $("[data-product-image]"),
    name: $("[data-product-name]"),
    shop: $("[data-product-shop]"),
    status: $("[data-product-status]"),
    buy: $("[data-product-buy]"),
    reset: $("[data-product-reset]"),
  };
  const receipt = {
    price: $("[data-receipt-price]"),
    priceLabel: $("[data-receipt-price-label]"),
    originalLine: $("[data-receipt-original-line]"),
    originalPrice: $("[data-receipt-original-price]"),
    discount: $("[data-receipt-discount]"),
    savingLine: $("[data-receipt-saving]"),
    savingValue: $("[data-receipt-saving-value]"),
    commission: $("[data-receipt-commission]"),
    rate: $("[data-receipt-rate]"),
    total: $("[data-receipt-total]"),
  };
  const sourceNote = $("[data-product-source-note]");
  const cashbackNote = $("[data-product-cashback-note]");

  const commentsToggle = $("[data-comments-toggle]");
  const commentsToggleLabel = $("[data-comments-toggle-label]");
  const comments = {
    section: $("[data-product-comments]"),
    list: $("[data-comment-list]"),
    empty: $("[data-comment-empty]"),
    form: $("[data-comment-form]"),
    input: $("[data-comment-input]"),
    submit: $("[data-comment-submit]"),
  };

  const buyDefaultHtml =
    el.buy instanceof HTMLButtonElement ? el.buy.innerHTML : "";

  let previewId = null;
  let activeRequest = null;
  let lastSubmittedUrl = "";
  // Sản phẩm đang hiển thị — dùng cho khối bình luận cộng đồng.
  let currentProduct = null;
  let commentCount = 0;

  const scrollToProductContext = () => {
    const isMobile = window.matchMedia("(max-width: 680px)").matches;
    const anchor = isMobile ? platformTabs : buyFlow;
    if (!(anchor instanceof HTMLElement)) return;

    // Desktop giữ cả tiêu đề, ô dán link, tab sàn và sản phẩm trong cùng một
    // nhịp nhìn. Mobile bắt đầu từ danh sách sàn để sản phẩm hiện ngay bên dưới.
    // Cả hai đều cuộn qua phần header nhưng không đẩy thẻ sản phẩm sát mép quá mức.
    const top = Math.max(
      0,
      window.scrollY + anchor.getBoundingClientRect().top - (isMobile ? 12 : 14),
    );
    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const postJson = async (path, body, signal) => {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token":
          csrfInput instanceof HTMLInputElement ? csrfInput.value : "",
      },
      body: JSON.stringify(body),
      signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        payload?.error?.message || "Hệ thống đang bận. Vui lòng thử lại.",
      );
      error.code = payload?.error?.code;
      throw error;
    }
    return payload;
  };

  const formatVnd = (value) =>
    Number.isFinite(Number(value))
      ? `${new Intl.NumberFormat("vi-VN", {
          maximumFractionDigits: 0,
        }).format(Number(value))} ₫`
      : "Đang cập nhật";

  // Máy trạng thái 4 nhánh loại trừ nhau: rỗng / đang tải / lỗi / kết quả.
  const setView = (view) => {
    if (emptyState instanceof HTMLElement) emptyState.hidden = view !== "empty";
    if (loading instanceof HTMLElement) loading.hidden = view !== "loading";
    if (errorBox instanceof HTMLElement) errorBox.hidden = view !== "error";
    if (result instanceof HTMLElement) result.hidden = view !== "result";
    if (view !== "result" && comments.section instanceof HTMLElement) {
      comments.section.hidden = true;
      if (commentsToggle instanceof HTMLElement) {
        commentsToggle.hidden = true;
        commentsToggle.setAttribute("aria-expanded", "false");
      }
    }
    if (view !== "result") currentProduct = null;
  };

  const setBusy = (busy) => {
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = busy;
    }
    if (submitText) {
      submitText.textContent = busy ? "Đang tra cứu…" : "Tra cứu";
    }
    if (busy) setView("loading");
  };

  const formatCommentTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const updateCommentsToggleLabel = () => {
    if (commentsToggleLabel) {
      commentsToggleLabel.textContent =
        commentCount > 0
          ? `Xem ${commentCount} bình luận về sản phẩm này`
          : "Chưa có bình luận — bấm để viết đầu tiên";
    }
  };

  const appendComment = (comment, { prepend = false } = {}) => {
    if (!(comments.list instanceof HTMLElement)) return;
    const item = document.createElement("article");
    item.className = "comment-item";
    const head = document.createElement("header");
    const name = document.createElement("b");
    name.textContent = comment.fullName || comment.full_name || "Người dùng";
    const time = document.createElement("time");
    time.textContent = formatCommentTime(
      comment.createdAt || comment.created_at,
    );
    head.append(name, time);
    const body = document.createElement("p");
    body.textContent = comment.content;
    item.append(head, body);
    if (prepend) comments.list.prepend(item);
    else comments.list.append(item);
    if (comments.empty instanceof HTMLElement) comments.empty.hidden = true;
    commentCount += 1;
    updateCommentsToggleLabel();
  };

  const loadComments = async (product) => {
    if (!(comments.section instanceof HTMLElement) || !product?.productId) {
      return;
    }
    commentCount = 0;
    if (comments.list instanceof HTMLElement) comments.list.textContent = "";
    if (comments.empty instanceof HTMLElement) comments.empty.hidden = true;
    if (commentsToggle instanceof HTMLElement) {
      commentsToggle.hidden = false;
      updateCommentsToggleLabel();
    }
    try {
      const params = new URLSearchParams({
        platform: product.platform,
        productId: product.productId,
      });
      const response = await fetch(`/api/v1/products/comments?${params}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.data)) return;
      if (payload.data.length === 0) {
        if (comments.empty instanceof HTMLElement) {
          comments.empty.hidden = false;
        }
        updateCommentsToggleLabel();
        return;
      }
      payload.data.forEach((comment) => appendComment(comment));
    } catch {
      // Không chặn luồng mua nếu tải bình luận lỗi.
    }
  };

  const showError = (message, title) => {
    if (errorTitle) errorTitle.textContent = title || "Chưa tìm được sản phẩm";
    if (errorMessage) {
      errorMessage.textContent =
        message || "Hãy kiểm tra lại link sản phẩm rồi thử lại.";
    }
    setView("error");
  };

  const renderProduct = (product) => {
    const label = product.platformLabel || "sàn";
    // Đồng bộ tab hiển thị theo đúng sàn hệ thống tự nhận diện từ link vừa
    // dán — người dùng không cần bấm đúng tab trước khi dán.
    if (product.platform) activatePlatformTab(product.platform);
    if (el.platform) el.platform.textContent = label;
    if (el.name) el.name.textContent = product.productName;
    if (el.shop) el.shop.textContent = product.shopName || `Gian hàng ${label}`;
    if (el.status) {
      const complete = product.dataStatus === "COMPLETE";
      el.status.textContent = complete ? "Đầy đủ" : "Đang cập nhật";
      el.status.classList.toggle("is-complete", complete);
      el.status.classList.toggle("is-partial", !complete);
    }
    if (receipt.price) {
      receipt.price.textContent =
        product.priceVnd === null ? "Xem giá trên sàn" : formatVnd(product.priceVnd);
    }
    // Giá gốc + % giảm chỉ hiện khi sàn thực sự đang có khuyến mãi
    // (originalPriceVnd > priceVnd) — không tự suy đoán khi thiếu dữ liệu.
    const hasDiscount =
      product.originalPriceVnd !== null &&
      product.originalPriceVnd !== undefined &&
      product.priceVnd !== null &&
      product.originalPriceVnd > product.priceVnd;
    if (receipt.priceLabel) {
      receipt.priceLabel.textContent = hasDiscount ? "Giá sau giảm" : "Giá hiện tại";
    }
    if (receipt.originalLine instanceof HTMLElement) {
      receipt.originalLine.hidden = !hasDiscount;
    }
    if (receipt.originalPrice) {
      receipt.originalPrice.textContent = hasDiscount
        ? formatVnd(product.originalPriceVnd)
        : "";
    }
    const discountPercent = hasDiscount
      ? Math.round((1 - product.priceVnd / product.originalPriceVnd) * 100)
      : 0;
    if (receipt.discount) {
      receipt.discount.textContent = hasDiscount ? `-${discountPercent}%` : "";
    }
    if (receipt.savingLine instanceof HTMLElement) {
      receipt.savingLine.hidden = !hasDiscount;
    }
    if (receipt.savingValue) {
      receipt.savingValue.textContent = hasDiscount
        ? formatVnd(product.originalPriceVnd - product.priceVnd)
        : "";
    }
    if (receipt.commission) {
      receipt.commission.textContent =
        product.affiliateCommissionVnd === null
          ? "Đang cập nhật"
          : formatVnd(product.affiliateCommissionVnd);
    }
    if (receipt.rate) {
      receipt.rate.textContent = `${product.buyerCashbackPercent}%`;
    }
    if (receipt.total) {
      receipt.total.textContent =
        product.buyerCashbackVnd === null
          ? "Đang cập nhật"
          : formatVnd(product.buyerCashbackVnd);
    }
    const purchaseEnabled = Boolean(platformPurchaseFlags[product.platform]);
    if (el.buy instanceof HTMLButtonElement) {
      el.buy.disabled = !purchaseEnabled;
      el.buy.classList.toggle("is-soon", !purchaseEnabled);
      el.buy.innerHTML = purchaseEnabled ? buyDefaultHtml : "Sắp mở";
    }
    if (cashbackNote) {
      cashbackNote.textContent = !purchaseEnabled
        ? ""
        : product.buyerCashbackVnd === null
          ? "Tiền hoàn đang cập nhật."
          : "Cộng vào ví sau khi sàn duyệt.";
    }
    if (sourceNote) {
      sourceNote.textContent = !purchaseEnabled
        ? `${label} sắp mở mua hàng — bạn có thể xem trước giá, chưa mua được ngay lúc này.`
        : product.dataStatus === "PARTIAL"
          ? "Một số dữ liệu đang cập nhật."
          : "";
    }
    if (el.image instanceof HTMLImageElement) {
      el.image.src = product.imageUrl || "/assets/images/logo.png";
      el.image.alt = product.productName;
      el.image.classList.toggle("is-placeholder", !product.imageUrl);
      el.image.onerror = () => {
        el.image.src = "/assets/images/logo.png";
        el.image.classList.add("is-placeholder");
        el.image.onerror = null;
      };
    }
    if (result instanceof HTMLElement) {
      result.dataset.platform = product.platform || "SHOPEE";
    }
    setView("result");
    // Chờ hai khung hình để trạng thái hidden và chiều cao thẻ sản phẩm đã
    // ổn định rồi mới tính điểm cuộn theo đúng bố cục desktop/mobile.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToProductContext);
    });
    currentProduct =
      product.productId && product.platform
        ? { platform: product.platform, productId: product.productId }
        : null;
    if (currentProduct) {
      void loadComments(currentProduct);
    }
  };

  const lookup = async (value) => {
    activeRequest?.abort();
    activeRequest = new AbortController();
    lastSubmittedUrl = value;
    setBusy(true);
    try {
      // Không ép platform theo tab đang chọn — để backend tự nhận diện sàn
      // từ chính domain trong link (không nhập nhằng giữa các sàn), rồi
      // renderProduct() sẽ tự đồng bộ lại tab hiển thị theo kết quả đó.
      const payload = await postJson(
        "/api/v1/products/preview",
        { productUrl: value },
        activeRequest.signal,
      );
      if (!payload?.product || !payload.previewId) {
        throw new Error("Chưa đọc được thông tin sản phẩm. Hãy thử lại.");
      }
      previewId = payload.previewId;
      renderProduct(payload.product);
    } catch (error) {
      if (error?.name !== "AbortError") {
        showError(
          error instanceof Error
            ? error.message
            : "Không lấy được thông tin sản phẩm.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // Bước 1: dán link → tra cứu.
  finder.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(urlInput instanceof HTMLInputElement)) return;
    const value = urlInput.value.trim();
    previewId = null;
    if (!value) {
      showError("Hãy dán link sản phẩm từ Shopee, TikTok Shop hoặc Lazada.");
      urlInput.focus();
      return;
    }
    await lookup(value);
  });

  retryButton?.addEventListener("click", () => {
    if (lastSubmittedUrl) void lookup(lastSubmittedUrl);
  });

  // Bước 2: bấm Mua ngay → tạo link Affiliate rồi mở tab mới.
  el.buy?.addEventListener("click", async () => {
    if (
      !previewId ||
      !(el.buy instanceof HTMLButtonElement) ||
      el.buy.disabled
    ) {
      return;
    }
    const originalText = el.buy.innerHTML;
    el.buy.disabled = true;
    el.buy.textContent = "Đang mở trang mua…";
    // Mở tab trống ngay trong sự kiện click để không bị chặn popup.
    const pending = window.open("about:blank", "_blank");
    try {
      const payload = await postJson("/api/v1/products/purchase", {
        previewId,
      });
      if (!payload?.buyUrl) throw new Error("Chưa tạo được link mua.");
      if (pending) {
        pending.location = payload.buyUrl;
      } else {
        window.location.assign(payload.buyUrl);
      }
    } catch (error) {
      pending?.close();
      if (error?.code === "PREVIEW_EXPIRED") previewId = null;
      showError(
        error instanceof Error ? error.message : "Chưa tạo được link mua.",
      );
    } finally {
      el.buy.disabled = false;
      el.buy.innerHTML = originalText;
    }
  });

  el.reset?.addEventListener("click", () => {
    activeRequest?.abort();
    previewId = null;
    setView("empty");
    if (urlInput instanceof HTMLInputElement) {
      urlInput.value = "";
      urlInput.focus();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Đổi tab đang bật (do người dùng bấm HOẶC do hệ thống tự nhận diện sàn từ
  // link vừa dán) — chỉ đổi màu/trạng thái, không đổi kích thước nút.
  const activatePlatformTab = (platform) => {
    const tab = document.querySelector(`[data-platform-tab="${platform}"]`);
    if (!(tab instanceof HTMLElement)) return;
    document.querySelectorAll("[data-platform-tab]").forEach((other) => {
      other.classList.remove("active");
      other.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    if (platformInput instanceof HTMLInputElement) {
      platformInput.value = platform;
    }
    if (urlInput instanceof HTMLInputElement) {
      const platformLabel = tab.getAttribute("data-platform-label") || platform;
      urlInput.placeholder = `Dán link ${platformLabel}`;
    }
  };

  document.querySelectorAll("[data-platform-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const platform = tab.getAttribute("data-platform-tab");
      if (platform) activatePlatformTab(platform);
    });
  });

  // Dán link (tay hoặc qua nút) là tìm luôn, không cần bấm thêm.
  const submitIfLink = () => {
    if (!(urlInput instanceof HTMLInputElement)) return;
    if (urlInput.value.trim().startsWith("https://")) finder.requestSubmit();
  };

  // Nút dán hiện sẵn khi trình duyệt cho phép đọc clipboard — cố tình KHÔNG
  // gọi urlInput.focus() sau khi dán, vì trên mobile việc focus vào input sẽ
  // bật bàn phím ảo lên dù người dùng chỉ muốn bấm 1 nút rồi xem kết quả.
  if (navigator.clipboard?.readText && pasteButton instanceof HTMLElement) {
    pasteButton.hidden = false;
    pasteButton.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && urlInput instanceof HTMLInputElement) {
          urlInput.value = text.trim();
          submitIfLink();
        }
      } catch {
        // Người dùng từ chối quyền đọc clipboard — họ tự dán bằng tay.
      }
    });
  }

  // Ẩn/hiện khối bình luận — khu phụ, không tự động chen vào tác vụ mua.
  commentsToggle?.addEventListener("click", () => {
    if (!(comments.section instanceof HTMLElement)) return;
    const willShow = comments.section.hidden;
    comments.section.hidden = !willShow;
    commentsToggle.setAttribute("aria-expanded", String(willShow));
  });

  // Gửi bình luận về sản phẩm đang xem.
  comments.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentProduct || !(comments.input instanceof HTMLInputElement)) {
      return;
    }
    const content = comments.input.value.trim();
    if (content.length < 2) {
      comments.input.focus();
      return;
    }
    if (comments.submit instanceof HTMLButtonElement) {
      comments.submit.disabled = true;
    }
    try {
      const created = await postJson("/api/v1/products/comments", {
        platform: currentProduct.platform,
        productId: currentProduct.productId,
        content,
      });
      appendComment(created, { prepend: true });
      comments.input.value = "";
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Chưa gửi được bình luận.",
      );
    } finally {
      if (comments.submit instanceof HTMLButtonElement) {
        comments.submit.disabled = false;
      }
    }
  });

  // Dán link bằng tay (Ctrl+V) cũng tìm luôn, không cần bấm thêm.
  urlInput?.addEventListener("paste", () => {
    window.setTimeout(submitIfLink, 40);
  });
})();
