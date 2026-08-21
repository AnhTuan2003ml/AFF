/*
 * admin-table.js — gắn nhãn cột vào từng ô của bảng quản trị.
 *
 * Trên màn hẹp, mb-admin.css đổi mỗi hàng thành một thẻ "nhãn — giá trị";
 * nhãn lấy từ thuộc tính data-label của ô. Việc gắn nhãn làm bằng JS chứ
 * không viết tay vào template vì 16 trang /backoffice dùng chung mấy kiểu
 * bảng này: sửa tay vừa phải đụng hàng trăm thẻ <td>, vừa chắc chắn sót
 * mỗi lần ai đó thêm một cột mới.
 *
 * Chỉ những bảng đã gắn nhãn xong mới được đánh dấu [data-cards]; bảng nào
 * không có <thead> tử tế thì bỏ qua và giữ nguyên cách cuộn ngang cũ —
 * thà cuộn còn hơn đổi sang thẻ mà mọi ô đều thiếu nhãn.
 *
 * Không dùng JS thì trang vẫn chạy đủ chức năng, chỉ là bảng phải cuộn ngang.
 */
(function () {
  "use strict";

  function labelsOf(table) {
    var head = table.tHead;
    if (!head || !head.rows.length) return null;
    // Hàng tiêu đề cuối cùng là hàng sát dữ liệu nhất (bảng có tiêu đề gộp
    // nhiều tầng thì tầng dưới mới là tên cột thật).
    var row = head.rows[head.rows.length - 1];
    var out = [];
    for (var i = 0; i < row.cells.length; i += 1) {
      var cell = row.cells[i];
      var text = (cell.textContent || "").replace(/\s+/g, " ").trim();
      var span = cell.colSpan || 1;
      // Cột gộp: nhãn chỉ gắn cho ô đầu, các ô sau để trống.
      for (var s = 0; s < span; s += 1) out.push(s === 0 ? text : "");
    }
    return out;
  }

  function stamp(table) {
    if (table.dataset.cards) return;
    var labels = labelsOf(table);
    if (!labels || !labels.length) return;

    var bodies = table.tBodies;
    // Đếm ô ĐÃ CÓ nhãn chứ không đếm ô vừa gắn: khi bảng được vẽ lại, hàm này
    // chạy lần hai trên những ô còn nguyên nhãn cũ và sẽ không gắn thêm cái
    // nào — đếm theo số ô vừa gắn thì kết quả bằng 0 và bảng mất cờ
    // [data-cards], tức là mất luôn kiểu thẻ trên điện thoại.
    var labelled = 0;
    for (var b = 0; b < bodies.length; b += 1) {
      var rows = bodies[b].rows;
      for (var r = 0; r < rows.length; r += 1) {
        var cells = rows[r].cells;
        // Hàng trạng thái rỗng ("Chưa có dữ liệu") trải một ô qua cả bảng —
        // gắn nhãn cột đầu vào đó là sai nghĩa.
        if (cells.length === 1 && (cells[0].colSpan || 1) > 1) continue;
        var col = 0;
        for (var c = 0; c < cells.length; c += 1) {
          var cell = cells[c];
          if (!cell.hasAttribute("data-label")) {
            cell.setAttribute("data-label", labels[col] || "");
          }
          if (!cell.querySelector(":scope > .cell-body") && !cell.classList.contains("select-col") && !cell.hasAttribute("colspan")) {
            var wrapper = document.createElement("div");
            wrapper.className = "cell-body";
            while (cell.firstChild) {
              wrapper.appendChild(cell.firstChild);
            }
            cell.appendChild(wrapper);
          }
          col += cell.colSpan || 1;
          labelled += 1;
        }
      }
    }

    if (labelled > 0) table.dataset.cards = "1";
  }

  function run(root) {
    var scope = root || document;
    var tables = scope.querySelectorAll(".backoffice-shell table");
    for (var i = 0; i < tables.length; i += 1) stamp(tables[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      run(document);
    });
  } else {
    run(document);
  }

  // Vài bảng được vẽ lại bằng JS sau khi lọc/phân trang; theo dõi để hàng mới
  // cũng có nhãn. Chỉ quan sát khi đúng là trang quản trị.
  var shell = document.querySelector(".backoffice-shell");
  if (shell && typeof MutationObserver === "function") {
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        var tables = shell.querySelectorAll("table");
        for (var i = 0; i < tables.length; i += 1) {
          // Bảng đã vẽ lại thì cờ cũ không còn đúng cho hàng mới: gỡ cờ rồi
          // gắn lại, ô nào có nhãn sẵn sẽ được bỏ qua nên không tốn công.
          var table = tables[i];
          if (table.dataset.cards) delete table.dataset.cards;
          stamp(table);
        }
      });
    });
    observer.observe(shell, { childList: true, subtree: true });
  }
})();
