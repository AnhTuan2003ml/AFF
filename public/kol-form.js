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

  // Kênh mạng xã hội: nhiều URL — nút "+" thêm dòng, "×" xóa dòng; gộp lại
  // (mỗi kênh một dòng) vào ô ẩn socialLinks khi submit.
  var social = document.querySelector("[data-social]");
  var socialAdd = document.querySelector("[data-social-add]");
  var socialHidden = document.querySelector("[data-social-hidden]");
  if (social && socialAdd && socialHidden) {
    var syncDel = function () {
      var rows = social.querySelectorAll(".kol-social-row");
      rows.forEach(function (row) {
        var del = row.querySelector("[data-social-del]");
        if (del) del.hidden = rows.length <= 1;
      });
    };
    var combine = function () {
      var vals = [];
      social.querySelectorAll("[data-social-input]").forEach(function (inp) {
        var v = inp.value.trim();
        if (v) vals.push(v);
      });
      socialHidden.value = vals.join("\n");
    };
    socialAdd.addEventListener("click", function () {
      var first = social.querySelector(".kol-social-row");
      var row = first.cloneNode(true);
      row.querySelector("[data-social-input]").value = "";
      social.appendChild(row);
      syncDel();
      row.querySelector("[data-social-input]").focus();
    });
    social.addEventListener("click", function (e) {
      var del = e.target.closest && e.target.closest("[data-social-del]");
      if (!del) return;
      var rows = social.querySelectorAll(".kol-social-row");
      if (rows.length > 1) del.closest(".kol-social-row").remove();
      syncDel();
      combine();
    });
    social.addEventListener("input", combine);
    syncDel();
  }

  var form = document.querySelector("[data-kol-form]");
  var btn = document.querySelector("[data-kol-submit]");
  if (form) {
    form.addEventListener("submit", function () {
      if (socialHidden && social) {
        var vals = [];
        social.querySelectorAll("[data-social-input]").forEach(function (inp) {
          var v = inp.value.trim();
          if (v) vals.push(v);
        });
        socialHidden.value = vals.join("\n");
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Đang gửi…";
      }
    });
  }
})();
