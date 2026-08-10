/**
 * Hyperlink "Chính sách người dùng" ở chân trang: click thì hiển thị nội dung
 * chính sách ngay tại chỗ thay vì rời trang. Nội dung nạp một lần rồi giữ lại.
 * Không có JS thì thẻ <a> vẫn mở /chinh-sach-nguoi-dung như bình thường.
 */
(function () {
  "use strict";

  var CONTENT_URL = "/chinh-sach-nguoi-dung/noi-dung";
  var scrim = document.querySelector("[data-policy-modal]");
  if (!scrim) return;

  var body = scrim.querySelector("[data-policy-modal-body]");
  var loaded = false;
  var loading = false;
  var lastFocused = null;

  function loadContent() {
    if (loaded || loading || !body) return;
    loading = true;
    fetch(CONTENT_URL, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .then(function (html) {
        body.innerHTML = html;
        loaded = true;
      })
      .catch(function () {
        body.innerHTML =
          '<p class="policy-modal-state">Chưa tải được nội dung. ' +
          '<a href="/chinh-sach-nguoi-dung">Mở trang chính sách</a>.</p>';
      })
      .finally(function () {
        loading = false;
      });
  }

  function open() {
    lastFocused = document.activeElement;
    scrim.hidden = false;
    scrim.removeAttribute("inert");
    document.body.classList.add("no-scroll");
    loadContent();
    var closeButton = scrim.querySelector("[data-policy-modal-close]");
    if (closeButton) closeButton.focus();
  }

  function close() {
    scrim.hidden = true;
    scrim.setAttribute("inert", "");
    document.body.classList.remove("no-scroll");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    var trigger = event.target.closest("[data-user-policy-link]");
    if (trigger) {
      event.preventDefault();
      open();
      return;
    }
    if (event.target.closest("[data-policy-modal-close]")) {
      event.preventDefault();
      close();
      return;
    }
    if (event.target === scrim) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !scrim.hidden) close();
  });
})();
