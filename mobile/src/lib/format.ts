/**
 * Định dạng hiển thị, khớp với bộ filter Nunjucks của web (`vnd`, `datetime`)
 * để cùng một con số không hiện ra hai kiểu ở hai nơi.
 */

/**
 * Tiền VND luôn là số nguyên trong hệ thống này — không có phần thập phân ở
 * bất kỳ đâu, kể cả khi chia hoa hồng. Làm tròn xuống cho khớp cách backend
 * tính, tránh app hiện nhiều hơn một đồng so với số thật trong ví.
 */
export function vnd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.floor(value).toLocaleString('vi-VN')}đ`;
}

export function ngay(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function ngayGio(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })} ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}
