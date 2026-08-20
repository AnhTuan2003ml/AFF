/*
 * Lớp phủ lên app.json cho những thứ phải đổi theo hồ sơ build.
 *
 * Vì sao cần: từ Android 9 (API 28), app KHÔNG khai báo gì thì mặc định bị cấm
 * mọi kết nối HTTP không mã hoá. Bản `preview` trỏ vào IP LAN (http://...:3000)
 * nên bị Android chặn thẳng — request không rời khỏi máy, backend không thấy gì,
 * app chỉ báo "Chưa kết nối được máy chủ". Trình duyệt không chịu luật này nên
 * mở cùng địa chỉ vẫn vào được, rất dễ tưởng nhầm là lỗi mạng.
 *
 * Chỉ mở HTTP cho bản test. Bản `production` trỏ https://shoptik.vn nên giữ
 * nguyên mặc định an toàn của Android — không hạ bảo mật của bản phát hành chỉ
 * vì tiện cho lúc dev.
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE ?? "development";
  const choPhepHttp = profile !== "production";

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: choPhepHttp } }],
    ],
  };
};
