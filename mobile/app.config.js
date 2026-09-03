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
    // EAS Update (OTA): app tự tải & áp bản JS/asset mới khi mở lại, khỏi cài
    // lại APK. Chỉ cần `eas update --branch <profile>`. Thay đổi phần NATIVE
    // (thêm thư viện native, đổi SDK) vẫn phải build APK mới.
    updates: {
      ...config.updates,
      url: "https://u.expo.dev/f7b17097-96a2-46c4-81f1-02ef6663a22d",
    },
    // Bản JS chỉ được áp cho build có cùng runtimeVersion. Gắn theo version app
    // (1.0.0) — đổi version (thường kèm thay đổi native) thì cần build APK mới.
    runtimeVersion: { policy: "appVersion" },
    android: {
      ...config.android,
      ...(coFcm ? { googleServicesFile } : {}),
    },
    // iOS — TÁCH RIÊNG, không đụng phần Android ở trên.
    // Song song với usesCleartextTraffic của Android: iOS chặn HTTP không mã hóa
    // qua App Transport Security. Bản test (development/preview) trỏ IP LAN
    // http://...:3000 nên phải nới ATS; bản production trỏ https://shoptikvn.com
    // giữ nguyên mặc định an toàn. Push iOS đi qua APNs (khóa do EAS giữ,
    // `eas credentials` → iOS), KHÔNG cần google-services; chuông riêng
    // shoptik_notify.wav được plugin expo-notifications bundle vào cả iOS.
    // iOS không có "large icon" nên thông báo không kèm ảnh linh vật
    // (muốn có phải làm Notification Service Extension — chưa làm).
    ios: {
      ...config.ios,
      ...(choPhepHttp
        ? {
            infoPlist: {
              ...(config.ios?.infoPlist ?? {}),
              NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
            },
          }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: choPhepHttp } }],
      // Chọn/chụp ảnh CCCD và quay video khuôn mặt cho đăng ký KOL/KOC.
      [
        "expo-image-picker",
        {
          photosPermission:
            "ShopTik cần truy cập thư viện ảnh để bạn tải ảnh CCCD khi đăng ký KOL/KOC.",
          cameraPermission:
            "ShopTik cần truy cập máy ảnh để chụp CCCD và quay video xác minh.",
          microphonePermission:
            "ShopTik cần micro để quay video khuôn mặt có tiếng khi xác minh.",
        },
      ],
      // Icon nhỏ trên thanh trạng thái phải là hình ĐƠN SẮC trắng trên nền trong
      // suốt (Android tự tô màu `color`); đưa logo màu vào đây sẽ thành khối
      // vuông xám bị phóng to. File sinh bởi scripts/make-brand-assets.py.
      // Kênh mặc định cho thông báo FCM tới khi app đang đóng; trùng id `default`
      // mà src/lib/push.ts tạo (importance HIGH) để thông báo nổi lên thanh trạng thái.
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#ee4d2d",
          // Phải trùng CHANNEL_ID trong src/lib/push.ts: đây là kênh Android dùng
          // khi FCM tới lúc app đang đóng.
          defaultChannel: "shoptik-alerts",
          // Chuông riêng, nhúng vào res/raw (Android) và bundle (iOS).
          sounds: ["./assets/sounds/shoptik_notify.wav"],
        },
      ],
      // Linh vật CamiO làm ảnh lớn cho MỌI thông báo (push lẫn cục bộ) trên Android.
      [
        "./plugins/withNotificationLargeIcon",
        { image: "./assets/images/notification-large-icon.png" },
      ],
    ],
  };
};
