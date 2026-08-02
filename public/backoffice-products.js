(() => {
  "use strict";

  const form = document.querySelector("[data-discover-editor]");
  if (!(form instanceof HTMLFormElement)) return;

  const typeInput = form.querySelector("[data-preview-type]");
  const titleInput = form.querySelector("[data-preview-title]");
  const descriptionInput = form.querySelector("[data-preview-description]");
  const badgeInput = form.querySelector("[data-preview-badge]");
  const categoryInput = form.querySelector("[data-preview-category]");
  const imageUrlInput = form.querySelector("[data-preview-image-url]");
  const imageFileInput = form.querySelector("[data-preview-image-file]");
  const selectedFile = form.querySelector("[data-selected-file]");

  const card = form.querySelector("[data-preview-card]");
  const previewImage = form.querySelector("[data-preview-image]");
  const previewPlaceholder = form.querySelector("[data-preview-placeholder]");
  const previewTypeLabel = form.querySelector("[data-preview-type-label]");
  const previewCategoryLabel = form.querySelector("[data-preview-category-label]");
  const previewBadgeLabel = form.querySelector("[data-preview-badge-label]");
  const previewTitleLabel = form.querySelector("[data-preview-title-label]");
  const previewDescriptionLabel = form.querySelector(
    "[data-preview-description-label]",
  );

  const typeMeta = {
    VOUCHER: { label: "Voucher", symbol: "％", className: "preview-voucher" },
    PRODUCT: { label: "Sản phẩm nổi bật", symbol: "▣", className: "preview-product" },
    TRENDING: { label: "Xu hướng", symbol: "↗", className: "preview-trending" },
    GUIDE: { label: "Hướng dẫn", symbol: "◎", className: "preview-guide" },
    ANNOUNCEMENT: {
      label: "Thông báo",
      symbol: "!",
      className: "preview-announcement",
    },
  };

  const productFields = form.querySelector("[data-product-fields]");
  const targetUrlHint = form.querySelector("[data-target-url-hint]");
  const targetUrlProductNote = form.querySelector(
    "[data-target-url-product-note]",
  );

  let fileObjectUrl = null;

  const setText = (target, value, fallback) => {
    if (target instanceof HTMLElement) {
      target.textContent = value.trim() || fallback;
    }
  };

  const setPreviewImage = (src) => {
    if (!(previewImage instanceof HTMLImageElement)) return;
    if (!(previewPlaceholder instanceof HTMLElement)) return;

    if (!src) {
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewPlaceholder.hidden = false;
      return;
    }

    previewImage.src = src;
    previewImage.hidden = false;
    previewPlaceholder.hidden = true;
  };

  const updateTextPreview = () => {
    const type =
      typeInput instanceof HTMLSelectElement ? typeInput.value : "VOUCHER";
    const meta = typeMeta[type] ?? typeMeta.VOUCHER;

    if (card instanceof HTMLElement) {
      Object.values(typeMeta).forEach((item) =>
        card.classList.remove(item.className),
      );
      card.classList.add(meta.className);
    }

    setText(previewTypeLabel, meta.label, "Voucher");
    setText(
      previewCategoryLabel,
      categoryInput instanceof HTMLInputElement ? categoryInput.value : "",
      "Danh mục",
    );
    if (previewPlaceholder instanceof HTMLElement) {
      const symbol = previewPlaceholder.querySelector("span");
      if (symbol instanceof HTMLElement) symbol.textContent = meta.symbol;
    }

    setText(
      previewTitleLabel,
      titleInput instanceof HTMLInputElement ? titleInput.value : "",
      "Tiêu đề nội dung",
    );
    setText(
      previewDescriptionLabel,
      descriptionInput instanceof HTMLTextAreaElement
        ? descriptionInput.value
        : "",
      "Mô tả sẽ hiển thị ở đây để bạn kiểm tra bố cục trước khi đăng.",
    );

    if (previewBadgeLabel instanceof HTMLElement) {
      const badge =
        badgeInput instanceof HTMLInputElement ? badgeInput.value.trim() : "";
      previewBadgeLabel.textContent = badge;
      previewBadgeLabel.hidden = badge.length === 0;
    }

    // Chỉ "Sản phẩm nổi bật" mới cần sàn/giá/hoa hồng — các loại khác ẩn đi
    // để form gọn, và đổi ghi chú đường dẫn cho đúng ngữ cảnh.
    const isProduct = type === "PRODUCT";
    if (productFields instanceof HTMLElement) {
      productFields.hidden = !isProduct;
      productFields
        .querySelectorAll("[data-product-field]")
        .forEach((field) => {
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
            field.disabled = !isProduct;
          }
        });
    }
    if (targetUrlHint instanceof HTMLElement) targetUrlHint.hidden = isProduct;
    if (targetUrlProductNote instanceof HTMLElement) {
      targetUrlProductNote.hidden = !isProduct;
    }
  };

  const updateImageFromInputs = () => {
    const file =
      imageFileInput instanceof HTMLInputElement
        ? imageFileInput.files?.[0]
        : null;

    if (file) {
      if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
      fileObjectUrl = URL.createObjectURL(file);
      setPreviewImage(fileObjectUrl);
      if (selectedFile instanceof HTMLElement) {
        selectedFile.textContent = file.name;
      }
      return;
    }

    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
      fileObjectUrl = null;
    }

    const imageUrl =
      imageUrlInput instanceof HTMLInputElement
        ? imageUrlInput.value.trim()
        : "";
    setPreviewImage(imageUrl);
    if (selectedFile instanceof HTMLElement) {
      selectedFile.textContent = "Chưa chọn file";
    }
  };

  [typeInput, titleInput, descriptionInput, badgeInput, categoryInput].forEach((element) => {
    element?.addEventListener("input", updateTextPreview);
    element?.addEventListener("change", updateTextPreview);
  });

  imageUrlInput?.addEventListener("input", updateImageFromInputs);
  imageFileInput?.addEventListener("change", updateImageFromInputs);

  if (previewImage instanceof HTMLImageElement) {
    previewImage.addEventListener("error", () => {
      previewImage.hidden = true;
      if (previewPlaceholder instanceof HTMLElement) {
        previewPlaceholder.hidden = false;
      }
    });
  }

  document.querySelectorAll("[data-admin-content-image]").forEach((image) => {
    image.addEventListener("error", () => {
      if (!(image instanceof HTMLImageElement) || image.dataset.fallback) return;
      image.dataset.fallback = "true";
      image.src = "/assets/images/logo.png";
      image.classList.add("is-placeholder");
    });
  });

  window.addEventListener("beforeunload", () => {
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
  });

  updateTextPreview();
  updateImageFromInputs();

  // Sửa nội dung: bấm "Sửa" trên 1 thẻ → nạp dữ liệu vào lại đúng form đăng
  // mới, đổi action sang route sửa riêng của bài đó, xem trước cập nhật
  // ngay như đang tạo mới. "Hủy sửa" đưa form về trạng thái tạo mới.
  const targetUrlInput = form.querySelector("input[name='targetUrl']");
  const sortOrderInput = form.querySelector("input[name='sortOrder']");
  const platformInput = form.querySelector("select[name='platform']");
  // priceVnd/originalPriceVnd giờ là ô ẩn (data-currency-raw) — phải nạp
  // giá trị vào đúng Ô HIỂN THỊ (data-currency-input) cạnh nó rồi bắn sự
  // kiện input để app.js tự định dạng lại và đồng bộ ngược về ô ẩn.
  const priceVndRaw = form.querySelector("input[name='priceVnd']");
  const priceVndDisplay = priceVndRaw
    ?.closest("label")
    ?.querySelector("[data-currency-input]");
  const originalPriceVndRaw = form.querySelector(
    "input[name='originalPriceVnd']",
  );
  const originalPriceVndDisplay = originalPriceVndRaw
    ?.closest("label")
    ?.querySelector("[data-currency-input]");
  const cashbackRatePercentInput = form.querySelector(
    "input[name='cashbackRatePercent']",
  );
  const modeLabel = document.querySelector("[data-editor-mode-label]");
  const modeTitle = document.querySelector("[data-editor-mode-title]");
  const submitButton = form.querySelector("[data-editor-mode-submit]");
  const cancelEditButton = document.querySelector(
    "[data-editor-cancel-edit]",
  );
  const createAction = form.dataset.createAction || form.action;

  const setValue = (input, value) => {
    if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
      input.value = value ?? "";
    }
  };

  const setCurrencyValue = (displayInput, value) => {
    if (!(displayInput instanceof HTMLInputElement)) return;
    displayInput.value = value ?? "";
    displayInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const enterEditMode = (button) => {
    const data = button.dataset;
    setValue(typeInput, data.editType);
    // Bật/tắt (un-disable) đúng nhóm field theo loại MỚI trước — nếu không,
    // giá bán/giá gốc có thể vẫn đang disabled từ lần trước, set value vào
    // đó không hiển thị đúng khi field bật lại.
    updateTextPreview();
    setValue(titleInput, data.editTitle);
    if (descriptionInput instanceof HTMLTextAreaElement) {
      descriptionInput.value = data.editDescription ?? "";
    }
    setValue(badgeInput, data.editBadge);
    setValue(categoryInput, data.editCategory);
    setValue(targetUrlInput, data.editTargetUrl);
    setValue(imageUrlInput, data.editImageUrl);
    setValue(sortOrderInput, data.editSortOrder || "0");
    setValue(platformInput, data.editPlatform);
    setCurrencyValue(priceVndDisplay, data.editPriceVnd);
    setCurrencyValue(originalPriceVndDisplay, data.editOriginalPriceVnd);
    setValue(cashbackRatePercentInput, data.editCashbackRatePercent);
    if (imageFileInput instanceof HTMLInputElement) imageFileInput.value = "";

    form.action = `/backoffice/products/${data.editId}/edit`;
    form.dataset.editingId = data.editId;
    if (modeLabel) modeLabel.textContent = "ĐANG SỬA";
    if (modeTitle) modeTitle.textContent = `Sửa: ${data.editTitle}`;
    if (submitButton) submitButton.textContent = "Cập nhật nội dung";
    if (cancelEditButton instanceof HTMLElement) cancelEditButton.hidden = false;

    updateTextPreview();
    updateImageFromInputs();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    titleInput?.focus();
  };

  const exitEditMode = () => {
    form.reset();
    delete form.dataset.editingId;
    form.action = createAction;
    if (modeLabel) modeLabel.textContent = "ĐĂNG MỚI";
    if (modeTitle) modeTitle.textContent = "Thêm nội dung Khám phá";
    if (submitButton) submitButton.textContent = "Đăng nội dung";
    if (cancelEditButton instanceof HTMLElement) cancelEditButton.hidden = true;
    updateTextPreview();
    updateImageFromInputs();
  };

  document.querySelectorAll("[data-edit-content]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button instanceof HTMLElement) enterEditMode(button);
    });
  });
  cancelEditButton?.addEventListener("click", exitEditMode);
})();
