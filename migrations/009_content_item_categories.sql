BEGIN;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS category text;

UPDATE content_items
SET category = CASE type
  WHEN 'VOUCHER' THEN 'Voucher'
  WHEN 'PRODUCT' THEN 'Nổi bật'
  WHEN 'TRENDING' THEN 'Xu hướng'
  WHEN 'GUIDE' THEN 'Hướng dẫn'
  WHEN 'ANNOUNCEMENT' THEN 'Thông báo'
  ELSE 'Khác'
END
WHERE category IS NULL OR trim(category) = '';

ALTER TABLE content_items
  ALTER COLUMN category SET DEFAULT 'Khác',
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE content_items
  ADD CONSTRAINT content_items_category_check
  CHECK (char_length(trim(category)) BETWEEN 1 AND 80);

CREATE INDEX IF NOT EXISTS content_items_discover_category_idx
  ON content_items (status, category, sort_order, published_at DESC);

COMMIT;
