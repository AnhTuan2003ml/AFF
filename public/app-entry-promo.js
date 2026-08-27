(() => {
  "use strict";

  const root = document.querySelector("[data-entry-promo]");
  if (!(root instanceof HTMLElement)) return;

  // Hiện MỘT LẦN mỗi lần mở web (theo phiên trình duyệt): đánh dấu ngay khi
  // hiện nên đóng xong, chuyển trang/tab menu trong cùng phiên không hiện lại;
  // mở web lần sau (phiên mới) lại hiện.
  const SEEN_KEY = "shoptik-entry-promo-seen";
  let daHien = false;
  try {
    daHien = sessionStorage.getItem(SEEN_KEY) === "1";
  } catch (e) {}
  if (daHien) return;

  const closeButton = root.querySelector("[data-entry-promo-close]");
  const imageLink = root.querySelector("[data-entry-promo-image-link]");
  const image = root.querySelector("[data-entry-promo-image]");
  const imageStaticWrap = root.querySelector("[data-entry-promo-visual-static]");
  const imageStatic = root.querySelector("[data-entry-promo-image-static]");
  const placeholder = root.querySelector("[data-entry-promo-placeholder]");
  const badge = root.querySelector("[data-entry-promo-badge]");
  const type = root.querySelector("[data-entry-promo-type]");
  const title = root.querySelector("[data-entry-promo-title]");
  const description = root.querySelector("[data-entry-promo-description]");
  const typeLabel = root.querySelector("[data-entry-promo-type-label]");
  const badgeInline = root.querySelector("[data-entry-promo-badge-inline]");
  const titleCopy = root.querySelector("[data-entry-promo-title-copy]");
  const descriptionCopy = root.querySelector("[data-entry-promo-description-copy]");
  const cta = root.querySelector("[data-entry-promo-cta]");

  if (!(closeButton instanceof HTMLButtonElement) ||
      !(imageLink instanceof HTMLAnchorElement) ||
      !(image instanceof HTMLImageElement) ||
      !(imageStaticWrap instanceof HTMLElement) ||
      !(imageStatic instanceof HTMLImageElement) ||
      !(placeholder instanceof HTMLElement) ||
      !(badge instanceof HTMLElement) ||
      !(type instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(description instanceof HTMLElement) ||
      !(typeLabel instanceof HTMLElement) ||
      !(badgeInline instanceof HTMLElement) ||
      !(titleCopy instanceof HTMLElement) ||
      !(descriptionCopy instanceof HTMLElement) ||
      !(cta instanceof HTMLAnchorElement)) return;

  const body = document.body;
  let previousFocus = null;

  const show = () => {
    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    root.hidden = false;
    root.removeAttribute("inert");
    body.classList.add("is-entry-promo-open");
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}

    window.requestAnimationFrame(() => {
      closeButton.focus({ preventScroll: true });
    });
  };

  const close = () => {
    // Nút X và "Bỏ qua" phải cùng một hành vi: đã đóng là không bật lại
    // khi điều hướng nội bộ (lưu theo ngày, giống nút Bỏ qua) — trước đây
    // X chỉ đóng ở trang hiện tại khiến popup hiện lại ở trang kế tiếp.
    // Đã đánh dấu "đã hiện" ngay lúc mở — đóng chỉ việc ẩn.
    // Đưa focus ra ngoài dialog trước khi ẩn. Nhờ vậy trình duyệt không còn
    // cảnh báo aria-hidden vì nút X vẫn giữ focus trong phần tử bị ẩn.
    if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
    } else {
      closeButton.blur();
    }

    root.setAttribute("inert", "");
    root.hidden = true;
    body.classList.remove("is-entry-promo-open");

    // Sau khi đóng quảng cáo: tự mở popup điểm danh. Quảng cáo chỉ hiện một lần
    // mỗi ngày (skipKey) nên việc này cũng chỉ xảy ra một lần khi vào trang.
    window.setTimeout(() => {
      const checkinTrigger = document.querySelector("[data-checkin-open]");
      if (checkinTrigger instanceof HTMLElement) checkinTrigger.click();
    }, 320);
  };

  closeButton.addEventListener("click", close);

  const setText = (element, value) => {
    element.textContent = value || "";
    element.hidden = !value;
  };

  const clearImageFit = () => {
    root.classList.remove(
      "has-entry-promo-image",
      "entry-promo-image-landscape",
      "entry-promo-image-portrait",
      "entry-promo-image-extra-tall",
    );
  };

  const applyImageFit = (loadedImage) => {
    if (!(loadedImage instanceof HTMLImageElement) ||
        loadedImage.naturalWidth <= 0 || loadedImage.naturalHeight <= 0) return;

    const ratio = loadedImage.naturalHeight / loadedImage.naturalWidth;
    root.classList.remove(
      "entry-promo-image-landscape",
      "entry-promo-image-portrait",
      "entry-promo-image-extra-tall",
    );

    if (ratio > 1.9) {
      root.classList.add("entry-promo-image-extra-tall");
    } else if (ratio > 1.15) {
      root.classList.add("entry-promo-image-portrait");
    } else {
      root.classList.add("entry-promo-image-landscape");
    }
  };

  const bindImageFit = (loadedImage) => {
    loadedImage.addEventListener("load", () => applyImageFit(loadedImage), { once: true });
    if (loadedImage.complete) applyImageFit(loadedImage);
  };

  const setImage = (url, alt, targetUrl) => {
    clearImageFit();

    const hasImage = typeof url === "string" && url.trim().length > 0;
    if (!hasImage) {
      image.hidden = true;
      image.removeAttribute("src");
      imageStatic.hidden = true;
      imageStatic.removeAttribute("src");
      imageLink.hidden = true;
      imageStaticWrap.hidden = true;
      placeholder.hidden = false;
      return;
    }

    root.classList.add("has-entry-promo-image");

    const normalizedUrl = url.trim();
    const normalizedAlt = alt && alt.trim().length > 0 ? alt.trim() : "Quảng cáo ShopTik";

    image.src = normalizedUrl;
    image.alt = normalizedAlt;
    image.hidden = false;

    imageStatic.src = normalizedUrl;
    imageStatic.alt = normalizedAlt;
    imageStatic.hidden = false;

    bindImageFit(image);
    bindImageFit(imageStatic);

    if (typeof targetUrl === "string" && targetUrl.trim().length > 0) {
      imageLink.href = targetUrl.trim();
      imageLink.hidden = false;
      imageStaticWrap.hidden = true;
    } else {
      imageLink.hidden = true;
      imageLink.removeAttribute("href");
      imageStaticWrap.hidden = false;
    }

    placeholder.hidden = true;
  };

  const bindPromo = (promo) => {
    setText(title, promo.title);
    setText(description, promo.description);
    setText(titleCopy, promo.title);
    setText(descriptionCopy, promo.description);
    setText(type, promo.typeLabel);
    setText(typeLabel, promo.typeLabel);
    setText(badge, promo.badge);
    setText(badgeInline, promo.badge);

    if (typeof promo.targetUrl === "string" && promo.targetUrl.trim().length > 0) {
      cta.href = promo.targetUrl.trim();
      cta.hidden = false;
    } else {
      cta.hidden = true;
      cta.removeAttribute("href");
    }

    setImage(promo.imageUrl, promo.title, promo.targetUrl);
  };

  fetch("/app/entry-promo", { headers: { "x-requested-with": "fetch" } })
    .then(async (response) => {
      if (!response.ok) return null;
      return response.json();
    })
    .then((payload) => {
      const promo = payload && typeof payload === "object" ? payload.promo : null;
      if (!promo || typeof promo.id !== "string") return;

      // Quảng cáo chỉ hiển thị dưới dạng ảnh — bỏ qua nếu chưa có ảnh, tránh
      // hiện popup chỉ toàn chữ. Đã bấm "Bỏ qua" hôm nay thì đã return từ đầu
      // file (skipKey), nên tới đây là còn phép hiện quảng cáo.
      if (typeof promo.imageUrl !== "string" || promo.imageUrl.trim().length === 0) return;

      bindPromo(promo);
      // Hiện thẳng overlay giữa màn hình khi vào trang — không cần nút "Ưu đãi"
      // nổi để bấm mở. Người dùng có thể đóng qua nút X (data-entry-promo-close).
      show();
    })
    .catch(() => {
      // Không chặn giao diện chính nếu tải quảng cáo thất bại.
    });
})();
