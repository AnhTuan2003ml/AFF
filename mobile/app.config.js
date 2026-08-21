/*
 * Lớp phủ lên app.json cho những thứ phải đổi theo hồ sơ build.
 *
 * Vì sao cần: từ Android 9 (API 28), app KHÔNG khai báo gì thì mặc định bị cấm
 * mọi kết nối HTTP không mã hoá. Bản `preview` trỏ vào IP LAN (http://...:3000)
 * nên bị Android chặn thẳng — request không rời khỏi máy, backend không thấy gì,
 * app chỉ báo "Chưa kết nối được máy chủ". Trình duyệt không chịu luật này nên
 * mở cùng địa chỉ vẫn vào được, rất dễ tưởng nhầm là lỗi mạng.
 *
 * Chỉ mở HTTP cho bản test. Bản `production` trỏ https://shoptikvn.com nên giữ
 * nguyên mặc định an toàn của Android — không hạ bảo mật của bản phát hành chỉ
 * vì tiện cho lúc dev.
 *
 * Thông báo đẩy (push) trên Android đi qua Firebase Cloud Messaging. Bản build
 * PHẢI nhúng `google-services.json` (tải từ Firebase Console), nếu không
 * `getExpoPushTokenAsync` thất bại ngay khi khởi động ("Default FirebaseApp
 * failed to initialize") → app không bao giờ đăng ký token với server → chỉ
 * thấy thông báo khi mở app. File này chứa khóa nên KHÔNG commit; đặt ở
 * `mobile/google-services.json` (local) hoặc upload làm EAS secret file với
 * tên biến `GOOGLE_SERVICES_JSON`. Xem docs/09-huong-dan-build-android.md.
 */
const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE ?? "development";
  const choPhepHttp = profile !== "production";

  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? path.join(__dirname, "google-services.json");
  const coFcm = fs.existsSync(googleServicesFile);
  if (!coFcm) {
    console.warn(
      "[app.config] Không thấy google-services.json — bản build sẽ KHÔNG nhận được thông báo đẩy ngoài app.",
    );
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(coFcm ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: choPhepHttp } }],
      // Kênh mặc định cho thông báo FCM tới khi app đang đóng; trùng id `default`
      // mà src/lib/push.ts tạo (importance HIGH) để thông báo nổi lên thanh trạng thái.
      ["expo-notifications", { color: "#ee4d2d", defaultChannel: "default" }],
    ],
  };
};
