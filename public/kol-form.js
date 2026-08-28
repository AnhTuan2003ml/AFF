/* Form KOL/KOC: xem trước ảnh/video khi chọn file; chặn submit đúp.
   Ảnh iPhone (HEIC) trình duyệt không preview được — khi đó hiện xác nhận
   "đã chọn" (tên file) thay vì để trống, để người dùng biết đã tải lên. */
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
      wrap.classList.remove("is-filled");
      wrap.classList.add("is-selected");

      if (!preview) return;
      var url = URL.createObjectURL(file);

      var thanhCong = function () {
        wrap.classList.add("is-filled");
        wrap.classList.remove("is-selected");
        preview.hidden = false;
      };
      var thatBai = function () {
        // Không preview được (HEIC…) — giữ ô, hiện xác nhận đã chọn.
        wrap.classList.remove("is-filled");
        wrap.classList.add("is-selected");
        preview.hidden = true;
      };

      preview.onload = thanhCong; // <img>
      preview.onloadeddata = thanhCong; // <video>
      preview.onerror = thatBai;
      preview.hidden = true;
      preview.src = url;
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
