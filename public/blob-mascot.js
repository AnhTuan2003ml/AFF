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

    // Lơ lửng lên xuống liên tục (cộng dồn lên transform gaze của ảnh nhờ
    // composite:"add"). WAAPI nên chạy bất kể prefers-reduced-motion.
    if (canAnim) {
      img.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-6%)" },
          { transform: "translateY(0)" }
        ],
        { duration: 3600, iterations: Infinity, easing: "ease-in-out", composite: "add" }
      );
    }
    // Nhún "pop" trên wrap (tách khỏi transform của ảnh).
    function pop() {
      if (!wrap.animate) return;
      wrap.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.13)" }, { transform: "scale(1)" }],
        { duration: 380, easing: "ease-out" }
      );
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
            { transform: "scale(1) rotate(0)" },
            { transform: "scale(1.12, .9) rotate(-5deg)" },
            { transform: "scale(.94, 1.07) rotate(4deg)" },
            { transform: "scale(1) rotate(0)" }
          ],
          { duration: 480, easing: "ease-in-out" }
        );
      }
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

    return { el: wrap, svg: img, img: img, setMood: setMood, setGaze: setGaze, say: say, poke: poke };
  }

  window.BlobMascot = { create: create, EXPR: EXPR, KEYS: KEYS };
})();
