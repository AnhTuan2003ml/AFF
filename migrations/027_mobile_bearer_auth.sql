-- Mở đường cho app di động: xác thực bằng Bearer token thay vì cookie phiên.
--
-- Không dựng bảng mới. Bảng `sessions` đã có đủ token_hash/expires_at/
-- revoked_at, chỉ thiếu hai thứ: biết phiên này thuộc web hay app, và một
-- refresh token sống dài để app không bắt người dùng đăng nhập lại mỗi 30 phút.
--
-- Quy ước: với phiên `mobile`, `token_hash` là ACCESS token (ngắn hạn, dùng
-- chung đúng truy vấn xác thực với cookie web), còn `refresh_token_hash` là
-- refresh token (dài hạn) — mỗi lần làm mới thì xoay cả hai trên cùng một dòng,
-- nên một thiết bị luôn tương ứng một dòng.
--
-- Xóa tài khoản tự phục vụ (chặn cứng của App Store và CH Play) KHÔNG cần
-- migration: dùng lại đúng cơ chế xóa mềm mà khu quản trị đã có từ migration
-- 003 — `deleted_at` + `deletion_reason` + status DISABLED.

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'web'
        CHECK (client IN ('web', 'mobile')),
    ADD COLUMN IF NOT EXISTS refresh_token_hash text UNIQUE,
    ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS sessions_refresh_active_idx
    ON sessions (refresh_token_hash)
    WHERE revoked_at IS NULL;

