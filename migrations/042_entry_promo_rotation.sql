BEGIN;

-- Mỗi nội dung/sản phẩm có thể được admin chọn vào kho quảng cáo popup.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS entry_promo_enabled boolean NOT NULL DEFAULT false;

-- Giữ nguyên quảng cáo thủ công đang hiển thị và đưa kho Đề xuất hiện có vào
-- vòng xoay ngay sau khi deploy. Admin có thể bỏ chọn từng mục ở backoffice.
UPDATE content_items
SET entry_promo_enabled = true
WHERE status = 'PUBLISHED'
  AND COALESCE(NULLIF(trim(image_url), ''), '') <> '';

CREATE INDEX IF NOT EXISTS content_items_entry_promo_pool_idx
  ON content_items (status, entry_promo_enabled, published_at DESC)
  WHERE entry_promo_enabled = true;

-- Singleton giữ quảng cáo hiện tại để mọi người dùng nhận cùng một sản phẩm
-- trong suốt chu kỳ. Hết chu kỳ, request đầu tiên sẽ chọn ngẫu nhiên mục mới.
CREATE TABLE entry_promo_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  rotation_minutes integer NOT NULL DEFAULT 180
    CHECK (rotation_minutes BETWEEN 15 AND 10080),
  current_content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  current_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

INSERT INTO entry_promo_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
