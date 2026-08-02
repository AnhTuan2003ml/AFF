(() => {
  "use strict";

  const form = document.querySelector("[data-discover-editor]");
  if (!(form instanceof HTMLFormElement)) return;

  form.setAttribute("data-validate-form", "");
  form.noValidate = true;

  const categoryInputOriginal = form.querySelector("[data-preview-category]");
  if (categoryInputOriginal instanceof HTMLInputElement) {
    const categoryOptions = [
      "Voucher",
      "Điện tử",
      "Mỹ phẩm",
      "Gia dụng",
      "Thời trang",
      "Sách",
      "Ăn uống",
      "Mẹ & Bé",
      "Du lịch",
      "Nổi bật",
      "Khác",
    ];
    const select = document.createElement("select");
    select.id = categoryInputOriginal.id || "discover-category-input";
    select.name = categoryInputOriginal.name;
    select.required = true;
    select.setAttribute("data-preview-category", "");
    select.dataset.requiredMessage = "Vui lòng chọn danh mục.";
    select.append(new Option("— Chọn danh mục —", ""));
    categoryOptions.forEach((value) => select.append(new Option(value, value)));
    if (
      categoryInputOriginal.value &&
      !categoryOptions.includes(categoryInputOriginal.value)
    ) {
      select.append(
        new Option(categoryInputOriginal.value, categoryInputOriginal.value),
      );
    }
    select.value = categoryInputOriginal.value;
    categoryInputOriginal.replaceWith(select);
  }

  const typeInput = form.querySelector("[data-preview-type]");
  const categoryInput = form.querySelector("[data-preview-category]");
  const categoryPreview = form.querySelector("[data-preview-category-label]");
  const platformInput = form.querySelector("select[name='platform']");
  if (platformInput instanceof HTMLSelectElement) {
    platformInput.id ||= "discover-platform-input";
    platformInput.required = true;
    platformInput.disabled =
      !(typeInput instanceof HTMLSelectElement) ||
      typeInput.value !== "PRODUCT";
    platformInput.dataset.requiredMessage = "Vui lòng chọn sàn cho sản phẩm.";
  }

  const salePriceInput = form
    .querySelector("input[name='priceVnd']")
    ?.closest("label")
    ?.querySelector("[data-currency-input]");
  const originalPriceInput = form
    .querySelector("input[name='originalPriceVnd']")
    ?.closest("label")
    ?.querySelector("[data-currency-input]");
  if (salePriceInput instanceof HTMLInputElement) {
    salePriceInput.id ||= "discover-price-input";
  }
  if (originalPriceInput instanceof HTMLInputElement) {
    originalPriceInput.id ||= "discover-original-price-input";
  }
  let originalPriceError = document.getElementById(
    "discover-original-price-input-error",
  );
  if (
    !originalPriceError &&
    originalPriceInput instanceof HTMLInputElement
  ) {
    originalPriceError = document.createElement("small");
    originalPriceError.id = "discover-original-price-input-error";
    originalPriceError.className = "field-error";
    originalPriceError.hidden = true;
    originalPriceInput.closest("label")?.append(originalPriceError);
  }

  const updateCategoryPreview = () => {
    if (
      !(categoryPreview instanceof HTMLElement) ||
      !(
        categoryInput instanceof HTMLInputElement ||
        categoryInput instanceof HTMLSelectElement
      )
    ) {
      return;
    }
    categoryPreview.textContent = categoryInput.value || "Danh mục";
  };

  const currencyAmount = (input) => {
    if (!(input instanceof HTMLInputElement)) return null;
    const digits = input.value.replace(/\D/g, "");
    return digits ? Number(digits) : null;
  };

  const validatePriceRelation = ({ show = false } = {}) => {
    if (!(originalPriceInput instanceof HTMLInputElement)) return true;
    const isProduct =
      typeInput instanceof HTMLSelectElement && typeInput.value === "PRODUCT";
    const salePrice = currencyAmount(salePriceInput);
    const originalPrice = currencyAmount(originalPriceInput);
    const relationMessage =
      isProduct &&
      salePrice !== null &&
      originalPrice !== null &&
      originalPrice < salePrice
        ? "Giá gốc phải lớn hơn hoặc bằng giá bán."
        : "";
    const message = relationMessage || originalPriceInput.dataset.errorMessage || "";

    originalPriceInput.setCustomValidity(message);
    originalPriceInput.classList.toggle(
      "field-invalid",
      Boolean(message) && show,
    );
    originalPriceInput.setAttribute(
      "aria-invalid",
      String(Boolean(message) && show),
    );
    if (originalPriceError instanceof HTMLElement) {
      originalPriceError.textContent = show ? message : "";
      originalPriceError.hidden = !show || !message;
      if (message) {
        originalPriceInput.setAttribute(
          "aria-describedby",
          originalPriceError.id,
        );
      } else {
        originalPriceInput.removeAttribute("aria-describedby");
      }
    }
    return !message;
  };

  categoryInput?.addEventListener("input", () =>
    queueMicrotask(updateCategoryPreview),
  );
  categoryInput?.addEventListener("change", () =>
    queueMicrotask(updateCategoryPreview),
  );
  salePriceInput?.addEventListener("input", () =>
    validatePriceRelation({ show: true }),
  );
  originalPriceInput?.addEventListener("input", () =>
    validatePriceRelation({ show: true }),
  );
  originalPriceInput?.addEventListener("blur", () =>
    validatePriceRelation({ show: true }),
  );
  typeInput?.addEventListener("change", () => {
    validatePriceRelation();
    queueMicrotask(() =>
      form.dispatchEvent(new Event("shoptik:field-sync")),
    );
  });

  form.addEventListener(
    "submit",
    (event) => {
      if (validatePriceRelation({ show: true })) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (originalPriceInput instanceof HTMLInputElement) {
        originalPriceInput.focus();
      }
    },
    { capture: true },
  );

  updateCategoryPreview();
  validatePriceRelation();
})();
