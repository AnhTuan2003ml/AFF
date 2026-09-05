-- Mở rộng platform_sync_settings: nguồn cookie (dán tay / lấy từ profile) và
-- kho cookie Lazada (adsense.lazada.vn) song song với Shopee. Cookie vẫn mã hóa
-- AES-256-GCM bằng FIELD_ENCRYPTION_KEY như cột Shopee sẵn có.

ALTER TABLE platform_sync_settings
  ADD COLUMN IF NOT EXISTS shopee_cookie_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (shopee_cookie_source IN ('MANUAL', 'PROFILE')),
  ADD COLUMN IF NOT EXISTS lazada_cookie_ciphertext text,
  ADD COLUMN IF NOT EXISTS lazada_cookie_hint text,
  ADD COLUMN IF NOT EXISTS lazada_cookie_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS lazada_cookie_source text NOT NULL DEFAULT 'PROFILE'
    CHECK (lazada_cookie_source IN ('MANUAL', 'PROFILE'));
