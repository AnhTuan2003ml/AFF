/*
 * Chào mừng khi vừa đăng nhập: linh vật CamiO đi TỪ TỪ từ mép phải màn hình ra
 * GIỮA màn hình kèm bong bóng "Chào mừng bạn quay lại!", giữ vài giây rồi trượt
 * ra. Chỉ chạy khi có [data-camio-welcome] (server đặt qua cookie một lần
 * aff_welcome) và mỗi phiên trình duyệt tối đa một lần.
 *
 * Chuyển động dùng CSS transition (không phải @keyframes) nên KHÔNG bị
 * prefers-reduced-motion tắt — đây là hiệu ứng người dùng chủ động yêu cầu.
 */
(function () {
  "use strict";

  function start() {
    var trigger = document.querySelector("[data-camio-welcome]");
    if (!trigger || !window.BlobMascot) return;
    try {
      if (window.sessionStorage.getItem("camio-welcomed") === "1") return;
      window.sessionStorage.setItem("camio-welcomed", "1");
    } catch (e) { /* sessionStorage bị chặn: vẫn chạy bình thường */ }

    var name = (trigger.getAttribute("data-welcome-name") || "").trim();

    var host = document.createElement("div");
    host.className = "camio-welcome";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");

    var bubble = document.createElement("div");
    bubble.className = "camio-welcome-bubble";
    var b = document.createElement("b");
    b.textContent = "Chào mừng bạn quay lại!";
    bubble.appendChild(b);
    if (name) {
      var s = document.createElement("span");
      s.textContent = name;
      bubble.appendChild(s);
    }

    var mascotBox = document.createElement("div");
    mascotBox.className = "camio-welcome-mascot";
    var mascot = window.BlobMascot.create({ mood: "happy", label: "CamiO" });
    mascotBox.appendChild(mascot.el);

    host.appendChild(bubble);
    host.appendChild(mascotBox);
    document.body.appendChild(host);

    // Bắt đầu ở ngoài mép phải, rồi trượt vào giữa (đợi 2 frame để transition chạy).
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        host.classList.add("is-in");
        mascot.setGaze(-8, -2);
      });
    });

    // Tới nơi thì vẫy tay (đổi biểu cảm) cho sinh động.
    var t1 = window.setTimeout(function () {
      mascot.setMood("vuive");
      mascot.setGaze(6, 0);
    }, 1600);

    // Giữ ~3.6s rồi trượt ra phải và gỡ khỏi DOM.
    var t2 = window.setTimeout(function () {
      host.classList.remove("is-in");
      host.classList.add("is-out");
    }, 4200);
    var t3 = window.setTimeout(function () {
      if (host.parentNode) host.parentNode.removeChild(host);
    }, 5300);

    // Bấm vào để đóng sớm.
    host.addEventListener("click", function () {
      window.clearTimeout(t1); window.clearTimeout(t2);
      host.classList.remove("is-in");
      host.classList.add("is-out");
      window.clearTimeout(t3);
      window.setTimeout(function () {
        if (host.parentNode) host.parentNode.removeChild(host);
      }, 900);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
