BEGIN;

-- Lazada Open Platform OAuth cho tích hợp Lazada của HỆ THỐNG ShopTik
-- (bảng đơn dòng - singleton, giống platform_sync_settings). Access/refresh
-- token là bí mật: luôn lưu dạng mã hóa AES-256-GCM bằng FIELD_ENCRYPTION_KEY
-- (encryptField/decryptField trong src/lib/crypto.ts), KHÔNG bao giờ plaintext.
-- Muốn mở rộng đa tài khoản về sau: bỏ ràng buộc CHECK (id) và thêm cột định
-- danh tài khoản — schema còn lại giữ nguyên.
CREATE TABLE lazada_oauth_tokens (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    access_token_ciphertext text NOT NULL,
    refresh_token_ciphertext text NOT NULL,
    access_token_expires_at timestamptz NOT NULL,
    refresh_token_expires_at timestamptz NOT NULL,
    country text,
    account text,
    account_id text,
    -- country_user_info và các metadata khác Lazada trả về (không chứa token).
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_refresh_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
