/* Backoffice KOL/KOC: hiện tên file PDF admin vừa chọn trên nút đính kèm.
   Tách file riêng vì CSP 'self' chặn inline script. */
(function () {
  "use strict";
  document.querySelectorAll("[data-kol-pdf]").forEach(function (input) {
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      var label = input.closest(".kol-file");
      var name = label && label.querySelector("[data-kol-pdf-name]");
      var face = label && label.querySelector(".kol-file-face");
      if (file && name) name.textContent = file.name;
      if (file && face) face.classList.add("is-filled");
    });
  });
})();
