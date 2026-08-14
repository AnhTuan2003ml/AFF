// Combobox danh mục (mobile): nút cố định chân trang mở một bảng danh sách
// trượt lên NGAY TRÊN nút (popover) để cuộn dọc chọn danh mục — không phủ nền
// đen, không khoá màn hình. Không đụng logic lọc: các nút bên trong vẫn do
// discover.js / discover-bestsellers.js xử lý; file này chỉ lo đóng/mở + nhãn.
(function () {
  "use strict";

  var sheet = document.querySelector("[data-cat-sheet]");
  var fab = document.querySelector("[data-cat-open]");
  if (!sheet || !fab) return;

  var current = fab.querySelector("[data-cat-current]");
  var tabs = sheet.querySelectorAll(".discover-category-tabs button");

  function isOpen() {
    return sheet.classList.contains("is-open");
  }

  function open() {
    sheet.classList.add("is-open");
    fab.setAttribute("aria-expanded", "true");
    document.body.classList.add("discover-cat-open");
  }

  function close() {
    sheet.classList.remove("is-open");
    fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("discover-cat-open");
  }

  function labelFor(btn) {
    return (btn.textContent || "").trim();
  }

  fab.addEventListener("click", function (e) {
    e.stopPropagation();
    if (isOpen()) close();
    else open();
  });

  // Chọn một danh mục: cập nhật nhãn nút mở rồi đóng bảng. Việc lọc thực sự do
  // handler sẵn có của các nút này đảm nhiệm.
  Array.prototype.forEach.call(tabs, function (btn) {
    btn.addEventListener("click", function () {
      if (current) current.textContent = labelFor(btn);
      close();
    });
  });

  // Bấm ra ngoài bảng/nút → đóng (thay cho lớp phủ). Vẫn cuộn trang bình thường.
  document.addEventListener("click", function (e) {
    if (!isOpen()) return;
    if (sheet.contains(e.target) || fab.contains(e.target)) return;
    close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) close();
  });

  // Đồng bộ nhãn ban đầu theo danh mục đang active.
  var active = sheet.querySelector(".discover-category-tabs button.active");
  if (active && current) current.textContent = labelFor(active);
})();
