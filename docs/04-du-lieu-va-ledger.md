# 04 — Dữ liệu và ledger

PostgreSQL, migration SQL thuần trong `migrations/` (chạy tuần tự, ghi vào
`schema_migrations`). **Không sửa migration cũ** — muốn đổi schema thì thêm file mới.

## Các nhóm bảng

### Người dùng và phiên

| Bảng | Vai trò |
| --- | --- |
| `users` | Tài khoản. `status`: PENDING_EMAIL → ACTIVE / LOCKED / DISABLED. `role`: USER / SUPPORT / FINANCE / RISK / ADMIN / AUDITOR. `tracking_code` (migration 016): mã ngắn cố định gắn vào Sub ID |
| `auth_identities` | Danh tính đăng nhập ngoài (chuẩn bị cho Google Login, chưa bật) |
| `sessions` | Phiên: token ngẫu nhiên **đã băm**, TTL theo `SESSION_TTL_HOURS` |
| `otp_challenges` | OTP băm + pepper, có hạn dùng, đếm số lần gửi/thử |
| `user_consents` | Đồng ý điều khoản/chính sách theo version |
| `referrals` | Quan hệ người giới thiệu ↔ người được mời |

### Affiliate và đơn hàng

| Bảng | Vai trò |
| --- | --- |
| `affiliate_programs` | Chương trình Affiliate theo sàn |
| `affiliate_links` | Mỗi lượt "Mua ngay" hoặc link chia sẻ: URL đích, subIds, campaign (`instantbuy` = mua trực tiếp) |
| `click_events` | Lượt đi qua `/go/:clickId` |
| `conversion_raw` | Dòng báo cáo thô từ sàn (giữ nguyên bản để truy vết) |
| `orders` | Đơn đã đối soát. `UNIQUE (platform, platform_order_id)` chống import trùng. `status`: PENDING / APPROVED / INVALID / CANCELLED / REVERSED |
| `order_items` | Dòng hàng trong đơn |
| `commission_rules` / `commission_entries` | Quy tắc chia hoa hồng theo version + kết quả chia cho từng đơn |
| `platform_sync_settings` | Cấu hình sync từng sàn (cookie **mã hóa**, tần suất, lần chạy gần nhất) — migration 015 |

### Tiền (ledger)

| Bảng | Vai trò |
| --- | --- |
| `ledger_accounts` | Tài khoản sổ cái: `owner_type` USER (kèm `owner_id`) hoặc SYSTEM, phân biệt bằng `code` |
| `ledger_transactions` | Giao dịch: `idempotency_key UNIQUE` — chạy lại không ghi trùng |
| `ledger_entries` | Bút toán DEBIT/CREDIT, `amount_vnd > 0`, thuộc một transaction |
| `withdrawal_intents` | Ý định rút chờ OTP (OTP_PENDING → CONFIRMED / EXPIRED / CANCELLED) |
| `withdrawals` | Lệnh rút: REQUESTED → FUNDS_HELD → APPROVED → PROCESSING → PAID (hoặc FAILED / REJECTED / CANCELLED / UNKNOWN). Số tài khoản lưu ciphertext + `bank_last4` |
| `payout_attempts` | Nhật ký gọi đối tác chi hộ (chưa dùng chi tự động) |
| `user_bank_accounts` / `bank_change_requests` | Tài khoản ngân hàng (mã hóa AES-256-GCM) + yêu cầu thay đổi chờ admin duyệt |

### Vận hành và nội dung

| Bảng | Vai trò |
| --- | --- |
| `business_config` | Cấu hình nghiệp vụ do admin đặt (tỷ lệ cashback, ngày giữ tiền…) — **ưu tiên hơn ENV** |
| `audit_logs` | Nhật ký thao tác admin (ai, làm gì, đối tượng nào) |
| `support_tickets` | Ticket hỗ trợ |
| `content_items` (+ images/products/categories) | Nội dung trang Khám phá |
| `product_comments` | Bình luận cộng đồng dưới sản phẩm tra cứu |
| `mission_definitions` / `user_mission_claims` / `notifications` | Nhiệm vụ, claim thưởng, thông báo in-app |

## Mô hình ledger (phần quan trọng nhất)

**Không có cột `balance` nào để UPDATE.** Số dư = tổng bút toán. Mọi biến động tiền là một
`ledger_transaction` gồm ≥2 `ledger_entries` với **tổng DEBIT = tổng CREDIT**
(`assertBalanced` trong `src/services/ledger.ts` ném lỗi nếu lệch).

### Bốn ví của người dùng

`getWalletBalances` trả về 4 số, tương ứng 4 tài khoản sổ cái theo `code`:

| Ví | Nghĩa | Vào | Ra |
| --- | --- | --- | --- |
| `PENDING` (CHỜ) | Tiền hoàn đã duyệt nhưng đang trong hạn giữ `cashback_hold_days` | Đơn APPROVED | Hết hạn giữ → AVAILABLE, hoặc đảo khoản khi đơn hủy |
| `AVAILABLE` (KHẢ DỤNG) | Được phép rút | `releaseDueCashback`, thưởng referral/mission | Tạo lệnh rút |
| `HELD` (ĐANG GIỮ) | Đang nằm trong lệnh rút chờ duyệt | Tạo lệnh rút | PAID (chi xong) hoặc hoàn về AVAILABLE khi từ chối |
| `PAID` (ĐÃ CHI) | Tổng đã chuyển khoản thành công | Lệnh rút PAID | — |

### Tính chất bắt buộc

- **Idempotent**: mỗi giao dịch có `idempotency_key` duy nhất
  (`ON CONFLICT DO NOTHING`) — sync chạy lại, import lại CSV không cộng tiền hai lần.
- **Đảo khoản thay vì xóa**: đơn hủy / sàn sửa hoa hồng → ghi giao dịch đảo ngược chiều,
  giao dịch mới mang `cashback_revision` kế tiếp (key hậu tố `:revN`). Lịch sử không bao giờ mất.
- **Truy vết**: mỗi giao dịch có `reference_type` + `reference_id` trỏ về nghiệp vụ gốc
  (đơn hàng, lệnh rút…).

### Ví dụ: đơn 200.000đ hoa hồng 10.000đ, cashback 80%

```
Giao dịch "cashback đơn #X" (idempotency: order:X:rev0)
  DEBIT  SYSTEM  nguồn hoa hồng        10.000
  CREDIT USER    ví CHỜ                 8.000   (80% cho người mua)
  CREDIT SYSTEM  phần nền tảng          2.000   (20%)
```

30 ngày sau, `releaseDueCashback`:

```
Giao dịch "giải ngân đơn #X"
  DEBIT  USER  ví CHỜ        8.000
  CREDIT USER  ví KHẢ DỤNG   8.000
```

## Quy ước tiền tệ

- VND là **số nguyên** (`bigint`), tuyệt đối không dùng float.
- Tỷ lệ tính bằng **bps** (basis points, 1/10000); nhân chia **làm tròn xuống**
  (`Math.floor`) — sai số dồn về phía nền tảng, không bao giờ trả thừa cho user.
- Số tiền trong bút toán luôn `> 0`; chiều tăng/giảm thể hiện bằng DEBIT/CREDIT.

## Kiểm thử schema

`tests/migration.test.ts` chạy toàn bộ migrations trên **PGlite** (Postgres nhúng WASM) —
mọi thay đổi schema được test tự động, không cần Postgres thật. Helper tạo DB test:
`tests/helpers.ts`.

➡️ Tiếp theo: [05 — Cài đặt và vận hành](05-cai-dat-va-van-hanh.md)
