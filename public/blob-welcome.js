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
    // Chỉ chạy khi server đã đặt cờ (cookie aff_welcome đã tiêu thụ → có phần tử
    // này). Cookie chỉ set một lần mỗi lần đăng nhập và bị xoá ngay ở render
    // /app đầu tiên, nên tự động "một lần/đăng nhập", tải lại không lặp — không
    // cần chặn thêm bằng sessionStorage (sẽ cản đăng nhập lại trong cùng phiên).
    var trigger = document.querySelector("[data-camio-welcome]");
    if (!trigger || !window.BlobMascot) return;

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

    mascot.setGaze(-8, -2);

    var removed = false;
    function remove() {
      if (removed) return;
      removed = true;
      if (host.parentNode) host.parentNode.removeChild(host);
    }

    var canAnimate = typeof host.animate === "function";

    // Đi TỪ mép phải VÀO giữa. Dùng Web Animations API thay cho CSS transition
    // vì dự án có rule @media(reduced-motion){*{transition-duration:.001ms}}
    // sẽ ép mọi transition về 0 (máy tắt hiệu ứng sẽ thấy nhảy cứng một chỗ).
    // element.animate KHÔNG bị rule đó tắt nên chuyển động luôn chạy.
    if (canAnimate) {
      host.animate(
        [
          { left: "128%", opacity: 0 },
          { left: "50%", opacity: 1 }
        ],
        { duration: 1500, easing: "cubic-bezier(.22,.7,.2,1)", fill: "forwards" }
      );
    } else {
      host.classList.add("is-in");
    }

    // Tới nơi thì vẫy tay (đổi biểu cảm) cho sinh động.
    var t1 = window.setTimeout(function () {
      mascot.setMood("vuive");
      mascot.setGaze(6, 0);
    }, 1700);

    var leaving = false;
    function leave() {
      if (leaving) return;
      leaving = true;
      window.clearTimeout(t1);
      if (canAnimate) {
        var out = host.animate(
          [
            { left: "50%", opacity: 1 },
            { left: "128%", opacity: 0 }
          ],
          { duration: 900, easing: "ease-in", fill: "forwards" }
        );
        out.onfinish = remove;
        window.setTimeout(remove, 1100); // phòng khi onfinish không bắn
      } else {
        host.classList.remove("is-in");
        host.classList.add("is-out");
        window.setTimeout(remove, 900);
      }
    }

    // Giữ ~3.6s rồi tự trượt ra; bấm vào đóng sớm.
    window.setTimeout(leave, 4200);
    host.addEventListener("click", leave);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
