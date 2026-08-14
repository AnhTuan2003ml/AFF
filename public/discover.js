(() => {
  "use strict";

  const page = document.querySelector("[data-discover-page]");
  if (!(page instanceof HTMLElement)) return;

  const cards = Array.from(page.querySelectorAll("[data-discover-card]"));
  const searchInput = page.querySelector("[data-discover-search]");
  const platformButtons = Array.from(
    page.querySelectorAll("[data-discover-platform]"),
  );
  const categoryButtons = Array.from(
    page.querySelectorAll("[data-discover-category]"),
  );
  const emptyState = page.querySelector("[data-discover-filter-empty]");
  const toast = page.querySelector("[data-discover-toast]");

  let activePlatform = "all";
  let activeCategory = "all";
  let toastTimer = null;

  const normalize = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("vi-VN")
      .trim();

  const showToast = (message, tone = "success") => {
    if (!(toast instanceof HTMLElement)) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("is-error", tone === "error");
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  };

  const updatePressedState = (buttons, selected, attribute) => {
    buttons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const active = button.getAttribute(attribute) === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  const applyFilters = () => {
    const query =
      searchInput instanceof HTMLInputElement
        ? normalize(searchInput.value)
        : "";
    let visibleCount = 0;

    cards.forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const platform = card.dataset.platform ?? "";
      const category = card.dataset.category ?? "";
      const matchesPlatform =
        activePlatform === "all" || platform === activePlatform;
      const matchesCategory =
        activeCategory === "all" || category === activeCategory;
      const matchesSearch =
        query === "" || normalize(card.textContent).includes(query);
      const visible = matchesPlatform && matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    if (emptyState instanceof HTMLElement) {
      emptyState.hidden = visibleCount > 0;
    }
  };

  platformButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activePlatform = button.getAttribute("data-discover-platform") ?? "all";
      updatePressedState(
        platformButtons,
        activePlatform,
        "data-discover-platform",
      );
      applyFilters();
    });
  });

  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.getAttribute("data-discover-category") ?? "all";
      updatePressedState(
        categoryButtons,
        activeCategory,
        "data-discover-category",
      );
      applyFilters();
    });
  });

  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener("input", applyFilters);
  }

  const postJson = async (path, body) => {
    const csrf = document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content");
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error?.message || "Hệ thống đang bận. Vui lòng thử lại.",
      );
    }
    return payload;
  };

  // Ủy quyền sự kiện lên khung trang: thẻ "Bán chạy nhất" render động sau
  // vẫn dùng chung luồng mua (preview → purchase → /go/:clickId có subId).
  page.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target ? target.closest("[data-discover-buy]") : null;
    if (button) void handleBuy(button);
  });

  async function handleBuy(button) {
    {
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      const productUrl = button.getAttribute("data-product-url") ?? "";
      const label = button.querySelector("[data-buy-label]");
      if (!productUrl) return;

      const purchaseWindow = window.open("about:blank", "_blank");
      button.disabled = true;
      if (label) label.textContent = "Đang tạo link mua…";

      try {
        const preview = await postJson("/api/v1/products/preview", {
          productUrl,
        });
        const purchase = await postJson("/api/v1/products/purchase", {
          previewId: preview.previewId,
        });
        if (!purchase.buyUrl) {
          throw new Error("Chưa tạo được link mua hoàn tiền.");
        }

        if (purchaseWindow) {
          purchaseWindow.opener = null;
          purchaseWindow.location.href = purchase.buyUrl;
        } else {
          window.location.href = purchase.buyUrl;
        }
        showToast("Đã tạo link mua hoàn tiền và mở sản phẩm trên sàn.");
      } catch (error) {
        if (purchaseWindow) purchaseWindow.close();
        showToast(
          error instanceof Error
            ? error.message
            : "Không thể tạo link mua. Vui lòng thử lại.",
          "error",
        );
      } finally {
        button.disabled = false;
        if (label) label.textContent = "Mua & Nhận Hoàn Tiền";
      }
    }
  }

  // "error" không bubble — bắt ở capture phase để ảnh render động cũng có
  // fallback.
  page.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      if (!image.hasAttribute("data-discover-image") || image.dataset.fallback) {
        return;
      }
      image.dataset.fallback = "true";
      image.src = "/assets/images/logo.png";
      image.classList.add("is-placeholder");
    },
    true,
  );

  applyFilters();
})();
