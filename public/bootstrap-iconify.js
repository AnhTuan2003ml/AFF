(() => {
  "use strict";

  const sprite = "/assets/bootstrap-icons.svg";
  const icon = (name, className = "sf-auto-icon") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `bi ${className}`);
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `${sprite}#${name}`);
    svg.appendChild(use);
    return svg;
  };

  const actionIcons = [
    [/đăng nhập/i, "box-arrow-in-right"],
    [/đăng xuất/i, "box-arrow-right"],
    [/tạo tài khoản|đăng ký|thêm người/i, "person-plus"],
    [/gửi.*otp|gửi mã|gửi yêu cầu|gửi$/i, "send"],
    [/tra cứu|tìm kiếm|tìm sản phẩm|tìm$/i, "search"],
    [/mua ngay/i, "bag-check"],
    [/rút tiền/i, "cash-coin"],
    [/lưu|xác nhận|duyệt/i, "check2-circle"],
    [/từ chối|hủy/i, "x-circle"],
    [/xóa/i, "trash3"],
    [/sửa|cập nhật/i, "pencil-square"],
    [/thêm|tạo mới/i, "plus-lg"],
    [/tải|xuất/i, "download"],
    [/nhập file|tải lên/i, "cloud-arrow-up"],
    [/làm mới|thử lại/i, "arrow-repeat"],
    [/xem tất cả|xem chi tiết|tiếp tục/i, "arrow-right"],
    [/quay lại/i, "arrow-left"]
  ];

  const headingIcons = [
    [/đăng nhập/i, "box-arrow-in-right"],
    [/tạo tài khoản|đăng ký/i, "person-plus"],
    [/mật khẩu|bảo mật/i, "shield-lock"],
    [/tìm|tra cứu/i, "search"],
    [/đơn/i, "receipt"],
    [/ví|số dư|doanh thu/i, "wallet2"],
    [/rút/i, "cash-coin"],
    [/ngân hàng/i, "bank"],
    [/giới thiệu/i, "share"],
    [/nhiệm vụ/i, "list-task"],
    [/hỗ trợ/i, "headset"],
    [/khám phá|nội dung/i, "compass"],
    [/người dùng|tài khoản/i, "people"],
    [/cấu hình/i, "gear"],
    [/nhật ký/i, "journal-text"],
    [/tổng quan/i, "grid"]
  ];

  const matchIcon = (text, rules) => {
    for (const [pattern, name] of rules) if (pattern.test(text)) return name;
    return null;
  };

  const enhanceActions = (scope = document) => {
    const nodes = scope.querySelectorAll(".button, button[type='submit'], .account-dropdown a, .account-dropdown button, .entry-promo-cta");
    nodes.forEach((node) => {
      if (node.dataset.sfIconified === "1" || node.querySelector("svg")) return;
      const text = (node.textContent || "").trim();
      const name = matchIcon(text, actionIcons);
      if (!name) return;
      node.prepend(icon(name));
      node.classList.add("sf-iconified");
      node.dataset.sfIconified = "1";
      if (!node.title) node.title = text;
    });
  };

  const enhanceHeadings = (scope = document) => {
    const nodes = scope.querySelectorAll(".page-heading h1, .admin-page-heading h1, .auth-heading h1, .auth-heading h2");
    nodes.forEach((heading) => {
      if (heading.dataset.sfHeadingIcon === "1") return;
      const text = (heading.textContent || "").trim();
      const name = matchIcon(text, headingIcons);
      if (!name) return;
      const wrap = document.createElement("span");
      wrap.className = "sf-heading-icon";
      wrap.appendChild(icon(name, "st-icon"));
      heading.prepend(wrap);
      heading.classList.add("sf-heading-with-icon");
      heading.dataset.sfHeadingIcon = "1";
    });
  };

  const enhanceTooltips = (scope = document) => {
    scope.querySelectorAll(".app-nav a, .backoffice-nav a, .mobile-bottom-nav a, .mobile-bottom-nav button, .notification-trigger, .theme-toggle").forEach((node) => {
      if (!node.title) {
        const text = (node.textContent || node.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        if (text) node.title = text;
      }
    });
  };

  const run = (scope = document) => {
    enhanceActions(scope);
    enhanceHeadings(scope);
    enhanceTooltips(scope);
  };

  run();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) run(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
