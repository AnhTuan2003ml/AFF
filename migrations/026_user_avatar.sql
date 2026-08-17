-- Ảnh đại diện: khi đăng nhập bằng Google thì lưu ảnh hồ sơ Google
-- (URL https, CSP đã cho phép img-src https:). Trống = dùng chữ cái đầu.
ALTER TABLE users
ADD COLUMN avatar_url text NOT NULL DEFAULT '';
