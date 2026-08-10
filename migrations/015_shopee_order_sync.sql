BEGIN;

-- Cấu hình đồng bộ báo cáo chuyển đổi từ sàn (bảng đơn dòng - singleton).
-- Cookie đăng nhập Affiliate là bí mật: luôn lưu dạng mã hóa AES-256-GCM
-- bằng FIELD_ENCRYPTION_KEY, chỉ hiển thị gợi ý (hint) ở giao diện admin.
CREATE TABLE platform_sync_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    shopee_enabled boolean NOT NULL DEFAULT false,
    shopee_cookie_ciphertext text,
    shopee_cookie_hint text,
    shopee_cookie_updated_at timestamptz,
    shopee_interval_minutes integer NOT NULL DEFAULT 60
        CHECK (shopee_interval_minutes BETWEEN 5 AND 1440),
    shopee_lookback_days integer NOT NULL DEFAULT 30
        CHECK (shopee_lookback_days BETWEEN 1 AND 180),
    shopee_last_run_at timestamptz,
    shopee_last_success_at timestamptz,
    shopee_last_status text
        CHECK (shopee_last_status IS NULL
            OR shopee_last_status IN ('SUCCESS', 'PARTIAL', 'ERROR')),
    shopee_last_error text,
    shopee_last_fetched_count integer NOT NULL DEFAULT 0,
    shopee_last_imported_count integer NOT NULL DEFAULT 0,
    shopee_last_failed_count integer NOT NULL DEFAULT 0,
    updated_by uuid REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trạng thái gốc của sàn + mốc thời gian hoàn thành để tính ngày giải ngân.
-- Tiền hoàn chỉ chuyển từ ví CHỜ sang KHẢ DỤNG khi đã qua `cashback_hold_days`
-- tính từ lúc đơn Hoàn thành; `cashback_released_at` đánh dấu đã giải ngân.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS completed_at timestamptz,
    ADD COLUMN IF NOT EXISTS cashback_available_at timestamptz,
    ADD COLUMN IF NOT EXISTS cashback_released_at timestamptz,
    ADD COLUMN IF NOT EXISTS external_status text,
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS cashback_revision integer NOT NULL DEFAULT 0
        CHECK (cashback_revision >= 0);

-- Đơn đã duyệt trước khi có cơ chế giữ tiền coi như đã giải ngân xong.
UPDATE orders
SET cashback_released_at = COALESCE(approved_at, updated_at),
    cashback_available_at = COALESCE(approved_at, updated_at),
    completed_at = COALESCE(completed_at, approved_at)
WHERE status = 'APPROVED' AND cashback_released_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_cashback_release_idx
    ON orders (cashback_available_at)
    WHERE status = 'APPROVED' AND cashback_released_at IS NULL;

COMMIT;
