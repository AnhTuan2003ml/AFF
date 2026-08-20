# ShopTik — Nền tảng hoàn tiền Affiliate đa sàn

ShopTik là MVP web hoàn tiền (cashback) cho người mua hàng trên **Shopee / TikTok Shop / Lazada**:
người dùng dán link sản phẩm → xem tiền hoàn dự kiến → bấm Mua ngay qua link Affiliate →
hệ thống tự đối soát đơn với sàn → cộng tiền vào ví → rút về tài khoản ngân hàng.

> 📚 **Người mới bắt đầu ở đây:** đọc [`docs/README.md`](docs/README.md) — bộ tài liệu đầy đủ
> (tổng quan, luồng nghiệp vụ, cấu trúc mã nguồn, CSDL, cài đặt, API, quy ước).
> AI/agent làm việc với repo: xem thêm [`CLAUDE.md`](CLAUDE.md) (bản đồ dự án cô đọng).

## Luồng nghiệp vụ trong 30 giây

```
Dán link sản phẩm ──▶ Xem tiền hoàn (preview, không ghi DB)
        │
        ▼
   Bấm "Mua ngay" ──▶ Tạo link Affiliate + clickId ──▶ Redirect sang sàn
        │
        ▼
  Đơn về từ sàn (tự động sync báo cáo Shopee / import CSV thủ công)
        │
        ▼
  Đối soát Sub ID ──▶ Gán đơn cho đúng người ──▶ Ghi bút toán ledger
        │
        ▼
  Ví CHỜ ──(hết hạn giữ tiền)──▶ Ví KHẢ DỤNG ──▶ Rút tiền về ngân hàng
```

Chi tiết từng bước (file nào xử lý, đối soát ra sao): [`docs/02-luong-nghiep-vu.md`](docs/02-luong-nghiep-vu.md).

## Công nghệ

| Thành phần | Lựa chọn |
| --- | --- |
| Runtime | Node.js 22+, TypeScript ESM (import nội bộ luôn có đuôi `.js`) |
| Web framework | Fastify 5 (helmet, rate-limit, cookie, CSRF) |
| Giao diện | Server-rendered Nunjucks + CSS/JS thuần trong `public/` (không CDN, CSP `self`) |
| CSDL | PostgreSQL 16+ (migration SQL thuần), Redis 7+ |
| Kiểm thử | Vitest + PGlite (không cần Postgres thật khi chạy test) |
| Tích hợp sàn | Shopee Affiliate Open API (chính), TikTok Shop / Lazada Open API |

## Chạy local nhanh

Yêu cầu: Node.js 22+, PostgreSQL 16+, Redis 7+.

```bash
# 1. Cài thư viện
npm ci

# 2. Tạo file .env (xem danh sách biến ở docs/05-cai-dat-va-van-hanh.md)
#    Tối thiểu: DATABASE_URL, APP_SECRET, OTP_PEPPER, IP_HASH_PEPPER,
#    FIELD_ENCRYPTION_KEY (base64 32 byte), TERMS_VERSION, PRIVACY_VERSION.

# 3. Tạo bảng + dữ liệu mẫu
npm run db:migrate
npm run db:seed

# 4. Tạo tài khoản quản trị (xóa biến ADMIN_INITIAL_PASSWORD ngay sau đó)
ADMIN_INITIAL_PASSWORD='MatKhauManh123!' npm run admin:create -- admin@example.com

# 5. Chạy dev
npm run dev
```

Mở `http://localhost:3000` — trang người dùng ở `/app`, trung tâm vận hành ở `/backoffice`.
Ở chế độ dev, OTP/email in ra console (`EMAIL_MODE=console`), không cần SMTP.

## Lệnh thường dùng

```bash
npm run dev            # chạy dev (tsx watch)
npm run typecheck      # tsc --noEmit
npm test               # vitest run (DB test dùng PGlite)
npm run db:migrate     # chạy migrations
npm run db:seed        # dữ liệu nội dung mẫu
npm run build          # build production vào dist/
npm run admin:create   # tạo tài khoản admin
npm run data:clear-demo        # dọn dữ liệu demo
npm run shopee:report:test     # thử kéo báo cáo chuyển đổi Shopee
```

## Tài liệu

| Tài liệu | Nội dung |
| --- | --- |

Hai chỗ vẫn cần Boss
iOS chưa build được. Không phải thiếu cấu hình — cấu hình xong hết rồi — mà vì .ipa bắt buộc có tài khoản Apple Developer 99 USD/năm ngay từ khâu kiểm thử, và bản ad-hoc còn phải đăng ký sẵn UDID của từng iPhone. Chưa có thì npm run build sẽ chạy xong Android rồi dừng ở khâu chứng chỉ iOS. Trong lúc đó dùng npm run build:android.

Ba trường trong submit.production đang để giá trị tạm (CHUA_CO) — appleId, ascAppId, appleTeamId lấy từ App Store Connect, và tệp khoá Google Play đặt ở secrets/google-play-service-account.json. Chỉ cần tới GĐ 4 lúc nộp cửa hàng.

Và ba lệnh khởi động vẫn chờ Boss: npm run eas -- login, npm run eas -- init --id 25612d71-daf1-428d-afb6-8f2551167bbe, rồi npm run build:android.