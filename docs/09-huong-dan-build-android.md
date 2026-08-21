# Hướng dẫn build app Android ShopTik

Dành cho người chưa từng đụng vào dự án này. Đi từ con số không — cài công cụ,
đăng ký tài khoản, dựng backend, tới lúc cầm file `.apk` cài lên điện thoại.

Mọi bước dưới đây đã được chạy thật trên Windows 11 + PowerShell. Những chỗ ghi
"cái bẫy" là lỗi đã thực sự xảy ra chứ không phải phòng xa.

---

## 0. Cần có gì trước

| Thứ | Bản | Kiểm tra |
| --- | --- | --- |
| Node.js | ≥ 22 (dự án chạy tốt trên 24) | `node -v` |
| Docker Desktop | bản nào cũng được | `docker ps` |
| Git | bản nào cũng được | `git --version` |
| Điện thoại Android | 9 trở lên | |
| Tài khoản Expo | miễn phí | mục 2 |

**Không** cần Android Studio, không cần JDK, không cần trình giả lập. Việc biên
dịch chạy trên máy chủ của Expo, máy bạn chỉ gửi mã nguồn lên.

Máy tính và điện thoại phải **chung một mạng Wi-Fi**.

---

## 1. Dựng backend chạy được đã

App chỉ là lớp vỏ; mọi dữ liệu đến từ backend ở thư mục gốc repo. Backend chưa
chạy thì app cài xong chỉ báo "Chưa kết nối được máy chủ".

### 1.1 Bật hạ tầng

```powershell
cd F:\Works\AFF
copy .env.example .env          # rồi mở ra sửa theo hướng dẫn trong file
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```

Mở `http://localhost:3000/-/ready`, thấy `{"status":"ready"}` là xong.

### 1.2 Cái bẫy: Postgres không nghe được từ ngoài Docker

`docker-compose.yml` **không publish** cổng của `postgres` và `redis` — chúng chỉ
nhìn thấy nhau trong mạng nội bộ compose. Chạy `npm run dev` trên máy (ngoài
Docker) sẽ nhận `ECONNREFUSED 127.0.0.1:5432` dù container đang chạy.

Cách xử lý: tạo `docker-compose.override.yml` ở gốc repo (Compose tự nạp file
này, không phải sửa file gốc):

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:15432:5432"
  redis:
    ports:
      - "127.0.0.1:16379:6379"
```

Rồi sửa `DATABASE_URL` và `REDIS_URL` trong `.env` cho khớp cổng đó.

Vì sao dùng 15432/16379 thay vì 5432/6379: nếu máy bạn còn dự án khác cũng chạy
Postgres thì hai bên tranh cổng. Cổng riêng thì không bao giờ đụng nhau.

**Cái bẫy phụ trên Windows:** một số dải cổng bị Hyper-V/WinNAT giữ chỗ sẵn.
Chọn trúng dải đó thì Docker báo `bind: An attempt was made to access a socket in
a way forbidden by its access permissions` — nghe như lỗi quyền nhưng thật ra là
cổng bị đặt gạch. Xem dải bị chiếm:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

---

## 2. Đăng ký tài khoản Expo

1. Vào https://expo.dev → **Sign Up**. Miễn phí, chỉ cần email.
2. Đăng nhập từ máy:

```powershell
cd F:\Works\AFF\mobile
npx eas-cli@latest login
```

Lệnh này mở trình duyệt để bạn đăng nhập. Kiểm tra lại:

```powershell
npx eas-cli@latest whoami
```

### Nối với dự án có sẵn

`mobile/app.json` đã ghi sẵn `projectId`, nên sau khi đăng nhập là tự nối đúng
dự án — **không** cần chạy `eas init`.

Nếu bạn muốn build vào tài khoản Expo của riêng mình thay vì tài khoản chủ dự
án, xóa khối `extra.eas.projectId` trong `app.json` rồi chạy `npx eas-cli init`.
Lúc đó bạn sẽ có keystore riêng, và app bạn build **không cài đè** được lên bản
do người khác build (Android từ chối cài đè khi chữ ký khác nhau).

---

## 3. Trỏ app về đúng địa chỉ backend

Đây là chỗ sai nhiều nhất. Có **hai** file, dùng cho hai việc khác nhau:

| File | Dùng khi | Đọc lúc nào |
| --- | --- | --- |
| `mobile/.env` | `npx expo start` (Expo Go, dev) | lúc chạy |
| `mobile/eas.json` | `npm run build:android` (file APK) | **lúc build** |

Giá trị trong `eas.json` bị **nướng cứng vào file APK**. Sai địa chỉ thì phải
build lại từ đầu, sửa file rồi cài lại không ăn thua.

### Tìm IP máy tính

```powershell
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi').IPAddress
```

Điền IP đó vào cả hai file, dạng `http://192.168.1.x:3000`.

> **Tuyệt đối không dùng `localhost`.** Điện thoại hiểu `localhost` là chính nó,
> nên sẽ luôn báo mất kết nối.

> IP do router cấp nên **có thể đổi sau khi khởi động lại mạng**. Đổi IP là APK
> cũ chết, phải build lại. Nếu định build nhiều lần, đặt IP tĩnh cho máy trong
> trang quản trị router — làm một lần, đỡ cả chuỗi phiền.

---

## 4. Mở đường mạng cho điện thoại

Backend nghe ở `0.0.0.0:3000` rồi vẫn chưa đủ — Windows Firewall chặn mặc định.

Mở **PowerShell bằng quyền Administrator**:

```powershell
New-NetFirewallRule -DisplayName "ShopTik dev 3000" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

### Cái bẫy: rule đúng nhưng không có tác dụng

Rule trên chỉ áp cho mạng hồ sơ **Private**. Windows thường xếp Wi-Fi mới là
**Public**, và khi đó rule nằm im. Kiểm tra:

```powershell
Get-NetConnectionProfile
```

Thấy `NetworkCategory: Public` thì đổi lại (vẫn cần quyền Administrator):

```powershell
Set-NetConnectionProfile -Name "<tên Wi-Fi>" -NetworkCategory Private
```

Máy bị Group Policy khoá không đổi được category thì mở rule cho cả hai hồ sơ:

```powershell
Set-NetFirewallRule -DisplayName "ShopTik dev 3000" -Profile Any
```

Đánh đổi: cổng 3000 sẽ mở cả khi bạn mang máy ra quán cà phê. Nhớ tắt khi không
dev nữa bằng `Disable-NetFirewallRule -DisplayName "ShopTik dev 3000"`.

### Kiểm tra trước khi build

Mở **trình duyệt trên điện thoại** vào `http://192.168.1.x:3000/-/ready`.

- Ra `{"status":"ready"}` → mạng thông, build được rồi
- Không ra gì → router đang bật cách ly thiết bị (AP isolation). Vào trang quản
  trị router tắt nó, hoặc phát 4G từ điện thoại rồi cho máy tính nối vào (cách
  này luôn thông, nhưng IP máy sẽ đổi nên phải sửa `eas.json` và build lại)

---

## 5. Kiểm tra trước khi build

Mỗi lượt build tốn 15–30 phút chờ hàng đợi. Chạy hai lệnh này trước để khỏi phí:

```powershell
cd F:\Works\AFF\mobile
npm install
npm run typecheck    # tsc --noEmit
npm run doctor       # npx expo-doctor — soi cấu hình
```

`expo-doctor` phải báo `21/21 checks passed`. Nếu nó kêu lệch phiên bản gói:

```powershell
npx expo install --fix
```

---

## 6. Build

```powershell
npm run build:android
```

Lệnh này chạy hồ sơ `preview` → ra file **`.apk`** cài thẳng được.

Phân biệt hai hồ sơ:

| Hồ sơ | Ra file | Dùng để |
| --- | --- | --- |
| `preview` | `.apk` | cài thẳng vào máy, test nội bộ |
| `production` | `.aab` | nộp lên CH Play, **không** cài thẳng được |

Lần build đầu tiên EAS tự sinh keystore ký ứng dụng và giữ trên tài khoản. Các
lần sau tái dùng đúng keystore đó, nên bản mới cài đè lên bản cũ được.

Xong sẽ có link. Mở link **trên điện thoại**, tải về, cài — Android sẽ hỏi cho
phép cài từ nguồn không xác định.

### Lệnh hữu ích

```powershell
npx eas-cli@latest build:list --platform android --limit 5   # xem lịch sử
npx eas-cli@latest build:view <build-id>                     # xem chi tiết
npm run build:android -- --no-wait                           # không chờ, trả về ngay
```

### Cái bẫy: EAS đóng gói từ git, không phải từ thư mục

Nếu `mobile/` nằm trong một repo git, EAS gửi lên **trạng thái đã commit**, bỏ
qua thay đổi chưa commit. Sửa mã xong mà quên commit thì bản build ra vẫn là mã
cũ — và không có cảnh báo nào rõ ràng.

Hai cách xử lý:

```powershell
git add -A; git commit -m "..."      # cách sạch sẽ
$env:EAS_NO_VCS = 1; npm run build:android   # đóng gói thẳng từ thư mục làm việc
```

`eas.json` là ngoại lệ: nó được CLI đọc từ đĩa lúc chạy lệnh, nên sửa IP trong
đó có tác dụng ngay kể cả chưa commit.

---

## 7. Cái bẫy lớn nhất: Android chặn HTTP

Từ Android 9 (API 28), app **không khai báo gì** thì bị cấm mọi kết nối HTTP
không mã hoá. Bản `preview` trỏ vào IP LAN (`http://...:3000`) nên bị chặn ngay
trong máy — request không bao giờ rời khỏi app.

Triệu chứng rất dễ chẩn đoán nhầm:

- App báo "Chưa kết nối được máy chủ"
- Nhưng **trình duyệt trên chính điện thoại đó** vào `/-/ready` lại được
- Log backend **không thấy request nào** từ app

Trình duyệt không chịu luật này nên vẫn vào được — nhìn như lỗi mạng, thật ra là
lỗi cấu hình lúc build. Gỡ app cài lại không ăn thua, vì lỗi nằm ở file APK.

Dự án đã xử lý sẵn ở `mobile/app.config.js`:

```js
const choPhepHttp = process.env.EAS_BUILD_PROFILE !== 'production';
// → preview: cho phép HTTP.  production: giữ mặc định an toàn (dùng HTTPS).
```

Chỉ mở cho bản test, không hạ bảo mật của bản phát hành.

**Nếu bạn tự dựng lại dự án từ đầu** thì nhớ cài và khai báo:

```powershell
npx expo install expo-build-properties
```

---

## 8. Tự kiểm tra file APK

Muốn chắc bản build đúng trước khi cài, giải nén APK ra soi. Đây là cách kiểm
tra chuỗi địa chỉ đã nướng vào:

```powershell
python -c "import zipfile; b=zipfile.ZipFile('shoptik.apk').read('assets/index.android.bundle'); print('192.168.1.179:3000' in str(b))"
```

### Cái bẫy: bundle là Hermes bytecode

Bundle **không phải** JavaScript thường mà là Hermes bytecode (8 byte đầu là
`c61fbc03...`). Chuỗi ASCII vẫn tìm được như thường, nhưng chuỗi **tiếng Việt
lưu dạng UTF-16**, không phải UTF-8. Tìm sai cách sẽ ra "không thấy gì" và
tưởng nhầm build hỏng:

```python
"Đăng nhập".encode("utf-8")     # KHÔNG tìm thấy
"Đăng nhập".encode("utf-16-le") # tìm thấy
```

---

## 9. Không cần build vẫn xem được app

Trong lúc dựng giao diện, dùng **Expo Go** cho nhanh — sửa mã là thấy ngay,
không phải chờ build:

```powershell
cd F:\Works\AFF\mobile
npm run start
```

Cài Expo Go từ CH Play, quét mã QR hiện trên terminal. Cách này đọc
`mobile/.env` lúc chạy nên đổi IP là xong, không phải build lại.

**Giới hạn:** `expo-secure-store` không có bản web thật, nên chạy
`npm run web` sẽ luôn ở trạng thái chưa đăng nhập — token không lưu được. Muốn
kiểm tra màn hình sau đăng nhập thì phải dùng Expo Go trên máy thật hoặc cài
APK.

---

## 10. Bảng tra lỗi nhanh

| Hiện tượng | Nguyên nhân | Xử lý |
| --- | --- | --- |
| `ECONNREFUSED 127.0.0.1:5432` | compose không publish cổng DB | mục 1.2 |
| `password authentication failed` | mật khẩu `.env` khác mật khẩu trong volume | `POSTGRES_PASSWORD` chỉ có tác dụng lần đầu tạo volume; đổi mật khẩu trong DB bằng `ALTER USER` hoặc xóa volume làm lại |
| `EADDRINUSE :3000` | tiến trình cũ chưa chết | `Get-NetTCPConnection -LocalPort 3000 -State Listen` rồi `Stop-Process -Id <PID> -Force` |
| `eas` báo chưa đăng nhập | chưa làm mục 2 | `npx eas-cli@latest login` |
| Build dừng hỏi keystore | chạy ở chế độ tương tác | chọn **Yes**, hoặc thêm `--non-interactive` |
| Tải được file nhưng bấm cài không lên | file là `.aab` | dùng hồ sơ `preview`, không phải `production` |
| App báo mất kết nối, trình duyệt vào được | Android chặn HTTP | mục 7 |
| App mất kết nối, trình duyệt cũng không vào được | tường lửa / hồ sơ mạng | mục 4 |
| Sửa mã rồi build mà không thấy đổi | EAS lấy bản đã commit | mục 6 |
| Build xếp hàng rất lâu | gói EAS miễn phí | bình thường, 15–30 phút |

---

## 11. Toàn bộ lệnh, gom một chỗ

```powershell
# --- Backend (thư mục gốc) ---
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev              # http://localhost:3000
npm run typecheck
npm test

# --- App (thư mục mobile) ---
cd mobile
npm install
npm run start            # Expo Go, sửa là thấy ngay
npm run typecheck
npm run doctor           # soi cấu hình trước khi tốn lượt build
npm run icons            # sinh lại bộ biểu tượng

# --- Build ---
npx eas-cli@latest login
npm run build:android    # .apk, hồ sơ preview
npm run build:store      # .aab + .ipa, hồ sơ production
npm run submit:store     # đẩy lên CH Play / App Store Connect
```

---

## 12. Về iOS

Cùng một mã nguồn ra được cả hai nền tảng, nhưng nhánh iOS đòi tài khoản Apple
Developer (99 USD/năm) ngay từ khâu kiểm thử, và bản `preview` ad-hoc còn phải
đăng ký sẵn UDID của từng iPhone định cài.

Chưa có tài khoản thì vẫn test được trên iPhone thật **miễn phí** bằng Expo Go
(mục 9). Cách này hết hiệu lực khi dự án thêm share extension và thông báo đẩy —
lúc đó bắt buộc phải có development build.

---

Xem thêm: [`08-mobile-giai-doan-0.md`](08-mobile-giai-doan-0.md) cho bối cảnh và
lộ trình, [`mobile/README.md`](../mobile/README.md) cho cấu trúc mã nguồn app.
