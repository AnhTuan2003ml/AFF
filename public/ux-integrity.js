(() => {
  "use strict";

  const schedule = (callback) => window.setTimeout(callback, 0);

  const setupMissionTabs = () => {
    const tabs = Array.from(document.querySelectorAll("[data-mission-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-mission-panel]"));
    if (!tabs.length) return;

    const activate = (activeTab, focus = false) => {
      const target = activeTab.getAttribute("data-mission-tab");
      tabs.forEach((tab) => {
        const selected = tab === activeTab;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(selected));
        tab.removeAttribute("aria-pressed");
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle("active", selected);
      });
      panels.forEach((panel) => {
        panel.setAttribute("role", "tabpanel");
        panel.hidden = panel.getAttribute("data-mission-panel") !== target;
      });
      if (focus && activeTab instanceof HTMLElement) activeTab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const last = tabs.length - 1;
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : (index - 1 + tabs.length) % tabs.length;
        activate(tabs[next], true);
      });
    });
    activate(tabs.find((tab) => tab.classList.contains("active")) ?? tabs[0]);
  };

  const setupMissionProgress = () => {
    document.querySelectorAll(".mission-progress").forEach((progress) => {
      const bar = progress.querySelector(".mission-progress-bar");
      const fill = bar?.querySelector("span");
      const counter = progress.querySelector("small")?.textContent?.trim() ?? "";
      const match = counter.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!(bar instanceof HTMLElement) || !(fill instanceof HTMLElement) || !match) {
        return;
      }
      const value = Number(match[1]);
      const maximum = Math.max(1, Number(match[2]));
      const percent = Math.max(0, Math.min(100, (value / maximum) * 100));
      const widthStep = Math.round(percent / 5) * 5;
      fill.removeAttribute("style");
      Array.from(fill.classList)
        .filter((className) => /^mission-width-\d+$/.test(className))
        .forEach((className) => fill.classList.remove(className));
      fill.classList.add(`mission-width-${widthStep}`);
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(maximum));
      bar.setAttribute("aria-valuenow", String(value));
      bar.setAttribute("aria-valuetext", `${value} trên ${maximum}`);
    });
  };

  const setupFormFeedback = () => {
    document
      .querySelectorAll("[data-validate-form], [data-discover-editor]")
      .forEach((form, formIndex) => {
        if (!(form instanceof HTMLFormElement)) return;
        form.noValidate = true;
        const submit = form.querySelector("[data-submit-button]");
        const dirtyTracked =
          form.hasAttribute("data-dirty-form") ||
          form.getAttribute("action") === "/backoffice/config";
        const savedState = form.querySelector(".config-saved-state");

        const fingerprint = () => {
          const values = [];
          new FormData(form).forEach((value, key) => {
            if (key !== "_csrf") values.push([key, String(value)]);
          });
          return JSON.stringify(values);
        };
        const initialFingerprint = fingerprint();

        const fields = () =>
          Array.from(
            form.querySelectorAll(
              "input[required], select[required], textarea[required]",
            ),
          );

        const ensureError = (field, fieldIndex) => {
          if (!field.id) field.id = `validated-field-${formIndex}-${fieldIndex}`;
          let error = document.getElementById(`${field.id}-error`);
          if (!error) {
            error = document.createElement("small");
            error.id = `${field.id}-error`;
            error.className = "field-error";
            error.hidden = true;
            field.closest("label")?.append(error);
          }
          return error;
        };

        const showError = (field, message, fieldIndex) => {
          const error = ensureError(field, fieldIndex);
          field.classList.toggle("field-invalid", Boolean(message));
          field.setAttribute("aria-invalid", message ? "true" : "false");
          error.textContent = message;
          error.hidden = !message;
          if (message) field.setAttribute("aria-describedby", error.id);
          else field.removeAttribute("aria-describedby");
        };

        const messageFor = (field) => {
          if (field.validity.valueMissing) {
            return field.dataset.requiredMessage || "Trường này là bắt buộc.";
          }
          if (field.validity.rangeUnderflow) {
            return field.dataset.minMessage || "Giá trị thấp hơn mức tối thiểu.";
          }
          if (field.validity.rangeOverflow) {
            return field.dataset.maxMessage || "Giá trị vượt quá mức tối đa.";
          }
          return field.dataset.errorMessage || "Giá trị chưa hợp lệ.";
        };

        const refresh = () => {
          const activeFields = fields().filter((field) => !field.disabled);
          const filled = activeFields.every((field) => {
            if (field instanceof HTMLInputElement && field.type === "checkbox") {
              return field.checked;
            }
            return field.value.trim() !== "";
          });
          const dirty = !dirtyTracked || fingerprint() !== initialFingerprint;
          if (submit instanceof HTMLButtonElement) submit.disabled = !filled || !dirty;
          if (savedState instanceof HTMLElement && dirtyTracked) {
            savedState.textContent = dirty
              ? "Có thay đổi chưa lưu"
              : "Chưa có thay đổi";
            savedState.classList.toggle("is-dirty", dirty);
          }
        };

        fields().forEach((field, fieldIndex) => {
          ensureError(field, fieldIndex);
          field.addEventListener("blur", () => {
            /*
             * Rời ô CHỈ báo lỗi định dạng khi người dùng đã nhập gì đó. Ô còn
             * trống nguyên thì không đỏ — lỗi "bắt buộc" để dành lúc bấm nút
             * gửi. app.js đã theo đúng quy tắc này, còn ở đây thì chưa, nên
             * chỉ cần rời ô email trống là hiện ngay "Vui lòng nhập email".
             *
             * Hệ quả nặng hơn cả chuyện thẩm mỹ: ô email được autofocus, nên
             * cú bấm ĐẦU TIÊN vào link "Tạo tài khoản" làm ô mất focus →
             * dòng lỗi chèn vào → cả khối tụt xuống → con trỏ nhả chuột không
             * còn nằm trên link nữa, click bị nuốt. Phải bấm lần hai mới đi
             * được sang trang đăng ký.
             */
            const hasValue =
              field instanceof HTMLInputElement && field.type === "checkbox"
                ? field.checked
                : String(field.value ?? "").trim().length > 0;
            if (field.disabled || !hasValue || field.checkValidity()) {
              showError(field, "", fieldIndex);
            } else {
              showError(field, messageFor(field), fieldIndex);
            }
          });
        });

        form.addEventListener("input", () => schedule(refresh));
        form.addEventListener("change", () => schedule(refresh));
        form.addEventListener("shoptik:field-sync", () => schedule(refresh));
        form.addEventListener(
          "submit",
          (event) => {
            let firstInvalid = null;
            fields().forEach((field, fieldIndex) => {
              if (field.disabled) {
                showError(field, "", fieldIndex);
                return;
              }
              const valid = field.checkValidity();
              showError(field, valid ? "" : messageFor(field), fieldIndex);
              if (!valid && !firstInvalid) firstInvalid = field;
            });
            if (firstInvalid) {
              event.preventDefault();
              event.stopImmediatePropagation();
              firstInvalid.focus();
            }
          },
          { capture: true },
        );

        const type = form.querySelector("[data-preview-type]");
        const platform = form.querySelector("select[name='platform']");
        const syncProductFields = () => {
          if (
            !(type instanceof HTMLSelectElement) ||
            !(platform instanceof HTMLSelectElement)
          ) {
            return;
          }
          const isProduct = type.value === "PRODUCT";
          platform.disabled = !isProduct;
          platform.required = isProduct;
          if (!isProduct) {
            platform.setCustomValidity("");
            platform.setAttribute("aria-invalid", "false");
          }
          schedule(refresh);
        };
        type?.addEventListener("change", syncProductFields);
        syncProductFields();
        refresh();
      });
  };

  setupMissionTabs();
  setupMissionProgress();
  schedule(setupFormFeedback);
})();
