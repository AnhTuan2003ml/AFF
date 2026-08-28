-- Cho phép lưu file PDF hợp đồng (admin upload khi duyệt) vào bảng file KYC, để
-- người dùng xem lại sau khi được duyệt và admin có thể gửi lại email.
ALTER TABLE kol_application_files
  DROP CONSTRAINT IF EXISTS kol_application_files_kind_check;
ALTER TABLE kol_application_files
  ADD CONSTRAINT kol_application_files_kind_check
  CHECK (kind IN ('CCCD_FRONT', 'CCCD_BACK', 'FACE_VIDEO', 'CONTRACT_PDF'));
