/* Xoay vòng media nền hero trang chủ theo cấu hình admin (hero_media).
   Danh sách nằm trong <script type="application/json" data-hero-media>. Mỗi mục:
   { id, kind: 'image'|'video', src, durationMs }. Ảnh/GIF đặt qua background-image
   của .px-home-hero-bg; video dùng thẻ .px-home-hero-video phủ lên.
   CSP: đặt style qua CSSOM (element.style) được phép, không phải style nội tuyến. */
(function () {
  "use strict";
  var hero = document.querySelector("[data-hero-rotate]");
  if (!hero) return;
  var dataEl = hero.querySelector("script[data-hero-media]");
  var bg = hero.querySelector(".px-home-hero-bg");
  var video = hero.querySelector(".px-home-hero-video");
  if (!dataEl || !bg) return;

  var items;
  try {
    items = JSON.parse(dataEl.textContent || "[]");
  } catch (e) {
    return;
  }
  if (!Array.isArray(items) || items.length === 0) return;

  function preload(src) {
    var img = new Image();
    img.src = src;
  }

  function show(item) {
    if (item.kind === "video" && video) {
      if (video.getAttribute("src") !== item.src) {
        video.setAttribute("src", item.src);
        try {
          video.load();
        } catch (e) {}
      }
      video.hidden = false;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      bg.style.backgroundImage = 'url("' + String(item.src).replace(/"/g, "%22") + '")';
      if (video) {
        video.hidden = true;
        try {
          video.pause();
        } catch (e) {}
      }
    }
  }

  var index = -1;
  function next() {
    index = (index + 1) % items.length;
    show(items[index]);
    var upcoming = items[(index + 1) % items.length];
    if (upcoming && upcoming.kind !== "video") preload(upcoming.src);
    if (items.length > 1) {
      var dur = Math.max(500, Number(items[index].durationMs) || 6000);
      window.setTimeout(next, dur);
    }
  }

  next();
})();
