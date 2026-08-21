# ShopTik — bản đồ dự án cho AI/dev

MVP hoàn tiền Affiliate đa sàn (Shopee/TikTok Shop/Lazada). Fastify 5 + TypeScript ESM,
PostgreSQL, Redis, server-rendered Nunjucks. Node 22+. Import nội bộ luôn dùng đuôi `.js`.

## Luồng nghiệp vụ chính (mua hoàn tiền)

1. Người dùng dán link sản phẩm ở `/app` → bấm **Xem tiền hoàn**
   → `POST /api/v1/products/preview` (`src/routes/api/products.ts`)
   → `lookupProductPreview` (`src/services/product-preview.ts`): resolve link rút gọn,
   lấy dữ liệu theo thứ tự ưu tiên **Shopee Affiliate Open API**
   (`src/services/shopee-open-api.ts`, GraphQL `productOfferV2` — nguồn chính thức
   cho tên/ảnh/giá/tỷ lệ hoa hồng, cần `SHOPEE_OPEN_API_APP_ID`+`SECRET`)
   → partner API tự cấu hình → API sàn/HTML công khai (thường bị chặn bot).
   Tiền hoàn = hoa hồng × `buyerCashbackPercent`. Trả `{ product, previewId }`;
   preview lưu tạm trong `src/services/preview-cache.ts` (in-memory, TTL 15 phút).
   **Không ghi DB ở bước này.**
2. Bấm **Mua ngay** → `POST /api/v1/products/purchase` với `previewId`
   → `createPurchaseIntent` (`src/services/affiliate.ts`): build link Affiliate
   (Shopee: `generateShortLink` qua Open API kèm subIds do `buildSubIdParts`
   dựng — `[c<clickId>, u<users.tracking_code>, p<productId>, source, campaign]`,
   fallback `s.shopee.vn/an_redir`; TikTok/Lazada qua partner API "convert"),
   ghi `affiliate_programs` + `affiliate_links`, trả `buyUrl = /go/:clickId`.
3. Trình duyệt mở `buyUrl` → `GET /go/:clickId` (`src/routes/public.ts`):
   kiểm tra allowlist redirect, ghi `click_events`, 302 sang link Affiliate.
   Ngay từ bước 2, lượt mua đã hiện trong `/app/orders` dưới dạng bản ghi
   "Chờ sàn xác nhận" (`listOrderHistory` trong `src/services/order-history.ts`
   gộp `orders` với các `affiliate_links` campaign `instantbuy` chưa có đơn
   khớp); bản ghi này tự biến mất khi bước 4 gán được đơn thật cho link.
4. Đơn về theo hai đường, cùng đổ vào `importOrderRow` (`src/services/order-import.ts`):
   - **Tự động (chính)**: `src/jobs/sync-scheduler.ts` → `runShopeeOrderSync`
     (`src/services/shopee-order-sync.ts`) gọi báo cáo chuyển đổi Shopee
     (`src/services/shopee-report.ts`, cookie + tần suất do admin đặt ở
     `/backoffice/sync`, lưu mã hóa trong `platform_sync_settings`; mặc định
     60 phút/lượt, lấy đơn 30 ngày gần nhất). Sub ID nằm ở `utm_content`, các
     mảnh nối bằng "-" và có thể bị sàn cắt bớt đuôi. `resolveUser` đối soát
     theo thứ tự: mã lượt click → Sub ID nguyên vẹn → cặp
     `u<tracking_code>` + `p<productId>` (chọn lượt bấm mua gần nhất trước giờ
     mua và CHƯA gắn đơn nào). Không bao giờ suy ra người mua từ email.
   - **Thủ công**: import CSV ở `/backoffice/reconciliation`.
   Trạng thái: `COMPLETED`→APPROVED, `CANCEL`→CANCELLED (đảo khoản + hiện lý do),
   còn lại→PENDING (đang duyệt, hỏi lại ở lượt sau).
5. Cộng tiền qua bút toán ledger cân bằng (`src/services/ledger.ts`) — không bao giờ
   sửa trực tiếp số dư. Đơn Hoàn thành nằm ở ví CHỜ thêm `cashback_hold_days`
   (Cấu hình nghiệp vụ) tính từ `orders.completed_at`; `releaseDueCashback`
   (`src/services/cashback-release.ts`) mới chuyển sang KHẢ DỤNG để rút.
   Khi sàn sửa hoa hồng lúc đơn còn chờ, hệ thống đảo khoản cũ rồi ghi khoản mới
   ở `cashback_revision` kế tiếp (khóa idempotency có hậu tố `:revN`).

Frontend của luồng này: `views/app/dashboard.njk` + `public/purchase.js` +
`public/instant-purchase.css`. JS shell chung (sidebar/theme/menu): `public/app.js`.

## Cấu trúc thư mục

- `src/server.ts` — bootstrap Fastify, plugin, error handler, mount route.
- `src/config.ts` — load/validate ENV (zod). `src/db.ts` — pool PG + helper `query`.
- `src/auth/` — session cookie, CSRF, guards (`requireUser`, `requireApiUser`), đồng bộ admin.
  Xác thực có HAI đường vào cùng bảng `sessions`: cookie `aff_session` cho web, và
  `Authorization: Bearer` cho app di động (`services/mobile-token.ts` — access 30 phút,
  refresh 60 ngày, xoay cả hai mỗi lần làm mới). Cùng một hook `session.ts` đọc cả hai
  nên mọi guard sẵn có tự hiểu người dùng app. CSRF bỏ qua khi `authScheme === "bearer"`.
- `src/routes/`
  - `public.ts` — landing, `/go/:clickId`, healthcheck.
  - `auth.ts` — trang đăng nhập/đăng ký (form).
  - `app.ts` — trang người dùng `/app/*` (dashboard, đơn, ví, ngân hàng, rút tiền…).
  - `api/` — JSON API `/api/v1/*`: `auth.ts`, `products.ts` (preview/purchase),
    `account.ts` (me/orders/wallet/withdrawals/support), `me.ts` (ngân hàng, rút tiền,
    hồ sơ, phiên, xóa tài khoản — nhánh cho app di động), `deps.ts`, `index.ts`.
  - `backoffice.ts`, `admin-*.ts` — trung tâm vận hành `/backoffice/*`.
- `src/services/` — nghiệp vụ thuần, nhận `db`/`config` qua tham số, dễ test:
  affiliate, product-preview, preview-cache, ledger, withdrawal, bank, otp, email,
  order-import, business-config, audit…
- `views/` — Nunjucks: `app/app-base.njk` (khung user), `backoffice/base.njk`
  (khung admin duy nhất — mọi trang backoffice, kể cả các trang hậu tố `-v2`,
  đều extends đúng file này), partials macro/icon.
  Hậu tố `-v2` chỉ còn dùng cho tên file nội dung backoffice console, không
  phải một khung admin khác.
- `public/` — static, phục vụ tại `/assets/*`. Không CDN (CSP `self`).
- `migrations/` — SQL thuần, chạy bằng `npm run db:migrate`.
- `mobile/` — app React Native (Expo SDK 54, expo-router). Project riêng, có
  `package.json`/`tsconfig` riêng; `npm run typecheck` và `npm test` ở gốc KHÔNG
  chạm tới nó. Màu lấy từ `mobile/src/theme/tokens.ts` — bản dịch của
  `public/theme/tokens.css`, đổi màu thì sửa file CSS trước rồi đồng bộ sang.
  Xem `mobile/README.md` và `docs/08-mobile-giai-doan-0.md`.
- `tests/` — Vitest; DB test dùng PGlite (`tests/helpers.ts`), không cần Postgres thật.

## Quy ước

- Tiền VND là số nguyên (không float); tính hoa hồng dùng bps (1/10000), làm tròn xuống.
- Mọi thay đổi số dư qua ledger transaction cân bằng DEBIT/CREDIT.
- Link/redirect Affiliate phải qua allowlist host (`isSafeAffiliateRedirect`).
- Thông báo lỗi người dùng bằng tiếng Việt, qua `AppError(code, message, statusCode)`.
- Không tự bịa số tiền hoàn khi sàn chưa trả hoa hồng — hiển thị "Đang cập nhật".
- Chính sách người dùng chỉ có MỘT nguồn: `src/services/user-policy.ts`. Cùng nội
  dung đó phục vụ trang `/chinh-sach-nguoi-dung`, mảnh HTML
  `/chinh-sach-nguoi-dung/noi-dung` (modal mở từ hyperlink chân trang) và email
  gửi ngay khi đăng ký (`EmailService.sendUserPolicy`). Các con số trong chính
  sách lấy từ `business_config` nên luôn khớp cách hệ thống tính tiền; sửa nội
  dung ảnh hưởng quyền lợi thì tăng `USER_POLICY_VERSION`.

## Lệnh

```bash
npm run dev         # tsx watch
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run db:migrate  # chạy migrations
```
