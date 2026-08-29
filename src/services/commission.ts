/**
 * Chia hoa hồng thực nhận của một đơn theo chính sách 2026-08-25:
 *
 *   · Người mua nhận `buyerCashbackPercent`% (60% chuẩn; đơn ≤ ngưỡng đơn nhỏ
 *     — 25.000₫ — thì tới `smallOrderBuyerPercent`% = 80%).
 *   · Người chia sẻ/giới thiệu nhận `sharerSharePercent`% TRỰC TIẾP trên hoa
 *     hồng (10% chuẩn, cũng là mức của ĐỐI TÁC ĐẶC BIỆT — quyết định ở nơi gọi).
 *   · Nền tảng giữ phần còn lại (30% khi người mua 60%).
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

  const buyerPercent = rates.buyerCashbackPercent;
  const sharerPercent = hasSharer ? rates.sharerSharePercent : 0;
  if (buyerPercent + sharerPercent > 100) {
    throw new Error("Tổng tỷ lệ người mua + người chia sẻ vượt quá 100%.");
  }
  const platformPercent = 100 - buyerPercent - sharerPercent;

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
