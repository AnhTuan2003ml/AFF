// Chat hỗ trợ trực tiếp: gửi tin qua POST /app/support/messages và poll tin
// mới (câu trả lời của CSKH từ Slack) mỗi vài giây qua GET cùng đường dẫn.
(function () {
  "use strict";

  var root = document.querySelector("[data-chat]");
  if (!root) return;

  var endpoint = root.getAttribute("data-endpoint");
  var csrfToken = root.getAttribute("data-csrf") || "";
  var list = root.querySelector("[data-chat-messages]");
  var emptyState = root.querySelector("[data-chat-empty]");
  var form = root.querySelector("[data-chat-form]");
  var input = root.querySelector("[data-chat-input]");
  var sendButton = root.querySelector("[data-chat-send]");
  var errorBox = root.querySelector("[data-chat-error]");

  var POLL_INTERVAL_MS = 5000;
  var knownIds = {};
  var sending = false;
  var pollTimer = null;

  Array.prototype.forEach.call(
    list.querySelectorAll("[data-message-id]"),
    function (node) {
      knownIds[node.getAttribute("data-message-id")] = true;
    }
  );

  function formatTime(isoString) {
    var date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function appendMessage(message) {
    if (knownIds[message.id]) return false;
    knownIds[message.id] = true;
    if (emptyState) emptyState.hidden = true;

    var row = document.createElement("div");
    row.className =
      "support-chat-row is-" +
      (message.authorRole === "AGENT" ? "agent" : "user");
    row.setAttribute("data-message-id", message.id);

    var bubble = document.createElement("div");
    bubble.className = "support-chat-bubble";

    var body = document.createElement("p");
    body.textContent = message.body;

    var time = document.createElement("time");
    time.dateTime = message.createdAt;
    time.textContent = formatTime(message.createdAt);

    bubble.appendChild(body);
    bubble.appendChild(time);
    row.appendChild(bubble);
    list.appendChild(row);
    return true;
  }

  function scrollToBottom() {
    list.scrollTop = list.scrollHeight;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  }

  async function poll() {
    try {
      var response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) return;
      var data = await response.json();
      var added = false;
      (data.messages || []).forEach(function (message) {
        if (appendMessage(message)) added = true;
      });
      if (added) scrollToBottom();
    } catch (error) {
      // Mất mạng tạm thời: giữ im lặng, lượt poll sau sẽ thử lại.
    }
  }

  async function send() {
    var body = input.value.trim();
    if (!body || sending) return;
    sending = true;
    sendButton.disabled = true;
    clearError();
    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
          accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ body: body }),
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        showError(
          (data.error && data.error.message) ||
            "Chưa gửi được tin nhắn. Vui lòng thử lại."
        );
        return;
      }
      input.value = "";
      autosize();
      if (data.message) {
        appendMessage(data.message);
        scrollToBottom();
      }
    } catch (error) {
      showError("Mất kết nối. Kiểm tra mạng rồi thử lại.");
    } finally {
      sending = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    send();
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });

  input.addEventListener("input", autosize);

  // Tạm dừng poll khi tab bị ẩn để đỡ tốn tài nguyên.
  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(poll, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopPolling();
    } else {
      poll();
      startPolling();
    }
  });

  autosize();
  scrollToBottom();
  startPolling();
})();
