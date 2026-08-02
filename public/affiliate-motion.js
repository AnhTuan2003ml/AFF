(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.add("js-ui-stable");

  function initLoadingButtons() {
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.matches("[data-no-loading], [target='_blank']")) return;

      const submitter = event.submitter;
      if (!(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement)) return;

      requestAnimationFrame(() => {
        if (event.defaultPrevented || !form.checkValidity()) return;
        submitter.classList.add("is-ui-loading");
        submitter.setAttribute("aria-busy", "true");
      });
    });

    window.addEventListener("pageshow", () => {
      document.querySelectorAll(".is-ui-loading").forEach((element) => {
        element.classList.remove("is-ui-loading");
        element.removeAttribute("aria-busy");
      });
    });
  }

  function initSupportFab() {
    const trigger = document.querySelector("[data-support-fab-trigger]");
    const panel = document.querySelector("[data-support-fab-panel]");
    const dismiss = document.querySelector("[data-support-fab-dismiss]");

    if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

    const close = () => {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };

    trigger.addEventListener("click", () => {
      const shouldOpen = panel.hidden;
      panel.hidden = !shouldOpen;
      trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    });

    dismiss?.addEventListener("click", close);

    document.addEventListener("click", (event) => {
      if (panel.hidden) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || trigger.contains(target)) return;
      close();
    });
  }

  function initSidebarState() {
    const shells = document.querySelectorAll(".app-shell, .backoffice-shell");
    const openButtons = document.querySelectorAll("[data-sidebar-open]");
    const closeButtons = document.querySelectorAll("[data-sidebar-close]");

    if (!shells.length) return;

    const setOpen = (value) => {
      shells.forEach((shell) => shell.classList.toggle("sidebar-open", value));
      document.body.classList.toggle("sidebar-is-open", value);
    };

    openButtons.forEach((button) => button.addEventListener("click", () => setOpen(true)));
    closeButtons.forEach((button) => button.addEventListener("click", () => setOpen(false)));

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1100) setOpen(false);
    });
  }

  function init() {
    // Reveal content immediately. No observer, clipping or 3D tilt.
    document.querySelectorAll("[data-ui-reveal]").forEach((element) => {
      element.classList.add("is-ui-visible");
    });

    initLoadingButtons();
    initSupportFab();
    initSidebarState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
