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
 * Chia hoa hồng Shopee thực nhận cho một đơn hàng.
 *
 * Không trả tiền theo click — hàm này chỉ được gọi khi có một đơn hợp lệ với
 * commissionVnd > 0 do Shopee ghi nhận và đối tác duyệt.
 *
 * - Mua trực tiếp (hasSharer=false): người mua nhận buyerCashbackPercent%,
 *   nền tảng giữ phần còn lại (platformSharePercent%).
 * - Mua qua link chia sẻ của người khác (hasSharer=true): người mua vẫn nhận
 *   buyerCashbackPercent%; trong phần nền tảng, chủ link nhận
 *   sharerRewardFromPlatformPercent% (vd 80/20 nền tảng, sharer 20% của 20%
 *   = 4% tổng hoa hồng, nền tảng còn 16%).
 *
 * Làm tròn xuống cho buyer/sharer, phần dư gán cho nền tảng để tổng ba phần
 * luôn khớp chính xác commissionVnd — đảm bảo bút toán ledger cân bằng.
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
