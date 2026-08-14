# Profile-worker — lấy sản phẩm đề xuất Shopee Affiliate

Worker này chạy **trên máy host**, điều khiển trình duyệt qua ứng dụng
**Browser Control** (`http://127.0.0.1:9222` — tài liệu tại `/api-docs`).
Không dùng Playwright, không cần cài dependency — chỉ cần **Node 22+**.

Worker nhận lệnh từ trang **Backoffice → Profile Shopee**:

- **Mở đăng nhập**: start profile trong Browser Control (cửa sổ trình duyệt
  hiện lên), bạn đăng nhập `affiliate.shopee.vn`, worker tự nhận biết khi
  đăng nhập xong.
- **Lấy sản phẩm**: start profile → mở
  `https://affiliate.shopee.vn/offer/product_offer` → gọi
  `api/v3/offer/product/list` ngay trong trang (qua CDP, bằng phiên đăng
  nhập của profile) → gửi response về server. Server parse và tự đưa sản
  phẩm lên trang **Khám phá**.

## Yêu cầu

1. Ứng dụng **Browser Control** đang chạy (`http://127.0.0.1:9222/health` trả `ok`).
2. Profile đã được tạo trong Browser Control; **Profile ID** của nó phải được
   đăng ký ở trang admin `/backoffice/profiles` (nhập đúng ID này khi tạo).
3. Node 22 trở lên.

## Chạy

Token lấy từ `HARVEST_WORKER_TOKEN` trong `.env` của dự án (worker tự đọc
`../.env` nếu không đặt biến môi trường):

```bash
cd profile-worker
npm start
```

Biến môi trường (tùy chọn):

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `SERVER_URL` | `http://localhost:3000` | Địa chỉ server ShopTik |
| `HARVEST_WORKER_TOKEN` | đọc từ `../.env` | Phải khớp token phía server |
| `BROWSER_CONTROL_URL` | `http://127.0.0.1:9222` | Địa chỉ ứng dụng Browser Control |

Ghi chú: nếu profile đang chạy sẵn thì worker dùng luôn và **không tự đóng**;
profile do worker tự mở sẽ được đóng sau khi xong việc.
