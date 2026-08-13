-- Email nhận kết quả phản hồi hỗ trợ: người dùng điền trong form
-- "Gửi yêu cầu theo mẫu"; trống = dùng email đăng ký của tài khoản.
ALTER TABLE support_conversations
ADD COLUMN notify_email text NOT NULL DEFAULT '';
