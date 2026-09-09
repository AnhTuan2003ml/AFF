-- Cơ chế "mốc thưởng giới thiệu" mới: 7 mốc theo số người giới thiệu HỢP LỆ
-- (mỗi người được mời phải phát sinh ≥ 5 đơn hàng hợp lệ — APPROVED, hoa hồng
-- > 0). Thưởng được TỰ ĐỘNG cộng vào ví khả dụng khi đạt mốc (xem
-- maybeAwardReferralMilestones trong src/services/mission.ts).
--
-- Nạp lại toàn bộ mốc REFERRAL_MILESTONE. An toàn khi các mốc cũ chưa phát sinh
-- yêu cầu nhận thưởng (user_mission_claims) — nếu môi trường nào đã có claim gắn
-- mốc REFERRAL cũ, lệnh DELETE sẽ vướng khóa ngoại và migration dừng lại để xử
-- lý tay, tránh xoá nhầm dữ liệu thưởng đã ghi nhận.

BEGIN;

DELETE FROM mission_definitions WHERE type = 'REFERRAL_MILESTONE';

INSERT INTO mission_definitions
  (type, title, description, threshold, reward_amount_vnd, status, sort_order)
VALUES
  ('REFERRAL_MILESTONE', 'Mốc 10.000đ',
   'Giới thiệu 5 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   5, 10000, 'ACTIVE', 1),
  ('REFERRAL_MILESTONE', 'Mốc 20.000đ',
   'Giới thiệu 10 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   10, 20000, 'ACTIVE', 2),
  ('REFERRAL_MILESTONE', 'Mốc 50.000đ',
   'Giới thiệu 25 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   25, 50000, 'ACTIVE', 3),
  ('REFERRAL_MILESTONE', 'Mốc 100.000đ',
   'Giới thiệu 50 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   50, 100000, 'ACTIVE', 4),
  ('REFERRAL_MILESTONE', 'Mốc 500.000đ',
   'Giới thiệu 250 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   250, 500000, 'ACTIVE', 5),
  ('REFERRAL_MILESTONE', 'Mốc 1.000.000đ',
   'Giới thiệu 500 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   500, 1000000, 'ACTIVE', 6),
  ('REFERRAL_MILESTONE', 'Mốc 5.000.000đ',
   'Giới thiệu 1.000 người, mỗi người phát sinh ít nhất 5 đơn hàng hợp lệ.',
   1000, 5000000, 'ACTIVE', 7);

COMMIT;
