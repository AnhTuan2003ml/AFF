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
  const platformShowcase = buyFlow?.querySelector("[data-platform-showcase]");

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
  // Câu thoại Camio đổi theo trạng thái luồng (nguồn: public/camio-voice.js).
  const camioLine = $("[data-camio-line]");
  const camioSay = (group, fallback, vars) => {
    const v = window.CamioVoice;
    const text = (v && v.pick(group, vars)) || fallback;
    if (camioLine instanceof HTMLElement && text) camioLine.textContent = text;
    return text;
  };
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
    // Mobile: đưa NGƯỜI DÙNG THẲNG XUỐNG THẺ SẢN PHẨM vừa tra được (ảnh +
    // giá + nút mua) — không dừng ở danh sách sàn, vì màn hình nhỏ dán link
    // xong là muốn thấy hàng ngay. Desktop giữ cả cụm tra cứu trong khung nhìn.
    const anchor = isMobile
      ? result instanceof HTMLElement && !result.hidden
        ? result
        : platformShowcase
      : buyFlow;
    if (!(anchor instanceof HTMLElement)) return;

    const top = Math.max(
      0,
      window.scrollY + anchor.getBoundingClientRect().top - (isMobile ? 8 : 14),
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
      // "Hệ thống đang bận" chỉ dành cho lỗi máy chủ thật (5xx); lỗi dữ
      // liệu luôn ưu tiên thông báo tiếng Việt cụ thể từ server.
      const fallback =
        response.status >= 500
          ? camioSay("error", "Hệ thống đang hơi bận, chờ Camio một chút nha.")
          : camioSay("badLink", "Camio chưa đọc được link này, kiểm tra lại nhé!");
      const error = new Error(payload?.error?.message || fallback);
      error.code = payload?.error?.code;
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  // Nhận diện sàn ngay tại client để (1) chặn sớm link sai/không hỗ trợ với
  // thông báo đúng nguyên nhân, (2) đồng bộ tab sàn tức thì khi vừa dán.
  const CLIENT_PLATFORM_HOSTS = {
    SHOPEE: ["shopee.vn", "s.shopee.vn", "shp.ee", "shope.ee"],
    TIKTOK: ["tiktok.com", "vt.tiktok.com", "vm.tiktok.com", "shop.tiktok.com"],
    LAZADA: ["lazada.vn", "s.lazada.vn", "c.lazada.vn", "pages.lazada.vn"],
  };

  const detectClientPlatform = (value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      return { error: "INVALID" };
    }
    if (url.protocol !== "https:") return { error: "INVALID" };
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const [platform, hosts] of Object.entries(CLIENT_PLATFORM_HOSTS)) {
      if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return { platform };
      }
    }
    return { error: "UNSUPPORTED" };
  };

  // Lỗi thuộc về DỮ LIỆU link (người dùng cần sửa link, không phải thử lại).
  const DATA_ERROR_CODES = new Set([
    "VALIDATION",
    "INVALID_PRODUCT_URL",
    "UNSAFE_PRODUCT_URL",
    "UNSUPPORTED_PLATFORM",
    "PLATFORM_MISMATCH",
    "ALREADY_AFFILIATE_URL",
    "PRODUCT_NOT_FOUND",
    "SHORT_LINK_UNAVAILABLE",
    "SHORT_LINK_UNRESOLVED",
    "URL_TOO_LONG",
  ]);

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
    if (view === "empty") camioSay("noLink", "Dán link vào đây, Camio kiểm tra cho!");
    if (view === "loading") camioSay("checking", "Camio đang soi link…");
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

  // kind: "data" (người dùng phải sửa link → nút "Sửa link", focus input)
  //       "server" (lỗi mạng/máy chủ → nút "Thử lại" gửi lại yêu cầu).
  let lastErrorKind = "server";

  const showError = (message, title, kind = "server") => {
    lastErrorKind = kind;
    if (errorTitle) {
      errorTitle.textContent =
        title ||
        (kind === "data"
          ? camioSay("badLink", "Camio chưa đọc được link này 🤔")
          : camioSay("error", "Camio vừa vấp một chút…"));
    }
    if (errorMessage) {
      errorMessage.textContent =
        message || "Copy lại link sản phẩm rồi đưa Camio nhé!";
    }
    camioSay(kind === "data" ? "badLink" : "error", "");
    if (retryButton) {
      retryButton.textContent = kind === "data" ? "Sửa link" : "Thử lại";
    }
    if (urlInput instanceof HTMLInputElement) {
      urlInput.setAttribute("aria-invalid", kind === "data" ? "true" : "false");
      urlInput.setAttribute(
        "aria-describedby",
        kind === "data"
          ? "product-url-hint product-error-message"
          : "product-url-hint",
      );
    }
    setView("error");
  };

  const clearInputErrorState = () => {
    if (urlInput instanceof HTMLInputElement) {
      urlInput.setAttribute("aria-invalid", "false");
      urlInput.setAttribute("aria-describedby", "product-url-hint");
    }
  };

  const renderProduct = (product) => {
    const label = product.platformLabel || "sàn";
    // Đồng bộ tab hiển thị theo đúng sàn hệ thống tự nhận diện từ link vừa
    // dán — người dùng không cần bấm đúng tab trước khi dán.
    if (product.platform) activatePlatformTab(product.platform);
    if (el.platform) el.platform.textContent = label;
    if (el.name) el.name.textContent = product.productName;
    if (el.shop) el.shop.textContent = product.shopName || `Gian hàng ${label}`;
    // 3 mức trung thực của kết quả: Đầy đủ / Đang cập nhật (có dữ liệu thật
    // nhưng thiếu một phần) / CHƯA XÁC MINH (không lấy được bất kỳ dữ liệu
    // thật nào từ sàn — thẻ chỉ dựng từ URL, không được trình bày như một
    // kết quả tra cứu thành công).
    const verified = product.dataVerified !== false;
    if (el.status) {
      const complete = product.dataStatus === "COMPLETE";
      el.status.textContent = !verified
        ? "Chưa xác minh"
        : complete
          ? "Đầy đủ"
          : "Đang cập nhật";
      el.status.classList.toggle("is-complete", verified && complete);
      el.status.classList.toggle("is-partial", verified && !complete);
      el.status.classList.toggle("is-unverified", !verified);
    }
    if (result instanceof HTMLElement) {
      result.classList.toggle("is-unverified", !verified);
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
      el.buy.innerHTML = !purchaseEnabled
        ? "Sắp mở"
        : verified
          ? buyDefaultHtml
          : `Mở trên ${label} để kiểm tra`;
    }
    if (!verified) {
      if (receipt.commission) receipt.commission.textContent = "Chưa xác minh";
      if (receipt.total) receipt.total.textContent = "Chưa xác minh";
    }
    if (cashbackNote) {
      cashbackNote.textContent =
        !purchaseEnabled || !verified
          ? ""
          : product.buyerCashbackVnd === null
            ? "Tiền hoàn đang cập nhật."
            : "Cộng vào ví sau khi sàn duyệt.";
    }
    if (!verified || product.buyerCashbackVnd === null) {
      camioSay("pendingAmount", "Có hoàn đó, nhưng sàn chưa báo số. Camio cập nhật sau nhé 👀");
    } else if (product.buyerCashbackVnd > 0) {
      camioSay("foundAmount", "🎉 Bạn có thể nhận khoảng {amount}.", {
        amount: formatVnd(product.buyerCashbackVnd),
      });
    } else {
      camioSay("noCashback", "Hmm… link này chưa có hoàn tiền rồi 🥲");
    }
    if (sourceNote) {
      sourceNote.textContent = !verified
        ? `ShopTik chưa lấy được dữ liệu từ ${label} nên CHƯA xác minh được sản phẩm này có tồn tại. Nếu bạn chắc link đúng, có thể mở trên sàn để kiểm tra — tiền hoàn (nếu mua) vẫn đối soát theo đơn thực tế.`
        : !purchaseEnabled
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

  let lookupSeq = 0;

  const lookup = async (value) => {
    activeRequest?.abort();
    activeRequest = new AbortController();
    const seq = ++lookupSeq;
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
      if (seq !== lookupSeq) return;
      if (!payload?.product || !payload.previewId) {
        throw new Error("Chưa đọc được thông tin sản phẩm. Hãy thử lại.");
      }
      previewId = payload.previewId;
      clearInputErrorState();
      renderProduct(payload.product);
    } catch (error) {
      if (seq !== lookupSeq) return;
      if (error?.name !== "AbortError") {
        const isDataError =
          DATA_ERROR_CODES.has(error?.code) ||
          (typeof error?.status === "number" &&
            error.status >= 400 &&
            error.status < 500);
        showError(
          error instanceof Error
            ? error.message
            : "Camio chưa lấy được thông tin sản phẩm.",
          isDataError ? "🤔 Camio chưa đọc được link này" : "😵 Camio vừa vấp một chút…",
          isDataError ? "data" : "server",
        );
      }
    } finally {
      // Chỉ yêu cầu MỚI NHẤT được phép mở khóa nút — tránh cảnh yêu cầu cũ
      // bị hủy chạy finally muộn, bật nút trong khi skeleton còn chạy.
      if (seq === lookupSeq) setBusy(false);
    }
  };

  // Bước 1: dán link → tra cứu. Chặn sớm tại client các lỗi có thể biết
  // ngay (trống / sai định dạng / ngoài 3 sàn) với thông báo đúng nguyên
  // nhân — không đẩy lên server để rồi nhận thông báo chung chung.
  finder.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(urlInput instanceof HTMLInputElement)) return;
    const value = urlInput.value.trim();
    previewId = null;
    if (!value) {
      showError(
        "Dán link sản phẩm từ Shopee, TikTok Shop hoặc Lazada, Camio kiểm tra cho!",
        "Link đâu rồi? 👀",
        "data",
      );
      urlInput.focus();
      return;
    }
    const detected = detectClientPlatform(value);
    if (detected.error === "INVALID") {
      showError(
        "Hình như link bị thiếu rồi — dán link đầy đủ bắt đầu bằng https:// từ Shopee, TikTok Shop hoặc Lazada nhé!",
        "🤔 Camio chưa đọc được link này",
        "data",
      );
      urlInput.focus();
      return;
    }
    if (detected.error === "UNSUPPORTED") {
      showError(
        "Camio mới săn hoàn được trên Shopee, TikTok Shop và Lazada Việt Nam thôi. Thử link sàn khác nhé!",
        "Sàn này Camio chưa săn được 🥲",
        "data",
      );
      urlInput.focus();
      return;
    }
    // Đồng bộ tab sàn NGAY khi biết — không chờ kết quả trả về.
    if (detected.platform) activatePlatformTab(detected.platform);
    await lookup(value);
  });

  retryButton?.addEventListener("click", () => {
    if (lastErrorKind === "data") {
      // Lỗi thuộc về link: đưa người dùng về input để sửa, không gửi lại
      // chính link sai. focus không được kéo trang cuộn — chỉ cuộn khi ô
      // nhập thực sự nằm ngoài viewport.
      setView("empty");
      if (urlInput instanceof HTMLInputElement) {
        urlInput.focus({ preventScroll: true });
        urlInput.select();
        const rect = urlInput.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          urlInput.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }
      return;
    }
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
    // Mở tab trống ngay trong sự kiện click để không bị chặn popup. Mobile:
    // điều hướng ngay tab hiện tại thay vì mở tab about:blank mới.
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
    const pending = isMobile ? null : window.open("about:blank", "_blank");
    try {
      const payload = await postJson("/api/v1/products/purchase", {
        previewId,
      });
      if (!payload?.buyUrl) throw new Error("Camio chưa tạo được link mua. Thử lại nhé!");
      camioSay("linkReady", "✅ Xong! Giờ bạn có thể đi mua rồi.");
      if (pending) {
        pending.location = payload.buyUrl;
      } else {
        window.location.assign(payload.buyUrl);
      }
    } catch (error) {
      pending?.close();
      // Khách chưa đăng nhập bấm Mua → đẩy sang trang đăng nhập.
      if (error?.status === 401) {
        window.location.assign("/dang-nhap?next=" + encodeURIComponent("/app"));
        return;
      }
      if (error?.code === "PREVIEW_EXPIRED") previewId = null;
      showError(
        error instanceof Error ? error.message : "Camio chưa tạo được link mua. Thử lại nhé!",
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

  // Sàn được nhận diện trực tiếp từ URL. Ba logo phía dưới chỉ là quảng bá,
  // KHÔNG còn là nút chọn sàn. Khi nhận diện được link, slide tương ứng được
  // đưa lên trước để phản hồi trực quan mà không thay đổi cơ chế mua.
  const PLATFORM_LABELS = { SHOPEE: "Shopee", TIKTOK: "TikTok Shop", LAZADA: "Lazada" };
  const activatePlatformTab = (platform) => {
    if (platformInput instanceof HTMLInputElement) platformInput.value = platform;
    if (urlInput instanceof HTMLInputElement) {
      urlInput.placeholder = `Dán link ${PLATFORM_LABELS[platform] || platform}`;
    }
    document.querySelectorAll("[data-platform-ad]").forEach((slide) => {
      const active = slide.getAttribute("data-platform-ad") === platform;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    document.dispatchEvent(new CustomEvent("shoptik:platform-detected", { detail: { platform } }));
  };

  // Dán link (tay hoặc qua nút) là tìm luôn, không cần bấm thêm.
  const submitIfLink = () => {
    if (!(urlInput instanceof HTMLInputElement)) return;
    if (urlInput.value.trim().startsWith("https://")) finder.requestSubmit();
  };

  // Nút dán hiện sẵn khi trình duyệt cho phép đọc clipboard — cố tình KHÔNG
  // gọi urlInput.focus() sau khi dán, vì trên mobile việc focus vào input sẽ
  // bật bàn phím ảo lên dù người dùng chỉ muốn bấm 1 nút rồi xem kết quả.
  const pasteHint = finder.querySelector("[data-paste-hint]");
  let pasteHintTimer = 0;
  const showPasteHint = (message) => {
    if (!(pasteHint instanceof HTMLElement)) return;
    pasteHint.textContent = message;
    pasteHint.hidden = false;
    window.clearTimeout(pasteHintTimer);
    pasteHintTimer = window.setTimeout(() => {
      pasteHint.hidden = true;
    }, 4000);
  };

  if (navigator.clipboard?.readText && pasteButton instanceof HTMLElement) {
    pasteButton.hidden = false;
    pasteButton.addEventListener("click", async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) {
          // Clipboard trống: giữ nguyên trang, KHÔNG dùng lại link cũ.
          showPasteHint("Bộ nhớ tạm chưa có link nào, copy link rồi thử lại nha 👀");
          return;
        }
        if (urlInput instanceof HTMLInputElement) {
          urlInput.value = text;
          submitIfLink();
        }
      } catch {
        showPasteHint(
          "Trình duyệt chưa cho phép đọc clipboard — hãy dán bằng Ctrl+V.",
        );
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

  // Nút Tra cứu chỉ bật khi ô nhập có nội dung; gõ lại là xóa cờ lỗi ARIA.
  const updateSubmitEnabled = () => {
    if (
      submitButton instanceof HTMLButtonElement &&
      urlInput instanceof HTMLInputElement
    ) {
      submitButton.disabled = urlInput.value.trim().length === 0;
    }
  };
  urlInput?.addEventListener("input", () => {
    clearInputErrorState();
    if (pasteHint instanceof HTMLElement) pasteHint.hidden = true;
    updateSubmitEnabled();
  });
  updateSubmitEnabled();
})();
