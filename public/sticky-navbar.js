// Ghim thanh menu ngang (.commerce-navbar-wrap) khi cuộn qua khỏi vị trí gốc.
//
// Hai vấn đề cần giải quyết cùng lúc:
// 1) Phần tử này nằm trong .commerce-hero (chỉ cao ~180-300px) nên
//    position:sticky bị giới hạn trong đúng khối cha đó, không dính được
//    suốt trang — phải tự đo vị trí gốc rồi chuyển sang position:fixed.
// 2) .commerce-hero có isolation:isolate (tạo ngữ cảnh xếp lớp riêng) nên
//    dù nav đã fixed, nó vẫn bị "nhốt" trong đúng lớp của .commerce-hero —
//    nội dung .app-content đứng sau trong DOM vẫn vẽ đè lên trên. Chỉ đổi
//    position không đủ; phải CHUYỂN HẲN node ra khỏi .commerce-hero (vào
//    cuối <body>) lúc ghim, rồi trả lại đúng chỗ cũ (ngay trước ô đệm) lúc
//    bỏ ghim.
(() => {
  const nav = document.querySelector("[data-sticky-navbar]");
  if (!(nav instanceof HTMLElement)) return;

  const spacer = document.createElement("div");
  spacer.className = "commerce-navbar-spacer";
  spacer.setAttribute("aria-hidden", "true");
  nav.after(spacer);

  let originalTop = null;
  let pinned = false;

  const measure = () => {
    if (pinned) return;
    originalTop = nav.getBoundingClientRect().top + window.scrollY;
  };

  const update = () => {
    if (originalTop === null) return;
    const shouldPin = window.scrollY >= originalTop;
    if (shouldPin === pinned) return;
    pinned = shouldPin;

    if (pinned) {
      spacer.style.height = `${nav.offsetHeight}px`;
      nav.classList.add("is-pinned");
      document.body.appendChild(nav);
    } else {
      nav.classList.remove("is-pinned");
      spacer.before(nav);
      spacer.style.height = "0";
    }
  };

  measure();
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    update();
  });
})();
