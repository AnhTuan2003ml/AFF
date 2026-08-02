/**
 * Tương tác khung giao diện dùng chung: sidebar, theme, menu tài khoản,
 * hiện/ẩn mật khẩu, sao chép, flash, khóa nút submit, nhập CSV.
 *
 * Luồng tra cứu + mua hoàn tiền nằm riêng ở /assets/purchase.js
 * (chỉ được nạp tại màn hình chính /app).
 */
(() => {
  "use strict";

  const body = document.body;

  /**
   * Hộp thoại overlay của ShopTik — thay thế hoàn toàn alert()/confirm()
   * của trình duyệt. Trả về Promise<boolean> (confirm) hoặc Promise<void>.
   */
  const openDialog = ({
    title,
    message,
    confirmText = "Đồng ý",
    cancelText = "Hủy",
    showCancel = true,
    danger = false,
  }) =>
    new Promise((resolve) => {
      const scrim = document.createElement("div");
      scrim.className = "st-dialog-scrim";
      const dialog = document.createElement("div");
      dialog.className = "st-dialog";
      dialog.setAttribute("role", showCancel ? "dialog" : "alertdialog");
      dialog.setAttribute("aria-modal", "true");

      const icon = document.createElement("span");
      icon.className = `st-dialog-icon${danger ? " is-danger" : ""}`;
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = danger ? "!" : "?";

      const heading = document.createElement("h2");
      heading.id = `st-dialog-title-${Date.now()}`;
      heading.textContent = title;
      dialog.setAttribute("aria-labelledby", heading.id);

      const copy = document.createElement("p");
      copy.textContent = message;

      const actions = document.createElement("div");
      actions.className = "st-dialog-actions";

      const close = (result) => {
        document.removeEventListener("keydown", onKey, true);
        scrim.classList.add("is-closing");
        window.setTimeout(() => scrim.remove(), 140);
        resolve(result);
      };

      const onKey = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(false);
        }
      };

      if (showCancel) {
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "st-dialog-cancel";
        cancelButton.textContent = cancelText;
        cancelButton.addEventListener("click", () => close(false));
        actions.append(cancelButton);
      }

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = `st-dialog-confirm${danger ? " is-danger" : ""}`;
      confirmButton.textContent = confirmText;
      confirmButton.addEventListener("click", () => close(true));
      actions.append(confirmButton);

      dialog.append(icon, heading, copy, actions);
      scrim.append(dialog);
      scrim.addEventListener("click", (event) => {
        if (event.target === scrim && showCancel) close(false);
      });
      document.addEventListener("keydown", onKey, true);
      body.append(scrim);
      confirmButton.focus();
    });

  const confirmDialog = (message, options = {}) =>
    openDialog({
      title: options.title ?? "Xác nhận thao tác",
      message,
      confirmText: options.confirmText ?? "Đồng ý",
      danger: options.danger ?? false,
    });

  const alertDialog = (message, title = "Thông báo") =>
    openDialog({
      title,
      message,
      confirmText: "Đã hiểu",
      showCancel: false,
    });

  const resetSubmitButtons = () => {
    document.querySelectorAll("[data-submit-button]").forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const initialHtml =
        button.dataset.initialHtml ??
        button.dataset.originalHtml ??
        button.innerHTML;
      button.dataset.initialHtml = initialHtml;
      button.dataset.originalHtml = initialHtml;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = initialHtml;
    });
  };

  const sidebar = document.querySelector("[data-sidebar]");
  // Có 2 nút đóng: "×" trong sidebar và lớp phủ .sidebar-scrim che cả màn
  // hình (bấm ra ngoài). Trước đây dùng querySelector (chỉ khớp phần tử đầu
  // tiên) nên lớp phủ không có sự kiện — bấm ra ngoài không đóng được.
  const scrimButtons = document.querySelectorAll("[data-sidebar-close]");

  const openSidebar = () => {
    if (!sidebar) return;
    sidebar.classList.add("open");
    scrimButtons.forEach((el) => el.classList.add("open"));
    body.classList.add("no-scroll");
  };

  const closeSidebar = () => {
    sidebar?.classList.remove("open");
    scrimButtons.forEach((el) => el.classList.remove("open"));
    body.classList.remove("no-scroll");
  };

  document
    .querySelectorAll("[data-sidebar-open]")
    .forEach((button) => button.addEventListener("click", openSidebar));
  scrimButtons.forEach((el) => el.addEventListener("click", closeSidebar));

  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  const isDarkNow = () =>
    root.getAttribute("data-theme") === "dark" ||
    (!root.hasAttribute("data-theme") && prefersDark.matches);

  const applyTheme = (theme) => {
    if (theme !== "light" && theme !== "dark") return;
    root.setAttribute("data-theme", theme);
    document
      .querySelectorAll("[data-theme-toggle]")
      .forEach((b) => {
        const dark = String(theme === "dark");
        b.setAttribute("aria-pressed", dark);
        b.setAttribute("aria-checked", dark);
      });
  };

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const dark = String(isDarkNow());
    button.setAttribute("aria-pressed", dark);
    button.setAttribute("aria-checked", dark);
    button.addEventListener("click", () => {
      const next = isDarkNow() ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem("aff-theme", next);
      } catch (e) {}
    });
  });

  // Giữ theme nhất quán giữa các tab đang mở và khi quay lại từ bfcache —
  // trước đây đổi theme ở tab này thì tab khác vẫn giữ theme cũ.
  window.addEventListener("storage", (event) => {
    if (event.key === "aff-theme") applyTheme(event.newValue);
  });
  window.addEventListener("pageshow", () => {
    try {
      const saved = localStorage.getItem("aff-theme");
      if (saved) applyTheme(saved);
    } catch (e) {}
    resetSubmitButtons();
  });
  resetSubmitButtons();

  const menuTrigger = document.querySelector("[data-menu-trigger]");
  const accountMenu = document.querySelector("[data-menu]");
  menuTrigger?.addEventListener("click", () => {
    const isOpen = accountMenu?.classList.toggle("open") ?? false;
    menuTrigger.setAttribute("aria-expanded", String(isOpen));
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target instanceof Node &&
      !menuTrigger?.contains(target) &&
      !accountMenu?.contains(target)
    ) {
      accountMenu?.classList.remove("open");
      menuTrigger?.setAttribute("aria-expanded", "false");
    }
  });

  const missionTabButtons = document.querySelectorAll("[data-mission-tab]");
  if (missionTabButtons.length) {
    const missionPanels = document.querySelectorAll("[data-mission-panel]");
    missionTabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.getAttribute("data-mission-tab");
        missionTabButtons.forEach((btn) => {
          const isActive = btn === button;
          btn.classList.toggle("active", isActive);
          btn.setAttribute("aria-pressed", String(isActive));
        });
        missionPanels.forEach((panel) => {
          panel.hidden = panel.getAttribute("data-mission-panel") !== target;
        });
      });
    });
  }

  const notificationTrigger = document.querySelector("[data-notification-trigger]");
  const notificationPanel = document.querySelector("[data-notification-panel]");
  const notificationBadge = document.querySelector("[data-notification-badge]");
  notificationTrigger?.addEventListener("click", () => {
    const isOpen = notificationPanel?.classList.toggle("open") ?? false;
    notificationTrigger.setAttribute("aria-expanded", String(isOpen));
    if (isOpen && notificationBadge) {
      notificationBadge.remove();
      const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? "";
      fetch("/app/notifications/mark-read", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      }).catch(() => {});
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target instanceof Node &&
      !notificationTrigger?.contains(target) &&
      !notificationPanel?.contains(target)
    ) {
      notificationPanel?.classList.remove("open");
      notificationTrigger?.setAttribute("aria-expanded", "false");
    }
  });

  // Ảnh sản phẩm lấy từ link chia sẻ có thể đã hỏng/hết hạn — rơi về ảnh
  // placeholder thay vì để trình duyệt hiện icon ảnh vỡ mặc định.
  document.querySelectorAll("[data-product-thumb]").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    img.addEventListener(
      "error",
      () => {
        img.src = "/assets/images/logo.png";
        img.classList.add("is-placeholder");
      },
      { once: true },
    );
  });

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.parentElement?.querySelector("[data-password]");
      if (!(field instanceof HTMLInputElement)) return;
      const showing = field.type === "text";
      field.type = showing ? "password" : "text";
      button.textContent = showing ? "Hiện" : "Ẩn";
      button.setAttribute(
        "aria-label",
        showing ? "Hiện mật khẩu" : "Ẩn mật khẩu",
      );
    });
  });

  document.querySelectorAll("[data-copy-button]").forEach((button) => {
    button.addEventListener("click", async () => {
      const container = button.closest(".copy-field") ?? button.parentElement;
      const source = container?.querySelector("[data-copy-source]");
      if (!(source instanceof HTMLInputElement)) return;
      try {
        await navigator.clipboard.writeText(source.value);
        const oldText = button.textContent;
        button.textContent = "Đã sao chép";
        window.setTimeout(() => {
          button.textContent = oldText;
        }, 1800);
      } catch {
        source.select();
        document.execCommand("copy");
      }
    });
  });

  const dismissFlash = (flash) => {
    if (!(flash instanceof HTMLElement)) return;
    flash.classList.add("is-hiding");
    window.setTimeout(() => flash.remove(), 220);
  };
  // Desktop: chỉ thông báo thành công tự đóng (lỗi/thông tin giữ lại góc
  // dưới phải để người dùng đọc kỹ). Mobile: mọi loại đều tự biến mất vì
  // thông báo che giữa màn hình, không nên đọng lại lâu.
  const isMobileViewport = () => window.matchMedia("(max-width: 640px)").matches;
  document.querySelectorAll("[data-flash]").forEach((flash) => {
    if (flash.classList.contains("flash-success") || isMobileViewport()) {
      window.setTimeout(() => dismissFlash(flash), 3500);
    }
  });
  document.querySelectorAll("[data-dismiss-flash]").forEach((button) => {
    button.addEventListener("click", () => {
      dismissFlash(button.closest("[data-flash]"));
    });
  });

  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const submit = form.querySelector("[data-submit-button]");
      if (!(submit instanceof HTMLButtonElement)) return;
      if (!submit.dataset.initialHtml) submit.dataset.initialHtml = submit.innerHTML;
      window.requestAnimationFrame(() => {
        if (event.defaultPrevented) {
          submit.disabled = false;
          submit.innerHTML = submit.dataset.initialHtml ?? submit.innerHTML;
          return;
        }
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
        submit.innerHTML = "Đang xử lý…";
      });
    });
  });

  // Form có [data-validate-form]: nút xác nhận disabled khi còn trống trường
  // bắt buộc; báo lỗi tiếng Việt ngay dưới từng trường thay vì tooltip mặc
  // định của trình duyệt. Dùng lại các ràng buộc HTML sẵn có (required,
  // pattern, min, max, minlength) làm nguồn kiểm tra — chỉ đổi cách hiển thị.
  function fieldErrorMessage(field) {
    const v = field.validity;
    if (v.valueMissing) {
      return field.dataset.requiredMessage || "Trường này là bắt buộc.";
    }
    if (v.patternMismatch || v.typeMismatch) {
      return field.dataset.patternMessage || "Giá trị chưa đúng định dạng.";
    }
    if (v.rangeUnderflow) {
      return (
        field.dataset.minMessage ||
        `Giá trị tối thiểu là ${Number(field.min).toLocaleString("vi-VN")}.`
      );
    }
    if (v.rangeOverflow) {
      return (
        field.dataset.maxMessage ||
        `Giá trị tối đa là ${Number(field.max).toLocaleString("vi-VN")}.`
      );
    }
    if (v.tooShort) {
      return (
        field.dataset.minlengthMessage ||
        `Cần ít nhất ${field.minLength} ký tự.`
      );
    }
    return field.dataset.errorMessage || "Trường này chưa hợp lệ.";
  }

  document.querySelectorAll("[data-validate-form]").forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    const submit = form.querySelector("[data-submit-button]");
    const requiredFields = Array.from(
      form.querySelectorAll("input[required], select[required], textarea[required]"),
    );

    const showFieldError = (field, message) => {
      const errorEl = field.id ? document.getElementById(`${field.id}-error`) : null;
      field.classList.toggle("field-invalid", Boolean(message));
      field.setAttribute("aria-invalid", message ? "true" : "false");
      if (errorEl) {
        errorEl.textContent = message || "";
        errorEl.hidden = !message;
      }
    };

    const updateSubmitState = () => {
      const filled = requiredFields.every((field) => {
        if (field instanceof HTMLSelectElement) return field.value !== "";
        if (field instanceof HTMLInputElement && field.type === "checkbox") {
          return field.checked;
        }
        return field.value.trim().length > 0;
      });
      if (submit instanceof HTMLButtonElement) submit.disabled = !filled;
    };

    requiredFields.forEach((field) => {
      field.addEventListener("input", () => {
        updateSubmitState();
        if (field.classList.contains("field-invalid") && field.checkValidity()) {
          showFieldError(field, "");
        }
      });
      field.addEventListener("change", updateSubmitState);
      field.addEventListener("blur", () => {
        if (!field.checkValidity()) showFieldError(field, fieldErrorMessage(field));
      });
    });
    updateSubmitState();

    // form.reset() (vd. modal dùng lại cho nhiều dòng) không tự xóa lỗi cũ —
    // xóa thủ công để không hiển thị lỗi của lượt mở trước.
    form.addEventListener("reset", () => {
      requiredFields.forEach((field) => showFieldError(field, ""));
      window.setTimeout(updateSubmitState, 0);
    });

    form.addEventListener("submit", (event) => {
      let firstInvalid = null;
      requiredFields.forEach((field) => {
        const valid = field.checkValidity();
        showFieldError(field, valid ? "" : fieldErrorMessage(field));
        if (!valid && !firstInvalid) firstInvalid = field;
      });
      if (firstInvalid) {
        event.preventDefault();
        firstInvalid.focus();
      }
    });
  });

  // Ô nhập tiền VNĐ dùng chung toàn app: ô người dùng thấy có phân tách
  // hàng nghìn (data-currency-input), ô ẩn cùng tên thật gửi lên server luôn
  // là số nguyên thuần (data-currency-raw). Áp dụng cho mọi ô tiền — rút
  // tiền, cấu hình nghiệp vụ, giá sản phẩm Khám phá... chỉ cần gắn đúng cặp
  // thuộc tính, không cần thêm JS riêng cho từng trang.
  document.querySelectorAll("[data-currency-input]").forEach((displayInput) => {
    if (!(displayInput instanceof HTMLInputElement)) return;
    const container = displayInput.closest("label") ?? displayInput.parentElement;
    const rawInput = container?.querySelector("[data-currency-raw]");
    if (!(rawInput instanceof HTMLInputElement)) return;

    const formatter = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 0,
    });
    const min = Number(displayInput.dataset.currencyMin ?? 0);
    const max = Number(displayInput.dataset.currencyMax ?? Number.MAX_SAFE_INTEGER);
    const step = Number(displayInput.dataset.currencyStep ?? 1);

    const digitsOnly = (value) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

    const validationMessage = (amount, digits) => {
      if (!digits) return "";
      if (!Number.isSafeInteger(amount)) return "Số tiền chưa hợp lệ.";
      if (amount < min) {
        return displayInput.dataset.minMessage || "Số tiền thấp hơn mức tối thiểu.";
      }
      if (amount > max) {
        return displayInput.dataset.maxMessage || "Số tiền vượt quá hạn mức cho phép.";
      }
      if (step > 1 && amount % step !== 0) {
        return displayInput.dataset.stepMessage || "Số tiền chưa đúng bước quy định.";
      }
      return "";
    };

    const syncValue = () => {
      const digits = digitsOnly(displayInput.value);
      const amount = digits ? Number(digits) : 0;
      const message = validationMessage(amount, digits);

      rawInput.value = digits;
      displayInput.value = digits ? formatter.format(amount) : "";
      displayInput.dataset.errorMessage = message;
      displayInput.setCustomValidity(message);
    };

    // Capture giúp định dạng và cập nhật validity trước bộ kiểm tra form
    // dùng chung (data-validate-form) phía trên.
    displayInput.addEventListener("input", syncValue, { capture: true });
    const form = displayInput.closest("form");
    form?.addEventListener("submit", syncValue, { capture: true });
    form?.addEventListener("reset", () => {
      // Ô ẩn (raw) reset về value gốc trong HTML (giá trị đã lưu), không
      // phải rỗng — nạp lại vào ô hiển thị trước khi định dạng lại.
      window.setTimeout(() => {
        if (!displayInput.value && rawInput.value) {
          displayInput.value = rawInput.value;
        }
        syncValue();
      }, 0);
    });

    // Trang có thể render sẵn giá trị đã lưu vào ô ẩn (raw) — nạp vào ô
    // hiển thị trước khi định dạng lần đầu, không để mất giá trị cũ.
    if (!displayInput.value && rawInput.value) {
      displayInput.value = rawInput.value;
    }
    syncValue();
  });

  // Hỏi xác nhận bằng overlay (capture phase để chặn cả handler khóa nút
  // submit cho tới khi người dùng đồng ý).
  document.querySelectorAll("[data-confirm-form]").forEach((form) => {
    form.addEventListener(
      "submit",
      (event) => {
        if (form.dataset.stConfirmed === "1") {
          delete form.dataset.stConfirmed;
          return;
        }
        const submitter = event.submitter;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        // Handler khóa nút submit có thể đã chạy trước — mở lại trong lúc hỏi.
        const submit = form.querySelector("[data-submit-button]");
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
          if (submit.dataset.initialHtml) {
            submit.innerHTML = submit.dataset.initialHtml;
          }
        }
        const message =
          form.getAttribute("data-confirm-message") ??
          "Bạn có chắc muốn tiếp tục?";
        const danger = Boolean(form.querySelector(".button-danger"));
        void confirmDialog(message, { danger }).then((accepted) => {
          if (!accepted) return;
          form.dataset.stConfirmed = "1";
          if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
            form.requestSubmit(submitter);
          } else {
            form.requestSubmit();
          }
        });
      },
      { capture: true },
    );
  });

  document.querySelectorAll("[data-select-all]").forEach((master) => {
    if (!(master instanceof HTMLInputElement)) return;
    const group = master.getAttribute("data-select-all");
    if (!group) return;
    const items = () =>
      Array.from(document.querySelectorAll(`[data-select-item="${group}"]`)).filter(
        (item) => item instanceof HTMLInputElement && !item.disabled,
      );
    const updateMaster = () => {
      const checkboxes = items();
      const checked = checkboxes.filter((item) => item.checked);
      master.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
      master.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
    };
    master.addEventListener("change", () => {
      items().forEach((item) => {
        item.checked = master.checked;
      });
      updateMaster();
    });
    items().forEach((item) => item.addEventListener("change", updateMaster));
    updateMaster();
  });

  const csvFile = document.querySelector("[data-csv-file]");
  const csvTarget = document.querySelector("[data-csv-target]");
  const fileName = document.querySelector("[data-file-name]");
  csvFile?.addEventListener("change", async () => {
    if (
      !(csvFile instanceof HTMLInputElement) ||
      !(csvTarget instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    const file = csvFile.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) {
      void alertDialog(
        "File CSV vượt quá 64 KB. Hãy chia nhỏ báo cáo rồi nhập từng phần.",
        "File quá lớn",
      );
      csvFile.value = "";
      return;
    }
    csvTarget.value = await file.text();
    if (fileName) fileName.textContent = file.name;
  });

  // Nút bật/tắt một panel theo id (vd: mở khối "Nhập báo cáo" ở backoffice).
  document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(
        button.getAttribute("data-panel-toggle") ?? "",
      );
      if (!target) return;
      target.hidden = !target.hidden;
      if (!target.hidden) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        target.querySelector("input, textarea, select")?.focus();
      }
    });
  });

  // Panel dạng modal (st-dialog-scrim tĩnh có id, vd "Nhập báo cáo"): bấm ra
  // ngoài nội dung hoặc nhấn Esc để đóng, không ảnh hưởng panel bật/tắt khác.
  document.querySelectorAll(".st-dialog-scrim[id]").forEach((scrim) => {
    scrim.addEventListener("click", (event) => {
      if (event.target === scrim) scrim.hidden = true;
    });
  });

  // Server có thể yêu cầu mở sẵn một panel/modal sau khi redirect lại vì lỗi
  // (vd: nộp form tạo tài khoản thất bại) — ?open=<id-phần-tử>.
  const openTarget = new URLSearchParams(window.location.search).get("open");
  if (openTarget) {
    const panel = document.getElementById(openTarget);
    if (panel) {
      panel.hidden = false;
      panel.querySelector("input, textarea, select")?.focus();
    }
  }

  // Menu ba chấm theo từng dòng bảng. Khi mở, menu được đưa ra ngoài vùng
  // cuộn của bảng và neo trực tiếp vào nút đã chọn. Mỗi lần cuộn bảng, cuộn
  // trang hoặc đổi kích thước cửa sổ, vị trí được tính lại để menu luôn đi
  // cùng đúng tài khoản thay vì đứng yên và đè lên dòng khác.
  let activeRowMenu = null;
  let activeRowMenuTrigger = null;
  let rowMenuFrame = 0;

  function restoreRowMenu(menu) {
    if (!(menu instanceof HTMLElement)) return;
    const triggerId = menu.getAttribute("data-row-menu-owner");
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    const home = trigger?.closest(".row-menu");
    menu.classList.remove("row-menu-portal");
    menu.removeAttribute("data-row-menu-owner");
    menu.style.removeProperty("top");
    menu.style.removeProperty("left");
    menu.style.removeProperty("max-height");
    menu.style.removeProperty("min-width");
    if (home) home.append(menu);
  }

  function closeAllRowMenus() {
    if (rowMenuFrame) cancelAnimationFrame(rowMenuFrame);
    rowMenuFrame = 0;
    document.querySelectorAll("[data-row-menu]").forEach((menu) => {
      menu.hidden = true;
      restoreRowMenu(menu);
    });
    document
      .querySelectorAll("[data-row-menu-trigger]")
      .forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
    activeRowMenu = null;
    activeRowMenuTrigger = null;
  }

  function positionActiveRowMenu() {
    rowMenuFrame = 0;
    if (
      !(activeRowMenu instanceof HTMLElement) ||
      !(activeRowMenuTrigger instanceof HTMLElement) ||
      activeRowMenu.hidden ||
      !activeRowMenuTrigger.isConnected
    ) {
      return;
    }

    const triggerRect = activeRowMenuTrigger.getBoundingClientRect();
    const tableViewport = activeRowMenuTrigger.closest(".responsive-table");
    const viewportRect = tableViewport?.getBoundingClientRect();
    const outsideWindow =
      triggerRect.bottom < 0 ||
      triggerRect.top > window.innerHeight ||
      triggerRect.right < 0 ||
      triggerRect.left > window.innerWidth;
    const outsideTable =
      viewportRect &&
      (triggerRect.bottom < viewportRect.top ||
        triggerRect.top > viewportRect.bottom ||
        triggerRect.right < viewportRect.left ||
        triggerRect.left > viewportRect.right);
    if (outsideWindow || outsideTable) {
      closeAllRowMenus();
      return;
    }

    const gap = 6;
    const edge = 10;
    const preferredWidth = Math.max(210, activeRowMenu.offsetWidth || 0);
    activeRowMenu.style.minWidth = `${preferredWidth}px`;
    const menuHeight = Math.min(activeRowMenu.scrollHeight, window.innerHeight - edge * 2);
    const roomBelow = window.innerHeight - triggerRect.bottom - edge;
    const roomAbove = triggerRect.top - edge;
    const openAbove = roomBelow < Math.min(menuHeight, 220) && roomAbove > roomBelow;
    const top = openAbove
      ? Math.max(edge, triggerRect.top - menuHeight - gap)
      : Math.min(window.innerHeight - menuHeight - edge, triggerRect.bottom + gap);
    const left = Math.max(
      edge,
      Math.min(triggerRect.right - preferredWidth, window.innerWidth - preferredWidth - edge),
    );

    activeRowMenu.dataset.placement = openAbove ? "top" : "bottom";
    activeRowMenu.style.top = `${Math.max(edge, top)}px`;
    activeRowMenu.style.left = `${left}px`;
    activeRowMenu.style.maxHeight = `${window.innerHeight - edge * 2}px`;
  }

  function scheduleRowMenuPosition() {
    if (!activeRowMenu || rowMenuFrame) return;
    rowMenuFrame = requestAnimationFrame(positionActiveRowMenu);
  }

  document.querySelectorAll("[data-row-menu-trigger]").forEach((trigger, index) => {
    if (!(trigger instanceof HTMLElement)) return;
    if (!trigger.id) trigger.id = `row-menu-trigger-${index + 1}`;
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const home = trigger.closest(".row-menu");
      const menu = home?.querySelector(":scope > [data-row-menu]");
      if (!(menu instanceof HTMLElement)) return;
      const willOpen = menu.hidden || activeRowMenu !== menu;
      closeAllRowMenus();
      if (!willOpen) return;

      menu.setAttribute("data-row-menu-owner", trigger.id);
      menu.classList.add("row-menu-portal");
      const menuPortal = document.querySelector(".backoffice-shell") ?? document.body;
      menuPortal.append(menu);
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      activeRowMenu = menu;
      activeRowMenuTrigger = trigger;
      positionActiveRowMenu();
    });
  });

  window.addEventListener("resize", scheduleRowMenuPosition, { passive: true });
  window.addEventListener("scroll", scheduleRowMenuPosition, {
    passive: true,
    capture: true,
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (activeRowMenu?.contains(event.target) || activeRowMenuTrigger?.contains(event.target)) {
      return;
    }
    closeAllRowMenus();
  });

  // Nút hỗ trợ nổi (gộp Zalo/Telegram): bấm ra ngoài hoặc Esc để đóng panel.
  const supportFab = document.querySelector("[data-support-fab]");
  const supportFabTrigger = document.querySelector("[data-support-fab-trigger]");
  const supportFabPanel = document.querySelector("[data-support-fab-panel]");
  const supportFabDismiss = document.querySelector("[data-support-fab-dismiss]");
  const closeSupportFab = () => {
    if (supportFabPanel instanceof HTMLElement) supportFabPanel.hidden = true;
    supportFabTrigger?.setAttribute("aria-expanded", "false");
  };
  let isDraggingFab = false;
  let dragMovedFab = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const moveFab = (clientX, clientY) => {
    if (!(supportFab instanceof HTMLElement)) return;
    const width = supportFab.offsetWidth || 60;
    const height = supportFab.offsetHeight || 60;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, clientX - dragOffsetX));
    const top = Math.max(12, Math.min(window.innerHeight - height - 12, clientY - dragOffsetY));
    supportFab.style.left = `${left}px`;
    supportFab.style.top = `${top}px`;
    supportFab.style.right = "auto";
    supportFab.style.bottom = "auto";
  };
  supportFabTrigger?.addEventListener("pointerdown", (event) => {
    if (!(supportFab instanceof HTMLElement)) return;
    isDraggingFab = true;
    dragMovedFab = false;
    const rect = supportFab.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    supportFab.classList.add("is-dragging");
    supportFabTrigger.setPointerCapture?.(event.pointerId);
  });
  supportFabTrigger?.addEventListener("pointermove", (event) => {
    if (!isDraggingFab) return;
    dragMovedFab = true;
    moveFab(event.clientX, event.clientY);
  });
  const stopFabDrag = () => {
    isDraggingFab = false;
    if (supportFab instanceof HTMLElement) supportFab.classList.remove("is-dragging");
  };
  supportFabTrigger?.addEventListener("pointerup", (event) => {
    const wasDragged = dragMovedFab;
    stopFabDrag();
    if (wasDragged) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    if (!(supportFabPanel instanceof HTMLElement)) return;
    const willOpen = supportFabPanel.hidden;
    supportFabPanel.hidden = !willOpen;
    supportFabTrigger.setAttribute("aria-expanded", String(willOpen));
  });
  supportFabTrigger?.addEventListener("pointercancel", stopFabDrag);
  supportFabDismiss?.addEventListener("click", closeSupportFab);
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (supportFab && !supportFab.contains(event.target)) closeSupportFab();
  });

  // Modal xác nhận hành động tài khoản dùng chung (khóa / đổi quyền / xóa):
  // nút trong menu ba chấm điền tên, email, action URL rồi mở modal tương
  // ứng — chỉ 1 modal cho mỗi loại hành động, không lặp theo từng dòng.
  document.querySelectorAll("[data-open-account-modal]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      closeAllRowMenus();
      const type = trigger.getAttribute("data-open-account-modal");
      const modal = document.getElementById(`${type}-account-modal`);
      if (!modal) return;
      const userId = trigger.getAttribute("data-user-id") ?? "";
      const userName = trigger.getAttribute("data-user-name") ?? "";
      const userEmail = trigger.getAttribute("data-user-email") ?? "";
      const nameField = modal.querySelector("[data-modal-target-name]");
      if (nameField) nameField.textContent = `${userName} · ${userEmail}`;
      const form = modal.querySelector("[data-account-action-form]");
      if (form instanceof HTMLFormElement) {
        form.reset();
        const endpoint = type === "lock" ? "status" : type;
        form.action = `/backoffice/accounts/${userId}/${endpoint}`;
      }
      if (type === "role") {
        const roleSelect = modal.querySelector("select[name='role']");
        if (roleSelect instanceof HTMLSelectElement) {
          roleSelect.value = trigger.getAttribute("data-user-role") ?? "USER";
        }
      }
      modal.hidden = false;
      modal.querySelector("textarea, select, input:not([type=hidden])")?.focus();
    });
  });

  // Hiện form nhập lý do từ chối của từng dòng đơn.
  document.querySelectorAll("[data-row-reject-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(
        button.getAttribute("data-row-reject-toggle") ?? "",
      );
      if (!target) return;
      target.hidden = !target.hidden;
      if (!target.hidden) target.querySelector("input[name='reason']")?.focus();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
      accountMenu?.classList.remove("open");
      closeAllRowMenus();
      closeSupportFab();
      document.querySelectorAll(".st-dialog-scrim[id]").forEach((scrim) => {
        if (!scrim.hidden) scrim.hidden = true;
      });
    }
  });

  // Popup voucher nổi bật giờ dùng script riêng, độc lập, đặt ngay trong
  // views/app/dashboard/voucher-popup.njk — không còn xử lý ở đây nữa.

  // Trang Khám phá: lọc theo loại nội dung ngay trên danh sách đã tải sẵn,
  // không cần gọi lại server (danh sách ngắn, đã fetch đủ 1 lần).
  document.querySelectorAll("[data-discover-filter]").forEach((nav) => {
    const buttons = Array.from(nav.querySelectorAll("[data-discover-filter-value]"));
    const items = document.querySelectorAll("[data-discover-item]");
    const emptyState = document.querySelector("[data-discover-empty]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.getAttribute("data-discover-filter-value");
        buttons.forEach((other) => other.classList.toggle("active", other === button));
        let visibleCount = 0;
        items.forEach((item) => {
          const matches = value === "ALL" || item.getAttribute("data-discover-type") === value;
          item.hidden = !matches;
          if (matches) visibleCount += 1;
        });
        if (emptyState) emptyState.hidden = visibleCount > 0;
      });
    });
  });

  // Gợn mặt nước dùng cho TOÀN SITE (app, quản trị, trang công khai) — trước
  // đây chỉ bật khi có .dv13-commerce-shell (chỉ tồn tại ở /app/*) nên
  // desktop quản trị/trang công khai không có hiệu ứng gì. Gắn lớp hiệu ứng
  // thẳng vào <body> (không phải shell) để tránh bị "nhốt" trong ngữ cảnh
  // xếp lớp riêng (isolation:isolate) của .commerce-hero — cùng lỗi từng
  // gặp với thanh menu ghim. Lớp hiệu ứng không nhận chuột; rê chuột tạo vệt
  // nhỏ, chạm nền tạo vòng lớn và nút có vòng phản hồi nằm gọn bên trong. Tự
  // tắt khi hệ điều hành yêu cầu giảm chuyển động.
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!reduceMotion) {
    const waterLayer = document.createElement("div");
    waterLayer.className = "commerce-water-layer";
    waterLayer.setAttribute("aria-hidden", "true");
    body.appendChild(waterLayer);

    const animateRipple = (ripple, keyframes, options) => {
      if (typeof ripple.animate !== "function") {
        ripple.remove();
        return;
      }
      ripple
        .animate(keyframes, options)
        .finished.catch(() => undefined)
        .finally(() => ripple.remove());
    };

    const createWaterRipple = (x, y, kind, delay = 0) => {
      const ripple = document.createElement("span");
      ripple.className = `commerce-water-ripple commerce-water-ripple-${kind}`;
      waterLayer.appendChild(ripple);
      const base = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      const isSplash = kind === "splash";
      animateRipple(
        ripple,
        [
          {
            opacity: isSplash ? 0.72 : 0.42,
            transform: `${base} scale(0.1)`,
          },
          {
            opacity: isSplash ? 0.34 : 0.16,
            offset: 0.52,
            transform: `${base} scale(0.68)`,
          },
          { opacity: 0, transform: `${base} scale(1)` },
        ],
        {
          duration: isSplash ? 1080 : 760,
          delay,
          easing: "cubic-bezier(.16,.78,.2,1)",
          fill: "both",
        },
      );
    };

    const createSplash = (x, y) => {
      createWaterRipple(x, y, "splash");
      createWaterRipple(x, y, "splash", 105);
      createWaterRipple(x, y, "splash", 210);
    };

    const createControlRipple = (target, x, y) => {
      if (target.matches("[disabled], [aria-disabled='true']")) return;
      // .commerce-water-control chỉ cần overflow:hidden để gợn sóng không
      // tràn ra ngoài nút — KHÔNG được tự ý đổi position, vì nhiều nút (như
      // nút Đóng của popup quảng cáo) đã dùng position:absolute để neo đúng
      // góc; ép về relative sẽ làm nó rơi về đầu luồng tài liệu (nhảy sang
      // góc trái). Chỉ thêm position:relative khi phần tử đang là static.
      if (getComputedStyle(target).position === "static") {
        target.style.position = "relative";
      }
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "commerce-control-water-ripple";
      target.classList.add("commerce-water-control");
      target.appendChild(ripple);
      const base = `translate3d(${Math.round(x - rect.left)}px, ${Math.round(y - rect.top)}px, 0) translate(-50%, -50%)`;
      animateRipple(
        ripple,
        [
          { opacity: 0.68, transform: `${base} scale(0.1)` },
          { opacity: 0.28, offset: 0.46, transform: `${base} scale(10)` },
          { opacity: 0, transform: `${base} scale(22)` },
        ],
        {
          duration: 760,
          easing: "cubic-bezier(.18,.72,.2,1)",
          fill: "forwards",
        },
      );
    };

    const finePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    ).matches;
    let wakeFrame = 0;
    let lastWakeAt = 0;
    let lastWakeX = -100;
    let lastWakeY = -100;

    window.addEventListener(
      "pointermove",
      (event) => {
        if (!finePointer || event.pointerType !== "mouse" || wakeFrame) return;
        wakeFrame = window.requestAnimationFrame(() => {
          wakeFrame = 0;
          const now = performance.now();
          const distance = Math.hypot(
            event.clientX - lastWakeX,
            event.clientY - lastWakeY,
          );
          if (now - lastWakeAt < 58 || distance < 14) return;
          lastWakeAt = now;
          lastWakeX = event.clientX;
          lastWakeY = event.clientY;
          createWaterRipple(event.clientX, event.clientY, "wake");
        });
      },
      { passive: true },
    );

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const control = event.target.closest("button, a, [role='button']");
        if (control instanceof HTMLElement) {
          createControlRipple(control, event.clientX, event.clientY);
          createSplash(event.clientX, event.clientY);
          return;
        }
        if (!event.target.closest("input, select, textarea, label")) {
          createSplash(event.clientX, event.clientY);
        }
      },
      { passive: true },
    );
  }
})();
