/* Nhắc chọn giới tính (user đăng ký Google / tài khoản cũ chưa có). Hiện MỘT
   LẦN mỗi phiên: bấm "Để sau" thì ẩn tới khi mở lại trình duyệt. Chọn Nam/Nữ là
   form POST /app/settings/gender lưu ngay. */
(function () {
  "use strict";
  var el = document.querySelector("[data-gender-prompt]");
  if (!el) return;
  var SKIP = "shoptik-gender-prompt-skipped";
  var skipped = false;
  try { skipped = sessionStorage.getItem(SKIP) === "1"; } catch (e) {}
  if (skipped) return;
  el.hidden = false;

  var later = el.querySelector("[data-gender-later]");
  if (later) {
    later.addEventListener("click", function () {
      try { sessionStorage.setItem(SKIP, "1"); } catch (e) {}
      el.hidden = true;
    });
  }
  // Bấm ra nền mờ = để sau.
  el.addEventListener("click", function (e) {
    if (e.target === el) {
      try { sessionStorage.setItem(SKIP, "1"); } catch (e2) {}
      el.hidden = true;
    }
  });
})();
