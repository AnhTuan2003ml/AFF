-- Chính sách chia hoa hồng mới (2026-08-25):
--   Người dùng 60% · Đối tác giới thiệu 5% (trực tiếp trên hoa hồng)
--   · Sàn giữ phần còn lại 35% · Đối tác ĐẶC BIỆT 10% (đơn của người họ giới thiệu)
--   · Đơn ≤ 25.000₫: người dùng nhận tới 80%.
-- Phần trăm của người chia sẻ nay tính TRỰC TIẾP trên hoa hồng (không còn là
-- % của phần nền tảng); cột sharer_reward_from_platform_percent giữ lại cho
-- dữ liệu cũ nhưng không dùng trong tính toán nữa.

ALTER TABLE business_config
    ADD COLUMN referrer_share_percent integer NOT NULL DEFAULT 5,
    ADD COLUMN special_partner_share_percent integer NOT NULL DEFAULT 10,
    ADD COLUMN small_order_threshold_vnd numeric(14, 0) NOT NULL DEFAULT 25000,
    ADD COLUMN small_order_buyer_percent integer NOT NULL DEFAULT 80;

ALTER TABLE business_config
    ADD CONSTRAINT business_config_referrer_share_percent_check
        CHECK (referrer_share_percent BETWEEN 0 AND 100),
    ADD CONSTRAINT business_config_special_partner_share_percent_check
        CHECK (special_partner_share_percent BETWEEN 0 AND 100),
    ADD CONSTRAINT business_config_small_order_threshold_check
        CHECK (small_order_threshold_vnd >= 0),
    ADD CONSTRAINT business_config_small_order_buyer_percent_check
        CHECK (small_order_buyer_percent BETWEEN 0 AND 100);

-- Áp bộ số mới cho bản cấu hình hiện có (60/5/35, đơn nhỏ 80%).
UPDATE business_config
SET buyer_cashback_percent = 60,
    referrer_share_percent = 5,
    special_partner_share_percent = 10,
    small_order_threshold_vnd = 25000,
    small_order_buyer_percent = 80,
    platform_share_percent = 100 - 60 - 5,
    updated_at = now()
WHERE id = true;

-- Đối tác đặc biệt: cờ trên tài khoản NGƯỜI GIỚI THIỆU — mọi đơn của người
-- do họ giới thiệu, họ hưởng special_partner_share_percent thay vì
-- referrer_share_percent.
ALTER TABLE users
    ADD COLUMN is_special_partner boolean NOT NULL DEFAULT false;
