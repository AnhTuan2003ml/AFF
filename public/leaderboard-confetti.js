/*
 * Hiệu ứng pháo hoa tia lửa & kim tuyến vinh danh (Sparkler Fireworks & Confetti)
 * Dành cho Bảng xếp hạng: chậm rãi bồng bềnh, nhiều hạt lộng lẫy, có vệt tia lửa pháo hoa (sparkler trails).
 * Vẽ bằng Canvas 2D mượt mà 60fps, tương thích CSP.
 */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-lb2-confetti]");
  if (!canvas) return;
  var card = canvas.parentElement;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Bảng màu rực rỡ cao cấp: Vàng kim pháo hoa, Cam rực, Đỏ ruby, Xanh biển ngọc, Tím neon, Trắng sáng
  var PALETTES = [
    "#FFD700", "#FFC107", "#FFB300", "#FFF176", // Vàng kim & ánh sáng
    "#FF4D2D", "#FF6E40", "#FF3D00", "#FF1744", // Cam đỏ pháo hoa
    "#00E5FF", "#00B0FF", "#69F0AE",            // Xanh ngọc & Cyan
    "#E040FB", "#7C4DFF", "#FF4081",            // Tím & Hồng ánh kim
    "#FFFFFF", "#FFF9C4"                         // Trắng bạc & Ánh nến
  ];

  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickColor() {
    return PALETTES[(Math.random() * PALETTES.length) | 0];
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

  // Tạo một đợt pháo hoa / chùm tia lửa bung nở
  function createBurst(x, y, count, spreadMultiplier) {
    var total = count || (rand(48, 70) | 0);
    var baseColor = pickColor();
    var isSparklerBurst = Math.random() < 0.45; // 45% đợt bắn là chùm tia lửa pháo hoa vàng rực

    for (var i = 0; i < total; i++) {
      var angle = (Math.PI * 2 * i) / total + rand(-0.18, 0.18);
      var speed = rand(1.2, 3.8) * (spreadMultiplier || 1);
      var typeChoice = Math.random();

      var type = "paper";
      if (isSparklerBurst) {
        type = typeChoice < 0.65 ? "spark" : (typeChoice < 0.85 ? "star" : "paper");
      } else {
        if (typeChoice < 0.32) {
          type = "spark"; // Tia lửa vệt đuôi
        } else if (typeChoice < 0.55) {
          type = "star";  // Ngôi sao 4 cánh
        } else if (typeChoice < 0.72) {
          type = "glow";  // Bụi vàng lơ lửng
        }
      }

      var color;
      if (type === "spark") {
        var sparkColors = ["#FFF59D", "#FFD54F", "#FFB300", "#FF8A65", "#FFFFFF", "#FFE082"];
        color = sparkColors[(Math.random() * sparkColors.length) | 0];
      } else {
        color = Math.random() < 0.25 ? "#FFFFFF" : (Math.random() < 0.55 ? baseColor : pickColor());
      }

      particles.push({
        x: x,
        y: y,
        prevX: x,
        prevY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(0.3, 1.2), // Nhẹ nhàng hướng lên
        type: type,
        color: color,
        life: 1.0,
        decay: rand(0.0022, 0.0048), // Rơi chậm rãi, lưu lại 5-7 giây
        gravity: type === "spark" ? rand(0.018, 0.030) : rand(0.010, 0.020), // Rơi siêu êm
        drag: rand(0.976, 0.988),
        wobble: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.012, 0.028),
        wobbleRadius: rand(0.3, 0.9),
        tilt: rand(0, Math.PI * 2),
        tiltSpeed: rand(0.015, 0.040), // Lật 3D từ từ
        rot: rand(0, Math.PI * 2),
        rotSpeed: rand(-0.025, 0.025),
        w: rand(4.5, 7.5),
        h: rand(5.5, 10.0),
        r: rand(1.2, 2.2),
        sparkLength: rand(6, 14),
        sparklePhase: rand(0, Math.PI * 2)
      });
    }
  }

  // Vẽ ngôi sao 4 cánh lấp lánh
  function drawStar(x, y, spikes, outerRadius, innerRadius, color, alpha) {
    var rot = (Math.PI / 2) * 3;
    var step = Math.PI / spikes;
    ctx.save();
    ctx.beginPath();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < spikes; i++) {
      ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.lineTo(0, -outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Vẽ tia lửa pháo hoa có vệt sáng phát sáng đuôi (Sparkler Trail)
  function drawSpark(p, alpha) {
    var dx = p.x - p.prevX;
    var dy = p.y - p.prevY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var tailLen = Math.max(dist * 2.2, p.sparkLength * alpha);
    var normX = dist > 0.001 ? (dx / dist) * tailLen : 0;
    var normY = dist > 0.001 ? (dy / dist) * tailLen : tailLen;

    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(1, p.r * alpha);
    ctx.lineCap = "round";
    ctx.globalAlpha = Math.min(1, alpha * 1.2);

    // Đường vệt tia lửa
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - normX, p.y - normY);
    ctx.stroke();

    // Điểm đầu tia lửa phát sáng nhấp nháy
    var twinkle = (0.7 + 0.3 * Math.sin(p.sparklePhase));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.3 * twinkle, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = Math.min(1, alpha * twinkle);
    ctx.fill();

    ctx.restore();
  }

  var nextBurstTimer = 12;
  var isRunning = true;
  var isStarted = false;

  function render() {
    if (!isRunning) return;

    ctx.clearRect(0, 0, W, H);

    // Nhịp điệu bắn tiếp theo: êm ái, cách quãng 3.2 - 4.8 giây
    if (--nextBurstTimer <= 0) {
      nextBurstTimer = (rand(170, 260)) | 0;

      // Chọn điểm bắn xung quanh bục vinh danh
      var side = Math.random();
      if (side < 0.38) {
        createBurst(rand(W * 0.16, W * 0.36), rand(H * 0.16, H * 0.40), rand(42, 60), 1.0);
      } else if (side < 0.76) {
        createBurst(rand(W * 0.64, W * 0.84), rand(H * 0.16, H * 0.40), rand(42, 60), 1.0);
      } else {
        createBurst(rand(W * 0.36, W * 0.64), rand(H * 0.12, H * 0.28), rand(50, 72), 1.15);
      }
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      // Lưu vị trí cũ để vẽ vệt tia lửa
      p.prevX = p.x;
      p.prevY = p.y;

      // Cập nhật vật lý chậm rãi, bồng bềnh
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;

      p.wobble += p.wobbleSpeed;
      p.tilt += p.tiltSpeed;
      p.rot += p.rotSpeed;
      p.sparklePhase += 0.12;

      p.x += p.vx + Math.sin(p.wobble) * p.wobbleRadius;
      p.y += p.vy;
      p.life -= p.decay;

      // Hết hạn hoặc ra khỏi khung hình
      if (p.life <= 0 || p.y > H + 24) {
        particles.splice(i, 1);
        continue;
      }

      var alpha = Math.max(0, Math.min(1, p.life));

      // 1. Tia lửa pháo hoa (Sparkler Trail)
      if (p.type === "spark") {
        drawSpark(p, alpha);
      }
      // 2. Mảnh giấy kim tuyến 3D uốn lượn
      else if (p.type === "paper") {
        var scaleX = Math.cos(p.tilt);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(scaleX, 1);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      // 3. Ngôi sao 4 cánh lấp lánh (Sparkling Star)
      else if (p.type === "star") {
        var twinkleAlpha = alpha * (0.6 + 0.4 * Math.sin(p.sparklePhase));
        var starSize = p.r * 2.4;
        drawStar(p.x, p.y, 4, starSize, starSize * 0.36, p.color, Math.max(0, twinkleAlpha));
      }
      // 4. Bụi vàng phát sáng lơ lửng (Golden Glow)
      else {
        var glowAlpha = alpha * (0.65 + 0.35 * Math.sin(p.sparklePhase));
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = glowAlpha;
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(render);
  }

  function start() {
    if (isStarted) return;
    isStarted = true;
    resize();
    particles = [];

    // Chùm chào mừng khi vừa tải trang (nở nhẹ 2 bên)
    createBurst(W * 0.26, H * 0.26, 45, 0.95);
    createBurst(W * 0.74, H * 0.28, 45, 0.95);

    render();
  }

  window.addEventListener("resize", function () {
    if (isStarted) resize();
  });

  document.addEventListener("visibilitychange", function () {
    isRunning = !document.hidden;
    if (isRunning && isStarted) {
      requestAnimationFrame(render);
    }
  });

  start();
})();
