/* Trang Hỗ trợ: 3 lựa chọn (Camio / CSKH / Form) mở TOÀN MÀN HÌNH; đóng (‹) về
   lại màn chọn. Quản lý hiển thị overlay [data-support-screen] + khoá cuộn nền. */
(function () {
  "use strict";
  var landing = document.querySelector("[data-support-landing]");
  if (!landing) return;

  // iOS Safari khôi phục vị trí cuộn khi reload → trang Hỗ trợ hay bị nhảy về
  // CHÂN trang. Trang này luôn nên bắt đầu từ đầu: tắt khôi phục cuộn (chỉ cho
  // trang này, trả lại 'auto' khi rời đi) và ép về đầu trang.
  try {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
      window.addEventListener("pagehide", function () {
        try { history.scrollRestoration = "auto"; } catch (e) {}
      });
    }
  } catch (e) {}
  function toTop() { window.scrollTo(0, 0); }
  toTop();
  window.addEventListener("pageshow", function () {
    toTop();
    requestAnimationFrame(toTop);
    setTimeout(toTop, 80);
  });

  var screens = {};
  Array.prototype.forEach.call(
    document.querySelectorAll("[data-support-screen]"),
    function (s) { screens[s.getAttribute("data-support-screen")] = s; }
  );
  var current = null;
  var vv = window.visualViewport || null;

  // Bàn phím mobile che overlay position:fixed: khi MỞ, ghim overlay đúng vùng
  // nhìn thấy (trên bàn phím) bằng VisualViewport để header + ô nhập không bị
  // đẩy đi. Khi bàn phím ĐÓNG, BỎ ghim để overlay về full màn hình qua CSS
  // (inset:0) — KHÔNG tự tính lại vv.height lúc đóng vì iOS trả sai/không cập
  // nhật → gây kẹt ngắn + khựng. (Đặt style qua CSSOM được phép dù CSP chặn
  // thuộc tính style=.)
  var kbOpen = false;
  function fitViewport() {
    if (!current || !vv || !kbOpen) return; // chỉ ghim khi bàn phím đang mở
    var s = screens[current];
    if (!s) return;
    s.style.height = vv.height + "px";
    s.style.top = vv.offsetTop + "px";
    s.style.bottom = "auto";
  }
  function clearViewport(s) {
    s.style.height = "";
    s.style.top = "";
    s.style.bottom = "";
  }
  function unfit() {
    if (!current) return;
    var s = screens[current];
    if (s) clearViewport(s); // về full màn hình qua CSS inset:0
  }
  // visualViewport 'resize'/'scroll' theo SÁT bàn phím lúc MỞ → mượt.
  if (vv) {
    vv.addEventListener("resize", fitViewport);
    vv.addEventListener("scroll", fitViewport);
  }
  // Vào ô nhập = bàn phím sắp mở → bật ghim. Rời ô = bàn phím đóng → bỏ ghim.
  document.addEventListener("focusin", function () {
    if (!current) return;
    kbOpen = true;
    fitViewport();
  });
  document.addEventListener("focusout", function () {
    if (!current) return;
    kbOpen = false;
    // Bỏ ghim vài lần trong lúc bàn phím trượt xuống để chắc chắn về full.
    setTimeout(unfit, 30);
    setTimeout(unfit, 300);
  });
  window.addEventListener("orientationchange", function () {
    setTimeout(unfit, 250);
  });

  function open(name) {
    var s = screens[name];
    if (!s) return;
    current = name;
    s.hidden = false;
    void s.offsetWidth; // reflow để chạy hiệu ứng
    s.classList.add("is-open");
    document.body.classList.add("support-screen-open");
    kbOpen = false;
    unfit(); // mở ra = full màn hình (CSS inset:0); chỉ ghim khi bàn phím mở

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
      clearViewport(screens[k]);
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
