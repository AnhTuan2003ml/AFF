-- Ảnh/video nền hero trang chủ (px-home-hero-bg) do admin cấu hình: danh sách
-- media (ảnh, GIF hoặc video), mỗi mục là URL ngoài HOẶC tệp tải lên (lưu bytea),
-- kèm thời gian hiển thị (duration_ms) và thứ tự. Frontend xoay vòng theo danh sách.

BEGIN;

CREATE TABLE IF NOT EXISTS hero_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 'image' bao gồm cả GIF (trình duyệt tự chạy); 'video' dùng thẻ <video>.
    kind text NOT NULL CHECK (kind IN ('image', 'video')),
    -- Nguồn: URL ngoài (url) HOẶC tệp tải lên (data + content_type). Đúng một trong hai.
    url text,
    content_type text,
    data bytea,
    -- Thời gian hiển thị mỗi mục (ms). 0.5s–5 phút.
    duration_ms integer NOT NULL DEFAULT 6000
        CHECK (duration_ms BETWEEN 500 AND 300000),
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (url IS NOT NULL OR data IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS hero_media_active_idx
    ON hero_media (active, sort_order, created_at);

COMMIT;
