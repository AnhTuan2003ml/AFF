/**
 * Chia hoa hồng thực nhận của một đơn theo chính sách 2026-08-29:
 *
 *   · Nền tảng LUÔN giữ (100 − `buyerCashbackPercent`)% hoa hồng — mặc định 40%
 *     (đơn ≤ ngưỡng đơn nhỏ 25.000₫: người mua tới `smallOrderBuyerPercent`%
 *     = 80% nên nền tảng chỉ còn 20%).
 *   · Người giới thiệu/chia sẻ (nếu có) hưởng `sharerSharePercent`% (mặc định
 *     6%) — TRÍCH TỪ phần người mua, KHÔNG lấy thêm từ nền tảng.
 *   · Vậy người mua nhận `buyerCashbackPercent`% khi KHÔNG có người giới thiệu
 *     (60%), và (`buyerCashbackPercent` − `sharerSharePercent`)% khi CÓ (54%).
 *
 * Buyer/sharer làm tròn xuống, phần dư về nền tảng để tổng luôn khớp
 * commissionVnd (ledger cân bằng).
 */

export interface CommissionRates {
  /** % hoa hồng người mua nhận (đã chọn theo giá trị đơn ở nơi gọi). */
  buyerCashbackPercent: number;
  /** % hoa hồng người chia sẻ/giới thiệu nhận — TRỰC TIẾP trên hoa hồng. */
  sharerSharePercent: number;
}

export interface CommissionSplit {
  buyerVnd: number;
  platformVnd: number;
  sharerVnd: number;
  buyerPercent: number;
  platformPercent: number;
  sharerPercent: number;
}

export function computeCommissionSplit(
  commissionVnd: number,
  rates: CommissionRates,
  hasSharer: boolean,
): CommissionSplit {
  if (!Number.isSafeInteger(commissionVnd) || commissionVnd < 0) {
    throw new Error("commissionVnd phải là số nguyên không âm.");
  }
  for (const [key, value] of Object.entries(rates)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`${key} phải nằm trong khoảng 0-100.`);
    }
  }

  const sharerPercent = hasSharer ? rates.sharerSharePercent : 0;
  if (sharerPercent > rates.buyerCashbackPercent) {
    throw new Error("Tỷ lệ người giới thiệu không được vượt tỷ lệ người mua.");
  }
  // Người giới thiệu hưởng phần TRÍCH TỪ tỷ lệ người mua: nền tảng luôn giữ
  // (100 − buyerCashbackPercent)%, người mua nhận phần còn lại của mình.
  const buyerPercent = rates.buyerCashbackPercent - sharerPercent;
  const platformPercent = 100 - rates.buyerCashbackPercent;

  if (commissionVnd === 0) {
    return { buyerVnd: 0, platformVnd: 0, sharerVnd: 0, buyerPercent, platformPercent, sharerPercent };
  }

  const buyerVnd = Math.floor((commissionVnd * buyerPercent) / 100);
  const sharerVnd = hasSharer
    ? Math.floor((commissionVnd * sharerPercent) / 100)
    : 0;
  const platformVnd = commissionVnd - buyerVnd - sharerVnd;

  return { buyerVnd, platformVnd, sharerVnd, buyerPercent, platformPercent, sharerPercent };
}

/**
 * % người mua nhận theo GIÁ TRỊ ĐƠN: đơn ≤ ngưỡng đơn nhỏ (> 0) nhận
 * `smallOrderBuyerPercent`; còn lại nhận `buyerCashbackPercent`. Đơn chưa rõ
 * giá trị (null/0) dùng tỷ lệ chuẩn — không tự bịa mức cao hơn.
 */
export function resolveBuyerPercent(
  orderAmountVnd: number | null,
  config: {
    buyerCashbackPercent: number;
    smallOrderThresholdVnd: number;
    smallOrderBuyerPercent: number;
  },
): number {
  if (
    orderAmountVnd !== null &&
    orderAmountVnd > 0 &&
    config.smallOrderThresholdVnd > 0 &&
    orderAmountVnd <= config.smallOrderThresholdVnd
  ) {
    return config.smallOrderBuyerPercent;
  }
  return config.buyerCashbackPercent;
}
