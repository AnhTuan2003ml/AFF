-- Mục "Bán chạy nhất" (list_type=2) trên trang Khám phá: sản phẩm lấy theo
-- TRANG (20 sp/trang) từ api/v3/offer/product/list và cache trong DB — trang
-- nào đã có thì tái dùng, chưa có mới nhờ profile-worker gọi Shopee.

-- Lệnh worker cần tham số (list_type, page) → thêm params + kind mới.
ALTER TABLE harvest_jobs DROP CONSTRAINT harvest_jobs_kind_check;
ALTER TABLE harvest_jobs ADD CONSTRAINT harvest_jobs_kind_check
  CHECK (kind IN ('LOGIN', 'FETCH', 'FETCH_PAGE'));
ALTER TABLE harvest_jobs ADD COLUMN params jsonb NOT NULL DEFAULT '{}';

-- Sản phẩm của từng trang.
CREATE TABLE shopee_offer_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_type integer NOT NULL,
    page_no integer NOT NULL CHECK (page_no >= 1),
    position integer NOT NULL CHECK (position >= 0),
    item_id text NOT NULL,
    name text NOT NULL,
    image_url text,
    price_vnd bigint CHECK (price_vnd IS NULL OR price_vnd >= 0),
    commission_rate_bps integer
        CHECK (commission_rate_bps IS NULL
               OR commission_rate_bps BETWEEN 0 AND 10000),
    shop_name text,
    product_url text NOT NULL,
    sales_count bigint,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (list_type, page_no, position)
);

CREATE INDEX shopee_offer_products_page_idx
  ON shopee_offer_products (list_type, page_no, position);

-- Trạng thái từng trang (kể cả trang rỗng — để không gọi lại vô ích).
CREATE TABLE shopee_offer_pages (
    list_type integer NOT NULL,
    page_no integer NOT NULL CHECK (page_no >= 1),
    item_count integer NOT NULL DEFAULT 0,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (list_type, page_no)
);
