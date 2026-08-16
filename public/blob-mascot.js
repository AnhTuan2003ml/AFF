/*
 * Linh vật "Blob" thuần SVG cho ShopTik — không phụ thuộc thư viện, hợp CSP.
 * Cảm hứng từ feral-blob nhưng viết lại bằng vanilla JS + SVG nội tuyến để chạy
 * trong Nunjucks (không React, không CDN). Màu lấy từ CSS custom properties
 * (--jelly-*) nên đổi bảng màu chỉ bằng cách set biến trên phần tử bao ngoài.
 *
 * API:
 *   var m = window.BlobMascot.create({ mood: 'happy', gaze: {x:10,y:-6}, label:'...' });
 *   node.appendChild(m.el);
 *   m.setMood('sad'); m.setGaze(x, y); m.say('Xin chào'); m.poke();
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function n(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Miệng theo từng cảm xúc (path d trong viewBox 120x120).
  var MOUTH = {
    neutral: "M52 82 Q60 86 68 82",
    happy: "M49 79 Q60 93 71 79",
    sad: "M52 87 Q60 80 68 87",
    hmm: "M53 84 Q57 88 60 84 T67 84",
    sideEye: "M54 84 H66",
    password: "M53 83 Q60 87 67 83",
    angry: "M52 87 Q60 82 68 87"
  };
  // Cảm xúc nào thì nhắm mắt (dùng cung thay tròng mắt).
  var CLOSED = { happy: true, password: true };

  function create(opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "blob-mascot";
    wrap.setAttribute("data-mood", "neutral");

    var svg = n("svg", {
      viewBox: "0 0 120 120",
      class: "blob-svg",
      role: "img",
      "aria-label": opts.label || "Linh vật ShopTik"
    });

    // Bóng đổ mềm
    svg.appendChild(n("ellipse", { class: "blob-shadow", cx: 60, cy: 108, rx: 34, ry: 7 }));

    // Tay (thò hai bên, khẽ vẫy)
    svg.appendChild(n("ellipse", { class: "blob-arm blob-arm-l", cx: 15, cy: 76, rx: 9, ry: 13 }));
    svg.appendChild(n("ellipse", { class: "blob-arm blob-arm-r", cx: 105, cy: 76, rx: 9, ry: 13 }));

    // Thân blob (nhún dẻo bằng CSS)
    var bodyG = n("g", { class: "blob-bodyg" });
    bodyG.appendChild(n("path", {
      class: "blob-body",
      d: "M60 16 C88 16 105 37 105 64 C105 92 86 106 60 106 C34 106 15 92 15 64 C15 37 32 16 60 16 Z"
    }));
    // Ánh sáng bóng bẩy trên thân
    bodyG.appendChild(n("ellipse", { class: "blob-gloss", cx: 44, cy: 40, rx: 13, ry: 8 }));
    svg.appendChild(bodyG);

    // Má hồng (chỉ hiện khi vui)
    svg.appendChild(n("ellipse", { class: "blob-cheek blob-cheek-l", cx: 40, cy: 76, rx: 7, ry: 4.5 }));
    svg.appendChild(n("ellipse", { class: "blob-cheek blob-cheek-r", cx: 80, cy: 76, rx: 7, ry: 4.5 }));

    // Mắt (nhóm để đảo mắt theo gaze)
    var eyes = n("g", { class: "blob-eyes" });
    function eye(cx) {
      var g = n("g", { class: "blob-eye" });
      g.appendChild(n("ellipse", { class: "eye-dot", cx: cx, cy: 60, rx: 5, ry: 6.5 }));
      g.appendChild(n("circle", { class: "eye-shine", cx: cx + 1.8, cy: 57, r: 1.7 }));
      // mắt nhắm (cung) cho happy/password
      g.appendChild(n("path", { class: "eye-lid", d: "M" + (cx - 6) + " 61 Q" + cx + " 55 " + (cx + 6) + " 61" }));
      return g;
    }
    eyes.appendChild(eye(47));
    eyes.appendChild(eye(73));
    svg.appendChild(eyes);

    // Miệng
    var mouth = n("path", { class: "blob-mouth", d: MOUTH.neutral });
    svg.appendChild(mouth);

    wrap.appendChild(svg);

    // Bong bóng thoại
    var bubble = document.createElement("div");
    bubble.className = "blob-bubble";
    bubble.hidden = true;
    wrap.appendChild(bubble);

    var sayTimer = null;
    var currentMood = "neutral";

    function setMood(m) {
      if (!MOUTH[m]) m = "neutral";
      currentMood = m;
      wrap.setAttribute("data-mood", m);
      mouth.setAttribute("d", MOUTH[m]);
    }
    function setGaze(x, y) {
      var gx = clamp((x || 0) * 0.22, -4.5, 4.5);
      var gy = clamp((y || 0) * 0.22, -3.5, 3.5);
      eyes.setAttribute("transform", "translate(" + gx.toFixed(2) + "," + gy.toFixed(2) + ")");
    }
    function say(text, ms) {
      if (!text) { bubble.hidden = true; return; }
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
      // ép reflow để chạy lại animation
      void wrap.offsetWidth;
      wrap.classList.add("is-poked");
      pokeCount += 1;
      var wasMood = currentMood;
      setMood(pokeCount % 4 === 0 ? "angry" : "hmm");
      say(POKES[pokeCount % POKES.length], 1400);
      window.setTimeout(function () { setMood(wasMood); }, 1400);
      if (pokeCount >= 6 && typeof opts.onOverpoke === "function") {
        pokeCount = 0;
        opts.onOverpoke();
      }
    }

    svg.addEventListener("click", poke);
    svg.style.cursor = "pointer";

    setMood(opts.mood || "neutral");
    if (opts.gaze) setGaze(opts.gaze.x, opts.gaze.y);

    return { el: wrap, svg: svg, setMood: setMood, setGaze: setGaze, say: say, poke: poke };
  }

  window.BlobMascot = { create: create, MOUTH: MOUTH, CLOSED: CLOSED };
})();
