/* Popup "Hướng dẫn chi tiết" quản trị — mở/đóng, cuộn theo mục lục, tìm nhanh,
   đánh dấu mục đang xem. Không phụ thuộc thư viện. */
(function () {
  "use strict";
  var scrim = document.querySelector("[data-guide-scrim]");
  if (!scrim) return;
  var scroll = scrim.querySelector("[data-guide-scroll]");
  var links = Array.prototype.slice.call(scrim.querySelectorAll("[data-guide-link]"));
  var sections = Array.prototype.slice.call(scrim.querySelectorAll("[data-guide-section]"));
  var search = scrim.querySelector("[data-guide-search]");
  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    scrim.hidden = false;
    document.body.classList.add("bo-guide-open");
    // Mở tới mục đầu; cuộn content về đầu.
    if (scroll) scroll.scrollTop = 0;
    setActive(links[0]);
    var first = scrim.querySelector("[data-guide-close]");
    if (first) first.focus();
  }
  function close() {
    scrim.hidden = true;
    document.body.classList.remove("bo-guide-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function (e) {
    var openBtn = e.target.closest ? e.target.closest("[data-guide-open]") : null;
    if (openBtn) { e.preventDefault(); open(); return; }
  });
  scrim.addEventListener("click", function (e) {
    if (e.target === scrim || (e.target.closest && e.target.closest("[data-guide-close]"))) {
      close();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !scrim.hidden) close();
  });

  function setActive(link) {
    links.forEach(function (l) { l.classList.toggle("is-active", l === link); });
  }

  // Bấm mục lục → cuộn tới đúng phần trong khung nội dung.
  links.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var id = link.getAttribute("href").slice(1);
      var target = scrim.querySelector("#" + CSS.escape(id));
      if (target && scroll) {
        scroll.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
      }
      setActive(link);
    });
  });

  // Đánh dấu mục đang xem theo vị trí cuộn.
  if (scroll) {
    var ticking = false;
    scroll.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        var top = scroll.scrollTop + 16;
        var current = sections[0];
        sections.forEach(function (s) { if (s.offsetTop <= top) current = s; });
        if (current) {
          var link = links.filter(function (l) {
            return l.getAttribute("href") === "#" + current.id;
          })[0];
          if (link) setActive(link);
        }
      });
    });
  }

  // Tìm nhanh: lọc mục lục + phần nội dung theo từ khóa.
  if (search) {
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      sections.forEach(function (s) {
        var hit = !q || s.textContent.toLowerCase().indexOf(q) !== -1;
        s.hidden = !hit;
        var link = links.filter(function (l) {
          return l.getAttribute("href") === "#" + s.id;
        })[0];
        if (link) link.hidden = !hit;
      });
    });
  }
})();
