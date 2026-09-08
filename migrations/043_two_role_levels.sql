-- Gộp mọi vai trò về ĐÚNG 2 cấp: USER và ADMIN.
-- Các vai trò nhân viên (SUPPORT/FINANCE/RISK/AUDITOR) và SUPER_ADMIN đều trở
-- thành ADMIN — quản trị có toàn quyền. Quan hệ/dữ liệu khác không đụng tới.
UPDATE users SET role = 'ADMIN' WHERE role NOT IN ('USER', 'ADMIN');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('USER', 'ADMIN'));
