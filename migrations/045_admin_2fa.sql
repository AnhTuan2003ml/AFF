-- Xác thực hai lớp (TOTP) cho tài khoản quản trị. Secret lưu MÃ HÓA
-- (AES-256-GCM qua encryptField) trong totp_secret; chỉ có hiệu lực khi
-- totp_enabled = true (đã xác nhận bằng một mã hợp lệ lúc bật).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_secret text,
    ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;
