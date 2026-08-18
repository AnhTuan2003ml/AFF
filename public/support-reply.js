/* Bảng "Phản Hồi":
   - Desktop: cạnh form. Mobile: ngăn kéo trượt đè, mở bằng "Phản Hồi", đóng ×.
   - Cập nhật REALTIME: poll trao đổi mới nhất và dựng lại bảng, không cần reload. */
(function () {
  "use strict";
  var panel = document.querySelector("[data-reply-panel]");
  if (!panel) return;
  var openBtn = document.querySelector("[data-reply-open]");
  var closeBtn = panel.querySelector("[data-reply-close]");
  var thread = panel.querySelector(".support-thread");
  var shell = panel.parentNode; // .support-shell (vị trí gốc cho desktop)

  // MOBILE: đưa drawer ra thẳng <body> để position:fixed bám đúng viewport
  // (tránh bị tổ tiên có transform/animation "giam" khiến không cuộn được).
  // DESKTOP: trả về .support-shell để nằm cạnh form như cột thường.
  var mqMobile = window.matchMedia("(max-width: 820px)");
  function reparent() {
    if (mqMobile.matches) {
      if (panel.parentNode !== document.body) document.body.appendChild(panel);
    } else if (shell && panel.parentNode !== shell) {
      shell.appendChild(panel);
    }
  }
  reparent();
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", reparent);
  else if (mqMobile.addListener) mqMobile.addListener(reparent);

  function open() { panel.classList.add("is-open"); document.body.classList.add("reply-open"); }
  function close() { panel.classList.remove("is-open"); document.body.classList.remove("reply-open"); }
  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  if (mqMobile.matches && panel.getAttribute("data-has-reply") === "1") {
    window.setTimeout(open, 250);
  }

  // ===== Cập nhật realtime =====
  function fmt(iso) {
    try {
      return new Date(iso).toLocaleString("vi-VN", {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
      });
    } catch (e) { return ""; }
  }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function makeBubble(role, label, body, at) {
    var msg = el("div", "support-msg is-" + role);
    if (role === "agent") {
      var av = el("span", "support-msg-avatar");
      av.setAttribute("aria-hidden", "true");
      if (window.BlobMascot) {
        var m = window.BlobMascot.create({ mood: "happy", label: "Đội CSKH" });
        m.setGaze(-6, -4);
        av.appendChild(m.el);
      }
      msg.appendChild(av);
    }
    var b = el("div", "support-msg-bubble");
    var t = el("b"); t.textContent = label; b.appendChild(t);
    var p = el("p"); p.textContent = body; b.appendChild(p);
    var tm = el("time"); tm.textContent = fmt(at); b.appendChild(tm);
    msg.appendChild(b);
    return msg;
  }
  function renderThread(data) {
    if (!thread) return;
    thread.innerHTML = "";
    if (data.request) {
      thread.appendChild(makeBubble("user", "Yêu cầu của bạn", data.request.body, data.request.at));
    }
    if (data.reply) {
      thread.appendChild(makeBubble("agent", "Đội CSKH", data.reply.body, data.reply.at));
    } else {
      var w = el("p", "support-thread-waiting");
      w.textContent = "Đội CSKH đang xử lý — phản hồi sẽ hiện tại đây và báo bằng linh vật.";
      thread.appendChild(w);
    }
  }

  // Chữ ký phản hồi hiện tại (đọc từ DOM server render) để phát hiện tin mới.
  var lastReplySig = (function () {
    var a = panel.querySelector(".support-msg.is-agent .support-msg-bubble p");
    return a ? a.textContent : "";
  })();

  function poll() {
    fetch("/app/support/latest", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var sig = data.reply ? data.reply.body : "";
        if (sig === lastReplySig && thread && thread.children.length) return;
        lastReplySig = sig;
        renderThread(data);
        if (data.reply) {
          panel.setAttribute("data-has-reply", "1");
          if (openBtn && !openBtn.querySelector(".support-reply-dot")) {
            var dot = el("span", "support-reply-dot");
            dot.setAttribute("aria-hidden", "true");
            openBtn.appendChild(dot);
          }
          if (mqMobile.matches && !panel.classList.contains("is-open")) open();
        }
      })
      .catch(function () {});
  }

  var POLL_MS = 15000;
  var timer = null;
  function start() { if (!timer) timer = window.setInterval(poll, POLL_MS); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else { poll(); start(); }
  });
  window.setTimeout(start, POLL_MS);
})();
