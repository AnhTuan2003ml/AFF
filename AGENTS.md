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
   (Shopee: `generateShortLink` qua Open API kèm subIds `[cClickId, source, campaign]`,
   fallback `s.shopee.vn/an_redir`; TikTok/Lazada qua partner API "convert"),
   ghi `affiliate_programs` + `affiliate_links`, trả `buyUrl = /go/:clickId`.
3. Trình duyệt mở `buyUrl` → `GET /go/:clickId` (`src/routes/public.ts`):
   kiểm tra allowlist redirect, ghi `click_events`, 302 sang link Affiliate.
4. Đơn về qua import CSV đối soát (`src/services/order-import.ts`, backoffice)
   → cộng tiền qua bút toán ledger cân bằng (`src/services/ledger.ts`) — không bao giờ
   sửa trực tiếp số dư.

Frontend của luồng này: `views/app/dashboard.njk` + `public/purchase.js` +
`public/instant-purchase.css`. JS shell chung (sidebar/theme/menu): `public/app.js`.

## Cấu trúc thư mục

- `src/server.ts` — bootstrap Fastify, plugin, error handler, mount route.
- `src/config.ts` — load/validate ENV (zod). `src/db.ts` — pool PG + helper `query`.
- `src/auth/` — session cookie, CSRF, guards (`requireUser`, `requireApiUser`), đồng bộ admin.
- `src/routes/`
  - `public.ts` — landing, `/go/:clickId`, healthcheck.
  - `auth.ts` — trang đăng nhập/đăng ký (form).
  - `app.ts` — trang người dùng `/app/*` (dashboard, đơn, ví, ngân hàng, rút tiền…).
  - `api/` — JSON API `/api/v1/*`: `auth.ts`, `products.ts` (preview/purchase),
    `account.ts` (me/orders/wallet/withdrawals/support), `deps.ts`, `index.ts`.
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
- `tests/` — Vitest; DB test dùng PGlite (`tests/helpers.ts`), không cần Postgres thật.

## Quy ước

- Tiền VND là số nguyên (không float); tính hoa hồng dùng bps (1/10000), làm tròn xuống.
- Mọi thay đổi số dư qua ledger transaction cân bằng DEBIT/CREDIT.
- Link/redirect Affiliate phải qua allowlist host (`isSafeAffiliateRedirect`).
- Thông báo lỗi người dùng bằng tiếng Việt, qua `AppError(code, message, statusCode)`.
- Không tự bịa số tiền hoàn khi sàn chưa trả hoa hồng — hiển thị "Đang cập nhật".

## Lệnh

```bash
npm run dev         # tsx watch
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run db:migrate  # chạy migrations
```
