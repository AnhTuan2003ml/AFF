// Bấm "Mã đối chiếu" để sao chép mã hệ thống (dùng đối chiếu với đơn Shopee).
(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    var button = target ? target.closest("[data-copy-ref]") : null;
    if (!button) return;
    var code = button.getAttribute("data-copy-ref") || "";
    if (!code) return;

    var done = function () {
      button.classList.add("is-copied");
      var badge = button.querySelector("span");
      var original = badge ? badge.textContent : "";
      if (badge) badge.textContent = "Đã sao chép";
      window.setTimeout(function () {
        button.classList.remove("is-copied");
        if (badge) badge.textContent = original;
      }, 1600);
    };

    var fallbackCopy = function () {
      var ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      if (ok) done();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      // Clipboard API lỗi (thiếu focus/quyền) → lùi về execCommand.
      navigator.clipboard.writeText(code).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
  });
})();
