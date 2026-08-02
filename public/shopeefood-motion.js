(() => {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  body.classList.add("sf-page-enter");

  const requestFrame = (callback) => {
    let queued = false;
    return (...args) => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        callback(...args);
      });
    };
  };

  /* Page scroll progress */
  const progress = doc.createElement("div");
  progress.className = "sf-scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  body.prepend(progress);

  const updateScrollState = requestFrame(() => {
    const scrollTop = window.scrollY || root.scrollTop || 0;
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    const percent = Math.min(100, Math.max(0, (scrollTop / max) * 100));
    progress.style.setProperty("--sf-scroll-progress", `${percent}%`);

    doc.querySelectorAll(".app-topbar, .public-header").forEach((bar) => {
      bar.classList.toggle("sf-topbar-scrolled", scrollTop > 14);
    });
  });

  window.addEventListener("scroll", updateScrollState, { passive: true });
  window.addEventListener("resize", updateScrollState, { passive: true });
  updateScrollState();

  /* Subtle global pointer glow */
  if (finePointer && !reduceMotion) {
    const updatePointer = requestFrame((event) => {
      const x = Math.round((event.clientX / Math.max(1, window.innerWidth)) * 100);
      const y = Math.round((event.clientY / Math.max(1, window.innerHeight)) * 100);
      body.style.setProperty("--sf-pointer-x", `${x}%`);
      body.style.setProperty("--sf-pointer-y", `${y}%`);
    });
    window.addEventListener("pointermove", updatePointer, { passive: true });
  }

  /* Reveal content as it enters the viewport */
  const revealSelector = [
    ".hero-copy",
    ".process-grid > article",
    ".transparency-section > *",
    ".auth-card",
    ".app-editorial-hero",
    ".page-heading",
    ".page-head",
    ".admin-page-heading",
    ".shopping-panel",
    ".recent-panel",
    ".home-guide-card",
    ".wallet-hero",
    ".referral-hero",
    ".discover-hero",
    ".discover-filters",
    ".panel",
    ".chart-panel",
    ".data-panel",
    ".stat-card",
    ".balance-card",
    ".kpi-card",
    ".admin-kpi-card",
    ".buy-card",
    ".withdraw-action",
    ".withdraw-steps",
    ".orders-history-card",
    ".discover-card",
    ".discover-admin-card",
    ".product-grid-card",
    ".mission-card",
    ".bank-visual-card",
    ".info-strip",
    ".warning-strip"
  ].join(",");

  let revealObserver = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("sf-revealed");
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -7% 0px", threshold: 0.08 }
    );
  }

  const prepareReveal = (scope = doc) => {
    const items = scope.matches?.(revealSelector)
      ? [scope]
      : Array.from(scope.querySelectorAll?.(revealSelector) || []);

    items.forEach((item, index) => {
      if (item.classList.contains("sf-reveal-ready")) return;
      item.classList.add("sf-reveal-ready");
      item.style.setProperty("--sf-reveal-delay", `${Math.min(index % 6, 5) * 45}ms`);
      if (revealObserver) revealObserver.observe(item);
      else item.classList.add("sf-revealed");
    });
  };

  prepareReveal();

  /* Hover lift for every visual component */
  const liftSelector = [
    ".process-grid > article",
    ".stat-card",
    ".balance-card",
    ".kpi-card",
    ".admin-kpi-card",
    ".console-card",
    ".ops-card",
    ".platform-tab",
    ".recent-order-row",
    ".orders-history-card",
    ".discover-card",
    ".discover-admin-card",
    ".product-grid-card",
    ".mission-card",
    ".bank-visual-card",
    ".ticket-list > article",
    ".session-list > div",
    ".profile-list > div",
    ".profile-list > a",
    ".mini-audit-list > div",
    ".referral-row",
    ".mission-row"
  ].join(",");

  const prepareLift = (scope = doc) => {
    const items = scope.matches?.(liftSelector)
      ? [scope]
      : Array.from(scope.querySelectorAll?.(liftSelector) || []);
    items.forEach((item) => item.classList.add("sf-hover-lift"));
  };

  prepareLift();

  /* Mouse-follow card tilt; intentionally very subtle */
  const tiltSelector = [
    ".stat-card",
    ".balance-card",
    ".kpi-card",
    ".admin-kpi-card",
    ".platform-tab",
    ".discover-card",
    ".product-grid-card",
    ".mission-card"
  ].join(",");

  const attachTilt = (card) => {
    if (!finePointer || reduceMotion || card.dataset.sfTiltReady === "1") return;
    card.dataset.sfTiltReady = "1";
    card.classList.add("sf-pointer-card");

    const move = requestFrame((event) => {
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      card.style.setProperty("--sf-card-x", `${Math.round(px * 100)}%`);
      card.style.setProperty("--sf-card-y", `${Math.round(py * 100)}%`);
      card.style.setProperty("--sf-card-rx", `${((0.5 - py) * 1.7).toFixed(2)}deg`);
      card.style.setProperty("--sf-card-ry", `${((px - 0.5) * 1.7).toFixed(2)}deg`);
    });

    card.addEventListener("pointermove", move, { passive: true });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--sf-card-rx", "0deg");
      card.style.setProperty("--sf-card-ry", "0deg");
      card.style.setProperty("--sf-card-x", "50%");
      card.style.setProperty("--sf-card-y", "50%");
    });
  };

  const prepareTilt = (scope = doc) => {
    const items = scope.matches?.(tiltSelector)
      ? [scope]
      : Array.from(scope.querySelectorAll?.(tiltSelector) || []);
    items.forEach(attachTilt);
  };

  prepareTilt();

  /* Ripple feedback on buttons and tab-like controls */
  const rippleSelector = [
    ".button",
    "button:not([disabled])",
    ".mode-switch-option",
    ".platform-tab:not([disabled])",
    ".discover-platform-tabs button",
    ".discover-category-tabs button",
    ".filter-tabs button",
    ".mission-tabs button",
    ".mobile-bottom-nav a"
  ].join(",");

  doc.addEventListener("pointerdown", (event) => {
    if (reduceMotion) return;
    const target = event.target.closest(rippleSelector);
    if (!target || target.matches("[disabled], [aria-disabled='true']")) return;

    const rect = target.getBoundingClientRect();
    const ripple = doc.createElement("span");
    ripple.className = "sf-ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    target.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 650);
  });

  /* Internal-scroll awareness and scroll snapping */
  const scrollSelector = [
    ".recent-orders-list",
    ".orders-history-list",
    ".ticket-list",
    ".session-list",
    ".profile-list",
    ".mini-audit-list",
    ".ledger-list",
    ".support-thread",
    ".discover-admin-grid",
    ".product-grid",
    ".mission-grid",
    ".mission-list-scroll",
    ".responsive-table",
    ".share-table-wrap",
    ".ledger-table-wrap"
  ].join(",");

  const updateInternalScroll = (element) => {
    const canScroll = element.scrollHeight - element.clientHeight > 2 || element.scrollWidth - element.clientWidth > 2;
    element.classList.toggle("sf-has-scroll", canScroll);
    element.classList.toggle("sf-at-start", element.scrollTop <= 2 && element.scrollLeft <= 2);
    element.classList.toggle(
      "sf-at-end",
      element.scrollTop + element.clientHeight >= element.scrollHeight - 2 &&
        element.scrollLeft + element.clientWidth >= element.scrollWidth - 2
    );
  };

  const attachInternalScroll = (element) => {
    if (element.dataset.sfScrollReady === "1") return;
    element.dataset.sfScrollReady = "1";
    element.classList.add("sf-scrollable");
    const update = requestFrame(() => updateInternalScroll(element));
    element.addEventListener("scroll", update, { passive: true });
    updateInternalScroll(element);
  };

  const prepareInternalScroll = (scope = doc) => {
    const items = scope.matches?.(scrollSelector)
      ? [scope]
      : Array.from(scope.querySelectorAll?.(scrollSelector) || []);
    items.forEach(attachInternalScroll);
  };

  prepareInternalScroll();

  /* Keep dynamic content styled: product result, notifications, modals, admin rows */
  if ("MutationObserver" in window) {
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          prepareReveal(node);
          prepareLift(node);
          prepareTilt(node);
          prepareInternalScroll(node);
        }
      }
    });
    mutationObserver.observe(body, { childList: true, subtree: true });
  }

  window.addEventListener("resize", requestFrame(() => {
    doc.querySelectorAll(scrollSelector).forEach(updateInternalScroll);
  }), { passive: true });
})();
