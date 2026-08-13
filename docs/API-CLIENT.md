# ShopTik — Tài liệu API cho client app

Tổng hợp **toàn bộ API JSON** của ứng dụng (đối chiếu trực tiếp từ mã nguồn
`src/routes/api/*` + `src/routes/public.ts`) để xây dựng app mobile/SPA.

- **Base URL**: `{APP_ORIGIN}/api/v1` (mặc định dev: `http://localhost:3000/api/v1`)
- **Định dạng**: JSON UTF-8 (`Content-Type: application/json`)
- **Tiền tệ**: VND, **số nguyên** (không có số thập phân)
- Các cột số lớn lấy thẳng từ PostgreSQL (`*_vnd` trong orders/wallet/withdrawals)
  được serialize thành **chuỗi** (ví dụ `"cashback_vnd": "40000"`) — client phải
  tự parse. Riêng `balances` là **number**.

---

## 1. Xác thực & phiên

### 1.1. Cơ chế

| Thành phần | Giá trị |
|---|---|
| Session cookie | `aff_session` — httpOnly, `SameSite=Lax`, `Secure` (production), TTL `SESSION_TTL_HOURS` (mặc định **168 giờ**) |
| CSRF cookie | `aff_csrf` — httpOnly, signed, TTL 24h (server tự cấp ở response đầu tiên) |
| CSRF token | Lấy qua `GET /api/v1/csrf`, gửi lại ở **mọi request không phải GET/HEAD/OPTIONS** bằng header `x-csrf-token` (hoặc field `_csrf` trong body) |
| Origin check | Nếu request có header `Origin`, nó **phải trùng** `APP_ORIGIN` (production bắt buộc HTTPS) — sai trả `403 INVALID_ORIGIN` |

Client app phải:

1. Dùng HTTP client **giữ cookie** (cookie jar).
2. Gọi `GET /api/v1/csrf` trước, lưu `csrfToken`.
3. Gắn `x-csrf-token: <csrfToken>` cho mọi POST.
4. Token gắn với cookie `aff_csrf` — nếu cookie đổi (hết hạn 24h) phải gọi lại `/csrf`.

### 1.2. `GET /csrf`

Không cần đăng nhập.

```json
{ "csrfToken": "chuỗi-base64url" }
```

---

## 2. Định dạng lỗi (chung mọi endpoint)

```json
{
  "error": {
    "code": "MA_LOI",
    "message": "Thông báo tiếng Việt hiển thị được cho người dùng.",
    "requestId": "req-abc",
    "details": { "field": "email" }
  }
}
```

| HTTP | code | Khi nào |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query sai schema — `details.field` chỉ trường lỗi đầu tiên |
| 401 | `AUTH_REQUIRED` | Chưa đăng nhập / session hết hạn |
| 403 | `INVALID_CSRF` | Thiếu/sai `x-csrf-token` |
| 403 | `INVALID_ORIGIN` | Header Origin không khớp `APP_ORIGIN` |
| 403 | `FORBIDDEN` | Không đủ quyền |
| 404 | `NOT_FOUND` | Endpoint không tồn tại |
| 410 | `PREVIEW_EXPIRED` | `previewId` hết hạn (cache 15 phút) |
| 429 | `RATE_LIMITED` | Vượt rate limit — message ghi số giây cần chờ |
| 500 | `INTERNAL_ERROR` | Lỗi hệ thống |

Ngoài ra mỗi nghiệp vụ có mã lỗi riêng (ví dụ đăng nhập sai, OTP sai...) — luôn
đọc `error.message` để hiển thị, đừng hardcode theo `code`.

---

## 3. Auth API

Tất cả đều **không cần** đăng nhập trước; đều là POST (cần CSRF token).

### 3.1. `POST /auth/register` — đăng ký (bước 1/2)

Rate limit: 5 lần/giờ.

```json
{
  "fullName": "Nguyễn Văn A",        // 2-100 ký tự
  "email": "a@example.com",           // tối đa 254 ký tự
  "password": "MatKhau123x",          // ≥10 ký tự, có chữ thường + HOA + số
  "passwordConfirm": "MatKhau123x",   // phải trùng password
  "referralCode": "ABC123",           // tuỳ chọn, ≤30 ký tự
  "acceptPolicies": true               // bắt buộc literal true
}
```

**202**: `{ "status": "OTP_REQUIRED", "message": "Mã xác nhận đã được gửi tới email." }`
— hệ thống gửi OTP 6 số qua email.

### 3.2. `POST /auth/verify-email` — xác nhận OTP (bước 2/2)

Rate limit: 10 lần/15 phút.

```json
{ "email": "a@example.com", "code": "123456" }
```

**200**: `{ "status": "VERIFIED" }` + **set cookie `aff_session`** (đã đăng nhập luôn).

### 3.3. `POST /auth/login`

Rate limit: 10 lần/15 phút.

```json
{ "email": "a@example.com", "password": "MatKhau123x" }
```

**200**:

```json
{
  "user": { "id": "uuid", "email": "a@example.com", "fullName": "Nguyễn Văn A", "role": "USER" }
}
```

+ set cookie `aff_session`.

### 3.4. `POST /auth/logout`

**204** (không body). Hủy session hiện tại + xóa cookie.

### 3.5. `POST /auth/forgot-password`

Rate limit: 5 lần/giờ. Body: `{ "email": "a@example.com" }`

**202**: `{ "message": "Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi." }`
(luôn 202 kể cả email không tồn tại — chống dò email).

### 3.6. `POST /auth/reset-password`

Rate limit: 10 lần/15 phút.

```json
{ "email": "a@example.com", "code": "123456", "password": "MatKhauMoi123" }
```

**204** — sau đó đăng nhập lại bằng mật khẩu mới.

---

## 4. Luồng mua hoàn tiền (lõi của app)

Cần đăng nhập. Hai bước đúng như UI:

### 4.1. `POST /products/preview` — dán link, tra cứu

Rate limit: 30 lần/phút.

```json
{
  "productUrl": "https://shopee.vn/...",  // 10-2048 ký tự, hỗ trợ link rút gọn
  "platform": "SHOPEE"                     // tuỳ chọn: SHOPEE | TIKTOK | LAZADA (tự nhận diện nếu bỏ trống)
}
```

**200**:

```json
{
  "product": {
    "dataVerified": true,            // false = chưa lấy được dữ liệu thật từ sàn
    "platform": "SHOPEE",
    "platformLabel": "Shopee",
    "normalizedUrl": "https://shopee.vn/...",
    "productId": "123456" ,           // hoặc null
    "shopId": "789",                  // hoặc null
    "productName": "Tên sản phẩm",
    "shopName": "Tên shop",           // hoặc null
    "imageUrl": "https://...",        // hoặc null
    "priceVnd": 500000,               // hoặc null
    "originalPriceVnd": 650000,       // chỉ khác null khi đang khuyến mãi
    "affiliateCommissionVnd": 50000,  // hoặc null
    "buyerCashbackVnd": 40000,        // hoặc null → hiển thị "Đang cập nhật"
    "buyerCashbackPercent": 80,
    "commissionRateBps": 1000,        // hoặc null
    "commissionSource": "...",
    "dataStatus": "COMPLETE",         // COMPLETE | PARTIAL
    "estimateOnly": true
  },
  "previewId": "chuỗi"
}
```

Quy tắc hiển thị: khi `buyerCashbackVnd` là `null` **không được tự bịa số tiền
hoàn** — hiển thị "Đang cập nhật". `previewId` sống **15 phút**, không ghi DB.

### 4.2. `POST /products/purchase` — bấm "Mua ngay"

Rate limit: 30 lần/phút.

```json
{ "previewId": "chuỗi-từ-preview" }
```

**201**:

```json
{ "buyUrl": "/go/abc123", "clickId": "abc123", "platform": "SHOPEE" }
```

**410 `PREVIEW_EXPIRED`**: tra cứu lại.

**Quan trọng với app mobile**: `buyUrl` là đường dẫn tương đối — mở
`{APP_ORIGIN}/go/{clickId}` bằng **trình duyệt ngoài / Custom Tab / SafariVC**
(không fetch bằng HTTP client): server ghi `click_events` rồi **302** sang link
Affiliate của sàn — bước này quyết định đơn có được đối soát hoàn tiền hay không.
Ngay sau đó lượt mua hiện trong "Đơn hàng" dạng **"Chờ sàn xác nhận"**.

### 4.3. `GET /products/comments?platform=SHOPEE&productId=123456`

Bình luận cộng đồng của sản phẩm (20 mới nhất).

**200**: `{ "data": [ { "id", "full_name", "content", "created_at" } ] }`

### 4.4. `POST /products/comments`

Rate limit: 10 lần/phút.

```json
{ "platform": "SHOPEE", "productId": "123456", "content": "2-500 ký tự" }
```

**201**: `{ "id", "fullName", "content", "createdAt" }`

---

## 5. Tài khoản & dữ liệu cá nhân

Cần đăng nhập (401 `AUTH_REQUIRED` nếu chưa).

### 5.1. `GET /me`

```json
{
  "user": {
    "id": "uuid",
    "email": "a@example.com",
    "fullName": "Nguyễn Văn A",
    "role": "USER",          // USER | SUPPORT | FINANCE | RISK | ADMIN | AUDITOR | SUPER_ADMIN
    "status": "ACTIVE",      // PENDING_EMAIL | ACTIVE | LOCKED | DISABLED
    "referralCode": "ABC123"
  },
  "balances": { "pending": 0, "available": 40000, "held": 0, "paid": 120000 }
}
```

Ý nghĩa ví: `pending` = chờ đối soát; `available` = rút được; `held` = đang giữ
cho lệnh rút; `paid` = đã chuyển về ngân hàng.

### 5.2. `GET /me/orders` — 100 đơn gần nhất

**200**: `{ "data": [ ... ] }`, mỗi phần tử:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `platform` | string | SHOPEE/TIKTOK/LAZADA |
| `platform_order_id` | string | Mã đơn bên sàn |
| `status` | string | `PENDING` (đang duyệt) / `APPROVED` / `CANCELLED` |
| `order_amount_vnd`, `commission_vnd`, `cashback_vnd` | string | Số VND dạng chuỗi |
| `purchased_at`, `approved_at`, `created_at`, `completed_at` | ISO date/null | |
| `cancel_reason` | string/null | Hiện khi CANCELLED |
| `cashback_available_at`, `cashback_released_at` | ISO date/null | Lịch nhả tiền từ ví CHỜ sang KHẢ DỤNG |
| `product_name`, `product_image_url` | string/null | |
| `product_price_vnd`, `product_original_price_vnd` | string/null | |

Lưu ý: các lượt bấm mua chưa có đơn thật (campaign `instantbuy`) cũng xuất hiện
trong danh sách trên giao diện web dạng "Chờ sàn xác nhận"; bản ghi tự biến mất
khi đơn thật về và khớp được.

### 5.3. `GET /me/wallet` — số dư + 100 biến động gần nhất

```json
{
  "balances": { "pending": 0, "available": 40000, "held": 0, "paid": 120000 },
  "history": [
    {
      "id": "uuid",
      "type": "CASHBACK_ACCRUAL",
      "description": "…",
      "code": "USER_PENDING",      // mã tài khoản ledger
      "direction": "CREDIT",        // DEBIT | CREDIT
      "amount_vnd": "40000",
      "created_at": "2026-08-12T…"
    }
  ]
}
```

### 5.4. `GET /me/withdrawals` — 100 lệnh rút gần nhất

**200**: `{ "data": [ { "id", "amount_vnd", "bank_code", "bank_last4", "status", "rejection_reason", "requested_at", "paid_at" } ] }`

### 5.5. `POST /support/missing-order` — báo thiếu đơn

```json
{ "orderId": "mã đơn bên sàn (3-100 ký tự)", "description": "mô tả ≥20 ký tự, ≤3000" }
```

**201**: `{ "id": "uuid", "status": "OPEN" }`

---

## 6. Endpoint công khai (ngoài /api/v1)

| Endpoint | Mô tả |
|---|---|
| `GET /go/:clickId` | Ghi click + 302 sang link Affiliate (qua allowlist host). **Mở bằng trình duyệt**, không fetch |
| `GET /-/live` | Liveness check |
| `GET /-/ready` | Readiness check (dùng cho healthcheck/monitor) |
| `GET /chinh-sach-nguoi-dung` | Trang chính sách người dùng (HTML) |
| `GET /chinh-sach-nguoi-dung/noi-dung` | Mảnh HTML nội dung chính sách (nhúng vào modal/webview) |

---

## 7. Chức năng CHƯA có JSON API (app cần bổ sung endpoint nếu muốn làm)

Các chức năng sau hiện chỉ có dạng **form server-rendered** dưới `/app/*`
(session + CSRF như trên, nhưng trả HTML chứ không phải JSON):

- Thêm/xác minh tài khoản ngân hàng (OTP email) — `/app/banks`
- Tạo lệnh rút tiền — `/app/withdrawals`
- Nhiệm vụ (missions), điểm danh — `/app/nhiem-vu`
- Giới thiệu bạn bè (referrals) — `/app/referrals`
- Link chia sẻ — `/app/links`
- Khám phá / voucher — `/app/discover`
- Ticket hỗ trợ đầy đủ (tạo loại khác, xem hội thoại, trả lời) — `/app/support`
- Đổi thông tin tài khoản, mật khẩu, đăng xuất mọi thiết bị — `/app/settings`
- Thông báo (chuông) — render kèm trang, chưa có endpoint đọc/đánh dấu đã đọc

Khi xây app native nên thêm các endpoint JSON tương ứng vào `src/routes/api/`
(tái dùng service sẵn có: `bank.ts`, `withdrawal.ts`, `mission.ts`…) thay vì
parse HTML.

---

## 8. Checklist tích hợp cho client app

1. **Cookie jar bật sẵn** — toàn bộ auth dựa trên cookie `aff_session`, không có Bearer token.
2. **CSRF**: `GET /csrf` ngay khi mở app → cache token → header `x-csrf-token` cho mọi POST; gặp `403 INVALID_CSRF` thì gọi lại `/csrf` rồi retry 1 lần.
3. **Đừng gửi header `Origin` giả** — WebView/fetch trong app thường không gửi Origin (được phép); nếu gửi thì phải đúng `APP_ORIGIN`.
4. **Retry/backoff** khi `429` theo số giây trong message.
5. **Hiển thị `error.message` trực tiếp** — đã là tiếng Việt thân thiện.
6. **Mở `buyUrl` bằng browser thật** để click được ghi nhận và deep-link sang app Shopee/TikTok/Lazada hoạt động đúng.
7. **Parse chuỗi số VND** từ orders/wallet/withdrawals (`"40000"` → 40000).
8. Poll `GET /me` / `GET /me/orders` khi quay lại app sau khi mua để cập nhật trạng thái "Chờ sàn xác nhận" → PENDING/APPROVED.
