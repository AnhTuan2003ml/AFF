/* Bước 1 KOL/KOC: đọc thỏa thuận theo TỪNG MỤC (Mở đầu · Điều 1 · Điều 2 …).
   Bấm "Tiếp theo" sang điều kế; tới mục cuối mới hiện ô đồng ý + nút tiếp tục.
   Tách file riêng vì CSP 'self' chặn inline script. */
(function () {
  "use strict";
  var doc = document.querySelector("[data-kol-doc]");
  if (!doc) return;

  var sections = Array.prototype.slice.call(
    document.querySelectorAll("[data-section]"),
  );
  var steps = Array.prototype.slice.call(
    document.querySelectorAll("[data-step]"),
  );
  var prevBtn = document.querySelector("[data-prev]");
  var nextBtn = document.querySelector("[data-next]");
  var progress = document.querySelector("[data-progress]");
  var agreeBar = document.querySelector("[data-agree-bar]");
  var accept = document.getElementById("kol-accept");
  var cont = document.getElementById("kol-continue");
  var total = sections.length;
  var cur = 0;

  function show(i) {
    if (i < 0) i = 0;
    if (i > total - 1) i = total - 1;
    cur = i;
    sections.forEach(function (s, idx) {
      s.hidden = idx !== i;
    });
    steps.forEach(function (b, idx) {
      var on = idx === i;
      b.classList.toggle("active", on);
      if (on && b.scrollIntoView)
        b.scrollIntoView({ block: "nearest", inline: "center" });
    });
    doc.scrollTop = 0;

    var last = i === total - 1;
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.hidden = last;
    if (agreeBar) agreeBar.hidden = !last;
    if (progress) {
      var label = steps[i] ? steps[i].textContent : "";
      progress.textContent = label + " · " + (i + 1) + "/" + total;
    }
  }

  if (prevBtn)
    prevBtn.addEventListener("click", function () {
      show(cur - 1);
    });
  if (nextBtn)
    nextBtn.addEventListener("click", function () {
      show(cur + 1);
    });
  steps.forEach(function (b, idx) {
    b.addEventListener("click", function () {
      show(idx);
    });
  });

  if (accept && cont) {
    var sync = function () {
      cont.disabled = !accept.checked;
    };
    accept.addEventListener("change", sync);
    sync();
  }

  show(0);
})();
