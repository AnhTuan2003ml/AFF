/* Cấu hình AI (backoffice/support):
   - Đổi provider → combobox Model chỉ hiện model của provider đó.
   - Chọn "Tùy chỉnh" → ẩn combobox, hiện ô nhập tên model + Link API (base URL).
   - Nút "Kiểm tra kết nối" → gọi /settings/test, hiện kết quả + hạn mức usage/limit.
   Chỉ MỘT ô model được submit (ô kia bị disabled nên trình duyệt bỏ qua). */
(function () {
  "use strict";
  var form = document.querySelector("[data-ai-config]");
  if (!form) return;

  var PROV = {};
  try {
    var raw = document.getElementById("ai-providers");
    if (raw) PROV = JSON.parse(raw.textContent || "{}");
  } catch (e) { PROV = {}; }

  var savedProvider = form.getAttribute("data-provider") || "";
  var savedModel = form.getAttribute("data-model") || "";
  var endpoint = form.getAttribute("data-test-endpoint");
  var csrf = form.getAttribute("data-csrf");

  var providerSel = form.querySelector("#ar-provider");
  var modelInput = form.querySelector("#ar-model");
  var modelHint = form.querySelector("[data-model-hint]");
  var baseWrap = form.querySelector("[data-baseurl-wrap]");
  var baseInput = form.querySelector("#ar-baseurl");
  var keyInput = form.querySelector("#ar-key");
  var testBtn = form.querySelector("[data-test-btn]");
  var testResult = form.querySelector("[data-test-result]");
  var simRange = form.querySelector("[data-sim-range]");
  var simLabel = form.querySelector("[data-sim-label]");

  // Ô Model là input gõ/dán tự do; provider chỉ đổi phần GỢI Ý (không ép giá trị).
  function rebuild() {
    var provider = providerSel.value;
    var meta = PROV[provider] || {};
    var isCustom = !!meta.needsBaseUrl;

    if (baseWrap) baseWrap.hidden = !isCustom;
    if (baseInput) baseInput.disabled = !isCustom;

    if (modelHint) {
      var list = meta.suggestedModels || [];
      modelHint.textContent = list.length
        ? "Gợi ý (bấm để điền): "
        : "Dán tên model của endpoint tùy chỉnh.";
      modelHint.innerHTML = "";
      if (list.length) {
        modelHint.appendChild(document.createTextNode("Gợi ý (bấm để điền): "));
        list.forEach(function (m, i) {
          if (i) modelHint.appendChild(document.createTextNode(", "));
          var a = document.createElement("a");
          a.href = "#";
          a.className = "bo-model-pick";
          a.textContent = m;
          a.addEventListener("click", function (e) {
            e.preventDefault();
            modelInput.value = m;
            modelInput.focus();
          });
          modelHint.appendChild(a);
        });
      } else {
        modelHint.textContent = "Dán tên model của endpoint tùy chỉnh (API tương thích OpenAI).";
      }
    }
  }

  function activeModel() {
    return (modelInput.value || "").trim();
  }

  function showResult(ok, message, limits) {
    testResult.hidden = false;
    testResult.className = "bo-test-result " + (ok ? "is-ok" : "is-err");
    var html = "<b>" + (ok ? "✓ " : "✕ ") + escapeHtml(message) + "</b>";
    if (limits && limits.length) {
      html += '<ul class="bo-test-limits">';
      limits.forEach(function (l) {
        html += "<li>" + escapeHtml(l.label) + ": <b>" + escapeHtml(l.value) + "</b></li>";
      });
      html += "</ul>";
    }
    testResult.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  if (testBtn && endpoint) {
    testBtn.addEventListener("click", function () {
      var model = activeModel();
      if (!model) {
        showResult(false, "Hãy chọn/nhập tên model trước khi kiểm tra.");
        return;
      }
      testBtn.disabled = true;
      var oldText = testBtn.textContent;
      testBtn.textContent = "Đang kiểm tra…";
      testResult.hidden = false;
      testResult.className = "bo-test-result";
      testResult.textContent = "Đang gọi API…";

      fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          aiProvider: providerSel.value,
          aiModel: model,
          aiBaseUrl: baseInput ? baseInput.value.trim() : "",
          aiApiKey: keyInput ? keyInput.value.trim() : "",
        }),
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false, message: "HTTP " + r.status }; }); })
        .then(function (res) { showResult(!!res.ok, res.message || (res.ok ? "OK" : "Lỗi"), res.limits); })
        .catch(function () { showResult(false, "Không gọi được máy chủ. Thử lại sau."); })
        .then(function () {
          testBtn.disabled = false;
          testBtn.textContent = oldText;
        });
    });
  }

  if (simRange && simLabel) {
    simRange.addEventListener("input", function () {
      simLabel.textContent = simRange.value + "%";
    });
  }

  providerSel.addEventListener("change", function () {
    // Đổi provider thì kết quả test cũ không còn đúng.
    if (testResult) testResult.hidden = true;
    rebuild();
  });

  rebuild();
})();
