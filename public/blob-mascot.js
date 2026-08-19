/*
 * Linh vật CamiO cho ShopTik — dùng ảnh 3D (PNG trong suốt) thay cho bản SVG
 * "Blob" cũ. Không phụ thuộc thư viện, hợp CSP (chỉ ảnh self + CSS + vanilla JS).
 * Giữ NGUYÊN API và các class hook (.blob-mascot / .blob-svg / .blob-bubble) nên
 * mọi nơi gọi cũ (fab hỗ trợ, thông báo, xác nhận đăng xuất, avatar CSKH) không
 * cần sửa. Biểu cảm = đổi ảnh; hiệu ứng = float/gaze (CSS var trên <img>) +
 * pop/poke (scale trên wrap).
 *
 * API:
 *   var m = window.BlobMascot.create({ mood: 'happy', gaze:{x:10,y:-6}, label:'...' });
 *   node.appendChild(m.el);
 *   m.setMood('sad'); m.setGaze(x, y); m.say('Xin chào'); m.poke();
 */
(function () {
  "use strict";

  var BASE = "/assets/images/mascot/camio-";

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
    return BASE + (EXPR[mood] || "vuive") + ".png";
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Nạp trước 6 ảnh để đổi biểu cảm không bị chớp.
  KEYS.forEach(function (k) { var i = new Image(); i.src = BASE + k + ".png"; });

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
    var swapTimer = null;
    var pokeTimer = null;
    var currentMood = "neutral";

    function setMood(m) {
      var key = EXPR[m] ? m : "neutral";
      currentMood = key;
      wrap.setAttribute("data-mood", EXPR[key]);
      var src = fileFor(key);
      if (img.getAttribute("src") !== src) {
        img.setAttribute("src", src);
        // pop nhẹ khi đổi biểu cảm
        wrap.classList.remove("is-swap");
        void wrap.offsetWidth;
        wrap.classList.add("is-swap");
        if (swapTimer) window.clearTimeout(swapTimer);
        swapTimer = window.setTimeout(function () { wrap.classList.remove("is-swap"); }, 420);
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
      wrap.classList.remove("is-poked");
      void wrap.offsetWidth;
      wrap.classList.add("is-poked");
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
