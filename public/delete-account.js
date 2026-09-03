/* Popup xác nhận xóa tài khoản ở trang Thông tin cá nhân.
   Mở modal (khung .policy-modal), focus ô mật khẩu; đóng bằng nút ×, nút Hủy,
   bấm nền hoặc phím Esc. Form submit đi POST /app/settings/delete-account. */
(function () {
  "use strict";
  var scrim = document.querySelector("[data-delete-account-modal]");
  if (!scrim) return;
  // Ô xác nhận: mật khẩu (tài khoản thường) HOẶC email (tài khoản Google).
  var field = scrim.querySelector(".delete-account-form input:not([type=hidden])");
  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    scrim.hidden = false;
    scrim.removeAttribute("inert");
    document.body.classList.add("is-policy-open");
    if (field) {
      field.value = "";
      window.setTimeout(function () {
        field.focus();
      }, 40);
    }
  }
  function close() {
    scrim.hidden = true;
    scrim.setAttribute("inert", "");
    document.body.classList.remove("is-policy-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  var openers = document.querySelectorAll("[data-open-delete-account]");
  Array.prototype.forEach.call(openers, function (b) {
    b.addEventListener("click", open);
  });
  var closers = scrim.querySelectorAll("[data-delete-account-close]");
  Array.prototype.forEach.call(closers, function (b) {
    b.addEventListener("click", close);
  });
  scrim.addEventListener("click", function (e) {
    if (e.target === scrim) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !scrim.hidden) close();
  });
})();
