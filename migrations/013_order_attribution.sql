BEGIN;

-- Dấu vết định vị đơn: cho biết hệ thống đã gán đơn cho tài khoản bằng
-- Click ID, Sub ID hay email đối soát thủ công.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS attribution_method text
        CHECK (
            attribution_method IS NULL
            OR attribution_method IN ('CLICK_ID', 'SUB_ID', 'EMAIL')
        ),
    ADD COLUMN IF NOT EXISTS attribution_value text,
    ADD COLUMN IF NOT EXISTS attributed_at timestamptz;

-- Sub ID là khóa đối chiếu chính khi nhập báo cáo chuyển đổi Shopee.
CREATE INDEX IF NOT EXISTS affiliate_links_sub_id_idx
    ON affiliate_links (sub_id);
CREATE INDEX IF NOT EXISTS orders_affiliate_link_idx
    ON orders (affiliate_link_id)
    WHERE affiliate_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_attribution_idx
    ON orders (attribution_method, attributed_at DESC);

-- Nếu báo cáo trả thông tin mặt hàng thật thì đánh dấu REPORT; nếu báo cáo chỉ
-- có mã đơn, hệ thống lưu ảnh chụp sản phẩm đã bấm dưới dạng CLICK_SNAPSHOT.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'REPORT'
        CHECK (source IN ('REPORT', 'CLICK_SNAPSHOT')),
    ADD COLUMN IF NOT EXISTS item_image_url text;

COMMIT;
