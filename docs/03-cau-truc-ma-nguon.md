# 03 — Cấu trúc mã nguồn

## Bản đồ thư mục gốc

```
AFF/
├── src/            # Toàn bộ mã TypeScript phía server
├── views/          # Template Nunjucks (server-rendered)
├── public/         # CSS/JS/ảnh tĩnh, phục vụ tại /assets/*
├── migrations/     # SQL thuần, chạy tuần tự bằng npm run db:migrate
├── tests/          # Vitest (DB test dùng PGlite, không cần Postgres)
├── scripts/        # Tiện ích CLI: migrate, seed, tạo admin, dọn demo...
├── infra/          # Cấu hình reverse proxy mẫu
├── docs/           # Bộ tài liệu này
├── CLAUDE.md       # Bản đồ dự án cô đọng cho AI/dev
├── docker-compose.yml + Dockerfile   # Chạy production
└── package.json    # Node 22+, type: module (ESM)
```

> Quy tắc ESM quan trọng: **import nội bộ luôn có đuôi `.js`**
> (`import { query } from "../db.js"`) dù file nguồn là `.ts`.

## `src/` — chi tiết

### Hạt nhân

| File | Vai trò |
| --- | --- |
| `server.ts` | Bootstrap Fastify: plugin (cookie, helmet CSP, rate-limit, static, nunjucks), session/CSRF hooks, biến `locals` cho template (badge đếm việc chờ xử lý, số dư header, thông báo), mount routes, khởi động admin-sync + sync-scheduler, error handler |
| `config.ts` | Load + validate toàn bộ ENV bằng zod. Fail-fast khi thiếu/sai. Đây là **danh mục biến môi trường chính thức** — muốn biết có biến gì, đọc file này |
| `db.ts` | Pool PostgreSQL + helper `query`, `withTransaction` |

### `src/auth/` — xác thực và phân quyền

| File | Vai trò |
| --- | --- |
| `session.ts` | Session cookie (token ngẫu nhiên đã băm, `HttpOnly`/`Secure`/`SameSite=Lax`), gắn `request.currentUser` |
| `csrf.ts` | CSRF token cho form + API |
| `guards.ts` | `requireUser` (redirect về đăng nhập), `requireApiUser` (401 JSON), guard theo role cho backoffice |
| `admin-sync.ts` | Admin mặc định hardcode + đồng bộ allowlist admin từ ENV khi khởi động |

### `src/routes/` — điểm vào HTTP

Routes chỉ validate input (zod qua `parseInput`) và gọi service; không chứa nghiệp vụ.

| File | Prefix | Nội dung |
| --- | --- | --- |
| `public.ts` | `/` | Landing, trang pháp lý, chính sách người dùng, **`/go/:clickId`** (redirect Affiliate), healthcheck `/-/live` `/-/ready` |
| `auth.ts` | `/` | Đăng ký, xác thực email OTP, đăng nhập/xuất, quên/đặt lại mật khẩu (URL tiếng Việt: `/dang-ky`, `/dang-nhap`…) |
| `app.ts` | `/app` | Trang người dùng: dashboard, links, orders, wallet, banks, withdrawals, discover, referrals, nhiem-vu, support, settings |
| `api/` | `/api/v1` | JSON API — xem [06 — API và routes](06-api-va-routes.md) |
| `backoffice.ts` | `/backoffice` | Orders, banks, withdrawals, support, audit, config, revenue, products (content), missions |
| `admin-console.ts`, `admin-dashboard.ts` | `/backoffice` | Console tổng quan vận hành |
| `admin-orders.ts` | `/backoffice` | Đối soát đơn: import CSV, duyệt hàng loạt |
| `admin-users.ts` | `/backoffice` | Quản lý tài khoản người dùng/admin |
| `admin-sync.ts` | `/backoffice` | Cấu hình đồng bộ sàn (cookie, tần suất) + chạy sync tay |

### `src/services/` — nghiệp vụ thuần

Mỗi service nhận `db`/`config` qua **tham số** (không import singleton) nên test được độc lập.

Nhóm theo chức năng:

**Luồng mua hoàn tiền**
| File | Vai trò |
| --- | --- |
| `product-preview.ts` | Tra cứu sản phẩm từ link (điều phối các nguồn dữ liệu) |
| `preview-cache.ts` | Cache preview in-memory, TTL 15 phút |
| `affiliate.ts` | Tạo purchase intent, build link Affiliate + subIds, `isSafeAffiliateRedirect` |
| `shopee-open-api.ts` / `tiktok-open-api.ts` / `lazada-open-api.ts` | Client Open API từng sàn |

**Đồng bộ + đối soát đơn**
| File | Vai trò |
| --- | --- |
| `shopee-report.ts` | Kéo báo cáo chuyển đổi Shopee (cookie admin cấp) |
| `shopee-order-sync.ts` | Điều phối một lượt sync: kéo báo cáo → `importOrderRow` từng dòng |
| `platform-sync-settings.ts` | Lưu/đọc cấu hình sync (mã hóa) trong `platform_sync_settings` |
| `order-import.ts` | **Trái tim đối soát**: `importOrderRow`, `resolveUser` (clickId → Sub ID → tracking code), trạng thái đơn, revision hoa hồng |
| `order-history.ts` | Gộp đơn thật + lượt mua "Chờ sàn xác nhận" cho `/app/orders` |

**Tiền**
| File | Vai trò |
| --- | --- |
| `ledger.ts` | Sổ cái kế toán kép: `postLedgerTransaction`, `assertBalanced`, `getWalletBalances` |
| `cashback-release.ts` | Giải ngân ví CHỜ → KHẢ DỤNG khi hết hạn giữ tiền |
| `commission.ts` | Chia hoa hồng theo tỷ lệ nghiệp vụ (bps, làm tròn xuống) |
| `withdrawal.ts` | Vòng đời lệnh rút tiền |
| `bank.ts` | Tài khoản ngân hàng (AES-256-GCM, duyệt thay đổi) |
| `referral-reward.ts` | Thưởng giới thiệu |

**Nền tảng chung**
| File | Vai trò |
| --- | --- |
| `auth.ts`, `otp.ts`, `email.ts` | Đăng ký/đăng nhập, OTP (băm + pepper, giới hạn gửi/thử), gửi mail (console/smtp) |
| `business-config.ts` | Cấu hình nghiệp vụ trong DB (ưu tiên hơn ENV seed) |
| `user-policy.ts` | **Nguồn duy nhất** của chính sách người dùng (trang + modal + email) |
| `mission.ts` | Nhiệm vụ, claim thưởng, thông báo in-app |
| `audit.ts` | Ghi `audit_logs` cho thao tác admin |
| `app-dashboard.ts`, `chart-data.ts`, `content-image.ts` | Dữ liệu dashboard, biểu đồ doanh thu, ảnh nội dung |

### `src/jobs/`

`sync-scheduler.ts` — vòng lặp nền duy nhất (bật qua `ENABLE_SYNC_SCHEDULER`):
mỗi tick kiểm tra sàn nào đến hạn sync (tần suất do admin đặt) → `runShopeeOrderSync`,
đồng thời gọi `releaseDueCashback`.

### `src/lib/`, `src/types/`, `src/data/`

Helper chung: `errors.ts` (`AppError`), `format.ts` (filter Nunjucks: `vnd`, `datetime`…),
`validation.ts` (`parseInput`), flash message, crypto.

## `views/` — giao diện

| Khung | Dùng cho |
| --- | --- |
| `base.njk` | Trang công khai (landing, pháp lý) |
| `auth/auth-base.njk`, `auth/auth-commerce-base.njk` | Trang đăng nhập/đăng ký |
| `app/app-base.njk` | **Khung duy nhất** cho mọi trang người dùng `/app/*` (sidebar, header, thông báo) |
| `backoffice/base.njk` | **Khung duy nhất** cho mọi trang admin — kể cả file hậu tố `-v2` (hậu tố chỉ là tên file nội dung, không phải khung khác) |
| `legal/` | Điều khoản, quyền riêng tư, chính sách người dùng (body dùng chung cho trang + modal) |
| `partials/` | Macro, icon SVG, modal chính sách |

## `public/` — static

JS thuần theo trang: `app.js` (shell chung: sidebar/theme/menu), `purchase.js`
(luồng tra cứu + mua), `user-policy.js` (modal chính sách), `app-entry-promo.js`…
CSS: `styles.css` (chung), `instant-purchase.css`. Được phục vụ tại `/assets/*`
với cache immutable 30 ngày ở production (cache-bust bằng `assetVersion` mỗi lần khởi động).

## Muốn sửa tính năng X thì vào đâu?

| Việc | Đụng vào |
| --- | --- |
| Thêm/sửa trang người dùng | `src/routes/app.ts` + `views/app/*.njk` (+ CSS/JS trong `public/`) |
| Thêm/sửa trang admin | `src/routes/backoffice.ts` hoặc `admin-*.ts` + `views/backoffice/*.njk` |
| Thêm API JSON | `src/routes/api/*.ts` (đăng ký trong `api/index.ts`) |
| Đổi cách tính tiền hoàn | `src/services/commission.ts` + `business-config.ts` — **đọc doc 04 trước** |
| Sửa đối soát đơn | `src/services/order-import.ts` (+ test `tests/order-import.test.ts`) |
| Thêm sàn mới | Client mới trong `services/` + nhánh trong `product-preview.ts`, `affiliate.ts`, allowlist redirect |
| Đổi schema DB | Thêm file `migrations/0XX_*.sql` mới (không sửa file cũ) |

➡️ Tiếp theo: [04 — Dữ liệu và ledger](04-du-lieu-va-ledger.md)
