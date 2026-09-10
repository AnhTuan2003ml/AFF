/* Xoay vòng media nền hero trang chủ theo cấu hình admin (hero_media).
   Danh sách nằm trong <script type="application/json" data-hero-media>. Mỗi mục:
   { id, kind: 'image'|'video', src, durationMs }.
   - image/GIF → background-image của .px-home-hero-bg
   - video file (mp4/webm) → thẻ .px-home-hero-video
   - video YouTube (link youtu.be / youtube.com) → iframe nhúng .px-home-hero-embed
   CSP: đặt style qua CSSOM (element.style) được phép, không phải style nội tuyến. */
(function () {
  "use strict";
  var hero = document.querySelector("[data-hero-rotate]");
  if (!hero) return;
  var dataEl = hero.querySelector("script[data-hero-media]");
  var bg = hero.querySelector(".px-home-hero-bg");
  var video = hero.querySelector(".px-home-hero-video");
  var embed = hero.querySelector(".px-home-hero-embed");
  if (!dataEl || !bg) return;

  var items;
  try {
    items = JSON.parse(dataEl.textContent || "[]");
  } catch (e) {
    return;
  }
  if (!Array.isArray(items) || items.length === 0) return;

  function youtubeId(url) {
    var m = String(url).match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/,
    );
    return m ? m[1] : null;
  }

  function preload(src) {
    var img = new Image();
    img.src = src;
  }

  // Kích thước iframe YouTube phủ kín hero (giữ 16:9, cắt phần thừa).
  function coverEmbed() {
    if (!embed || embed.hidden) return;
    var r = hero.getBoundingClientRect();
    var ratio = 16 / 9;
    var w = r.width;
    var h = r.height;
    if (w / h > ratio) {
      embed.style.width = w + "px";
      embed.style.height = w / ratio + "px";
    } else {
      embed.style.height = h + "px";
      embed.style.width = h * ratio + "px";
    }
  }
  window.addEventListener("resize", coverEmbed);

  function stopEmbed() {
    if (embed && !embed.hidden) {
      embed.hidden = true;
      embed.src = "";
    }
  }
  function stopVideo() {
    if (video && !video.hidden) {
      video.hidden = true;
      try {
        video.pause();
      } catch (e) {}
    }
  }

  function show(item) {
    var yt = item.kind === "video" ? youtubeId(item.src) : null;
    if (yt && embed) {
      stopVideo();
      embed.src =
        "https://www.youtube-nocookie.com/embed/" +
        yt +
        "?autoplay=1&mute=1&loop=1&playlist=" +
        yt +
        "&controls=0&modestbranding=1&rel=0&playsinline=1&disablekb=1";
      embed.hidden = false;
      coverEmbed();
    } else if (item.kind === "video" && video) {
      stopEmbed();
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
      stopEmbed();
      stopVideo();
      bg.style.backgroundImage =
        'url("' + String(item.src).replace(/"/g, "%22") + '")';
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
