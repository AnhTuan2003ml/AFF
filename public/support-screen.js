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

  // Bàn phím mobile che overlay position:fixed (100vh): trình duyệt cuộn cả
  // overlay lên để lộ ô nhập → mất header + tin nhắn. Ghim overlay đúng vùng
  // NHÌN THẤY (trên bàn phím) bằng VisualViewport. (Đặt style qua CSSOM được
  // phép dù CSP chặn thuộc tính style=).
  function fitViewport() {
    if (!current || !vv) return;
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
  // visualViewport 'resize'/'scroll' theo SÁT bàn phím trượt → mượt, không giật.
  if (vv) {
    vv.addEventListener("resize", fitViewport);
    vv.addEventListener("scroll", fitViewport);
  }
  window.addEventListener("orientationchange", function () {
    setTimeout(fitViewport, 300);
  });
  // iOS đôi khi KHÔNG bắn 'resize' khi bàn phím đóng → overlay kẹt ngắn. Fit lại
  // ĐÚNG MỘT LẦN sau khi bàn phím đã đóng hẳn (không hammer để khỏi giật).
  document.addEventListener("focusout", function () {
    if (current) setTimeout(fitViewport, 350);
  });

  function open(name) {
    var s = screens[name];
    if (!s) return;
    current = name;
    s.hidden = false;
    void s.offsetWidth; // reflow để chạy hiệu ứng
    s.classList.add("is-open");
    document.body.classList.add("support-screen-open");
    fitViewport();
    setTimeout(fitViewport, 300);

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
