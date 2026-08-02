BEGIN;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS price_vnd bigint,
  ADD COLUMN IF NOT EXISTS original_price_vnd bigint,
  ADD COLUMN IF NOT EXISTS cashback_rate_bps integer;

ALTER TABLE content_items
  ADD CONSTRAINT content_items_price_vnd_check
    CHECK (price_vnd IS NULL OR price_vnd >= 0),
  ADD CONSTRAINT content_items_original_price_vnd_check
    CHECK (original_price_vnd IS NULL OR original_price_vnd >= 0),
  ADD CONSTRAINT content_items_cashback_rate_bps_check
    CHECK (cashback_rate_bps IS NULL OR cashback_rate_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT content_items_platform_check
    CHECK (platform IS NULL OR platform IN ('SHOPEE', 'TIKTOK', 'LAZADA'));

-- "Sản phẩm nổi bật" là một loại nội dung do admin đăng/quản lý, giống
-- Voucher — không còn tự động lấy từ affiliate_links (dữ liệu click người
-- dùng), tránh hiển thị sản phẩm ngoài ý muốn admin.
ALTER TABLE content_items DROP CONSTRAINT content_items_type_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_type_check
  CHECK (type IN ('VOUCHER', 'TRENDING', 'GUIDE', 'ANNOUNCEMENT', 'PRODUCT'));

COMMIT;
