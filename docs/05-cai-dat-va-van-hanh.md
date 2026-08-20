# 05 — Cài đặt và vận hành

## Yêu cầu

- Node.js **22+**
- PostgreSQL **16+**
- Redis **7+**
- (Production) Docker Desktop + domain HTTPS qua reverse proxy hoặc Cloudflare Tunnel

## Chạy local (development)

```bash
npm ci
# Tạo .env — xem bảng biến bên dưới
npm run db:migrate
npm run db:seed
ADMIN_INITIAL_PASSWORD='MatKhauManh123!' npm run admin:create -- admin@example.com
npm run dev
```

- Mở `http://localhost:3000`; khu vận hành: `/backoffice`.
- Dev mặc định `EMAIL_MODE=console` — OTP in ra terminal, không cần SMTP.
- **Xóa `ADMIN_INITIAL_PASSWORD` khỏi môi trường ngay sau khi tạo admin.**
- Không ghi đè các khóa bí mật hoặc danh sách admin đang có trong `.env`.

## Biến môi trường

Nguồn chính thức và đầy đủ nhất là **`src/config.ts`** (zod schema, fail-fast khi sai).
Dưới đây là các nhóm chính:

### Bắt buộc

| Biến | Ghi chú |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| `APP_SECRET`, `OTP_PEPPER`, `IP_HASH_PEPPER` | Chuỗi ngẫu nhiên ≥32 ký tự, mỗi biến một giá trị riêng |
| `FIELD_ENCRYPTION_KEY` | Khóa AES base64 **đúng 32 byte** (`openssl rand -base64 32`) |
| `TERMS_VERSION`, `PRIVACY_VERSION` | Version văn bản pháp lý (ví dụ `2026-01-01`) |

### Ứng dụng

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `NODE_ENV` | `development` | Production ép HTTPS + SMTP |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | |
| `APP_ORIGIN` | `http://localhost:3000` | Production bắt buộc `https://` |
| `APP_NAME` | `ShopTik` | |
| `TRUST_PROXY` | `false` | Bật khi chạy sau reverse proxy tin cậy |
| `REDIS_URL` | (trống) | |
| `SESSION_TTL_HOURS` | `168` | Vòng đời cookie phiên của **web** |
| `MOBILE_ACCESS_TOKEN_TTL_MINUTES` | `30` | Access token của app di động (5–720) |
| `MOBILE_REFRESH_TOKEN_TTL_DAYS` | `60` | Refresh token của app di động (1–365) |
| `COMMUNITY_ZALO_URL` / `COMMUNITY_TELEGRAM_URL` | (trống) | Hiện nút cộng đồng nổi khi được đặt |

### Email / OTP

| Biến | Ghi chú |
| --- | --- |
| `EMAIL_MODE` | `console` (dev) hoặc `smtp` (bắt buộc ở production) |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM_NAME/FROM_EMAIL` | Với Gmail: bật xác minh 2 bước → tạo **App Password** (không dùng mật khẩu thường), `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` |
| `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_MAX_SENDS_PER_HOUR` | Giới hạn OTP |

Trước production: cấu hình SPF, DKIM, DMARC cho tên miền gửi.

### Tích hợp sàn

| Biến | Ghi chú |
| --- | --- |
| `SHOPEE_OPEN_API_APP_ID` + `SHOPEE_OPEN_API_SECRET` | **Quan trọng nhất.** Lấy tại [affiliate.shopee.vn](https://affiliate.shopee.vn) → Công cụ → API (tài khoản phải được duyệt quyền API). Có 2 giá trị này thì tra cứu trả dữ liệu thật từ `productOfferV2` và nút Mua tạo short link chính thức kèm subIds |
| `SHOPEE_AFFILIATE_ID` | ID Affiliate cho link fallback |
| `*_PRODUCT_API_URL` + `*_PRODUCT_API_TOKEN` | (Tùy chọn) endpoint partner nội bộ trả `productName`, `imageUrl`, `priceVnd`, `affiliateCommissionVnd` |
| `*_DEFAULT_COMMISSION_RATE_BPS` | **Không đặt nếu sàn chưa xác nhận** — khi API chưa trả hoa hồng, UI hiển thị "Đang cập nhật" chứ không bịa số |
| `*_AFFILIATE_REDIRECT_HOSTS` | Bổ sung allowlist host redirect |
| `TIKTOK_OPEN_API_APP_KEY/SECRET/ACCESS_TOKEN` | TikTok Shop Open API — access token lấy qua OAuth, **dán tay và tự gia hạn** (chưa auto-refresh) |
| `LAZADA_OPEN_API_APP_KEY/SECRET/ACCESS_TOKEN`, `LAZADA_AFFILIATE_MASTER_LINK` | Tương tự cho Lazada; Master Link dạng `https://c.lazada.vn/t/c.xxxxx` |

### Nghiệp vụ (chỉ là giá trị SEED)

`BUYER_CASHBACK_PERCENT` (80) + `PLATFORM_SHARE_PERCENT` (20) phải cộng đúng 100;
`CASHBACK_HOLD_DAYS` (30), `AFFILIATE_ATTRIBUTION_DAYS` (30), `MIN/MAX_WITHDRAWAL_VND`,
thưởng referral, mốc nhiệm vụ (`MISSION_*_MILESTONES_JSON`)…

> ⚠️ Các giá trị này chỉ dùng để **khởi tạo lần đầu** khi DB trống. Sau đó admin sửa trong
> Backoffice → Cấu hình / Nhiệm vụ, **DB là nguồn thật** và có hiệu lực ngay không cần restart.

### Tiến trình nền và admin

| Biến | Ghi chú |
| --- | --- |
| `ENABLE_SYNC_SCHEDULER` | `true` — bật vòng lặp sync đơn + giải ngân |
| `SYNC_SCHEDULER_TICK_SECONDS` | `60` — nhịp kiểm tra (tần suất sync thật do admin đặt ở `/backoffice/sync`) |
| `ADMIN_SYNC_FROM_ENV`, `ADMIN_ACCOUNTS_JSON`, `ADMIN_STRICT_ALLOWLIST`, `ADMIN_RESET_PASSWORDS_ON_STARTUP` | Đồng bộ allowlist admin từ ENV khi khởi động |

## Cấu hình đồng bộ đơn Shopee (sau khi chạy)

1. Đăng nhập backoffice → **Đồng bộ sàn** (`/backoffice/sync`).
2. Dán cookie đăng nhập trang báo cáo Shopee Affiliate, đặt tần suất (mặc định 60 phút/lượt,
   kéo đơn 30 ngày gần nhất). Cookie được **mã hóa** trước khi lưu.
3. Có thể bấm chạy sync tay để kiểm tra; hoặc test bằng CLI: `npm run shopee:report:test`.

## Chạy production trên Windows

Production **không** chạy bằng `npm run dev`. Lần đầu:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-production.ps1
```

Script hỏi domain HTTPS, Gmail gửi OTP + App Password, Affiliate ID và tài khoản quản trị
đầu tiên, sau đó tự động: sinh khóa bí mật chuẩn → backup `.env` cũ và tạo `.env` production
→ build image → khởi động PostgreSQL/Redis (không mở cổng ra Internet) → chạy migration
trước khi web khởi động → seed + tạo admin → kiểm tra endpoint sẵn sàng.

Các lần sau:

```powershell
docker compose up -d --build web    # cập nhật + chạy
docker compose ps                   # trạng thái
docker compose logs -f web          # log
```

### Nguyên tắc production

- Chỉ HTTPS; `NODE_ENV=production`, `APP_ORIGIN` đúng domain, `TRUST_PROXY=true` sau proxy tin cậy.
- **Không** hạ yêu cầu HTTPS hay đổi cookie sang không bảo mật để chạy localhost — nếu chỉ
  thử nghiệm, giữ `NODE_ENV=development` (vẫn có thể đặt `EMAIL_MODE=smtp` để gửi OTP thật).
- PostgreSQL/Redis không mở trực tiếp ra Internet.
- Secret quản lý bằng secret manager; không đưa `.env` vào Git/ZIP chia sẻ.
- Chưa mở chi tiền tự động khi chưa có hợp đồng, khóa production, webhook và đối soát thật
  với đối tác chi hộ.

## Healthcheck

- `GET /-/live` — tiến trình còn sống.
- `GET /-/ready` — đã kết nối DB, sẵn sàng nhận traffic.

## Script tiện ích

| Lệnh | Việc |
| --- | --- |
| `npm run db:migrate` / `db:seed` | Migration / dữ liệu nội dung mẫu |
| `npm run admin:create -- email` | Tạo admin (cần `ADMIN_INITIAL_PASSWORD` tạm thời) |
| `npm run data:clear-demo` | Dọn dữ liệu demo |
| `npm run shopee:report:test` | Thử kéo báo cáo chuyển đổi Shopee với cấu hình hiện tại |

➡️ Tiếp theo: [06 — API và routes](06-api-va-routes.md)
