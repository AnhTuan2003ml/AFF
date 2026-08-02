# ShopTik

MVP máy chủ web cho hành trình: đăng ký bằng email → dán link sản phẩm → xem ảnh, giá và tiền hoàn dự kiến → bấm Mua ngay qua Affiliate → theo dõi đơn → rút tiền.

## Luồng mua hoàn tiền

1. Dán link sản phẩm tại `/app` → bấm **Tra cứu** → `POST /api/v1/products/preview`
   trả tên, ảnh, giá gốc và tiền hoàn dự kiến kèm `previewId` (không ghi DB).
2. Bấm **Mua ngay** → `POST /api/v1/products/purchase` đổi `previewId` lấy
   `buyUrl = /go/:clickId` (lúc này mới tạo bản ghi `affiliate_links`).
3. `/go/:clickId` ghi nhận click rồi chuyển hướng sang link Affiliate của sàn.

Chi tiết kiến trúc dành cho dev/AI: xem `CLAUDE.md`.

## Cấu trúc chính

- `src/auth`: phiên đăng nhập, CSRF và phân quyền.
- `src/routes`: web người dùng (`app.ts`), API JSON (`api/`), trung tâm vận hành (`backoffice.ts`, `admin-*.ts`).
- `src/services`: OTP/email, Affiliate, tra cứu sản phẩm, đơn, ledger, ngân hàng và rút tiền.
- `migrations`: cấu trúc PostgreSQL, trigger tạo ví và kiểm tra bút toán cân bằng.
- `views` + `public`: giao diện server-rendered responsive, không phụ thuộc CDN.
- `docs/openapi.yaml`: hợp đồng API MVP.
- `tests`: kiểm tra mã hóa, mật khẩu, link, template và schema PostgreSQL.
- `infra`: cấu hình reverse proxy mẫu.

Google Login chưa được kích hoạt. Bảng `auth_identities` và ranh giới module đã sẵn để bổ sung sau mà không thay đổi mô hình người dùng hiện tại.

## Chạy local

Yêu cầu: Node.js 22+, PostgreSQL 16+ và Redis 7+.

1. Kiểm tra `.env`, cấu hình PostgreSQL, SMTP và Shopee Affiliate.
2. Không ghi đè các khóa bí mật hoặc danh sách admin đang có.
3. Cài thư viện: `npm ci`.
4. Tạo bảng: `npm run db:migrate`.
5. Tạo dữ liệu nội dung mẫu: `npm run db:seed`.
6. Đặt tạm `ADMIN_INITIAL_PASSWORD` trong môi trường rồi tạo quản trị:
   `ADMIN_INITIAL_PASSWORD='MatKhauManh123!' npm run admin:create -- admin@example.com`.
   Xóa biến này ngay sau khi tạo xong.
7. Chạy: `npm run dev`.

Mở `http://localhost:3000`. Khu vận hành ở `/backoffice`.

## Dữ liệu sản phẩm và hoa hồng

Nguồn chính thức là **Shopee Affiliate Open API** (cùng cơ chế các nền tảng
hoàn tiền lớn sử dụng). Đăng nhập [affiliate.shopee.vn](https://affiliate.shopee.vn)
→ Công cụ → API để lấy AppId và Secret (tài khoản Affiliate phải được duyệt
quyền API), rồi đặt:

```env
SHOPEE_OPEN_API_APP_ID=15394330000
SHOPEE_OPEN_API_SECRET=chuoi-secret-shopee-cap
```

Khi có 2 giá trị này: tra cứu trả tên, ảnh, giá và tỷ lệ hoa hồng thật từ
`productOfferV2`; nút Mua tạo short link chính thức `generateShortLink` kèm
subIds (`cClickId-source-campaign`) để đối soát đơn. Nếu chưa có, hệ thống
lùi về đọc trang công khai (Shopee thường chặn bot nên ảnh/giá có thể trống).

Tùy chọn bổ sung — endpoint nội bộ trả `productName`, `imageUrl`, `priceVnd`,
`affiliateCommissionVnd`:

```env
SHOPEE_PRODUCT_API_URL=https://api-noi-bo.example.com/shopee/product
SHOPEE_PRODUCT_API_TOKEN=token-cua-he-thong
SHOPEE_DEFAULT_COMMISSION_RATE_BPS=0
SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS=8000
```

Không đặt tỷ lệ mặc định nếu chưa được sàn xác nhận. Khi API chưa trả hoa hồng,
giao diện vẫn cho mua nhưng hiển thị “Đang cập nhật”, không tự bịa số tiền.

## Chạy production trên Windows

Production không chạy bằng `npm run dev`. Cần có domain HTTPS đã trỏ qua
reverse proxy hoặc Cloudflare Tunnel và Docker Desktop đang hoạt động.

Mở PowerShell tại thư mục dự án rồi chạy:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-production.ps1
```

Script sẽ yêu cầu domain HTTPS, Gmail gửi OTP, App Password, Affiliate ID và
tài khoản quản trị đầu tiên. Sau đó script tự:

- tạo các khóa bí mật ngẫu nhiên đúng chuẩn;
- sao lưu `.env` hiện tại rồi tạo `.env` production;
- build image production;
- khởi động PostgreSQL và Redis không mở cổng ra Internet;
- chạy migration trước khi web được phép khởi động;
- tạo dữ liệu nền và tài khoản quản trị;
- kiểm tra endpoint sẵn sàng.

Các lần chạy sau chỉ cần:

```powershell
docker compose up -d --build web
```

Xem trạng thái và log:

```powershell
docker compose ps
docker compose logs -f web
```

Không hạ yêu cầu HTTPS hoặc đổi cookie production sang không bảo mật để chạy
localhost. Nếu mới kiểm tra trên máy chưa có domain, giữ
`NODE_ENV=development` nhưng vẫn có thể đặt `EMAIL_MODE=smtp` để gửi OTP thật.

## Gửi OTP bằng Gmail

Không dùng mật khẩu đăng nhập Gmail thông thường. Bật xác minh 2 bước, tạo App Password, rồi đặt:

```env
EMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mail-gui@example.com
SMTP_PASS=mat-khau-ung-dung
SMTP_FROM_EMAIL=mail-gui@example.com
```

Với nhà cung cấp khác, thay host, port và chế độ TLS theo tài liệu của nhà cung cấp. Trước production cần cấu hình SPF, DKIM và DMARC cho tên miền gửi.

## Nguyên tắc production

- Chỉ dùng HTTPS; đặt `NODE_ENV=production`, `APP_ORIGIN` đúng domain và `TRUST_PROXY=true` sau reverse proxy tin cậy.
- PostgreSQL và Redis không mở trực tiếp ra Internet.
- Quản lý secret bằng secret manager; không đưa `.env` vào Git hoặc ZIP chia sẻ công khai.
- Tài khoản ngân hàng được mã hóa AES-256-GCM và chỉ hiển thị 4 số cuối.
- Máy chủ lưu phiên bằng token ngẫu nhiên đã băm; cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Mật khẩu dùng Argon2id; OTP có hạn dùng, giới hạn lần gửi/lần thử và không lưu dạng rõ.
- Tiền chỉ thay đổi qua bút toán cân bằng. Không sửa trực tiếp số dư.
- Chưa mở chi tiền tự động khi chưa có hợp đồng, khóa production, webhook và đối soát thật với đối tác chi hộ.

## Kiểm tra trước bàn giao

```bash
npm run typecheck
npm test
npm run build
```

Đặc tả API tổng quan nằm tại `docs/openapi.yaml`.
