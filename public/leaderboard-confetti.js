/*
 * Hiệu ứng lễ hội cho bảng xếp hạng: giấy rơi (confetti) liên tục + pháo hoa
 * (firework) nổ định kỳ + phun giấy quanh bục quán quân. Vẽ bằng <canvas>, tự
 * chứa (không thư viện ngoài — hợp CSP). Dừng khi tab ẩn để đỡ tốn pin.
 */
(function () {
  "use strict";
  var canvas = document.querySelector("[data-lb2-confetti]");
  if (!canvas) return;
  var card = canvas.parentElement;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var COLORS = ["#ff7a1a", "#ffc93c", "#ff4d4d", "#4d9bff", "#39d98a", "#ff5fa2", "#ffffff", "#b06bff"];
  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick() { return COLORS[(Math.random() * COLORS.length) | 0]; }

  function resize() {
    var r = card.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Giấy rơi.
  var flakes = [];
  function makeFlake(fromTop) {
    return {
      x: rand(0, W),
      y: fromTop ? rand(-H * 0.5, 0) : rand(-40, H),
      vx: rand(-0.4, 0.4),
      vy: rand(1, 2.6),
      w: rand(5, 10),
      h: rand(7, 14),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.15, 0.15),
      color: pick(),
      sway: rand(0, Math.PI * 2),
      swaySpeed: rand(0.02, 0.05),
    };
  }

  // Pháo hoa (hạt toả tròn rồi tắt dần) + phun giấy (mảnh giấy bắn lên).
  var sparks = [];
  function burst(x, y, paper) {
    var n = paper ? rand(18, 26) : rand(26, 44);
    var base = pick();
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + rand(-0.1, 0.1);
      var sp = rand(1.6, paper ? 3.4 : 4.4);
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (paper ? rand(1, 2) : 0),
        life: 1,
        decay: rand(0.012, 0.022),
        color: Math.random() < 0.28 ? "#ffffff" : base,
        paper: paper,
        w: rand(4, 8), h: rand(5, 10),
        rot: rand(0, Math.PI * 2), vrot: rand(-0.2, 0.2),
      });
    }
  }

  var fwTimer = 30;
  var paperTimer = 90;
  var running = true;
  var started = false;

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.sway += f.swaySpeed;
      f.x += f.vx + Math.sin(f.sway) * 0.6;
      f.y += f.vy;
      f.rot += f.vrot;
      if (f.y > H + 20) { flakes[i] = makeFlake(true); continue; }
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    }

    // pháo hoa nổ ngẫu nhiên phía trên
    if (--fwTimer <= 0) { fwTimer = rand(55, 120); burst(rand(W * 0.15, W * 0.85), rand(H * 0.12, H * 0.45), false); }
    // phun giấy từ đáy quanh bục quán quân (giữa)
    if (--paperTimer <= 0) { paperTimer = rand(80, 150); burst(rand(W * 0.4, W * 0.6), H * 0.62, true); }

    for (var j = sparks.length - 1; j >= 0; j--) {
      var p = sparks[j];
      p.vy += p.paper ? 0.09 : 0.05;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > H + 20) { sparks.splice(j, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.paper) {
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  function start() {
    if (started) return;
    started = true;
    resize();
    flakes = [];
    for (var i = 0; i < 90; i++) flakes.push(makeFlake(false));
    // vài loạt pháo hoa chào mừng ngay khi mở
    burst(W * 0.3, H * 0.28, false);
    burst(W * 0.7, H * 0.32, false);
    frame();
  }

  window.addEventListener("resize", function () { if (started) resize(); });
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running && started) requestAnimationFrame(frame);
  });

  start();
})();
