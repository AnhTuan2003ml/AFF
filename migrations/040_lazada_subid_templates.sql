-- Cache subId template của Lazada theo từng giá trị subId1 (thường là
-- u<tracking_code> của người mua). link-convert chỉ nhận subIdTemplateKey trỏ
-- tới template đã lưu trên tài khoản Lazada; ta tạo 1 template/người dùng rồi
-- cache key ở đây để lần sau khỏi tạo lại (số template = số user, không phình
-- theo số đơn).

CREATE TABLE IF NOT EXISTS lazada_subid_templates (
  subid1     text PRIMARY KEY,
  subid_key  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
