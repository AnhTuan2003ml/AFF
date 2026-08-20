# Giai đoạn 0 — Thông chuỗi công cụ cho app di động

Mục tiêu duy nhất: **một file `.apk` chạy được trên điện thoại Android thật**.

App chưa làm gì cho người dùng, và đúng ra là như vậy. Khi nó mở lên được thì
toàn bộ chuỗi Windows → cloud Expo → điện thoại đã thông, chữ ký số đã sẵn sàng
cho lần nộp cửa hàng sau này, và mọi công sức đổ vào giao diện ở giai đoạn 2 đều
đứng trên nền chắc.

---

## Đã dựng sẵn

Project nằm ở `mobile/`, ngay trong repo này — sửa API backend và app trong cùng
một commit.

| Hạng mục | Trạng thái |
| --- | --- |
| Expo SDK 57 + React Native 0.86 + expo-router + TypeScript | Xong |
| `app.json` — tên ShopTik, gói `vn.shoptik.app`, scheme `shoptik`, `projectId` | Xong |
| `eas.json` — ba hồ sơ, `preview` đã có `buildType: "apk"` | Xong |
| `expo-secure-store` — cất token trong Keychain/Keystore | Xong |
| `@tanstack/react-query` | Xong |
| `expo-web-browser` — mở link Affiliate ở giai đoạn 2 | Có sẵn trong template |
| Bộ biểu tượng + màn hình chờ mang thương hiệu ShopTik | Xong — `npm run icons` sinh lại |
| `expo-doctor` | 21/21 kiểm tra đạt |
| `src/theme/tokens.ts` — bảng màu dịch từ `public/theme/tokens.css` | Xong |
| `src/api/client.ts` — gọi API, tự làm mới token khi gặp 401 | Xong |
| `src/api/auth.ts` — đăng nhập, đăng ký, OTP, đăng xuất | Xong |
| `src/app/index.tsx` — màn hình kiểm chứng, hiện trạng thái kết nối máy chủ | Xong |
| Typecheck `mobile/` | Sạch |
| Typecheck + 237 test của backend | Vẫn xanh |

Hai việc dọn nhà nêu trong kế hoạch ban đầu hóa ra **không cần**: `vitest.config.ts`
đã giới hạn ở `tests/**/*.test.ts` nên không đụng tới `mobile/`, và `.gitignore`
gốc đã bắt `node_modules/` ở mọi tầng.

### Về ổ đĩa

Ổ C chỉ còn 15 GB nên cache npm đã được chuyển sang `E:\dev-cache\npm`
(`npm config get cache` để kiểm chứng). `eas-cli` cài cục bộ trong `mobile/`
thay vì cài toàn cục, nên nó cũng nằm trên ổ F cùng repo chứ không vào ổ C.
Từ giờ mọi lượt `npm install` đều tải qua cache trên E.

---

## Ba bước còn lại — Boss làm

Cả ba đều chạy trong thư mục `mobile`:

```powershell
cd F:\Works\AFF\mobile
```

### Bước 1 — Đăng nhập Expo

```powershell
npm run eas -- login
npm run eas -- whoami
```

`whoami` phải in ra tên tài khoản vừa đăng ký. Nếu báo chưa đăng nhập thì lệnh
`login` chưa thành công, làm lại.

### Bước 2 — Nối project với tài khoản Expo

Đúng lệnh mà bảng điều khiển Expo đã đưa:

```powershell
npm run eas -- init --id 25612d71-daf1-428d-afb6-8f2551167bbe
```

`projectId` đã được ghi sẵn vào `app.json` rồi, nhưng vẫn nên chạy lệnh này: nếu
`slug` dưới máy (`shoptik`) khác với slug của project trên tài khoản Expo, lệnh
này sẽ tự chỉnh cho khớp. Bỏ qua mà lệch slug thì bước build báo lỗi.

### Bước 3 — Build

```powershell
npm run build:android
```

Lượt đầu sẽ hỏi:

- **"Generate a new Android Keystore?"** → chọn **Yes**.
  Keystore là chữ ký số của app, Expo tạo và giữ hộ. Nhưng nhớ: **sau khi lên
  CH Play thì mất keystore đồng nghĩa không cập nhật được app nữa** — Google chỉ
  nhận bản cập nhật ký bằng đúng keystore cũ. Đừng xóa project trên expo.dev.

Gói miễn phí phải xếp hàng nên lượt đầu thường 10–25 phút. Cứ để đó làm việc
khác, hoặc mở <https://expo.dev> xem tiến trình.

---

## Về sau: một lệnh ra cả hai bản

Toàn bộ hồ sơ build đã dựng sẵn cho cả Android lẫn iOS, nên khi app hoàn thiện
thì chỉ còn một lệnh:

```powershell
npm run build          # .apk + .ipa, bản nội bộ để test
npm run build:store    # .aab + .ipa, bản nộp CH Play và App Store
npm run submit:store   # đẩy thẳng bản vừa build lên hai cửa hàng
```

| Lệnh | Hồ sơ | Android | iOS |
| --- | --- | --- | --- |
| `npm run build` | `preview` | `.apk` cài trực tiếp | `.ipa` ad-hoc |
| `npm run build:android` | `preview` | `.apk` | — |
| `npm run build:ios` | `preview` | — | `.ipa` ad-hoc |
| `npm run build:store` | `production` | `.aab` cho CH Play | `.ipa` cho TestFlight |

Số hiệu phiên bản (`versionCode` Android, `buildNumber` iOS) do EAS tự tăng ở hồ
sơ `production` — `appVersionSource: "remote"` trong `eas.json` — nên không phải
nhớ sửa tay mỗi lần nộp.

> **`npm run build` chỉ chạy trọn vẹn khi đã có tài khoản Apple Developer.**
> Nhánh Android chạy được ngay, nhưng nhánh iOS sẽ dừng ở khâu chứng chỉ nếu
> chưa có tài khoản 99 USD/năm — và với bản `preview` ad-hoc thì còn phải đăng
> ký sẵn mã máy (UDID) của từng iPhone định cài. Trong lúc chưa có, dùng
> `npm run build:android`.

---

## Test trên iPhone khi chưa có tài khoản Apple

Khoản 99 USD chỉ chặn đúng một thứ: **file `.ipa` cài lên iPhone**. Vẫn còn đường
chạy app trên iPhone thật mà không mất đồng nào.

| Cách | Cần gì | Chạy được trên Windows | Dùng được tới |
| --- | --- | --- | --- |
| **Expo Go** | Không cần gì | Có | Hết giai đoạn 2 |
| Bản cho iOS Simulator | Không cần tài khoản Apple | **Không** — cần máy Mac | — |
| `.ipa` ad-hoc / TestFlight | Apple Developer 99 USD/năm | Có (EAS build trên cloud) | Mãi mãi |

### Đường đang dùng được: Expo Go

1. Cài **Expo Go** từ App Store lên iPhone (miễn phí, không cần tài khoản gì)
2. Ở `mobile/` chạy `npm run start`
3. Mở Camera của iPhone quét mã QR hiện trong terminal
4. iPhone và máy tính phải chung một mạng Wi-Fi

App chạy thật trên iPhone thật, sửa code là thấy đổi ngay. Toàn bộ thư viện hiện
tại của project đều nằm sẵn trong Expo Go — expo-router, expo-secure-store,
expo-web-browser, react-query — nên sáu màn hình của giai đoạn 2 kiểm thử được
trọn vẹn theo đường này.

**Expo Go không cho thấy ba thứ**: biểu tượng và màn hình chờ ShopTik (nhìn thấy
của Expo Go), deep link theo scheme `shoptik://`, và hành vi của native module.
Muốn kiểm ba thứ đó trên iOS thì mới cần tới bản build thật.

**Hết hiệu lực ở giai đoạn 3.** Ngay khi thêm share extension để nhận link từ app
Shopee, hoặc thêm thông báo đẩy, Expo Go không chạy được nữa — hai thứ đó là
native module ngoài gói sẵn. Lúc đó buộc phải có tài khoản Apple để làm
development build cho iOS.

> Nếu quét QR mà máy không kết nối được: nhiều router bật chế độ cách ly thiết bị
> khiến điện thoại không thấy máy tính. Chạy `npm run start -- --tunnel` để đi
> vòng qua máy chủ của Expo — chậm hơn nhưng không phụ thuộc mạng nội bộ.

### Còn thiếu gì cho `npm run submit:store`

Hai chỗ trong `eas.json` đang để giá trị tạm, điền khi đăng ký xong tài khoản:

- `submit.production.ios` — `appleId`, `ascAppId`, `appleTeamId` lấy từ App Store Connect
- `submit.production.android.serviceAccountKeyPath` — tệp JSON tải từ Google Play
  Console, đặt ở `secrets/google-play-service-account.json` tại gốc repo
  (thư mục `secrets/` đã nằm trong `.gitignore`, không lo lộ khoá)

### Cài lên điện thoại

Build xong, terminal in ra **một mã QR và một đường dẫn tải**. Mở camera điện
thoại quét thẳng mã QR đó là tải được `.apk` về máy — không cần Zalo hay cáp USB.

Rồi trên điện thoại:

1. Bấm vào file `.apk` vừa tải
2. Android sẽ chặn và hỏi quyền — bật **"Cho phép từ nguồn này"** cho ứng dụng
   đang mở file (trình duyệt hoặc trình quản lý file). Đường dẫn thường là
   *Cài đặt → Ứng dụng → Quyền đặc biệt → Cài ứng dụng không xác định*
3. Quay lại, bấm **Cài đặt**, rồi mở app

File này gửi cho người khác cài thử cũng được — đó chính là mục đích của hồ sơ
`preview`.

---

## Xong khi

App ShopTik mở lên trên điện thoại, hiện tên thương hiệu và một thẻ trạng thái
kết nối máy chủ.

Thẻ đó báo **"Chưa kết nối được máy chủ"** là bình thường ở bước này — nó chỉ
xanh khi backend đang chạy (`npm run dev`) và điện thoại chung Wi-Fi với máy
tính. Bản thân việc app mở lên được đã là thứ giai đoạn 0 cần chứng minh.

Muốn thấy nó xanh:

1. Ở repo gốc chạy `npm run dev`
2. Điện thoại và máy tính chung một mạng Wi-Fi
3. IP LAN trong `mobile/.env` và `mobile/eas.json` phải đúng — hiện là
   `192.168.1.179`. Router đổi IP thì kiểm tra lại bằng `ipconfig` và sửa hai
   file đó, rồi build lại.
4. Cổng 3000 phải mở trên tường lửa Windows, VÀ mạng Wi-Fi phải được xếp loại
   Private — rule tạo cho hồ sơ Private mà mạng đang là Public thì rule không
   có tác dụng nào cả:

   ```powershell
   New-NetFirewallRule -DisplayName "ShopTik dev 3000" -Direction Inbound `
     -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
   Set-NetConnectionProfile -Name "<ten Wi-Fi>" -NetworkCategory Private
   ```

---

## Gặp lỗi thì xem đây

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `eas` chạy nhưng báo chưa đăng nhập | Bước 1 chưa xong | `npx eas login`, kiểm tra bằng `npx eas whoami` |
| Build báo lỗi slug không khớp | Chưa chạy bước 2 | `npx eas init --id 25612d71-daf1-428d-afb6-8f2551167bbe` |
| Build dừng ở khâu credentials | Chưa trả lời câu hỏi keystore | Chạy lại lệnh build, chọn **Yes** |
| Tải được file nhưng bấm cài không lên | File là `.aab` chứ không phải `.apk` | Kiểm tra hồ sơ `preview` trong `eas.json` còn dòng `"buildType": "apk"` không |
| Android chặn không cho cài | Chưa bật nguồn không xác định | Cấp quyền cho đúng ứng dụng đang mở file, không phải cho file |
| App mở lên nhưng báo mất kết nối | Backend chưa chạy, khác Wi-Fi, hoặc IP LAN đã đổi | Xem mục **Xong khi** ở trên |
| Trình duyệt trên điện thoại vào được `/-/ready` nhưng app vẫn báo mất kết nối, và log backend KHÔNG thấy request nào từ app | Android 9+ cấm HTTP không mã hoá khi app không khai báo `usesCleartextTraffic`. Request bị chặn ngay trong máy, không rời khỏi app. Trình duyệt không chịu luật này nên rất dễ chẩn đoán nhầm thành lỗi mạng | Đã xử lý sẵn ở `mobile/app.config.js`: bật cho hồ sơ test, giữ tắt cho `production` (bản đó dùng HTTPS). Kiểm tra bằng cách giải nén APK xem `AndroidManifest.xml` có `usesCleartextTraffic` chưa |
| Build xếp hàng rất lâu | Gói EAS miễn phí | Bình thường. Gần ngày nộp store, lúc build lại liên tục, mới cần tính nâng gói |

---

## Vài điều đã biết trước cho giai đoạn sau

- **Expo Go không thay thế được development build.** Đủ cho giai đoạn dựng giao
  diện, nhưng ngay khi thêm share extension để nhận link từ app Shopee ở giai
  đoạn 3 thì phải chuyển sang development build.
- **`npx eas update`** vá được phần JavaScript mà không phải chờ store duyệt lại
  — đáng giá với nghiệp vụ này vì chính sách hoàn tiền và văn bản điều khoản là
  thứ hay phải sửa gấp.

---

## Sau giai đoạn 0

Giai đoạn 1 (mở đường cho app ở backend) **đã xong**: token + refresh, miễn CSRF
cho nhánh bearer, rate limit khóa theo thiết bị, và tám route cho ví/tài khoản.
Chi tiết ở [API và routes](06-api-va-routes.md).

Tiếp theo là **giai đoạn 2 — dựng sáu màn hình v1**: Đăng nhập, Trang chủ, Đơn
hàng, Ví, Rút tiền, Tài khoản.

Một lưu ý về thứ tự: đừng dựng đủ sáu màn rồi mới thử mua. Làm xong Đăng nhập và
Trang chủ là **mua ngay một đơn thật** để kiểm chứng quy kết Sub ID khi app nhảy
sang Shopee. Đó là rủi ro nghiêm trọng nhất của cả dự án, và nếu nó vỡ thì vỡ ở
tầng *cách mở link* chứ không phải tầng giao diện — biết sớm thì mất một buổi,
biết muộn thì mất cả tuần công giao diện.
