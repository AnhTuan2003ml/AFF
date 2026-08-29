/* Nút hỗ trợ nổi: thay icon tĩnh bằng LINH VẬT tự đổi biểu cảm liên tục.
   Đổi mood + hướng nhìn theo chu kỳ (không phụ thuộc prefers-reduced-motion,
   nên vẫn "sống động" kể cả khi máy tắt hiệu ứng chuyển động). */
(function () {
  "use strict";
  if (!window.BlobMascot) return;

  // Avatar phía CSKH trong bảng trao đổi = linh vật (icon động).
  Array.prototype.forEach.call(
    document.querySelectorAll("[data-agent-mascot]"),
    function (h) {
      if (h.getAttribute("data-blobbed")) return;
      h.setAttribute("data-blobbed", "1");
      var m = window.BlobMascot.create({ mood: "happy", label: "Đội CSKH" });
      m.setGaze(-6, -4);
      h.appendChild(m.el);
    }
  );

  var host = document.querySelector("[data-fab-mascot]");
  if (!host) return;
  var fab = host.closest(".st-support-fab");

  var mascot = window.BlobMascot.create({ mood: "happy", label: "Camio – trợ lý hoàn tiền" });
  host.appendChild(mascot.el);
  var bubbleEl = mascot.el.querySelector(".blob-bubble");

  // Bay nhẹ từ dưới lên khi vào trang (0,5s).
  if (fab) fab.classList.add("camio-enter");

  // Nhún nhẹ MỘT lần mỗi 10 giây (thay cho nhảy vô hạn 2,8s).
  function nudge() {
    if (document.hidden || !mascot.el.animate) return;
    mascot.el.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-16%)", offset: 0.4 },
        { transform: "translateY(0)" }
      ],
      { duration: 620, easing: "ease-in-out" }
    );
  }
  window.setInterval(nudge, 10000);

  var GREETING =
    "Chào bạn 👋 Camio đây! Có link sản phẩm thì đưa mình kiểm tra tiền hoàn nhé.";
  var PROMPTS = [
    "Có link sản phẩm? Đưa Camio kiểm tra nhé!",
    "Đừng mua vội, kiểm tra tiền hoàn trước nha 🧡",
    "Camio có thể giúp bạn xem trước tiền hoàn.",
    "Dán link vào đây, còn lại để Camio lo!"
  ];
  function randomPrompt() {
    return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  }
  function ctaHtml(text) {
    return (
      "<span>" + text + "</span>" +
      '<button type="button" class="camio-paste-cta">Dán link ngay</button>'
    );
  }

  var hideTimer = null;
  var bubbleOpen = false;
  function showBubble(html, ms) {
    if (!bubbleEl) return;
    bubbleEl.innerHTML = html;
    bubbleEl.hidden = false;
    bubbleOpen = true;
    mascot.el.classList.add("has-bubble");
    mascot.setMood("happy");
    mascot.setGaze(0, -4);
    if (hideTimer) window.clearTimeout(hideTimer);
    // Giữ tối thiểu 4–5 giây (trước đây 1,5s quá nhanh).
    if (ms) hideTimer = window.setTimeout(hideBubble, ms);
  }
  function hideBubble() {
    if (!bubbleEl) return;
    bubbleEl.hidden = true;
    bubbleOpen = false;
    mascot.el.classList.remove("has-bubble");
  }

  // Chào chủ động MỘT LẦN mỗi phiên: chờ 0,8s rồi hiện bong bóng 5s.
  var greeted = false;
  try {
    greeted = sessionStorage.getItem("camio_greeted") === "1";
  } catch (e) {}
  if (!greeted) {
    window.setTimeout(function () {
      showBubble(ctaHtml(GREETING), 5000);
      try {
        sessionStorage.setItem("camio_greeted", "1");
      } catch (e) {}
    }, 900);
  }

  if (fab) {
    // Rê chuột (desktop) → gợi ý ngắn kèm nút dán link.
    fab.addEventListener("mouseenter", function () {
      if (!bubbleOpen) showBubble(ctaHtml(randomPrompt()), 4500);
    });

    // Bấm FAB: chạm CAMIO mở lời thoại; đang mở rồi (hoặc bấm nhãn "Hỏi Camio")
    // mới vào trang hỗ trợ.
    fab.addEventListener("click", function (e) {
      if (e.target.closest(".camio-paste-cta")) return; // CTA xử lý riêng
      if (e.target.closest(".st-fab-label")) return; // nhãn → điều hướng /app/support
      if (bubbleOpen) return; // lần chạm thứ hai → để <a> điều hướng
      e.preventDefault();
      showBubble(ctaHtml(randomPrompt()), 5000);
    });
  }

  // Nút "Dán link ngay": cuộn tới ô dán link + tự focus; trang khác thì về /app.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".camio-paste-cta");
    if (!btn) return;
    e.preventDefault();
    hideBubble();
    var input = document.querySelector('input[name="productUrl"]');
    if (input) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(function () {
        try {
          input.focus();
        } catch (err) {}
      }, 450);
    } else {
      window.location.href = "/app";
    }
  });
})();
