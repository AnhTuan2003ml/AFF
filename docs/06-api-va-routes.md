# 06 — API và routes

Toàn bộ endpoint của hệ thống, nhóm theo khu vực. Mã nguồn tương ứng trong `src/routes/`.

## Quy ước chung

- **API JSON** dưới prefix `/api/v1`, cần đăng nhập (`requireApiUser`) trừ nhóm auth.
  Lỗi trả `{ error: { code, message, requestId } }` với message tiếng Việt (`AppError`).
- **Form web** dùng POST + CSRF token; API lấy token qua `GET /api/v1/csrf`.
- Rate limit toàn cục 300 req/phút; một số endpoint có limit riêng chặt hơn (ghi chú bên dưới).

## API JSON — `/api/v1` (`src/routes/api/`)

### Auth (`api/auth.ts`)

| Method + path | Việc |
| --- | --- |
| `POST /auth/register` | Đăng ký (email + mật khẩu) |
| `POST /auth/verify-email` | Xác thực OTP email |
| `POST /auth/resend-otp` | Gửi lại OTP |
| `POST /auth/login` | Đăng nhập (set session cookie) |
| `POST /auth/logout` | Đăng xuất |
| `POST /auth/forgot-password` / `POST /auth/reset-password` | Quên / đặt lại mật khẩu |

### Sản phẩm — luồng mua hoàn tiền (`api/products.ts`)

| Method + path | Việc |
| --- | --- |
| `POST /products/preview` | Dán link → tra cứu tên/ảnh/giá/tiền hoàn dự kiến. Trả `{ product, previewId }`. **Không ghi DB.** Limit 30/phút |
| `POST /products/purchase` | Đổi `previewId` (TTL 15 phút, hết hạn trả 410 `PREVIEW_EXPIRED`) lấy `{ buyUrl, clickId, platform }` — lúc này mới ghi `affiliate_links`. Limit 30/phút |
| `GET /products/comments?platform=&productId=` | Bình luận cộng đồng của sản phẩm (20 mới nhất) |
| `POST /products/comments` | Gửi bình luận (2–500 ký tự). Limit 10/phút |

### Tài khoản (`api/account.ts`)

| Method + path | Việc |
| --- | --- |
| `GET /me` | Thông tin người dùng hiện tại |
| `GET /me/orders` | Lịch sử đơn (gồm bản ghi "Chờ sàn xác nhận") |
| `GET /me/wallet` | Số dư 4 ví |
| `GET /me/withdrawals` | Lịch sử rút tiền |
| `POST /support/missing-order` | Khiếu nại đơn hàng chưa được ghi nhận (tạo ticket) |

### Khác

| Method + path | Việc |
| --- | --- |
| `GET /csrf` | Lấy CSRF token cho client API |

## Trang công khai (`public.ts`)

| Path | Việc |
| --- | --- |
| `GET /` | Landing |
| `GET /go/:clickId` | **Redirect Affiliate**: kiểm tra allowlist host, ghi `click_events`, 302 sang sàn |
| `GET /dieu-khoan`, `GET /quyen-rieng-tu` | Văn bản pháp lý |
| `GET /chinh-sach-nguoi-dung` | Chính sách người dùng (trang đầy đủ) |
| `GET /chinh-sach-nguoi-dung/noi-dung` | Mảnh HTML cho modal chân trang |
| `GET /-/live`, `GET /-/ready` | Healthcheck |

## Trang xác thực (`auth.ts` — URL tiếng Việt)

`GET|POST /dang-ky`, `GET /xac-thuc-email` (+ POST xác thực / gửi lại OTP),
`GET|POST /dang-nhap`, `POST /dang-xuat`, `GET|POST /quen-mat-khau`, `GET|POST /dat-lai-mat-khau`.

## Trang người dùng — `/app` (`app.ts`, cần đăng nhập)

| Path | Trang |
| --- | --- |
| `GET /app` | Dashboard — dán link, tra cứu, mua ngay |
| `GET /app/entry-promo` | Màn hình khuyến mãi khi vào app |
| `GET|POST /app/links` | Tạo/quản lý link chia sẻ kiếm thưởng |
| `GET /app/orders` | Lịch sử đơn + trạng thái đối soát |
| `GET /app/wallet` | 4 ví + lịch sử bút toán |
| `GET /app/banks`, `POST /app/banks/request` | Tài khoản ngân hàng (thay đổi cần admin duyệt) |
| `GET /app/withdrawals`, `POST /app/withdrawals/request` | Rút tiền (OTP email) |
| `GET /app/discover` | Khám phá nội dung/sản phẩm |
| `GET /app/referrals` | Giới thiệu bạn bè |
| `GET /app/nhiem-vu`, `POST /app/nhiem-vu/claim` | Nhiệm vụ + nhận thưởng |
| `POST /app/notifications/mark-read` | Đánh dấu đã đọc thông báo |
| `GET|POST /app/support` | Ticket hỗ trợ |
| `GET /app/settings`, `POST /app/settings/profile`, `POST /app/settings/revoke-all` | Cài đặt, hồ sơ, đăng xuất mọi thiết bị |

## Backoffice — `/backoffice` (cần role admin)

`/backoffice` redirect về `/backoffice/console`.

| Path | Trang | File |
| --- | --- | --- |
| `/console` | Dashboard vận hành | `admin-dashboard.ts`, `admin-console.ts` |
| `/orders` | Danh sách đơn | `backoffice.ts` |
| `/reconciliation` (+ `/import`, `/bulk-decision`) | Đối soát: import CSV, duyệt hàng loạt | `admin-orders.ts` |
| `/sync` (+ `POST /sync`, `POST /sync/run`) | Cấu hình đồng bộ sàn + chạy tay | `admin-sync.ts` |
| `/withdrawals` (+ `/bulk-decision`) | Duyệt rút tiền | `backoffice.ts` |
| `/banks` | Duyệt thay đổi tài khoản ngân hàng | `backoffice.ts` |
| `/support` | Ticket hỗ trợ | `backoffice.ts` |
| `/config` | Cấu hình nghiệp vụ (`business_config`) | `backoffice.ts` |
| `/revenue` (+ `/export`) | Doanh thu + xuất CSV | `backoffice.ts` |
| `/products` | Quản lý nội dung Khám phá | `backoffice.ts` |
| `/missions` | Định nghĩa nhiệm vụ + duyệt claim | `backoffice.ts` |
| `/accounts` | Quản lý tài khoản | `admin-users.ts` |
| `/audit` | Nhật ký thao tác admin | `backoffice.ts` |

Sidebar backoffice hiển thị badge số việc chờ xử lý (đơn PENDING, lệnh rút chờ, ticket mở,
claim nhiệm vụ chờ) — tính trong `preHandler` của `src/server.ts`.

➡️ Tiếp theo: [07 — Quy ước phát triển](07-quy-uoc-phat-trien.md)
