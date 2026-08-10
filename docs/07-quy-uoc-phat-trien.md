# 07 — Quy ước phát triển

## TypeScript / ESM

- `"type": "module"` — **import nội bộ luôn có đuôi `.js`** dù file nguồn là `.ts`:
  ```ts
  import { query } from "../db.js";   // ✅
  import { query } from "../db";      // ❌ vỡ khi chạy build
  ```
- Node 22+, chạy dev bằng `tsx watch`, build bằng `tsc` vào `dist/`.
- Validate mọi input bằng **zod** qua `parseInput` (`src/lib/validation.ts`).

## Phân lớp

- **Route** chỉ: parse input → gọi service → render/trả JSON. Không viết nghiệp vụ trong route.
- **Service** nhận `db` / `config` **qua tham số** (không import singleton) — để test được
  độc lập và tái sử dụng trong jobs/scripts.
- Cấu hình nghiệp vụ đọc từ `business-config.ts` (DB), không đọc thẳng ENV — ENV chỉ là seed.

## Tiền tệ (đọc kỹ trước khi đụng vào code tiền)

- VND là **số nguyên** (`bigint` trong DB, `number` an toàn trong JS). Không float.
- Tỷ lệ dùng **bps** (1/10000); nhân chia **làm tròn xuống** (`Math.floor`).
- **Mọi thay đổi số dư qua `postLedgerTransaction`** với bút toán DEBIT/CREDIT cân bằng
  và `idempotency_key` duy nhất. Không bao giờ UPDATE số dư trực tiếp.
- Sửa/hủy khoản đã ghi = **đảo khoản** (giao dịch ngược chiều, revision mới), không xóa.
- Không bịa số tiền hoàn khi sàn chưa trả hoa hồng — hiển thị "Đang cập nhật".

## Bảo mật

- Redirect Affiliate bắt buộc qua allowlist host (`isSafeAffiliateRedirect`) — chặn open redirect.
- **Không đối soát người mua bằng email** — chỉ clickId / Sub ID / tracking code.
- Dữ liệu nhạy cảm (số tài khoản ngân hàng, cookie sync) mã hóa AES-256-GCM bằng
  `FIELD_ENCRYPTION_KEY`; log redact sẵn password/OTP/cookie (cấu hình pino trong `server.ts`).
- Mật khẩu: Argon2id. Session token: ngẫu nhiên + băm trước khi lưu. OTP: băm + pepper,
  giới hạn gửi/thử.
- CSP chỉ cho `self` — **không thêm CDN/script ngoài** vào views; mọi asset đặt trong `public/`.
- Thao tác admin quan trọng phải ghi `audit_logs` (`src/services/audit.ts`).

## Lỗi và thông báo

- Ném `AppError(code, message, statusCode)` (`src/lib/errors.ts`); message **tiếng Việt**,
  viết cho người dùng cuối hiểu được.
- API trả `{ error: { code, message, requestId } }`; web render `error.njk` hoặc flash message.

## Giao diện

- Server-rendered Nunjucks; trang user extends `views/app/app-base.njk`, trang admin extends
  `views/backoffice/base.njk` (khung admin **duy nhất** — hậu tố `-v2` trong tên file chỉ là
  tên nội dung, không phải khung khác).
- Filter có sẵn trong template: `vnd`, `datetime`, `date`, nhóm `audit*`.
- JS thuần theo trang trong `public/`, nạp qua `/assets/*?v={{ assetVersion }}` (cache-bust
  mỗi lần khởi động server).
- Chính sách người dùng chỉ sửa ở `src/services/user-policy.ts` (một nguồn cho trang, modal
  và email); sửa nội dung ảnh hưởng quyền lợi thì tăng `USER_POLICY_VERSION`.

## CSDL

- Đổi schema = thêm file `migrations/0XX_ten-mo-ta.sql` **mới**; không sửa migration đã chạy.
- Migration là SQL thuần, idempotent ở mức chạy tuần tự một lần (ghi `schema_migrations`).
- Ràng buộc nghiệp vụ đặt ngay trong schema (CHECK status, UNIQUE chống trùng, trigger
  kiểm tra bút toán cân bằng).

## Kiểm thử

```bash
npm test              # vitest run — toàn bộ
npm run test:watch    # watch mode
npx vitest run tests/order-import.test.ts   # một file
```

- DB test dùng **PGlite** (Postgres nhúng, không cần cài Postgres) — helper trong
  `tests/helpers.ts` tạo DB sạch và chạy migrations thật.
- Mỗi service nghiệp vụ quan trọng có file test tương ứng (`order-import`, `ledger`,
  `affiliate`, `shopee-order-sync`, `user-policy`…). Sửa nghiệp vụ nào thì chạy + cập nhật
  test file đó.
- `tests/migration.test.ts` bảo vệ schema; `tests/templates.test.ts` bảo vệ render Nunjucks.

## Checklist trước khi bàn giao / mở PR

```bash
npm run typecheck && npm test && npm run build
```

- [ ] Không hardcode secret, không commit `.env`.
- [ ] Code tiền mới có test và đi qua ledger.
- [ ] Message lỗi người dùng bằng tiếng Việt.
- [ ] Schema mới nằm trong migration mới.
- [ ] Cập nhật `CLAUDE.md` / docs nếu thay đổi luồng nghiệp vụ hoặc cấu trúc.
