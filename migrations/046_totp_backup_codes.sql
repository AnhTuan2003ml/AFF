-- Mã dự phòng cho 2FA: dùng khi admin mất thiết bị Authenticator. Lưu HASH
-- (SHA-256 hex) — không lưu mã gốc; mỗi mã dùng một lần rồi bị gỡ khỏi mảng.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_backup_codes text[] NOT NULL DEFAULT '{}';
