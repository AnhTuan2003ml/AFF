import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { creditFixedReward } from "./ledger.js";
import type { BusinessConfig } from "./business-config.js";

/**
 * Thưởng giới thiệu là số tiền cố định (không phải %), chỉ trả một lần khi
 * người được giới thiệu có đơn hợp lệ ĐẦU TIÊN được đối tác duyệt — không
 * trả theo lượt click hay theo số lượng đăng ký.
 */
export async function maybeRewardReferral(
  db: Database,
  appConfig: AppConfig,
  businessConfig: BusinessConfig,
  params: { buyerUserId: string; orderId: string; actorId?: string },
): Promise<void> {
  if (!businessConfig.enableReferralProgram) return;
  if (businessConfig.referralRewardTrigger !== "first_approved_order") return;
  if (
    businessConfig.referrerRewardAmountVnd <= 0 &&
    businessConfig.referredUserBonusAmountVnd <= 0
  ) {
    return;
  }

  const referral = await query<{
    id: string;
    referrer_user_id: string;
    referred_user_id: string;
    status: string;
  }>(
    db,
    `
      SELECT id, referrer_user_id, referred_user_id, status
      FROM referrals
      WHERE referred_user_id = $1 AND status IN ('PENDING', 'ELIGIBLE')
      FOR UPDATE
    `,
    [params.buyerUserId],
  );
  const row = referral.rows[0];
  if (!row) return;

  const priorApproved = await query<{ count: string }>(
    db,
    `
      SELECT count(*)::text AS count
      FROM orders
      WHERE user_id = $1 AND status = 'APPROVED' AND id <> $2
    `,
    [params.buyerUserId, params.orderId],
  );
  if (Number(priorApproved.rows[0]?.count ?? "0") > 0) {
    // Đơn hợp lệ đầu tiên đã xảy ra trước đó; không thưởng lại.
    await query(db, "UPDATE referrals SET status = 'REWARDED' WHERE id = $1", [
      row.id,
    ]);
    return;
  }

  await creditFixedReward(db, {
    userId: row.referrer_user_id,
    referenceId: row.id,
    idempotencyKey: `referral:referrer:${row.id}`,
    description: "Thưởng giới thiệu bạn bè (đơn đầu tiên đã duyệt)",
    amountVnd: businessConfig.referrerRewardAmountVnd,
    ...(params.actorId ? { createdBy: params.actorId } : {}),
  });
  await creditFixedReward(db, {
    userId: row.referred_user_id,
    referenceId: row.id,
    idempotencyKey: `referral:referred:${row.id}`,
    description: "Quà chào mừng thành viên mới (đơn đầu tiên đã duyệt)",
    amountVnd: businessConfig.referredUserBonusAmountVnd,
    ...(params.actorId ? { createdBy: params.actorId } : {}),
  });

  await query(db, "UPDATE referrals SET status = 'REWARDED' WHERE id = $1", [
    row.id,
  ]);
}
