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
| [`docs/01-tong-quan.md`](docs/01-tong-quan.md) | Bài toán, mô hình chia tiền, kiến trúc tổng thể |
| [`docs/02-luong-nghiep-vu.md`](docs/02-luong-nghiep-vu.md) | Luồng mua hoàn tiền end-to-end, đối soát đơn, giải ngân |
| [`docs/03-cau-truc-ma-nguon.md`](docs/03-cau-truc-ma-nguon.md) | Bản đồ thư mục, routes, services, views |
| [`docs/04-du-lieu-va-ledger.md`](docs/04-du-lieu-va-ledger.md) | Schema CSDL, mô hình ledger kế toán kép, 4 ví |
| [`docs/05-cai-dat-va-van-hanh.md`](docs/05-cai-dat-va-van-hanh.md) | Biến môi trường, SMTP/OTP, tích hợp sàn, production |
| [`docs/06-api-va-routes.md`](docs/06-api-va-routes.md) | Toàn bộ endpoint API + trang web |
| [`docs/07-quy-uoc-phat-trien.md`](docs/07-quy-uoc-phat-trien.md) | Quy ước code, tiền tệ, bảo mật, kiểm thử |

## Nguyên tắc bất di bất dịch

- **Tiền VND là số nguyên**, hoa hồng tính bằng bps (1/10000), làm tròn xuống.
- **Mọi thay đổi số dư đi qua bút toán ledger cân bằng** DEBIT/CREDIT — không bao giờ sửa trực tiếp số dư.
- **Không bịa số tiền hoàn** khi sàn chưa trả hoa hồng — hiển thị "Đang cập nhật".
- **Redirect Affiliate phải qua allowlist host** (`isSafeAffiliateRedirect`).
- **Không suy ra người mua từ email** — chỉ đối soát qua clickId / Sub ID / tracking code.
- Thông báo lỗi cho người dùng bằng tiếng Việt, qua `AppError(code, message, statusCode)`.

## Kiểm tra trước khi bàn giao

```bash
npm run typecheck && npm test && npm run build
```
