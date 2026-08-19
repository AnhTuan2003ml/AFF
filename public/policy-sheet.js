/*
 * Bottom sheet đọc chính sách cho trang đăng nhập / đăng ký: click link có
 * [data-policy-sheet] thì bảng KÉO TỪ CHÂN LÊN, nạp nội dung Điều khoản / Quyền
 * riêng tư / Chính sách người dùng ngay tại chỗ. Dùng Web Animations API để
 * trượt (không bị rule reduced-motion ép transition về 0). Không JS thì link
 * vẫn mở trang đầy đủ.
 */
(function () {
  "use strict";
  var scrim = document.querySelector("[data-policy-sheet-scrim]");
  if (!scrim) return;
  var sheet = scrim.querySelector(".policy-sheet");
  var titleEl = scrim.querySelector("[data-policy-sheet-title]");
  var bodyEl = scrim.querySelector("[data-policy-sheet-body]");
  var cache = {};
  var lastFocused = null;

  function load(url) {
    if (!url) return;
    if (cache[url]) { bodyEl.innerHTML = cache[url]; bodyEl.scrollTop = 0; return; }
    bodyEl.innerHTML = '<p class="policy-sheet-state">Đang tải nội dung…</p>';
    fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var el = doc.querySelector(".legal-page, article.legal-page, .user-policy, article");
        var content = el ? el.innerHTML : doc.body.innerHTML;
        cache[url] = content;
        bodyEl.innerHTML = content;
        bodyEl.scrollTop = 0;
      })
      .catch(function () {
        bodyEl.innerHTML = '<p class="policy-sheet-state">Chưa tải được nội dung. ' +
          '<a href="' + url + '" target="_blank" rel="noopener">Mở trang đầy đủ</a>.</p>';
      });
  }

  function open(url, title) {
    lastFocused = document.activeElement;
    titleEl.textContent = title || "Chính sách";
    scrim.hidden = false;
    scrim.removeAttribute("inert");
    document.body.classList.add("no-scroll");
    load(url);
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: "forwards" });
    if (sheet.animate) {
      sheet.animate(
        [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        { duration: 440, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
      );
    }
    var c = scrim.querySelector("[data-policy-sheet-close]");
    if (c) c.focus();
  }

  function close() {
    function done() {
      scrim.hidden = true;
      scrim.setAttribute("inert", "");
      document.body.classList.remove("no-scroll");
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    }
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
    if (sheet.animate) {
      var a = sheet.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }],
        { duration: 320, easing: "ease-in", fill: "forwards" }
      );
      a.onfinish = done;
      window.setTimeout(done, 380);
    } else { done(); }
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    var trigger = event.target.closest("[data-policy-sheet]");
    if (trigger) {
      event.preventDefault();
      open(trigger.getAttribute("data-policy-url"), trigger.getAttribute("data-policy-title"));
      return;
    }
    if (event.target.closest("[data-policy-sheet-close]")) { event.preventDefault(); close(); return; }
    if (event.target === scrim) close();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !scrim.hidden) close();
  });
})();
