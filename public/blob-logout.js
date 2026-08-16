/* Modal xác nhận có linh vật — dùng chung cho:
   - Đăng xuất (form[action="/dang-xuat"]).
   - Thao tác nhạy cảm khác: form gắn data-blob-confirm (vd. đăng xuất mọi thiết bị).
   Linh vật phản ứng theo nút người dùng đang trỏ tới. */
(function () {
  "use strict";
  var scrim = document.querySelector("[data-confirm-modal]");
  if (!scrim || !window.BlobMascot) return;

  var host = scrim.querySelector("[data-confirm-mascot]");
  var eyebrowEl = scrim.querySelector("[data-confirm-eyebrow]");
  var titleEl = scrim.querySelector("[data-confirm-title]");
  var copyEl = scrim.querySelector("[data-confirm-copy]");
  var stayBtn = scrim.querySelector(".blob-btn-stay");
  var okBtn = scrim.querySelector("[data-confirm-ok]");
  var mascot = window.BlobMascot.create({ mood: "neutral", label: "Linh vật ShopTik" });
  host.appendChild(mascot.el);

  var pendingForm = null;
  var pendingSubmitter = null;
  var lastFocus = null;

  function open(form, opts) {
    pendingForm = form;
    lastFocus = document.activeElement;
    eyebrowEl.textContent = opts.eyebrow;
    titleEl.textContent = opts.title;
    copyEl.textContent = opts.copy;
    okBtn.textContent = opts.okLabel;
    scrim.hidden = false;
    scrim.removeAttribute("inert");
    window.requestAnimationFrame(function () { scrim.classList.add("is-open"); });
    mascot.setMood("hmm");
    mascot.setGaze(0, -6);
    if (opts.say) mascot.say(opts.say, 2000);
    document.addEventListener("keydown", onKey);
    if (stayBtn) window.setTimeout(function () { stayBtn.focus(); }, 30);
  }
  function close() {
    scrim.classList.remove("is-open");
    scrim.setAttribute("inert", "");
    document.removeEventListener("keydown", onKey);
    window.setTimeout(function () { scrim.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    pendingForm = null;
    pendingSubmitter = null;
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  function bind(form, resolveOpts) {
    form.addEventListener(
      "submit",
      function (e) {
        if (form.dataset.blobConfirmed === "1") {
          delete form.dataset.blobConfirmed;
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        pendingSubmitter = e.submitter || null;
        open(form, resolveOpts(form));
      },
      { capture: true }
    );
  }

  // Đăng xuất
  Array.prototype.forEach.call(
    document.querySelectorAll('form[action="/dang-xuat"]'),
    function (f) {
      bind(f, function () {
        return {
          eyebrow: "Sắp đi đâu à?",
          title: "Đăng xuất?",
          copy: "Bạn sẽ cần đăng nhập lại để vào tài khoản.",
          okLabel: "Đăng xuất",
          say: "Ở lại nhé?",
        };
      });
    }
  );

  // Thao tác nhạy cảm khác (data-blob-confirm = nội dung mô tả)
  Array.prototype.forEach.call(
    document.querySelectorAll("form[data-blob-confirm]"),
    function (f) {
      bind(f, function (form) {
        return {
          eyebrow: form.getAttribute("data-confirm-eyebrow") || "Xác nhận thao tác",
          title: form.getAttribute("data-confirm-title") || "Bạn chắc chứ?",
          copy: form.getAttribute("data-blob-confirm") || "",
          okLabel: form.getAttribute("data-confirm-label") || "Đồng ý",
          say: "Cân nhắc nhé!",
        };
      });
    }
  );

  okBtn.addEventListener("click", function () {
    if (!pendingForm) return;
    var form = pendingForm;
    var submitter = pendingSubmitter;
    form.dataset.blobConfirmed = "1";
    // Mở lại nút submit nếu đã bị khóa (ux-integrity) để lượt gửi thật đi qua.
    var sub = form.querySelector("[data-submit-button]");
    if (sub && sub.tagName === "BUTTON") {
      sub.disabled = false;
      sub.removeAttribute("aria-busy");
    }
    close();
    if (submitter && (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement)) {
      form.requestSubmit(submitter);
    } else {
      form.requestSubmit();
    }
  });

  Array.prototype.forEach.call(
    scrim.querySelectorAll("[data-confirm-cancel]"),
    function (b) { b.addEventListener("click", close); }
  );
  scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });

  // Linh vật phản ứng theo nút đang trỏ / focus.
  function reactStay() { mascot.setMood("happy"); mascot.setGaze(-12, 4); mascot.say("Ở lại nhé!", 0); }
  function reactOk() { mascot.setMood("sad"); mascot.setGaze(14, 6); mascot.say("Chắc chưa?", 0); }
  function reactIdle() { mascot.setMood("hmm"); mascot.setGaze(0, -6); mascot.say("", 1); }
  if (stayBtn) {
    stayBtn.addEventListener("mouseenter", reactStay);
    stayBtn.addEventListener("focus", reactStay);
    stayBtn.addEventListener("mouseleave", reactIdle);
    stayBtn.addEventListener("blur", reactIdle);
  }
  if (okBtn) {
    okBtn.addEventListener("mouseenter", reactOk);
    okBtn.addEventListener("focus", reactOk);
    okBtn.addEventListener("mouseleave", reactIdle);
    okBtn.addEventListener("blur", reactIdle);
  }
})();
