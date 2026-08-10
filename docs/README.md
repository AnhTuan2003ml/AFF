# Tài liệu dự án ShopTik

Bộ tài liệu dành cho người mới tham gia dự án và AI/agent cần nắm tổng quan.
Đọc theo thứ tự nếu bạn hoàn toàn mới; đọc riêng lẻ nếu chỉ cần một chủ đề.

| # | Tài liệu | Trả lời câu hỏi |
| --- | --- | --- |
| 1 | [Tổng quan](01-tong-quan.md) | Dự án làm gì? Tiền chảy như thế nào? Kiến trúc ra sao? |
| 2 | [Luồng nghiệp vụ](02-luong-nghiep-vu.md) | Từ lúc dán link đến lúc rút tiền, hệ thống làm gì ở mỗi bước? |
| 3 | [Cấu trúc mã nguồn](03-cau-truc-ma-nguon.md) | File nào làm gì? Sửa tính năng X thì đụng vào đâu? |
| 4 | [Dữ liệu và ledger](04-du-lieu-va-ledger.md) | CSDL có những bảng gì? Ví tiền hoạt động ra sao? |
| 5 | [Cài đặt và vận hành](05-cai-dat-va-van-hanh.md) | Chạy local/production thế nào? Cần biến môi trường gì? |
| 6 | [API và routes](06-api-va-routes.md) | Có những endpoint và trang nào? |
| 7 | [Quy ước phát triển](07-quy-uoc-phat-trien.md) | Viết code theo chuẩn nào? Test ra sao? |

## Lộ trình đọc gợi ý

- **Dev mới vào dự án**: 1 → 2 → 3, sau đó 5 để chạy được local, rồi 7 trước khi viết code.
- **Chỉ cần chạy dự án**: 5.
- **Làm việc với tiền/ví/rút tiền**: 2 + 4 (bắt buộc — mô hình ledger là phần dễ làm sai nhất).
- **AI/agent**: `CLAUDE.md` ở gốc repo là bản đồ cô đọng nhất; bộ docs này là bản diễn giải đầy đủ.

## Thuật ngữ dùng xuyên suốt

| Thuật ngữ | Nghĩa |
| --- | --- |
| **Cashback / tiền hoàn** | Phần hoa hồng Affiliate chia lại cho người mua |
| **bps** | Basis points, 1/10000. Ví dụ 250 bps = 2,5% |
| **clickId** | Mã định danh một lượt bấm "Mua ngay", nằm trong URL `/go/:clickId` |
| **Sub ID** | Chuỗi định danh gắn vào link Affiliate để sàn trả lại trong báo cáo, dùng đối soát đơn |
| **tracking_code** | Mã ngắn cố định của mỗi user (`users.tracking_code`), một mảnh của Sub ID |
| **Ledger** | Sổ cái kế toán kép — mọi biến động tiền là một giao dịch DEBIT/CREDIT cân bằng |
| **Ví CHỜ / KHẢ DỤNG** | Tiền hoàn mới duyệt nằm ở ví CHỜ, hết hạn giữ tiền mới sang KHẢ DỤNG để rút |
| **Backoffice** | Trung tâm vận hành cho admin tại `/backoffice` |
| **Preview** | Kết quả tra cứu sản phẩm tạm thời (in-memory, TTL 15 phút, chưa ghi DB) |
