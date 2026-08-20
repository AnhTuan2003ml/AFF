/*
 * Hiệu ứng "bắn hoa" cho bảng xếp hạng: từng ĐỢT pháo hoa / confetti nổ ra rồi
 * rơi và tắt dần, cách quãng vài giây — KHÔNG mưa giấy liên tục (đỡ nhiễu mắt).
 * Vẽ bằng <canvas>, tự chứa (không thư viện ngoài — hợp CSP). Dừng khi tab ẩn.
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

  // Một đợt "bắn hoa": chùm hạt toả tròn (hơi hướng lên) gồm confetti giấy xoay
  // và đốm pháo hoa, bay ra rồi chịu trọng lực, rơi và mờ dần.
  var parts = [];
  function burst(x, y) {
    var n = (rand(30, 46)) | 0;
    var base = pick();
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + rand(-0.12, 0.12);
      var sp = rand(2.2, 6.2);
      var paper = Math.random() < 0.6;
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(0.5, 2), // hơi hướng lên cho cảm giác bắn
        life: 1,
        decay: rand(0.008, 0.016),
        color: Math.random() < 0.25 ? "#ffffff" : (Math.random() < 0.5 ? base : pick()),
        paper: paper,
        w: rand(5, 9), h: rand(6, 12),
        r: rand(1.8, 2.8),
        rot: rand(0, Math.PI * 2), vrot: rand(-0.25, 0.25),
      });
    }
  }

  var nextBurst = 12; // đợt đầu bắn sớm
  var running = true;
  var started = false;

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);

    // hẹn đợt bắn kế tiếp — cách quãng để không nhiễu; thi thoảng bắn đôi
    if (--nextBurst <= 0) {
      nextBurst = rand(90, 190);
      burst(rand(W * 0.2, W * 0.8), rand(H * 0.18, H * 0.5));
      if (Math.random() < 0.4) burst(rand(W * 0.2, W * 0.8), rand(H * 0.18, H * 0.5));
    }

    for (var j = parts.length - 1; j >= 0; j--) {
      var p = parts[j];
      p.vy += 0.06; // trọng lực
      p.vx *= 0.985;
      p.vy *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > H + 24) { parts.splice(j, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
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
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Không còn hạt và chưa tới đợt kế → vẫn chạy vòng lặp nhẹ để canvas trống.
    requestAnimationFrame(frame);
  }

  function start() {
    if (started) return;
    started = true;
    resize();
    parts = [];
    // vài đợt chào mừng khi mở
    burst(W * 0.32, H * 0.3);
    burst(W * 0.68, H * 0.34);
    frame();
  }

  window.addEventListener("resize", function () { if (started) resize(); });
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running && started) requestAnimationFrame(frame);
  });

  start();
})();
