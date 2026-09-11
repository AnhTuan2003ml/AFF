// Nút con mắt: hiện/ẩn số tài khoản đầy đủ của chính chủ trên trang ngân hàng.
// CSP style-src 'self' → không dùng inline style; đổi hiển thị icon bằng
// thuộc tính [hidden], đổi nội dung số bằng textContent.
(function () {
  "use strict";

  function groupDigits(digits) {
    // Nhóm 4 chữ số cho dễ đọc: 1234 5678 90
    return String(digits).replace(/\s+/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  function bindToggle(btn) {
    var row = btn.closest(".bank-visual-number-row");
    if (!row) return;
    var numberEl = row.querySelector("[data-account-number]");
    if (!numberEl) return;
    var full = numberEl.getAttribute("data-full") || "";
    var mask = numberEl.getAttribute("data-mask") || numberEl.textContent;
    if (!full) return;

    var eyeOn = btn.querySelector(".bank-eye-on");
    var eyeOff = btn.querySelector(".bank-eye-off");
    var showLabel = btn.getAttribute("aria-label") || "Hiện số tài khoản";
    var hideLabel =
      document.documentElement.lang === "en"
        ? "Hide account number"
        : "Ẩn số tài khoản";

    btn.addEventListener("click", function () {
      var revealed = btn.getAttribute("aria-pressed") === "true";
      if (revealed) {
        numberEl.textContent = mask;
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", showLabel);
        btn.setAttribute("title", showLabel);
        if (eyeOn) eyeOn.hidden = false;
        if (eyeOff) eyeOff.hidden = true;
      } else {
        numberEl.textContent = groupDigits(full);
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-label", hideLabel);
        btn.setAttribute("title", hideLabel);
        if (eyeOn) eyeOn.hidden = true;
        if (eyeOff) eyeOff.hidden = false;
      }
    });
  }

  function init() {
    var toggles = document.querySelectorAll("[data-account-toggle]");
    for (var i = 0; i < toggles.length; i++) bindToggle(toggles[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
