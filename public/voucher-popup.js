/**
 * Popup voucher nổi bật khi vào /app — độc lập, không đi qua cơ chế
 * data-panel-toggle dùng chung, để không phụ thuộc/xung đột với modal khác.
 * (Trước đây thử đặt <script> inline trực tiếp trong template nhưng bị CSP
 * script-src 'self' chặn hoàn toàn — không hề chạy — nên nút đóng vô tác
 * dụng. Phải là file ngoài .js như thế này mới được phép chạy.)
 */
(() => {
  "use strict";

  const scrim = document.querySelector("[data-voucher-popup]");
  if (!(scrim instanceof HTMLElement)) return;

  const seenKey = `shoptik-voucher-seen:${scrim.getAttribute("data-voucher-id") ?? ""}`;

  const close = () => {
    scrim.hidden = true;
  };

  scrim.querySelectorAll("[data-voucher-close]").forEach((el) => {
    el.addEventListener("click", close);
  });
  scrim.addEventListener("click", (event) => {
    if (event.target === scrim) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !scrim.hidden) close();
  });

  let alreadySeen = false;
  try {
    alreadySeen = sessionStorage.getItem(seenKey) === "1";
  } catch (e) {}
  if (!alreadySeen) {
    window.setTimeout(() => {
      scrim.hidden = false;
      try {
        sessionStorage.setItem(seenKey, "1");
      } catch (e) {}
    }, 500);
  }
})();
