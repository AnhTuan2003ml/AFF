# 06 — API và routes

Toàn bộ endpoint của hệ thống, nhóm theo khu vực. Mã nguồn tương ứng trong `src/routes/`.

## Quy ước chung

- **API JSON** dưới prefix `/api/v1`, cần đăng nhập (`requireApiUser`) trừ nhóm auth.
  Lỗi trả `{ error: { code, message, requestId } }` với message tiếng Việt (`AppError`).
- **Form web** dùng POST + CSRF token; API lấy token qua `GET /api/v1/csrf`.
- Rate limit toàn cục 300 req/phút; một số endpoint có limit riêng chặt hơn (ghi chú bên dưới).
  Bộ đếm khóa theo **token thiết bị** nếu request có bearer, còn lại theo IP — người dùng
  app đi qua NAT nhà mạng nên khóa theo IP sẽ khiến cả nghìn thuê bao 4G chia chung một
  hạn mức (`server.ts`, `keyGenerator`).

### Hai cơ chế xác thực chạy song song

| | Web | App di động |
| --- | --- | --- |
| Mang danh tính bằng | Cookie `aff_session` | Header `Authorization: Bearer` |
| Vòng đời | `SESSION_TTL_HOURS` (mặc định 168h) | Access 30 phút + refresh 60 ngày |
| Kiểm tra CSRF | Có (double-submit + Origin) | **Không** — xem lý do bên dưới |
| Lưu ở đâu | Bảng `sessions`, `client = 'web'` | Cùng bảng `sessions`, `client = 'mobile'` |

Cả hai dùng chung cột `token_hash`, nên hook xác thực ở `auth/session.ts` chỉ đọc thêm
header là mọi guard sẵn có tự hiểu người dùng app — không phải sửa từng route.

CSRF được bỏ qua ở nhánh bearer (`auth/csrf.ts`) vì CSRF chỉ tồn tại để chống việc trình
duyệt **tự** đính kèm cookie vào yêu cầu do trang của kẻ tấn công tạo ra. Trình duyệt
không bao giờ tự thêm header `Authorization`, nên ở nhánh này không có quyền hạn ngầm nào
để lợi dụng.

Refresh token bị **xoay** mỗi lần dùng: cả access lẫn refresh được ghi đè trên đúng dòng
`sessions` cũ. Hệ quả là refresh token vừa dùng chết ngay, và một thiết bị luôn chiếm
đúng một dòng.

## API JSON — `/api/v1` (`src/routes/api/`)

### Auth (`api/auth.ts`)

| Method + path | Việc |
| --- | --- |
| `POST /auth/register` | Đăng ký (email + mật khẩu) → gửi OTP. Limit 5/giờ |
| `POST /auth/verify-email` | Xác thực OTP email, **set session cookie** |
| `POST /auth/login` | Đăng nhập, **set session cookie**. Limit 10/15 phút |
| `POST /auth/logout` | Đăng xuất phiên cookie |
| `POST /auth/forgot-password` / `POST /auth/reset-password` | Quên / đặt lại mật khẩu |

Nhánh token — dành cho app di động. **Không** đặt cookie, **không** đọc cookie:

| Method + path | Việc |
| --- | --- |
| `POST /auth/token` | Đăng nhập → `{ accessToken, refreshToken, expiresIn, user }`. Limit 10/15 phút |
| `POST /auth/token/verify-email` | Xác thực OTP → trả luôn cặp token, khỏi đăng nhập lại |
| `POST /auth/token/refresh` | Đổi refresh token lấy cặp mới (xoay cả hai). Limit 60/giờ |
| `POST /auth/token/revoke` | Đăng xuất đúng thiết bị đang cầm token |

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
| `GET /support/form` | Dữ liệu dựng form hỗ trợ cho app (loại vấn đề, đơn để chọn, email nhận phản hồi, yêu cầu/phản hồi mới nhất); mở = đánh dấu đã xem phản hồi |
| `POST /support/requests` | Gửi yêu cầu hỗ trợ theo mẫu — cùng `submitSupportRequest` với web, đổ vào thread Slack kèm `reply_broadcast` |
| `POST /support/missing-order` | Khiếu nại đơn hàng chưa được ghi nhận (đi chung hội thoại hỗ trợ) |

### Ví và tài khoản (`api/me.ts`)

Nhánh này sinh ra cho app di động: trên web những việc tương ứng nằm ở các form trong
`routes/app.ts` và kết thúc bằng redirect + flash, app không dùng được. Các route ở đây
là lớp vỏ JSON mỏng, **gọi lại đúng service mà web đang gọi** — không chép lại logic,
nếu không luật rút tiền sẽ tách đôi giữa web và app.

Ngân hàng và rút tiền đều **hai bước, có OTP qua email**, y hệt web:

| Method + path | Việc |
| --- | --- |
| `GET /me/bank-accounts` | Danh sách tài khoản ngân hàng (đã che số) + `supportedBanks` |
| `POST /me/bank-accounts` | Bước 1 — gửi yêu cầu thêm, trả `{ requestId }` + gửi OTP. Limit 5/giờ |
| `POST /me/bank-accounts/:id/confirm` | Bước 2 — nhập OTP, tài khoản chuyển `VERIFIED`. Limit 10/15 phút |
| `POST /me/withdrawals` | Bước 1 — tạo lệnh rút, trả `{ intentId }` + gửi OTP. Limit 5/giờ |
| `POST /me/withdrawals/:id/confirm` | Bước 2 — nhập OTP, ghi bút toán giữ tiền. Limit 10/15 phút |
| `PATCH /me` | Đổi tên hiển thị |
| `POST /me/sessions/revoke-all` | Đăng xuất mọi thiết bị (kể cả thiết bị đang gọi) |
| `DELETE /me` | **Xóa tài khoản tự phục vụ** — xem bên dưới |

`DELETE /me` là chặn cứng của cả App Store lẫn CH Play (app có tài khoản thì phải cho tự
xóa ngay trong app). Quy tắc:

- Còn lệnh rút đang xử lý → chặn cứng, `409 WITHDRAWAL_IN_PROGRESS`
- Ví còn tiền mà chưa xác nhận → `409 BALANCE_REMAINING` kèm `details.remainingVnd`;
  gửi lại với `{ "forfeitBalance": true }` mới xóa
- Xóa **mềm**, dùng lại đúng cơ chế của khu quản trị (`deleted_at` + `deletion_reason`,
  status `DISABLED`). Bút toán ledger và đơn hàng giữ nguyên để đối soát không thủng;
  cái bị gỡ là danh tính — email đổi sang dạng vô hiệu (giải phóng chỉ mục để đăng ký
  lại được), tên, mật khẩu, liên kết Google và toàn bộ thông tin ngân hàng

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
