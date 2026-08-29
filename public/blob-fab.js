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

  // FAB CHỈ là icon Hỗ trợ: bấm/chạm → điều hướng thẳng /app/support. KHÔNG
  // popup chào. Linh vật nhắc nhở xuất hiện theo thao tác ở nơi khác (toast/
  // modal Camio), không gắn với nút này.
  if (fab) fab.classList.add("camio-enter"); // bay nhẹ lên khi vào trang

  // Nhún nhẹ MỘT lần mỗi 10 giây cho icon "sống" (không phải nhảy vô hạn).
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

  // Linh vật NHẮC dán link ngay tại ô nhập (chỉ ở trang có ô). Tự đung đưa và
  // định kỳ chỉ xuống ô để thu hút chú ý — KHÔNG popup, không chắn thao tác.
  var pasteHost = document.querySelector("[data-paste-mascot]");
  if (pasteHost && !pasteHost.getAttribute("data-blobbed")) {
    pasteHost.setAttribute("data-blobbed", "1");
    var pm = window.BlobMascot.create({ mood: "happy", label: "Camio nhắc dán link" });
    pasteHost.appendChild(pm.el);
    pm.setGaze(-4, 12); // nhìn xuống ô nhập
    var pointing = function () {
      if (document.hidden || !pm.el.animate) return;
      pm.el.animate(
        [
          { transform: "translateY(0) rotate(0)" },
          { transform: "translateY(20%) rotate(5deg)", offset: 0.4 },
          { transform: "translateY(0) rotate(0)" }
        ],
        { duration: 720, easing: "ease-in-out" }
      );
      pm.setGaze(-3, 13);
    };
    window.setInterval(pointing, 4500);
  }
})();
