/* "Ghi nhớ đăng nhập": nhớ EMAIL (điền sẵn lần sau) và tick lại checkbox.
   KHÔNG lưu mật khẩu ở đây — mật khẩu do trình duyệt tự nhớ (password manager)
   qua autocomplete, an toàn hơn nhiều so với lưu plaintext ở client. */
(function () {
  "use strict";
  var email = document.getElementById("login-email-input");
  var box = document.querySelector("[data-remember-checkbox]");
  var form = document.querySelector(".login-form");
  if (!email || !box) return;
  var KEY = "shoptik-remember-email";

  try {
    var saved = window.localStorage.getItem(KEY);
    if (saved) {
      if (!email.value) email.value = saved;
      box.checked = true;
      // Email đã có sẵn → đưa con trỏ sang ô mật khẩu cho tiện gõ / để trình
      // duyệt tự điền mật khẩu đã lưu.
      var pass = document.getElementById("login-password-input");
      if (pass && email.value) {
        window.setTimeout(function () { pass.focus(); }, 60);
      }
    }
  } catch (e) {}

  if (form) {
    form.addEventListener("submit", function () {
      try {
        if (box.checked && email.value) {
          window.localStorage.setItem(KEY, email.value.trim());
        } else {
          window.localStorage.removeItem(KEY);
        }
      } catch (e) {}
    });
  }
})();
