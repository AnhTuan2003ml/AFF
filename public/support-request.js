// Form hỗ trợ theo mẫu: chọn vấn đề + đơn hàng liên quan + mô tả, gửi qua
// POST /app/support/requests. Yêu cầu được chuẩn hóa thành một tin nhắn trong
// cùng hội thoại chat — sau khi gửi, bắn sự kiện "support-chat:append" để tin
// hiện ngay trong khung chat bên cạnh.
(function () {
  "use strict";

  var form = document.querySelector("[data-support-form]");
  if (!form) return;

  var endpoint = form.getAttribute("data-endpoint");
  var csrfToken = form.getAttribute("data-csrf") || "";
  var topicSelect = form.querySelector("[data-topic-select]");
  var listBlock = form.querySelector('[data-order-block="list"]');
  var codeBlock = form.querySelector('[data-order-block="code"]');
  var orderSelect = form.querySelector("[data-order-select]");
  var orderCode = form.querySelector("[data-order-code]");
  var description = form.querySelector("[data-description]");
  var notifyEmail = form.querySelector("[data-notify-email]");
  var submitButton = form.querySelector("[data-support-submit]");
  var successBox = form.querySelector("[data-support-success]");
  var errorBox = form.querySelector("[data-support-error]");
  var sending = false;

  function fieldErrorBox(input) {
    return document.getElementById(input.id + "-error");
  }

  function setFieldError(input, message) {
    var box = fieldErrorBox(input);
    if (!box) return;
    box.textContent = message || "";
    box.hidden = !message;
  }

  function clearFeedback() {
    [topicSelect, orderSelect, orderCode, description, notifyEmail].forEach(
      function (el) {
        if (el) setFieldError(el, "");
      }
    );
    errorBox.hidden = true;
    successBox.hidden = true;
  }

  function currentOrderMode() {
    var option = topicSelect.options[topicSelect.selectedIndex];
    if (!option || !option.value) return null;
    return option.getAttribute("data-order-mode");
  }

  function currentOrderRequired() {
    var option = topicSelect.options[topicSelect.selectedIndex];
    return Boolean(option && option.getAttribute("data-order-required") === "1");
  }

  function syncOrderFields() {
    var mode = currentOrderMode();
    listBlock.hidden = mode !== "list";
    codeBlock.hidden = mode !== "code";
  }

  function validate() {
    var ok = true;
    if (!topicSelect.value) {
      setFieldError(topicSelect, "Vui lòng chọn vấn đề cần hỗ trợ.");
      ok = false;
    }
    var mode = currentOrderMode();
    if (mode === "list" && currentOrderRequired() && !orderSelect.value) {
      setFieldError(orderSelect, "Vui lòng chọn đơn hàng cần hỗ trợ.");
      ok = false;
    }
    if (mode === "code" && orderCode.value.trim().length < 3) {
      setFieldError(orderCode, "Vui lòng nhập mã đơn hàng trên sàn (tối thiểu 3 ký tự).");
      ok = false;
    }
    if (description.value.trim().length < 10) {
      setFieldError(description, "Mô tả cần tối thiểu 10 ký tự.");
      ok = false;
    }
    var email = notifyEmail ? notifyEmail.value.trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(notifyEmail, "Email nhận phản hồi chưa đúng định dạng.");
      ok = false;
    }
    return ok;
  }

  async function submit() {
    if (sending) return;
    clearFeedback();
    if (!validate()) return;

    var mode = currentOrderMode();
    var payload = {
      topic: topicSelect.value,
      description: description.value.trim(),
    };
    if (mode === "list" && orderSelect.value) payload.orderKey = orderSelect.value;
    if (mode === "code") payload.orderCode = orderCode.value.trim();
    if (notifyEmail) payload.notifyEmail = notifyEmail.value.trim();

    sending = true;
    submitButton.disabled = true;
    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
          accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        errorBox.textContent =
          (data.error && data.error.message) ||
          "Chưa gửi được yêu cầu. Vui lòng thử lại.";
        errorBox.hidden = false;
        return;
      }
      form.reset();
      syncOrderFields();
      successBox.hidden = false;
      if (data.message) {
        document.dispatchEvent(
          new CustomEvent("support-chat:append", { detail: data.message })
        );
      }
    } catch (error) {
      errorBox.textContent = "Mất kết nối. Kiểm tra mạng rồi thử lại.";
      errorBox.hidden = false;
    } finally {
      sending = false;
      submitButton.disabled = false;
    }
  }

  topicSelect.addEventListener("change", function () {
    clearFeedback();
    syncOrderFields();
  });

  [orderSelect, orderCode, description, notifyEmail].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", function () {
      setFieldError(el, "");
      successBox.hidden = true;
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    submit();
  });

  syncOrderFields();
})();
