-- Tỷ lệ hoa hồng RIÊNG cho từng đối tác (override % chung). NULL = dùng mức
-- chung: special_partner_share_percent nếu is_special_partner, ngược lại
-- referrer_share_percent. Cho phép admin hạ/nâng % của từng người mà không đổi
-- cấu hình toàn hệ thống.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS partner_share_percent smallint
    CHECK (partner_share_percent IS NULL
           OR (partner_share_percent >= 0 AND partner_share_percent <= 100));
