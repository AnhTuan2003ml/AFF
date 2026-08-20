# ShopTik Mobile

App React Native (Expo SDK 57) cho người dùng ShopTik — Android và iOS từ một
codebase. Đứng **cạnh** web Nunjucks chứ không thay thế: cả hai dùng chung
backend Fastify và chung PostgreSQL ở thư mục gốc repo.

Khu vận hành `/backoffice` không có bản app và sẽ không có — admin làm việc trên
máy tính, mọi màn hình đó đều là bảng dữ liệu dày.

## Chạy

```powershell
npm run start        # Metro dev server
npm run typecheck    # tsc --noEmit
npm run doctor       # expo-doctor: soi cấu hình trước khi tốn lượt build
npm run icons        # sinh lại bộ biểu tượng từ scripts/make-icons.mjs
```

Backend phải chạy song song ở repo gốc (`npm run dev`), và điện thoại phải chung
Wi-Fi với máy tính.

## Build — một lệnh, hai nền tảng

```powershell
npm run build         # .apk + .ipa  (hồ sơ preview, bản nội bộ để test)
npm run build:store   # .aab + .ipa  (hồ sơ production, nộp hai cửa hàng)
npm run submit:store  # đẩy bản vừa build lên CH Play và App Store Connect
```

Cần build lẻ một nền tảng thì có `build:android` và `build:ios`.

Nhánh iOS đòi tài khoản Apple Developer (99 USD/năm) ngay từ khâu kiểm thử, và
bản `preview` ad-hoc còn phải đăng ký sẵn UDID của từng iPhone định cài. Trong
lúc chưa có tài khoản, dùng `npm run build:android`.

Nhưng **vẫn test được trên iPhone thật miễn phí** bằng Expo Go: cài Expo Go từ
App Store, chạy `npm run start`, quét mã QR. Đủ dùng hết giai đoạn 2 vì mọi thư
viện hiện tại đều nằm sẵn trong Expo Go. Hết hiệu lực ở giai đoạn 3 khi thêm
share extension và thông báo đẩy. Chi tiết ở `docs/08-mobile-giai-doan-0.md`.

## Cấu trúc

```
src/
├── app/        Màn hình — expo-router định tuyến theo file
├── api/        Gọi backend: client (tự làm mới token), auth, storage
└── theme/      Bảng màu dịch từ public/theme/tokens.css của repo gốc
```

## Ba điều dễ làm sai

**Địa chỉ backend không phải `localhost`.** Điện thoại hiểu `localhost` là chính
nó. Phải là IP LAN của máy tính — xem `.env` cho lúc dev, `eas.json` cho lúc
build. Router đổi IP thì sửa cả hai chỗ.

**Mở link Affiliate bằng `expo-web-browser`, tuyệt đối không webview nhúng.**
Trình duyệt hệ thống (SFSafariViewController / Chrome Custom Tabs) mới bàn giao
đúng sang app Shopee và giữ nguyên Sub ID. Webview nhúng làm mất lượt chuyển đổi,
và nhiều mạng Affiliate cấm hẳn — mất quy kết là mất tiền của người dùng.

**Màu lấy từ `src/theme/tokens.ts`, và file đó là bản dịch chứ không phải bản
gốc.** Nguồn thật là `public/theme/tokens.css` ở repo gốc. Đổi màu thì sửa bên
đó trước rồi đồng bộ sang đây, nếu không app và web sẽ trôi khỏi nhau.

## Xác thực

Web dùng cookie `aff_session` + CSRF. App dùng cặp token qua header
`Authorization: Bearer` — access 30 phút, refresh 60 ngày, xoay cả hai mỗi lần
làm mới. Hai cơ chế chạy song song, không cơ chế nào ảnh hưởng cơ chế nào.

`src/api/client.ts` tự xử lý việc làm mới khi gặp 401, và chỉ cho đúng một lượt
làm mới chạy tại một thời điểm — nếu để nhiều lượt cùng chạy thì lượt đầu thắng,
các lượt sau cầm refresh token đã bị xoay và đá người dùng ra màn hình đăng nhập
oan.

Chi tiết backend: `docs/06-api-va-routes.md` ở repo gốc.

## Lộ trình

Giai đoạn 0 và 1 đã xong. Tiếp theo là giai đoạn 2 — sáu màn hình v1: Đăng nhập,
Trang chủ, Đơn hàng, Ví, Rút tiền, Tài khoản. Xem
`docs/08-mobile-giai-doan-0.md` ở repo gốc.
