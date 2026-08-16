/* Modal xác nhận đăng xuất có linh vật. Chặn mọi form đăng xuất, mở hộp thoại;
   linh vật phản ứng theo nút người dùng đang trỏ tới. */
(function () {
  "use strict";
  var scrim = document.querySelector("[data-logout-modal]");
  if (!scrim || !window.BlobMascot) return;

  var host = scrim.querySelector("[data-logout-mascot]");
  var stayBtn = scrim.querySelector(".blob-btn-stay");
  var outBtn = scrim.querySelector("[data-logout-confirm]");
  var mascot = window.BlobMascot.create({ mood: "neutral", label: "Linh vật ShopTik" });
  host.appendChild(mascot.el);

  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    scrim.hidden = false;
    scrim.removeAttribute("inert");
    window.requestAnimationFrame(function () { scrim.classList.add("is-open"); });
    mascot.setMood("hmm");
    mascot.setGaze(0, -6);
    mascot.say("Ở lại nhé?", 2000);
    document.addEventListener("keydown", onKey);
    if (stayBtn) window.setTimeout(function () { stayBtn.focus(); }, 30);
  }
  function close() {
    scrim.classList.remove("is-open");
    scrim.setAttribute("inert", "");
    document.removeEventListener("keydown", onKey);
    window.setTimeout(function () { scrim.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  // Chặn mọi form POST /dang-xuat (menu tài khoản, trang Cài đặt) — trừ form
  // nằm trong chính modal (đó mới là lượt đăng xuất thật).
  Array.prototype.forEach.call(
    document.querySelectorAll('form[action="/dang-xuat"]'),
    function (f) {
      if (f.hasAttribute("data-logout-form")) return;
      f.addEventListener("submit", function (e) { e.preventDefault(); open(); });
    }
  );

  Array.prototype.forEach.call(
    scrim.querySelectorAll("[data-logout-cancel]"),
    function (b) { b.addEventListener("click", close); }
  );
  scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });

  // Linh vật phản ứng theo nút đang trỏ / focus.
  function reactStay() { mascot.setMood("happy"); mascot.setGaze(-12, 4); mascot.say("Yay!", 0); }
  function reactOut() { mascot.setMood("sad"); mascot.setGaze(14, 6); mascot.say("Đừng mà…", 0); }
  function reactIdle() { mascot.setMood("hmm"); mascot.setGaze(0, -6); mascot.say("", 1); }

  if (stayBtn) {
    stayBtn.addEventListener("mouseenter", reactStay);
    stayBtn.addEventListener("focus", reactStay);
    stayBtn.addEventListener("mouseleave", reactIdle);
    stayBtn.addEventListener("blur", reactIdle);
  }
  if (outBtn) {
    outBtn.addEventListener("mouseenter", reactOut);
    outBtn.addEventListener("focus", reactOut);
    outBtn.addEventListener("mouseleave", reactIdle);
    outBtn.addEventListener("blur", reactIdle);
  }
})();
