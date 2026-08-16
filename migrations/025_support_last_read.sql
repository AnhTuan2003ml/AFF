-- Mốc "đã đọc" của khách cho hội thoại hỗ trợ: để biết còn phản hồi CSKH nào
-- khách chưa xem (báo bằng linh vật khi đăng nhập lại / đang ở trong app).
-- Mặc định now() nên các hội thoại cũ coi như đã đọc hết, không spam thông báo.
ALTER TABLE support_conversations
ADD COLUMN user_last_read_at timestamptz NOT NULL DEFAULT now();
