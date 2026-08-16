/* ShopTik route motion + platform advertising rotation. */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Thin orange progress line for MPA navigation. */
  if (!reduce) {
    var bar = document.createElement("div");
    bar.className = "ui-progress";
    bar.setAttribute("aria-hidden", "true");
    (document.body || document.documentElement).appendChild(bar);
    var timer = null;
    var width = 0;
    function start() {
      if (timer) return;
      bar.classList.add("is-active");
      width = 8;
      bar.style.width = width + "%";
      timer = window.setInterval(function () {
        width = Math.min(width + Math.random() * 11, 90);
        bar.style.width = width + "%";
      }, 190);
    }
    function done() {
      if (timer) { window.clearInterval(timer); timer = null; }
      bar.style.width = "100%";
      window.setTimeout(function () {
        bar.classList.remove("is-active");
        bar.style.width = "0";
      }, 240);
    }
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0 || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      if (a.origin && a.origin !== window.location.origin) return;
      start();
    }, true);
    document.addEventListener("submit", function (e) {
      var f = e.target;
      if (f && f.getAttribute && f.getAttribute("target") === "_blank") return;
      start();
    }, true);
    window.addEventListener("pageshow", done);
    window.addEventListener("load", done);
  }

  /* Display-only advertising rotator for Shopee / TikTok Shop / Lazada. */
  function initPlatformShowcase(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-platform-ad]"));
    var dots = Array.prototype.slice.call(root.querySelectorAll(".lux-platform-dot"));
    if (slides.length < 2) return;
    var index = Math.max(0, slides.findIndex(function (s) { return s.classList.contains("is-active"); }));
    var pausedUntil = 0;
    function show(next) {
      index = ((next % slides.length) + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        var active = i === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", active ? "false" : "true");
      });
      dots.forEach(function (dot, i) { dot.classList.toggle("is-active", i === index); });
    }
    function platformIndex(platform) {
      return slides.findIndex(function (slide) { return slide.getAttribute("data-platform-ad") === platform; });
    }
    document.addEventListener("shoptik:platform-detected", function (event) {
      var platform = event && event.detail && event.detail.platform;
      var i = platformIndex(platform);
      if (i >= 0) { pausedUntil = Date.now() + 6500; show(i); }
    });
    // Slideshow quảng cáo: luôn luân phiên nội dung, kể cả khi người dùng/HĐH
    // bật "giảm chuyển động" (prefers-reduced-motion chỉ tắt hiệu ứng trượt,
    // không nên đóng băng khu quảng bá 3 sàn). CSS hạ transform khi reduce.
    window.setInterval(function () {
      if (document.hidden || Date.now() < pausedUntil) return;
      show(index + 1);
    }, 4200);
  }

  function init() {
    document.querySelectorAll("[data-platform-showcase]").forEach(initPlatformShowcase);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
