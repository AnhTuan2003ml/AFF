BEGIN;

-- Mã định danh cố định của từng người dùng, nhét thẳng vào Sub ID của link
-- Affiliate (`u<tracking_code>`). Nhờ vậy báo cáo sàn luôn chỉ đúng chủ đơn
-- kể cả khi mã lượt click bị sàn cắt bớt hoặc người dùng mua ở phiên khác.
--
-- 12 ký tự hex, sinh từ gen_random_uuid() (hàm dựng sẵn của PostgreSQL, không
-- cần pgcrypto). Đặt DEFAULT ở tầng DB để mọi đường tạo tài khoản đều có mã.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tracking_code text
        DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- Backfill cho tài khoản đã có; lặp lại phòng trường hợp trùng mã.
DO $$
DECLARE
  remaining int;
BEGIN
  FOR i IN 1..10 LOOP
    UPDATE users
    SET tracking_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    WHERE tracking_code IS NULL
       OR tracking_code IN (
         SELECT tracking_code FROM users
         WHERE tracking_code IS NOT NULL
         GROUP BY tracking_code HAVING count(*) > 1
       );
    SELECT count(*) INTO remaining FROM (
      SELECT tracking_code FROM users
      WHERE tracking_code IS NULL
      UNION ALL
      SELECT tracking_code FROM users
      WHERE tracking_code IS NOT NULL
      GROUP BY tracking_code HAVING count(*) > 1
    ) x;
    EXIT WHEN remaining = 0;
  END LOOP;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Không sinh được tracking_code duy nhất cho toàn bộ tài khoản.';
  END IF;
END $$;

ALTER TABLE users
    ALTER COLUMN tracking_code SET NOT NULL,
    ADD CONSTRAINT users_tracking_code_format
        CHECK (tracking_code ~ '^[a-z0-9]{6,32}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_tracking_code_unique
    ON users (tracking_code);

-- Đối soát dự phòng theo cặp (người dùng, sản phẩm) khi Sub ID không còn
-- nguyên vẹn mã lượt click.
CREATE INDEX IF NOT EXISTS affiliate_links_user_product_idx
    ON affiliate_links (user_id, platform, product_id, created_at DESC)
    WHERE product_id IS NOT NULL;

COMMIT;
