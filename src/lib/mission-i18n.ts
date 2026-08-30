/**
 * Tiêu đề mốc nhiệm vụ (mission_definitions.title) lưu tiếng Việt trong DB, có
 * chèn số (vd "Mời 50 người", "Mua 3 đơn trong tháng"). Dịch theo MẪU khi hiển
 * thị tiếng Anh, giữ nguyên số. Không khớp mẫu thì để nguyên (admin đặt tự do).
 */
export function localizeMissionTitle(title: string, lang: string): string {
  if (lang !== "en" || !title) return title;
  let m = title.match(/^Mời (\d+) người$/);
  if (m) return `Invite ${m[1]} people`;
  m = title.match(/^Mua (\d+) đơn trong tháng$/);
  if (m) return `Buy ${m[1]} orders this month`;
  return title;
}
