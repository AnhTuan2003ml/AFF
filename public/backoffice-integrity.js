(() => {
  "use strict";
  if (!document.querySelector(".backoffice-shell")) return;

  const roleLabels = {
    SUPER_ADMIN: "Quản trị cao nhất",
    ADMIN: "Quản trị viên",
    SUPPORT: "Chăm sóc khách hàng",
    FINANCE: "Tài chính",
    RISK: "Rủi ro & an toàn",
    AUDITOR: "Kiểm toán",
    USER: "Thành viên",
  };
  const role = document.querySelector(".account-copy small");
  if (role instanceof HTMLElement) {
    role.textContent = roleLabels[role.textContent.trim()] ?? role.textContent;
  }

  if (window.location.pathname === "/backoffice/missions") {
    document.querySelectorAll(".mission-card-done").forEach((card) => {
      card.classList.remove("mission-card-done");
      card.classList.add("mission-card-active");
    });
  }
})();
