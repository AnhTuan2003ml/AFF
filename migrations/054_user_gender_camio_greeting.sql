-- Giới tính người dùng + mẫu câu chào của Camio theo giới tính.
--
-- users.gender: MALE/FEMALE do người dùng chọn khi đăng ký hoặc lấy từ Google
-- People API (best-effort); UNKNOWN khi chưa xác định. Camio dùng tên + giới
-- tính để chào ("Camio chào anh Tuấn" / "chị Phương"). Mẫu câu KHÔNG fix cứng —
-- admin sửa 3 mẫu (nam/nữ/chưa rõ) ở /backoffice/support; biến {ten} = tên gọi.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (gender IN ('MALE', 'FEMALE', 'UNKNOWN'));

ALTER TABLE support_autoreply_settings
  ADD COLUMN IF NOT EXISTS camio_greeting_male text NOT NULL
    DEFAULT 'Camio chào anh {ten} 🧡 Anh muốn hỏi về chính sách hoàn tiền, điều khoản hay cách ShopTik hoạt động không ạ?',
  ADD COLUMN IF NOT EXISTS camio_greeting_female text NOT NULL
    DEFAULT 'Camio chào chị {ten} 🧡 Chị muốn hỏi về chính sách hoàn tiền, điều khoản hay cách ShopTik hoạt động không ạ?',
  ADD COLUMN IF NOT EXISTS camio_greeting_unknown text NOT NULL
    DEFAULT 'Camio chào anh/chị {ten} 🧡 Anh/chị muốn hỏi về chính sách hoàn tiền, điều khoản hay cách ShopTik hoạt động không ạ?';
