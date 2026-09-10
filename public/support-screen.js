/* Trang Hỗ trợ: 3 lựa chọn (Camio / CSKH / Form) mở TOÀN MÀN HÌNH; đóng (‹) về
   lại màn chọn. Quản lý hiển thị overlay [data-support-screen] + khoá cuộn nền. */
(function () {
  "use strict";
  var landing = document.querySelector("[data-support-landing]");
  if (!landing) return;

  var screens = {};
  Array.prototype.forEach.call(
    document.querySelectorAll("[data-support-screen]"),
    function (s) { screens[s.getAttribute("data-support-screen")] = s; }
  );
  var current = null;

  function open(name) {
    var s = screens[name];
    if (!s) return;
    current = name;
    s.hidden = false;
    void s.offsetWidth; // reflow để chạy hiệu ứng
    s.classList.add("is-open");
    document.body.classList.add("support-screen-open");

    // Mở CSKH → bỏ chấm đỏ "có phản hồi mới" trên thẻ chọn.
    if (name === "cskh") {
      var openBtn = document.querySelector("[data-open-screen='cskh']");
      var dot = openBtn && openBtn.querySelector(".support-reply-dot");
      if (dot) dot.remove();
    }

    var thread = s.querySelector("[data-support-thread], [data-camio-thread]");
    if (thread) thread.scrollTop = thread.scrollHeight;
    var input = s.querySelector("textarea");
    if (input) { try { input.focus({ preventScroll: true }); } catch (e) {} }

    document.dispatchEvent(new CustomEvent("support-chat:open"));
  }

  function close() {
    current = null;
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.remove("is-open");
      screens[k].hidden = true;
    });
    document.body.classList.remove("support-screen-open");
    document.dispatchEvent(new CustomEvent("support-chat:close"));
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("[data-open-screen]"),
    function (btn) {
      btn.addEventListener("click", function () {
        open(btn.getAttribute("data-open-screen"));
      });
    }
  );
  Array.prototype.forEach.call(
    document.querySelectorAll("[data-close-screen]"),
    function (btn) {
      btn.addEventListener("click", function (e) { e.preventDefault(); close(); });
    }
  );
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && current) close();
  });

  // Cho nút bấm khác (vd thông báo) mở thẳng một màn: dispatch support-screen:open.
  document.addEventListener("support-screen:open", function (e) {
    if (e.detail && e.detail.name) open(e.detail.name);
  });
})();
