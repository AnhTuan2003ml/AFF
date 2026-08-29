-- Chính sách chia hoa hồng mới (2026-08-29):
--   · Nền tảng LUÔN giữ 40% (= 100 − buyer_cashback_percent).
--   · Người giới thiệu (F1) hưởng 6% — TRÍCH TỪ phần người mua, KHÔNG lấy thêm
--     từ nền tảng.
--   · Người mua: 60% khi KHÔNG có người giới thiệu; 54% (60 − 6) khi CÓ.
--   · Đơn nhỏ ≤ 25.000₫: người mua 80% (nền tảng 20%), F1 vẫn 6% trích từ đó.
--
-- Bất biến cũ (buyer + referrer + platform ≤ 100) không còn đúng vì referrer
-- nay nằm TRONG phần buyer → thay bằng: buyer + platform ≤ 100 và referrer,
-- special ≤ buyer.

ALTER TABLE business_config DROP CONSTRAINT business_config_check;

UPDATE business_config
SET buyer_cashback_percent = 60,
    referrer_share_percent = 6,
    special_partner_share_percent = 6,
    platform_share_percent = 40,
    small_order_buyer_percent = 80,
    updated_at = now()
WHERE id = true;

ALTER TABLE business_config
    ADD CONSTRAINT business_config_check
        CHECK (
            buyer_cashback_percent + platform_share_percent <= 100
            AND referrer_share_percent <= buyer_cashback_percent
            AND special_partner_share_percent <= buyer_cashback_percent
        );
