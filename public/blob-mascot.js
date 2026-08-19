/*
 * Linh vật CamiO cho ShopTik — dùng ảnh 3D (PNG trong suốt) thay cho bản SVG
 * "Blob" cũ. Không phụ thuộc thư viện, hợp CSP (chỉ ảnh self + CSS + vanilla JS).
 * Giữ NGUYÊN API và các class hook (.blob-mascot / .blob-svg / .blob-bubble) nên
 * mọi nơi gọi cũ (fab hỗ trợ, thông báo, xác nhận đăng xuất, avatar CSKH) không
 * cần sửa. Biểu cảm = đổi ảnh; hoạt ảnh (float lơ lửng, pop khi đổi biểu cảm,
 * poke) dùng Web Animations API nên chạy cả khi máy bật reduced-motion.
 *
 * API:
 *   var m = window.BlobMascot.create({ mood: 'happy', gaze:{x:10,y:-6}, label:'...' });
 *   node.appendChild(m.el);
 *   m.setMood('sad'); m.setGaze(x, y); m.say('Xin chào'); m.poke();
 */
(function () {
  "use strict";

  var BASE = "/assets/images/mascot/camio-";
  // Ảnh nạp qua JS (không có ?v của template) — bump VER khi đổi ảnh để ép
  // trình duyệt tải lại, khỏi phải Ctrl+F5.
  var VER = "?v=3";

  // Ánh xạ tên cảm xúc (kể cả các mood cũ) sang 1 trong 6 biểu cảm CamiO.
  var EXPR = {
    neutral: "vuive", vuive: "vuive",
    happy: "haohung", excited: "haohung", haohung: "haohung",
    hmm: "thichthu", thinking: "thichthu", curious: "thichthu", thichthu: "thichthu",
    sad: "ngacnhien", surprised: "ngacnhien", angry: "ngacnhien", ngacnhien: "ngacnhien",
    confident: "tutin", proud: "tutin", tutin: "tutin",
    sideEye: "baocao", password: "baocao", report: "baocao", baocao: "baocao"
  };
  var KEYS = ["vuive", "haohung", "thichthu", "ngacnhien", "tutin", "baocao"];

  function fileFor(mood) {
    return BASE + (EXPR[mood] || "vuive") + ".png" + VER;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Nạp trước 6 ảnh để đổi biểu cảm không bị chớp.
  KEYS.forEach(function (k) { var i = new Image(); i.src = BASE + k + ".png" + VER; });

  function create(opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "blob-mascot";
    wrap.setAttribute("data-mood", "neutral");

    var img = document.createElement("img");
    img.className = "blob-svg";
    img.alt = opts.label || "Linh vật CamiO";
    img.decoding = "async";
    img.draggable = false;
    wrap.appendChild(img);

    // Bong bóng thoại (giữ nguyên cơ chế cũ).
    var bubble = document.createElement("div");
    bubble.className = "blob-bubble";
    bubble.hidden = true;
    wrap.appendChild(bubble);

    var sayTimer = null;
    var pokeTimer = null;
    var currentMood = "neutral";
    var canAnim = typeof img.animate === "function";

    // IDLE HỮU CƠ: lơ lửng + đưa nghiêng (cape/tai) + squash-stretch nhẹ. Cộng
    // dồn lên transform gaze của ảnh nhờ composite:"add". WAAPI nên chạy bất kể
    // prefers-reduced-motion. Hai lớp lệch chu kỳ cho chuyển động tự nhiên hơn.
    if (canAnim) {
      img.animate(
        [
          { transform: "translateY(0) rotate(0deg) scale(1,1)" },
          { transform: "translateY(-5%) rotate(1.6deg) scale(.99,1.02)", offset: .25 },
          { transform: "translateY(-8.5%) rotate(0deg) scale(1.02,.985)", offset: .5 },
          { transform: "translateY(-4%) rotate(-1.6deg) scale(.99,1.02)", offset: .75 },
          { transform: "translateY(0) rotate(0deg) scale(1,1)" }
        ],
        { duration: 4200, iterations: Infinity, easing: "ease-in-out", composite: "add" }
      );
      img.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(1.5%)" }, { transform: "translateX(0)" }, { transform: "translateX(-1.5%)" }, { transform: "translateX(0)" }],
        { duration: 6100, iterations: Infinity, easing: "ease-in-out", composite: "add" }
      );
    }

    // Đổi biểu cảm: nhảy nảy có squash-stretch (sinh động hơn scale phẳng).
    function pop() {
      if (!wrap.animate) return;
      wrap.animate(
        [
          { transform: "translateY(0) scale(1,1)" },
          { transform: "translateY(-15%) scale(1.09,.93)", offset: .32 },
          { transform: "translateY(3%) scale(.93,1.09)", offset: .6 },
          { transform: "translateY(0) scale(1.02,.98)", offset: .82 },
          { transform: "translateY(0) scale(1,1)" }
        ],
        { duration: 500, easing: "cubic-bezier(.3,1.2,.5,1)" }
      );
    }

    // Hạt lấp lánh bung ra quanh linh vật (tự co giãn theo cỡ hiển thị).
    function sparkle(n) {
      n = n || 6;
      var w = wrap.offsetWidth || 110;
      for (var i = 0; i < n; i++) {
        var sp = document.createElement("span");
        sp.className = "blob-spark";
        sp.textContent = "✦";
        wrap.appendChild(sp);
        var ang = (Math.PI * 2 * i) / n + (Math.random() - .5) * 0.8;
        var dist = w * (0.36 + Math.random() * 0.26);
        var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - w * 0.06;
        sp.style.fontSize = Math.max(8, w * (0.09 + Math.random() * 0.05)).toFixed(1) + "px";
        if (sp.animate) {
          var a = sp.animate(
            [
              { transform: "translate(-50%,-50%) scale(0) rotate(0deg)", opacity: 0 },
              { transform: "translate(calc(-50% + " + (dx * .5).toFixed(1) + "px),calc(-50% + " + (dy * .5).toFixed(1) + "px)) scale(1) rotate(120deg)", opacity: 1, offset: .4 },
              { transform: "translate(calc(-50% + " + dx.toFixed(1) + "px),calc(-50% + " + dy.toFixed(1) + "px)) scale(0) rotate(260deg)", opacity: 0 }
            ],
            { duration: 620 + Math.random() * 380, easing: "ease-out" }
          );
          a.onfinish = (function (node) { return function () { if (node.parentNode) node.parentNode.removeChild(node); }; })(sp);
        } else { (function (node) { window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 120); })(sp); }
      }
    }

    function setMood(m) {
      var key = EXPR[m] ? m : "neutral";
      currentMood = key;
      wrap.setAttribute("data-mood", EXPR[key]);
      var src = fileFor(key);
      if (img.getAttribute("src") !== src) {
        img.setAttribute("src", src);
        pop(); // nảy nhẹ mỗi lần đổi biểu cảm
      }
    }

    // "Liếc" theo hướng nhìn: dịch ảnh qua CSS var để không đè animation float.
    function setGaze(x, y) {
      var gx = clamp((x || 0) * 0.14, -4, 4);
      var gy = clamp((y || 0) * 0.14, -3, 3);
      img.style.setProperty("--gx", gx.toFixed(1) + "px");
      img.style.setProperty("--gy", gy.toFixed(1) + "px");
    }

    function say(text, ms) {
      if (!text) { bubble.hidden = true; wrap.classList.remove("has-bubble"); return; }
      bubble.textContent = text;
      bubble.hidden = false;
      wrap.classList.add("has-bubble");
      if (sayTimer) window.clearTimeout(sayTimer);
      if (ms !== 0) {
        sayTimer = window.setTimeout(function () {
          bubble.hidden = true;
          wrap.classList.remove("has-bubble");
        }, ms || 2600);
      }
    }

    var POKES = ["Ơ!", "Nhột đấy!", "Hí hí", "Thôi nào~", "Ối!"];
    var pokeCount = 0;
    function poke() {
      if (wrap.animate) {
        wrap.animate(
          [
            { transform: "translateY(0) scale(1,1) rotate(0)" },
            { transform: "translateY(-20%) scale(1.14,.86) rotate(-7deg)", offset: .3 },
            { transform: "translateY(4%) scale(.9,1.12) rotate(6deg)", offset: .58 },
            { transform: "translateY(0) scale(1.03,.97) rotate(-2deg)", offset: .82 },
            { transform: "translateY(0) scale(1,1) rotate(0)" }
          ],
          { duration: 560, easing: "cubic-bezier(.3,1.3,.5,1)" }
        );
      }
      sparkle(5);
      pokeCount += 1;
      var wasMood = currentMood;
      setMood(pokeCount % 4 === 0 ? "ngacnhien" : "thichthu");
      say(POKES[pokeCount % POKES.length], 1400);
      if (pokeTimer) window.clearTimeout(pokeTimer);
      pokeTimer = window.setTimeout(function () { setMood(wasMood); }, 1400);
      if (pokeCount >= 6 && typeof opts.onOverpoke === "function") {
        pokeCount = 0;
        opts.onOverpoke();
      }
    }

    img.addEventListener("click", poke);
    img.style.cursor = "pointer";

    setMood(opts.mood || "neutral");
    if (opts.gaze) setGaze(opts.gaze.x, opts.gaze.y);

    // Pop-in đàn hồi khi xuất hiện (vọt quá rồi lắng lại).
    if (wrap.animate && opts.entrance !== false) {
      wrap.animate(
        [
          { transform: "scale(.2) rotate(-14deg)", opacity: 0 },
          { transform: "scale(1.16) rotate(7deg)", opacity: 1, offset: .55 },
          { transform: "scale(.93) rotate(-3deg)", offset: .78 },
          { transform: "scale(1) rotate(0deg)", opacity: 1 }
        ],
        { duration: 640, easing: "cubic-bezier(.2,1.35,.4,1)" }
      );
    }

    return { el: wrap, svg: img, img: img, setMood: setMood, setGaze: setGaze, say: say, poke: poke, sparkle: sparkle };
  }

  window.BlobMascot = { create: create, EXPR: EXPR, KEYS: KEYS };
})();
