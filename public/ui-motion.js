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

  /* Khu quảng bá Shopee / TikTok Shop / Lazada: tự luân phiên, và bấm được
     vào ba vạch chỉ báo để chọn thẳng một sàn. */
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
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
      });
    }
    function platformIndex(platform) {
      return slides.findIndex(function (slide) { return slide.getAttribute("data-platform-ad") === platform; });
    }
    // Bấm vào một vạch chỉ báo thì nhảy tới sàn đó và hoãn vòng tự chạy, nếu
    // không slide sẽ tự đổi ngay sau đó và cú bấm coi như vô hiệu.
    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () {
        pausedUntil = Date.now() + 9000;
        show(i);
      });
    });

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

/* Scroll-reveal: hé lộ dần các thẻ khi cuộn vào khung nhìn (giống whileInView).
   Nội dung LUÔN hiển thị mặc định; chỉ khi được phép chuyển động mới ẩn rồi
   hé lộ — nên máy bật "giảm chuyển động" vẫn thấy đủ nội dung. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  var SELECTOR =
    "[data-reveal], .discover-card, .promo-card, .product-card, .px-product-card, .stat-card, .orders-history-card, .mission-row, .referral-row";

  function setup() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
    if (!nodes.length) return;
    nodes.forEach(function (n, i) {
      if (n.classList.contains("reveal-init")) return;
      n.classList.add("reveal-init");
      // Xếp trễ theo cụm 6 để tạo hiệu ứng lần lượt, không lệch quá xa.
      n.style.setProperty("--reveal-delay", (i % 6) * 55 + "ms");
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("reveal-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -60px 0px" }
    );
    nodes.forEach(function (n) { io.observe(n); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
  // Băng chuyền/khám phá nạp thẻ bằng JS sau đó — quét lại một lần cho chắc.
  window.setTimeout(setup, 1200);
})();
