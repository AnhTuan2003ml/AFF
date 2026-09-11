/*
 * Hiệu ứng "rơi hoa" cho Bảng xếp hạng — cánh hoa (sakura) rơi lả tả, bay
 * nghiêng qua lại và xoay nhẹ, mờ dần khi vào/ra khung. ĐỒNG BỘ với app
 * (mobile/src/components/Confetti.tsx). Vẽ bằng Canvas 2D, tương thích CSP,
 * tôn trọng prefers-reduced-motion.
 */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-lb2-confetti]");
  if (!canvas) return;
  var card = canvas.parentElement;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Màu cánh hoa: hồng anh đào, hồng nhạt, trắng, đào, vàng phấn.
  var PALETTE = ["#ff9ec4", "#ffc2d8", "#ffffff", "#ffd3bf", "#ffe3a3"];

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

  var petals = [];

  function spawn(initial) {
    var s = rand(6, 12);
    return {
      x: rand(0, W),
      y: initial ? rand(-H * 0.2, H) : rand(-40, -10),
      s: s,
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      vy: rand(24, 52), // px/giây — rơi chậm
      rot: rand(0, Math.PI * 2),
      vr: rand(-1.6, 1.6), // xoay chậm
      swayAmp: rand(8, 22), // biên độ bay nghiêng
      swayFreq: rand(0.6, 1.4), // tần số đung đưa
      phase: rand(0, Math.PI * 2),
    };
  }

  function build() {
    // Mật độ theo bề rộng khung (~1 cánh/30px), thưa nhẹ cho thanh thoát.
    var count = Math.max(8, Math.min(40, Math.round(W / 30)));
    petals = [];
    for (var i = 0; i < count; i++) petals.push(spawn(true));
  }

  // Vẽ một cánh hoa hướng lên, kích thước s (gốc ở tâm).
  function petalPath(s) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.62, -s * 0.6, s * 0.5, s * 0.42, 0, s * 0.52);
    ctx.bezierCurveTo(-s * 0.5, s * 0.42, -s * 0.62, -s * 0.6, 0, -s);
    ctx.closePath();
  }

  var time = 0;
  function draw(dt) {
    time += dt;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y - p.s > H) {
        petals[i] = spawn(false);
        continue;
      }
      // Bay nghiêng qua lại theo thời gian + vị trí rơi.
      var sway = Math.sin(time * p.swayFreq + p.phase + p.y * 0.02) * p.swayAmp;
      var prog = p.y / H;
      var opacity =
        prog < 0.12
          ? Math.max(0, prog / 0.12)
          : prog > 0.82
            ? Math.max(0, (1 - prog) / 0.18)
            : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity)) * 0.95;
      ctx.translate(p.x + sway, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      petalPath(p.s);
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
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") cancelAnimationFrame(raf);
    else if (!reduce) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });

  start();
})();
