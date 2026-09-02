/**
 * Mô tả bút toán ví (ledger_transactions.description) do API trả về, LƯU SẴN
 * tiếng Việt lúc tạo giao dịch. Để hiển thị tiếng Anh khi đổi ngôn ngữ, ánh xạ
 * chuỗi cố định sang EN lúc render. Bản sao của src/lib/ledger-i18n.ts bên web.
 */
const LEDGER_DESC_EN: Record<string, string> = {
  'Ghi nhận hoàn tiền đang chờ đối tác duyệt': 'Cashback recorded, awaiting partner approval',
  'Chuyển hoàn tiền đã duyệt sang số dư khả dụng': 'Approved cashback moved to available balance',
  'Đảo khoản hoàn do đơn hủy hoặc không hợp lệ': 'Cashback reversed (order cancelled or invalid)',
  'Ghi nhận hoa hồng đơn hàng đang chờ đối tác duyệt':
    'Order commission recorded, awaiting partner approval',
  'Chuyển hoa hồng đã duyệt sang số dư khả dụng': 'Approved commission moved to available balance',
  'Đảo hoa hồng do đơn hủy hoặc không hợp lệ': 'Commission reversed (order cancelled or invalid)',
  'Giữ số dư cho yêu cầu rút tiền': 'Balance held for a withdrawal request',
  'Hoàn lại số dư do yêu cầu rút bị từ chối': 'Balance restored: withdrawal request rejected',
  'Thưởng giới thiệu bạn bè (đơn đầu tiên đã duyệt)': 'Referral reward (first approved order)',
};

/** Tiền tố mô tả động (có phần đuôi thay đổi) → hàm dựng bản EN. */
const PREFIX_EN: { vi: string; en: string }[] = [
  { vi: 'Thưởng nhiệm vụ: ', en: 'Mission reward: ' },
  { vi: 'Rút tiền về ', en: 'Withdrawal to ' },
];

export function localizeLedgerDescription(desc: string, lang: string): string {
  if (lang !== 'en' || !desc) return desc;
  const exact = LEDGER_DESC_EN[desc];
  if (exact) return exact;
  for (const p of PREFIX_EN) {
    if (desc.startsWith(p.vi)) return p.en + desc.slice(p.vi.length);
  }
  return desc;
}
