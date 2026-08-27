/* Bảng "Nhắn CSKH" cạnh form — CHAT TRỰC TIẾP:
   - Desktop: cạnh form. Mobile: ngăn kéo trượt đè, mở bằng nút, đóng ×.
   - Hiện ĐỦ hội thoại (không chỉ trao đổi mới nhất), poll tin mới mỗi 15s.
   - Có ô nhập gửi thẳng vào thread CSKH (POST /app/support/messages). */
(function () {
  "use strict";
  var panel = document.querySelector("[data-reply-panel]");
  if (!panel) return;
  var openBtn = document.querySelector("[data-reply-open]");
  var closeBtn = panel.querySelector("[data-reply-close]");
  var thread = panel.querySelector("[data-support-thread]") || panel.querySelector(".support-thread");
  var chatForm = panel.querySelector("[data-support-chatbar]");
  var chatInput = panel.querySelector("[data-chatbar-input]");
  var chatSend = panel.querySelector("[data-chatbar-send]");
  var chatError = panel.querySelector("[data-chatbar-error]");
  var csrfToken = chatForm ? chatForm.getAttribute("data-csrf") || "" : "";
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

  // ===== Dựng bong bóng tin nhắn =====
  function fmt(iso) {
    try {
      return new Date(iso).toLocaleString("vi-VN", {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
      });
    } catch (e) { return ""; }
  }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  // Các tin đã có trên màn (server render + đã append) — chống lặp khi poll.
  var knownIds = {};
  Array.prototype.forEach.call(
    panel.querySelectorAll("[data-message-id]"),
    function (node) { knownIds[node.getAttribute("data-message-id")] = true; }
  );

  function scrollCuoi() {
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  function goEmptyNote() {
    var empty = thread && thread.querySelector("[data-thread-empty]");
    if (empty) empty.remove();
  }

  function appendMessage(message) {
    if (!thread || !message || knownIds[message.id]) return false;
    knownIds[message.id] = true;
    goEmptyNote();
    var laUser = message.authorRole === "USER";
    var msg = el("div", "support-msg is-" + (laUser ? "user" : "agent"));
    msg.setAttribute("data-message-id", message.id);
    if (!laUser) {
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
    var t = el("b"); t.textContent = laUser ? "Bạn" : "Đội CSKH"; b.appendChild(t);
    var p = el("p"); p.textContent = message.body; b.appendChild(p);
    var tm = el("time"); tm.textContent = fmt(message.createdAt); b.appendChild(tm);
    msg.appendChild(b);
    thread.appendChild(msg);
    return true;
  }

  // ===== Poll ĐỦ hội thoại =====
  function poll() {
    fetch("/app/support/messages", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.messages)) return;
        var coTinMoi = false;
        var coAgentMoi = false;
        data.messages.forEach(function (message) {
          var moi = appendMessage(message);
          if (moi) {
            coTinMoi = true;
            if (message.authorRole !== "USER") coAgentMoi = true;
          }
        });
        if (coTinMoi) scrollCuoi();
        if (coAgentMoi) {
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

  // ===== Gửi tin trực tiếp =====
  var sending = false;
  function loi(message) {
    if (!chatError) return;
    chatError.textContent = message || "";
    chatError.hidden = !message;
  }
  async function guiTin() {
    if (sending || !chatInput) return;
    var body = chatInput.value.trim();
    if (!body) return;
    sending = true;
    if (chatSend) chatSend.disabled = true;
    loi("");
    try {
      var response = await fetch("/app/support/messages", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ body: body }),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        loi((data.error && data.error.message) || "Chưa gửi được tin. Thử lại nhé.");
        return;
      }
      chatInput.value = "";
      chatInput.style.height = "auto";
      if (data.message) appendMessage(data.message);
      scrollCuoi();
    } catch (e) {
      loi("Mất kết nối. Kiểm tra mạng rồi thử lại.");
    } finally {
      sending = false;
      if (chatSend) chatSend.disabled = false;
      chatInput.focus();
    }
  }
  if (chatForm) {
    chatForm.addEventListener("submit", function (event) {
      event.preventDefault();
      guiTin();
    });
  }
  if (chatInput) {
    // Enter gửi luôn, Shift+Enter xuống dòng (chuẩn các app chat).
    chatInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        guiTin();
      }
    });
    chatInput.addEventListener("input", function () {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 110) + "px";
    });
  }

  // Form "Gửi yêu cầu theo mẫu" gửi xong → hiện luôn trong thread bên cạnh.
  document.addEventListener("support-chat:append", function (event) {
    if (event && event.detail) {
      appendMessage(event.detail);
      scrollCuoi();
    }
  });

  scrollCuoi();
  var POLL_MS = 15000;
  var timer = null;
  function start() { if (!timer) timer = window.setInterval(poll, POLL_MS); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else { poll(); start(); }
  });
  window.setTimeout(start, POLL_MS);
})();
