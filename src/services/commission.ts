export interface CommissionRates {
  buyerCashbackPercent: number;
  platformSharePercent: number;
  sharerRewardFromPlatformPercent: number;
}

export interface CommissionSplit {
  buyerVnd: number;
  platformVnd: number;
  sharerVnd: number;
  buyerPercent: number;
  platformPercent: number;
  sharerPercent: number;
}

/**
 * Chia hoa hồng thực nhận của một đơn: buyer nhận buyerCashbackPercent%;
 * nếu mua qua link chia sẻ, sharer nhận sharerRewardFromPlatformPercent%
 * trích từ phần nền tảng. Buyer/sharer làm tròn xuống, phần dư về nền tảng
 * để tổng luôn khớp commissionVnd (ledger cân bằng).
 */
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
  const platformRawPercent = rates.platformSharePercent;
  const sharerPercent = hasSharer
    ? Math.floor((platformRawPercent * rates.sharerRewardFromPlatformPercent) / 100)
    : 0;
  const platformPercent = platformRawPercent - sharerPercent;

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
