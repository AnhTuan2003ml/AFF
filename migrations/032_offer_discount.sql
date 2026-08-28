-- Thông tin voucher/giảm giá cho sản phẩm kho offer (đặc biệt tab HOT):
-- giá gốc trước giảm và % giảm, để hiển thị "giảm bao nhiêu".
ALTER TABLE shopee_offer_products
    ADD COLUMN IF NOT EXISTS original_price_vnd bigint
        CHECK (original_price_vnd IS NULL OR original_price_vnd >= 0),
    ADD COLUMN IF NOT EXISTS discount_percent integer
        CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);
