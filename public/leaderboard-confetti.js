/*
 * Hiệu ứng "rơi hoa" (confetti nhẹ) cho Bảng xếp hạng — ĐỒNG BỘ với app
 * (mobile/src/components/Confetti.tsx): các mảnh giấy pastel nhỏ rơi chậm,
 * xoay tròn, mờ dần khi vào/ra khung. Không rực rỡ pháo hoa nữa để web và app
 * nhìn giống nhau. Vẽ bằng Canvas 2D, tương thích CSP; tôn trọng reduced-motion.
 */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-lb2-confetti]");
  if (!canvas) return;
  var card = canvas.parentElement;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Cùng bảng màu pastel với app: trắng, vàng nhạt, hồng đào, xanh mint, cam nhạt, xanh trời.
  var PALETTE = ["#ffffff", "#ffe08a", "#ffd0c0", "#c8f7d4", "#ffb38a", "#bcdcff"];

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var W = 0,
    H = 0,
    dpr = Math.min(window.devicePixelRatio || 1, 2);

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function resize() {
    var r = card.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var particles = [];

  function spawn(initial) {
    var size = rand(6, 15);
    return {
      x: rand(0, W),
      // Khi khởi tạo rải đều theo chiều cao để không bị "đợt" trống;
      // khi tái sinh thì bắt đầu từ phía trên khung.
      y: initial ? rand(-H * 0.2, H) : rand(-40, -8),
      w: size,
      h: size * 0.62,
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      vy: rand(28, 60), // px/giây — rơi chậm, nhẹ nhàng
      rot: rand(0, Math.PI * 2),
      vr: rand(-2.4, 2.4), // rad/giây
    };
  }

  function build() {
    // Mật độ theo bề rộng khung để thưa/đều ở mọi kích thước (khoảng 1 hạt/26px).
    var count = Math.max(10, Math.min(48, Math.round(W / 26)));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(spawn(true));
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y - p.h > H) {
        particles[i] = spawn(false);
        continue;
      }
      // Mờ dần: hiện ra ở mép trên, tan đi ở mép dưới (giống app).
      var prog = p.y / H;
      var opacity =
        prog < 0.12
          ? Math.max(0, prog / 0.12)
          : prog > 0.82
            ? Math.max(0, (1 - prog) / 0.18)
            : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      var rx = -p.w / 2,
        ry = -p.h / 2,
        rad = 2;
      // Chữ nhật bo góc nhẹ (radius 2) — khớp borderRadius của app.
      ctx.beginPath();
      ctx.moveTo(rx + rad, ry);
      ctx.arcTo(rx + p.w, ry, rx + p.w, ry + p.h, rad);
      ctx.arcTo(rx + p.w, ry + p.h, rx, ry + p.h, rad);
      ctx.arcTo(rx, ry + p.h, rx, ry, rad);
      ctx.arcTo(rx, ry, rx + p.w, ry, rad);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  var last = 0,
    raf = 0;
  function frame(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    build();
    if (reduce) {
      // Giảm chuyển động: vẽ một khung tĩnh, không lặp.
      draw(0);
      return;
    }
    last = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(start, 150);
  });
  // Ngừng vẽ khi tab ẩn để tiết kiệm pin; chạy lại khi quay lại.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") cancelAnimationFrame(raf);
    else if (!reduce) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });

  start();
})();
