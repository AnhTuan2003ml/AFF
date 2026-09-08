-- Ảnh đại diện người dùng tự tải lên. Lưu THẲNG trong DB: container web chạy
-- read-only filesystem (không ghi được ra đĩa) và không có volume cho uploads,
-- nên lưu DB là cách bền vững, còn giữ nguyên qua mỗi lần deploy.
-- users.avatar_url trỏ tới /avatar/<user_id>?v=<ts> khi dùng ảnh tự tải; ảnh
-- Google vẫn là URL ngoài như cũ.
CREATE TABLE IF NOT EXISTS user_avatars (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content_type text NOT NULL,
    data bytea NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
