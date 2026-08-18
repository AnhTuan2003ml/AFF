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

  var mascot = window.BlobMascot.create({ mood: "happy", label: "Trợ lý ShopTik" });
  host.appendChild(mascot.el);

  // Vòng biểu cảm dễ thương cho một trợ lý CSKH.
  var CYCLE = [
    { mood: "happy", gaze: { x: 0, y: 0 } },
    { mood: "neutral", gaze: { x: 14, y: -4 } },
    { mood: "hmm", gaze: { x: -12, y: 2 } },
    { mood: "sideEye", gaze: { x: 16, y: 4 } },
    { mood: "happy", gaze: { x: -8, y: -6 } },
    { mood: "neutral", gaze: { x: 0, y: 6 } }
  ];
  var i = 0;
  function tick() {
    if (document.hidden) return;
    i = (i + 1) % CYCLE.length;
    mascot.setMood(CYCLE[i].mood);
    mascot.setGaze(CYCLE[i].gaze.x, CYCLE[i].gaze.y);
  }
  window.setInterval(tick, 2600);

  var fab = host.closest(".st-support-fab");
  if (fab) {
    // Rê chuột vào nút → linh vật cười và chào.
    fab.addEventListener("mouseenter", function () {
      mascot.setMood("happy");
      mascot.setGaze(0, -4);
      mascot.say("Cần giúp gì không?", 1800);
    });
    fab.addEventListener("mouseleave", function () {
      mascot.setMood(CYCLE[i].mood);
    });
  }
})();
