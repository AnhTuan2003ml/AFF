-- Cập nhật mốc nhiệm vụ:
--  • MUA HÀNG (theo tháng): 20 đơn/tháng → +20.000đ; 80 đơn/tháng → +80.000đ.
--  • GIỚI THIỆU: bổ sung mốc 10.000 người → +50.000.000đ (mỗi người vẫn phải
--    phát sinh ≥ 5 đơn hợp lệ như các mốc khác).
-- An toàn khi các mốc chưa phát sinh yêu cầu nhận thưởng (user_mission_claims);
-- nếu môi trường nào đã có claim gắn mốc PURCHASE cũ, DELETE sẽ vướng khóa ngoại
-- và migration dừng lại để xử lý tay.

BEGIN;

-- Nhiệm vụ MUA HÀNG: thay bằng đúng 2 mốc theo tháng.
DELETE FROM mission_definitions WHERE type = 'PURCHASE_MILESTONE';

INSERT INTO mission_definitions
  (type, title, description, threshold, reward_amount_vnd, status, sort_order)
VALUES
  ('PURCHASE_MILESTONE', 'Mốc 20.000đ',
   'Phát sinh 20 đơn hàng đã duyệt trong 1 tháng.',
   20, 20000, 'ACTIVE', 1),
  ('PURCHASE_MILESTONE', 'Mốc 80.000đ',
   'Phát sinh 80 đơn hàng đã duyệt trong 1 tháng.',
   80, 80000, 'ACTIVE', 2);

-- Nhiệm vụ GIỚI THIỆU: thêm mốc cao nhất 10.000 người → 50 triệu.
INSERT INTO mission_definitions
  (type, title, description, threshold, reward_amount_vnd, status, sort_order)
VALUES
  ('REFERRAL_MILESTONE', 'Mốc 50.000.000đ',
   'Giới thiệu 10.000 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   10000, 50000000, 'ACTIVE', 8)
ON CONFLICT (type, threshold) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_amount_vnd = EXCLUDED.reward_amount_vnd,
  status = 'ACTIVE',
  sort_order = EXCLUDED.sort_order;

COMMIT;
