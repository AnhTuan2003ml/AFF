/**
 * Tiêu đề mốc nhiệm vụ (mission_definitions.title) do API trả về tiếng Việt, có
 * chèn số (vd "Mời 50 người", "Mua 3 đơn trong tháng"). Dịch theo MẪU khi hiển
 * thị tiếng Anh, giữ nguyên số. Không khớp mẫu thì để nguyên (admin đặt tự do).
 * Bản sao của src/lib/mission-i18n.ts bên web để hai nơi cùng một cách dịch.
 */
export function localizeMissionTitle(title: string, lang: string): string {
  if (lang !== 'en' || !title) return title;
  let m = title.match(/^Mời (\d+) người$/);
  if (m) return `Invite ${m[1]} people`;
  m = title.match(/^Mua (\d+) đơn trong tháng$/);
  if (m) return `Buy ${m[1]} orders this month`;
  return title;
}
