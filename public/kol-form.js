/* Form KOL/KOC: xem trước ảnh/video khi chọn file; chặn submit đúp. */
(function () {
  "use strict";
  document.querySelectorAll("[data-upload]").forEach(function (wrap) {
    var input = wrap.querySelector("[data-upload-input]");
    var name = wrap.querySelector("[data-upload-name]");
    var preview = wrap.querySelector("[data-upload-preview]");
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (name) name.textContent = file.name;
      var url = URL.createObjectURL(file);
      if (preview) {
        preview.src = url;
        preview.hidden = false;
      }
      wrap.classList.add("is-filled");
    });
  });

  var form = document.querySelector("[data-kol-form]");
  var btn = document.querySelector("[data-kol-submit]");
  if (form && btn) {
    form.addEventListener("submit", function () {
      btn.disabled = true;
      btn.textContent = "Đang gửi…";
    });
  }
})();
