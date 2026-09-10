/* Nút "Áp dụng" của bảng doanh thu: đổi biểu đồ bằng AJAX, KHÔNG reload trang
   (không nhảy về đầu trang). Lấy from/to/unit từ form, fetch mảnh HTML mới rồi
   thay phần thân [data-income-body]. */
(function () {
  "use strict";
  var panel = document.querySelector("[data-income-panel]");
  if (!panel) return;
  var form = panel.querySelector("[data-income-form]");
  var body = panel.querySelector("[data-income-body]");
  var endpoint = panel.getAttribute("data-income-endpoint");
  if (!form || !body || !endpoint) return;
  var applyBtn = form.querySelector(".income-apply");

  function apply(event) {
    if (event) event.preventDefault();
    var params = new URLSearchParams(new FormData(form)).toString();
    body.classList.add("is-loading");
    if (applyBtn) applyBtn.disabled = true;
    fetch(endpoint + "?" + params, {
      credentials: "same-origin",
      headers: { accept: "text/html" },
    })
      .then(function (r) {
        return r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status));
      })
      .then(function (html) {
        body.innerHTML = html;
      })
      .catch(function () {})
      .then(function () {
        body.classList.remove("is-loading");
        if (applyBtn) applyBtn.disabled = false;
      });
  }

  form.addEventListener("submit", apply);
})();
