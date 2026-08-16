-- "Sản phẩm đã xem": khi job dọn (pruneUnconfirmedInstantBuys) xóa một lượt
-- "Mua ngay" (affiliate_links campaign 'instantbuy') quá hạn mà chưa có đơn
-- khớp Sub ID, KHÔNG xóa mất trắng nữa mà chép sản phẩm + Sub ID sang đây để
-- mỗi user còn thấy lại thứ mình từng bấm mua và giữ dấu vết Sub ID để đối soát.
CREATE TABLE viewed_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'SHOPEE',
  product_id text,
  product_name text,
  product_url text,
  product_image_url text,
  product_price_vnd bigint,
  sub_id text NOT NULL,
  click_id text,
  campaign text,
  link_created_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- Mỗi lượt bấm mua có Sub ID riêng (chứa click_id) nên khóa theo (user, sub_id)
-- vừa chống chép trùng, vừa không bao giờ mất dấu một Sub ID nào.
CREATE UNIQUE INDEX viewed_products_user_sub_idx
  ON viewed_products (user_id, sub_id);

-- Truy vấn "sản phẩm đã xem gần đây" của một user.
CREATE INDEX viewed_products_user_recent_idx
  ON viewed_products (user_id, archived_at DESC);
