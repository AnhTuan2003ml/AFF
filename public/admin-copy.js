// Nút copy dùng chung cho backoffice: bấm [data-copy-text] → chép vào clipboard.
// CSP-safe (file /assets), không inline. Dùng cho số tài khoản chuyển tiền thủ công.
(function () {
  "use strict";

  function flash(btn, ok) {
    var old = btn.getAttribute("data-label") || btn.textContent;
    if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", old);
    btn.textContent = ok ? "Đã chép" : "Lỗi";
    btn.classList.toggle("is-copied", ok);
    setTimeout(function () {
      btn.textContent = btn.getAttribute("data-label") || "Copy";
      btn.classList.remove("is-copied");
    }, 1400);
  }

  function copy(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          flash(btn, true);
        },
        function () {
          fallback(text, btn);
        },
      );
    } else {
      fallback(text, btn);
    }
  }

  function fallback(text, btn) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      flash(btn, ok);
    } catch (e) {
      flash(btn, false);
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy-text]");
    if (!btn) return;
    e.preventDefault();
    copy(btn.getAttribute("data-copy-text") || "", btn);
  });
})();
