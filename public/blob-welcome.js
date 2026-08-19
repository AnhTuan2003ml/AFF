/*
 * Vừa đăng nhập: linh vật CamiO đi TỪ TỪ từ mép phải màn hình ra GIỮA kèm bong
 * bóng "Chào mừng bạn quay lại!", vẫy tay, giữ vài giây rồi trượt ra. Chỉ chạy
 * khi có [data-camio-welcome] (server đặt qua cookie một lần aff_welcome).
 *
 * Chuyển động dùng Web Animations API (element.animate) thay cho CSS transition
 * vì dự án có rule @media(reduced-motion){*{transition-duration:.001ms}} sẽ ép
 * transition về 0 — WAAPI không bị tắt nên linh vật luôn "đi ra chào".
 */
(function () {
  "use strict";

  function start() {
    var trigger = document.querySelector("[data-camio-welcome]");
    if (!trigger || !window.BlobMascot) return;

    var name = (trigger.getAttribute("data-welcome-name") || "").trim();

    var host = document.createElement("div");
    host.className = "camio-welcome";

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
    var mascot = window.BlobMascot.create({ mood: "happy", label: "CamiO", entrance: false });
    mascotBox.appendChild(mascot.el);

    host.appendChild(bubble);
    host.appendChild(mascotBox);
    document.body.appendChild(host);
    host.style.left = "50%";
    host.style.transform = "translate(-50%, -50%)";

    var canAnimate = typeof host.animate === "function";
    var removed = false;
    function remove() { if (!removed) { removed = true; if (host.parentNode) host.parentNode.removeChild(host); } }

    // Đi từ ngoài mép phải VÀO giữa, vọt hơi quá rồi lắng lại (điện ảnh hơn).
    if (canAnimate) {
      host.animate(
        [
          { left: "128%", opacity: 0 },
          { left: "45%", opacity: 1, offset: .8 },
          { left: "51%", opacity: 1, offset: .92 },
          { left: "50%", opacity: 1 }
        ],
        { duration: 1550, easing: "cubic-bezier(.2,.7,.25,1)", fill: "forwards" }
      );
    } else {
      host.style.opacity = "1";
    }

    // Tới nơi: bung lấp lánh + vẫy tay + nảy chào.
    var t1 = window.setTimeout(function () {
      mascot.setMood("vuive");
      mascot.setGaze(6, 0);
      if (mascot.sparkle) mascot.sparkle(9);
      if (mascotBox.animate) {
        mascotBox.animate(
          [
            { transform: "translateY(0) rotate(0)" },
            { transform: "translateY(-16px) rotate(-4deg)", offset: .4 },
            { transform: "translateY(0) rotate(3deg)", offset: .7 },
            { transform: "translateY(0) rotate(0)" }
          ],
          { duration: 700, easing: "cubic-bezier(.3,1.2,.5,1)" }
        );
      }
    }, 1600);

    var leaving = false;
    function leave() {
      if (leaving) return;
      leaving = true;
      window.clearTimeout(t1);
      if (canAnimate) {
        var out = host.animate(
          [{ left: "50%", opacity: 1 }, { left: "128%", opacity: 0 }],
          { duration: 900, easing: "ease-in", fill: "forwards" }
        );
        out.onfinish = remove;
        window.setTimeout(remove, 1100);
      } else { remove(); }
    }

    window.setTimeout(leave, 4400); // giữ ~3.7s sau khi tới nơi
    host.addEventListener("click", leave); // bấm để đóng sớm
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else { start(); }
})();
