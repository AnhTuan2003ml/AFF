-- Tự động khóa tạm khi đăng nhập sai nhiều lần: đếm số lần sai liên tiếp và
-- khóa đăng nhập tới một mốc thời gian. Đăng nhập đúng sẽ reset.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS login_locked_until timestamptz;
