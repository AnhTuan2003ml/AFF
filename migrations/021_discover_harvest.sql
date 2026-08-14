-- Lấy sản phẩm đề xuất từ Shopee Affiliate bằng profile trình duyệt:
-- worker Playwright chạy trên máy host, đăng nhập bằng profile riêng, mở
-- https://affiliate.shopee.vn/offer/product_offer và gọi
-- api/v3/offer/product/list, gửi response về server để đổ vào trang Khám phá.

-- Nội dung Khám phá cần phân biệt bài admin tự đăng và bài máy tự nhập.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS external_key text;

ALTER TABLE content_items
  ADD CONSTRAINT content_items_source_check
  CHECK (source IN ('MANUAL', 'SHOPEE_AUTO'));

CREATE UNIQUE INDEX IF NOT EXISTS content_items_external_key_idx
  ON content_items (external_key)
  WHERE external_key IS NOT NULL;

-- Mỗi profile là một thư mục trình duyệt bền vững phía worker; server chỉ
-- giữ định danh + trạng thái, KHÔNG giữ cookie hay dữ liệu đăng nhập.
CREATE TABLE harvest_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
    status text NOT NULL DEFAULT 'NEEDS_LOGIN'
        CHECK (status IN ('NEEDS_LOGIN', 'READY', 'DISABLED')),
    last_login_at timestamptz,
    last_fetch_at timestamptz,
    last_status text,
    last_error text,
    last_fetched_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES users(id)
);

-- Hàng đợi lệnh cho worker: LOGIN mở cửa sổ đăng nhập, FETCH lấy sản phẩm.
CREATE TABLE harvest_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES harvest_profiles(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('LOGIN', 'FETCH')),
    status text NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'ERROR')),
    error text,
    requested_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz
);

CREATE INDEX harvest_jobs_pending_idx
  ON harvest_jobs (status, created_at)
  WHERE status IN ('PENDING', 'RUNNING');

-- Cấu hình singleton (đúng 1 dòng, id luôn = true), theo mẫu
-- platform_sync_settings.
CREATE TABLE harvest_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled boolean NOT NULL DEFAULT false,
    interval_minutes integer NOT NULL DEFAULT 360
        CHECK (interval_minutes BETWEEN 15 AND 10080),
    pages integer NOT NULL DEFAULT 3 CHECK (pages BETWEEN 1 AND 10),
    page_limit integer NOT NULL DEFAULT 20 CHECK (page_limit BETWEEN 10 AND 50),
    max_items integer NOT NULL DEFAULT 60 CHECK (max_items BETWEEN 10 AND 200),
    worker_last_seen_at timestamptz,
    last_run_at timestamptz,
    last_status text,
    last_error text,
    last_imported_count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES users(id)
);
