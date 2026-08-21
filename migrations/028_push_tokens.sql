-- Đẩy thông báo ra ngoài app (Expo push): lưu token thiết bị của người dùng.
-- Một người có thể có nhiều thiết bị → mỗi token một dòng, token là duy nhất.

CREATE TABLE push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    token text NOT NULL UNIQUE,
    platform text NOT NULL DEFAULT 'expo',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);
