-- Cập nhật chính sách hoa hồng đối tác giới thiệu (F1):
--   Người được F1 giới thiệu (F2) phát sinh MỖI đơn hàng → F1 nhận 10% hoa
--   hồng của đơn đó (trước đây 5%). Mức này tính TRỰC TIẾP trên hoa hồng, lấy
--   từ phần nền tảng — KHÔNG giảm tiền hoàn của người mua (F2).
--
-- Đối tác ĐẶC BIỆT vốn đã 10% nên giữ nguyên; nay F1 thường cũng 10% → đồng nhất.
-- Nền tảng giữ phần còn lại: 100 - buyer_cashback_percent - 10.

UPDATE business_config
SET referrer_share_percent = 10,
    platform_share_percent = GREATEST(0, 100 - buyer_cashback_percent - 10),
    updated_at = now()
WHERE id = true;
