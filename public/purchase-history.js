// Admin — Lịch sử mua theo tài khoản (master-detail). Trái: lọc + chọn tài
// khoản. Phải: nạp lịch sử đơn mua + click của tài khoản đó qua JSON.
(function () {
  "use strict";

  var root = document.querySelector("[data-purchase-history]");
  if (!root) return;

  var endpoint = root.getAttribute("data-endpoint");
  var searchInput = root.querySelector("[data-ph-search]");
  var list = root.querySelector("[data-ph-list]");
  var listEmpty = root.querySelector("[data-ph-list-empty]");
  var countEl = root.querySelector("[data-ph-count]");
  var placeholder = root.querySelector("[data-ph-placeholder]");
  var body = root.querySelector("[data-ph-body]");
  var accounts = Array.prototype.slice.call(
    list.querySelectorAll("[data-ph-account]")
  );
  var requestSeq = 0;

  // ── Lọc danh sách bên trái ────────────────────────────────────────
  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  }

  function applyFilter() {
    var q = normalize(searchInput.value);
    var visible = 0;
    accounts.forEach(function (btn) {
      var hay = normalize(btn.getAttribute("data-search"));
      var show = q === "" || hay.indexOf(q) !== -1;
      btn.parentElement.hidden = !show;
      if (show) visible += 1;
    });
    countEl.textContent = String(visible);
    listEmpty.hidden = visible > 0;
  }

  searchInput.addEventListener("input", applyFilter);

  // ── Helpers render ────────────────────────────────────────────────
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function vnd(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n === 0) return "0 ₫";
    return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
  }

  function dt(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  var ORDER_STATUS = {
    APPROVED: { label: "Đã duyệt", cls: "status-positive" },
    PENDING: { label: "Đang duyệt", cls: "status-pending" },
    COMPLETED: { label: "Hoàn thành", cls: "status-positive" },
    CANCELLED: { label: "Đã hủy", cls: "status-negative" },
    INVALID: { label: "Không hợp lệ", cls: "status-negative" },
    REVERSED: { label: "Đảo khoản", cls: "status-negative" },
  };

  function statusBadge(status) {
    var s = ORDER_STATUS[status] || { label: status || "—", cls: "status-neutral" };
    return el("span", "status-badge " + s.cls, s.label);
  }

  function platformName(p) {
    if (p === "TIKTOK") return "TikTok";
    if (p === "LAZADA") return "Lazada";
    return "Shopee";
  }

  function summaryTile(label, value) {
    var tile = el("div", "ph-tile");
    tile.appendChild(el("span", "", label));
    tile.appendChild(el("strong", "", value));
    return tile;
  }

  function buildTable(headers) {
    var wrap = el("div", "responsive-table");
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    headers.forEach(function (h) { tr.appendChild(el("th", "", h)); });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap: wrap, tbody: tbody };
  }

  function refCell(code) {
    var td = document.createElement("td");
    if (code) {
      td.appendChild(el("code", "ph-ref", code));
    } else {
      td.textContent = "—";
    }
    return td;
  }

  function render(data) {
    body.innerHTML = "";

    // Đầu trang: tên + email + mã đối chiếu gốc + tổng quan.
    var head = el("header", "ph-detail-head");
    head.appendChild(el("h2", "", data.user.full_name));
    var sub = el("p", "ph-detail-sub");
    sub.appendChild(el("span", "", data.user.email));
    if (data.user.tracking_code) {
      sub.appendChild(el("span", "ph-detail-code", "Mã người mua: " + data.user.tracking_code));
    }
    head.appendChild(sub);
    body.appendChild(head);

    var orders = data.orders || [];
    var clicks = data.clicks || [];
    var totalCashback = orders.reduce(function (sum, o) {
      return sum + (Number(o.cashback_vnd) || 0);
    }, 0);
    var clicksWithOrder = clicks.filter(function (c) { return c.has_order; }).length;

    var tiles = el("div", "ph-tiles");
    tiles.appendChild(summaryTile("Đơn mua", String(orders.length)));
    tiles.appendChild(summaryTile("Tiền hoàn", vnd(totalCashback)));
    tiles.appendChild(summaryTile("Lượt click", String(clicks.length)));
    tiles.appendChild(summaryTile("Click thành đơn", String(clicksWithOrder)));
    body.appendChild(tiles);

    // ── Lịch sử đơn mua ──────────────────────────────────────────────
    body.appendChild(el("h3", "ph-section-title", "Lịch sử đơn mua"));
    if (orders.length === 0) {
      body.appendChild(el("p", "ph-empty", "Chưa có đơn mua nào được đối soát."));
    } else {
      var ot = buildTable(["Ngày", "Mã đơn sàn", "Mã đối chiếu", "Sản phẩm", "Giá trị", "Hoàn tiền", "Trạng thái"]);
      orders.forEach(function (o) {
        var tr = document.createElement("tr");
        tr.appendChild(el("td", "", dt(o.purchased_at || o.created_at)));
        tr.appendChild(el("td", "", o.platform_order_id ? "#" + o.platform_order_id : "—"));
        tr.appendChild(refCell(o.reference_code));
        var pd = el("td", "ph-product", o.product_name || "—");
        tr.appendChild(pd);
        tr.appendChild(el("td", "", vnd(o.order_amount_vnd)));
        tr.appendChild(el("td", "ph-cashback", "+" + vnd(o.cashback_vnd)));
        var st = document.createElement("td");
        st.appendChild(statusBadge(o.status));
        tr.appendChild(st);
        ot.tbody.appendChild(tr);
      });
      body.appendChild(ot.wrap);
    }

    // ── Lịch sử click đơn ────────────────────────────────────────────
    body.appendChild(el("h3", "ph-section-title", "Lịch sử click đơn"));
    if (clicks.length === 0) {
      body.appendChild(el("p", "ph-empty", "Chưa có lượt bấm mua nào."));
    } else {
      var ct = buildTable(["Thời điểm", "Mã đối chiếu", "Sàn", "Sản phẩm", "Giá", "Hoàn dự kiến", "Mở link", "Thành đơn"]);
      clicks.forEach(function (c) {
        var tr = document.createElement("tr");
        tr.appendChild(el("td", "", dt(c.created_at)));
        tr.appendChild(refCell(c.reference_code));
        tr.appendChild(el("td", "", platformName(c.platform)));
        tr.appendChild(el("td", "ph-product", c.product_name || "—"));
        tr.appendChild(el("td", "", c.product_price_vnd ? vnd(c.product_price_vnd) : "—"));
        tr.appendChild(el("td", "ph-cashback", c.estimated_cashback_vnd ? "+" + vnd(c.estimated_cashback_vnd) : "—"));
        tr.appendChild(el("td", "", String(c.click_count || 0) + " lần"));
        var done = document.createElement("td");
        done.appendChild(
          c.has_order
            ? el("span", "status-badge status-positive", "Có đơn")
            : el("span", "status-badge status-neutral", "Chưa")
        );
        tr.appendChild(done);
        ct.tbody.appendChild(tr);
      });
      body.appendChild(ct.wrap);
    }

    placeholder.hidden = true;
    body.hidden = false;
  }

  // ── Chọn tài khoản → nạp chi tiết ─────────────────────────────────
  async function selectAccount(id, btn) {
    accounts.forEach(function (a) { a.classList.toggle("is-active", a === btn); });
    var seq = ++requestSeq;
    placeholder.hidden = true;
    body.hidden = false;
    body.innerHTML = '<p class="ph-loading">Đang tải lịch sử…</p>';
    try {
      var response = await fetch(endpoint + "/" + id + "/data", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      var data = await response.json();
      if (seq !== requestSeq) return;
      if (!response.ok) throw new Error((data && data.error && data.error.message) || "Lỗi tải dữ liệu.");
      render(data);
    } catch (error) {
      if (seq !== requestSeq) return;
      body.innerHTML = "";
      body.appendChild(el("p", "ph-empty", "Không tải được lịch sử. Thử lại sau."));
    }
  }

  list.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    var btn = target ? target.closest("[data-ph-account]") : null;
    if (btn) selectAccount(btn.getAttribute("data-ph-account"), btn);
  });

  applyFilter();
})();
