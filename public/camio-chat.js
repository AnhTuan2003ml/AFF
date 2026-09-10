/* Chat với Camio (AI). Khác chat CSKH (poll Slack): Camio trả lời NGAY trong
   response POST /app/camio/messages. FE giữ lịch sử hội thoại và gửi kèm để AI
   có ngữ cảnh. Nút "Tìm đơn" đính kèm một đơn (chọn từ danh sách hoặc dán link)
   vào câu hỏi. */
(function () {
  "use strict";
  var root = document.querySelector("[data-camio]");
  if (!root) return;

  var endpoint = root.getAttribute("data-endpoint");
  var csrf = root.getAttribute("data-csrf") || "";
  var thread = root.querySelector("[data-camio-thread]");
  var form = root.querySelector("[data-camio-form]");
  var input = root.querySelector("[data-camio-input]");
  var sendBtn = root.querySelector("[data-camio-send]");
  var errorBox = root.querySelector("[data-camio-error]");
  var findBtn = root.querySelector("[data-camio-find]");
  var picker = root.querySelector("[data-camio-picker]");
  var pickerDone = root.querySelector("[data-camio-picker-done]");
  var orderSelect = root.querySelector("[data-camio-order-select]");
  var orderLink = root.querySelector("[data-camio-order-link]");
  var orderChip = root.querySelector("[data-camio-order-chip]");
  var orderLabelEl = root.querySelector("[data-camio-order-label]");
  var orderClear = root.querySelector("[data-camio-order-clear]");
  if (!thread || !form || !input) return;

  var AVATAR = "/assets/images/mascot/camio-vuive.png?v=3";
  var history = []; // {role:'user'|'assistant', body}
  var attachedOrder = null; // {label}
  var sending = false;

  // Avatar linh vật ở header + tin chào có sẵn.
  root.querySelectorAll("[data-camio-mascot], [data-camio-msg-mascot]").forEach(function (el) {
    if (!el.querySelector("img")) {
      var img = document.createElement("img");
      img.src = AVATAR;
      img.alt = "Camio";
      img.referrerPolicy = "no-referrer";
      el.appendChild(img);
    }
  });

  function scrollBottom() { thread.scrollTop = thread.scrollHeight; }

  function bubble(who, text, isTyping) {
    var row = document.createElement("div");
    row.className = "camio-msg is-" + who;
    if (who === "camio") {
      var av = document.createElement("span");
      av.className = "camio-msg-avatar";
      var img = document.createElement("img");
      img.src = AVATAR; img.alt = "Camio"; img.referrerPolicy = "no-referrer";
      av.appendChild(img);
      row.appendChild(av);
    }
    var b = document.createElement("div");
    b.className = "camio-bubble" + (isTyping ? " is-typing" : "");
    if (isTyping) {
      b.innerHTML = '<span class="camio-dot"></span><span class="camio-dot"></span><span class="camio-dot"></span>';
    } else {
      var p = document.createElement("p");
      p.textContent = text;
      b.appendChild(p);
    }
    row.appendChild(b);
    thread.appendChild(row);
    scrollBottom();
    return row;
  }

  function setOrder(label, key, link) {
    // key = ORDER:<id>/INTENT:<id> khi chọn từ danh sách (backend nạp ngữ cảnh
    // đơn); link = URL sản phẩm khi dán link (backend tra cứu sản phẩm).
    attachedOrder = label
      ? { label: label, key: key || "", link: link || "" }
      : null;
    if (attachedOrder) {
      if (orderLabelEl) orderLabelEl.textContent = label;
      if (orderChip) orderChip.hidden = false;
    } else if (orderChip) {
      orderChip.hidden = true;
    }
  }

  if (findBtn && picker) {
    findBtn.addEventListener("click", function () {
      picker.hidden = !picker.hidden;
    });
  }
  if (pickerDone) {
    pickerDone.addEventListener("click", function () {
      var label = "";
      var key = "";
      var link = "";
      if (orderSelect && orderSelect.value) {
        var opt = orderSelect.options[orderSelect.selectedIndex];
        label = opt ? (opt.getAttribute("data-label") || opt.textContent) : "";
        key = orderSelect.value;
      } else if (orderLink && orderLink.value.trim()) {
        link = orderLink.value.trim();
        // Nhãn gọn cho link (bỏ query cho đỡ dài).
        label = link.split("?")[0];
      }
      if (label) setOrder(label, key, link);
      if (picker) picker.hidden = true;
    });
  }
  if (orderClear) {
    orderClear.addEventListener("click", function () { setOrder(null); });
  }

  function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    if (sendBtn) sendBtn.disabled = true;
    if (errorBox) errorBox.hidden = true;

    bubble("user", text);
    input.value = "";
    input.style.height = "auto";

    // Câu gửi cho AI: đính kèm tham chiếu đơn nếu có.
    var message = attachedOrder ? "[Về đơn: " + attachedOrder.label + "] " + text : text;
    var typing = bubble("camio", "", true);

    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf, accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        message: message,
        history: history.slice(-16),
        orderKey: attachedOrder && attachedOrder.key ? attachedOrder.key : undefined,
        productLink:
          attachedOrder && attachedOrder.link ? attachedOrder.link : undefined,
      }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        var replyText = data.reply || "Xin lỗi, Camio chưa trả lời được. Anh/chị thử lại sau nhé.";
        bubble("camio", replyText);
        history.push({ role: "user", body: message });
        history.push({ role: "assistant", body: replyText });
      })
      .catch(function () {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        if (errorBox) { errorBox.textContent = "Mất kết nối. Thử lại nhé."; errorBox.hidden = false; }
      })
      .then(function () {
        sending = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
      });
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); send(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
})();
