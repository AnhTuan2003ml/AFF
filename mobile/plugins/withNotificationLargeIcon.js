/*
 * Config plugin: gắn ảnh LỚN (large icon) mặc định cho MỌI thông báo Android —
 * cả push từ server (expo-notifications nhận FCM rồi tự dựng notification) lẫn
 * thông báo cục bộ. Dùng để linh vật CamiO xuất hiện bên phải mỗi thông báo.
 *
 * Vì sao phải tự viết: plugin chính thức của expo-notifications chỉ cho đặt icon
 * nhỏ (đơn sắc) + màu, chưa có tuỳ chọn cho large icon (trong mã nguồn còn ghi
 * TODO). Nhưng phía native `ExpoNotificationBuilder` đã đọc meta-data
 * `expo.modules.notifications.large_notification_icon` trỏ tới một drawable —
 * nên chỉ cần chép PNG vào res/ và khai báo meta-data là xong.
 *
 * Chỉ Android. iOS không có khái niệm large icon; muốn ảnh kèm thông báo trên
 * iOS phải gửi attachment qua Notification Service Extension — ngoài phạm vi.
 */
const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");

const META_DATA_KEY = "expo.modules.notifications.large_notification_icon";
const RESOURCE_NAME = "notification_large_icon";

function withNotificationLargeIcon(config, { image } = {}) {
  if (!image) return config;

  // 1) Chép ảnh vào drawable-xxxhdpi (384px ≈ 96dp). Đặt ở mật độ cao nhất để
  //    Android chỉ thu nhỏ, không phóng to làm mờ; để ở drawable/ (mdpi) thì trên
  //    máy xxxhdpi bitmap bị phóng 4 lần.
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const src = path.resolve(cfg.modRequest.projectRoot, image);
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/res/drawable-xxxhdpi",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, path.join(dir, `${RESOURCE_NAME}.png`));
      return cfg;
    },
  ]);

  // 2) Khai báo meta-data cho expo-notifications biết dùng drawable đó.
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      META_DATA_KEY,
      `@drawable/${RESOURCE_NAME}`,
      "resource",
    );
    return cfg;
  });

  return config;
}

module.exports = withNotificationLargeIcon;
