-- Voucher Shopee hôm nay (nguồn shopeeanalytics.com) — hiển thị ở tab Voucher
-- trong Khám phá. Làm mới mỗi ngày; luôn thay toàn bộ theo lần lấy mới nhất.
CREATE TABLE IF NOT EXISTS shopee_vouchers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position integer NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    shop_name text,
    label text,
    label_color text,
    expiry_text text,
    used_percent integer,
    logo_url text,
    use_url text NOT NULL,
    detail_url text,
    fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopee_vouchers_pos_idx ON shopee_vouchers (position);
