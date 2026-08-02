BEGIN;

-- Bình luận của người dùng dưới sản phẩm vừa tra cứu (kiểu cộng đồng Longhouse).
CREATE TABLE product_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('SHOPEE', 'TIKTOK', 'LAZADA')),
    product_id text NOT NULL,
    content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_comments_product_idx
    ON product_comments (platform, product_id, created_at DESC);

COMMIT;
