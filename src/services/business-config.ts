import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database, type Transaction } from "../db.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";

export interface BusinessConfig {
  buyerCashbackPercent: number;
  platformSharePercent: number;
  sharerRewardFromPlatformPercent: number;
  referrerRewardAmountVnd: number;
  referredUserBonusAmountVnd: number;
  referralRewardTrigger: string;
  affiliateAttributionDays: number;
  cashbackHoldDays: number;
  minWithdrawAmountVnd: number;
  enableShareLink: boolean;
  enableReferralProgram: boolean;
  enableAutoCashbackApproval: boolean;
  updatedAt: Date;
}

interface BusinessConfigRow {
  buyer_cashback_percent: number;
  platform_share_percent: number;
  sharer_reward_from_platform_percent: number;
  referrer_reward_amount_vnd: string;
  referred_user_bonus_amount_vnd: string;
  referral_reward_trigger: string;
  affiliate_attribution_days: number;
  cashback_hold_days: number;
  min_withdraw_amount_vnd: string;
  enable_share_link: boolean;
  enable_referral_program: boolean;
  enable_auto_cashback_approval: boolean;
  updated_at: Date;
}

function mapRow(row: BusinessConfigRow): BusinessConfig {
  return {
    buyerCashbackPercent: row.buyer_cashback_percent,
    platformSharePercent: row.platform_share_percent,
    sharerRewardFromPlatformPercent: row.sharer_reward_from_platform_percent,
    referrerRewardAmountVnd: Number(row.referrer_reward_amount_vnd),
    referredUserBonusAmountVnd: Number(row.referred_user_bonus_amount_vnd),
    referralRewardTrigger: row.referral_reward_trigger,
    affiliateAttributionDays: row.affiliate_attribution_days,
    cashbackHoldDays: row.cashback_hold_days,
    minWithdrawAmountVnd: Number(row.min_withdraw_amount_vnd),
    enableShareLink: row.enable_share_link,
    enableReferralProgram: row.enable_referral_program,
    enableAutoCashbackApproval: row.enable_auto_cashback_approval,
    updatedAt: row.updated_at,
  };
}

const SELECT_SQL = `
  SELECT buyer_cashback_percent, platform_share_percent,
    sharer_reward_from_platform_percent, referrer_reward_amount_vnd::text,
    referred_user_bonus_amount_vnd::text, referral_reward_trigger,
    affiliate_attribution_days, cashback_hold_days,
    min_withdraw_amount_vnd::text, enable_share_link, enable_referral_program,
    enable_auto_cashback_approval, updated_at
  FROM business_config
  WHERE id = true
`;

/**
 * Đọc cấu hình nghiệp vụ từ database. Nếu chưa có (lần khởi tạo đầu tiên),
 * seed từ giá trị mặc định trong ENV rồi trả về bản vừa tạo.
 */
export async function getBusinessConfig(
  db: Database | Transaction,
  appConfig: AppConfig,
): Promise<BusinessConfig> {
  const existing = await query<BusinessConfigRow>(db, SELECT_SQL);
  if (existing.rows[0]) return mapRow(existing.rows[0]);

  const seeded = await query<BusinessConfigRow>(
    db,
    `
      INSERT INTO business_config (
        id, buyer_cashback_percent, platform_share_percent,
        sharer_reward_from_platform_percent, referrer_reward_amount_vnd,
        referred_user_bonus_amount_vnd, referral_reward_trigger,
        affiliate_attribution_days, cashback_hold_days,
        min_withdraw_amount_vnd, enable_share_link, enable_referral_program
      ) VALUES (
        true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      ON CONFLICT (id) DO UPDATE SET id = business_config.id
      RETURNING buyer_cashback_percent, platform_share_percent,
        sharer_reward_from_platform_percent, referrer_reward_amount_vnd::text,
        referred_user_bonus_amount_vnd::text, referral_reward_trigger,
        affiliate_attribution_days, cashback_hold_days,
        min_withdraw_amount_vnd::text, enable_share_link,
        enable_referral_program, enable_auto_cashback_approval, updated_at
    `,
    [
      appConfig.BUYER_CASHBACK_PERCENT,
      appConfig.PLATFORM_SHARE_PERCENT,
      appConfig.SHARER_REWARD_FROM_PLATFORM_PERCENT,
      appConfig.REFERRER_REWARD_AMOUNT,
      appConfig.REFERRED_USER_BONUS_AMOUNT,
      appConfig.REFERRAL_REWARD_TRIGGER,
      appConfig.AFFILIATE_ATTRIBUTION_DAYS,
      appConfig.CASHBACK_HOLD_DAYS,
      appConfig.MIN_WITHDRAW_AMOUNT,
      appConfig.ENABLE_SHARE_LINK,
      appConfig.ENABLE_REFERRAL_PROGRAM,
    ],
  );
  return mapRow(seeded.rows[0]!);
}

export interface BusinessConfigPatch {
  buyerCashbackPercent: number;
  sharerRewardFromPlatformPercent: number;
  referrerRewardAmountVnd: number;
  referredUserBonusAmountVnd: number;
  affiliateAttributionDays: number;
  cashbackHoldDays: number;
  minWithdrawAmountVnd: number;
  enableShareLink: boolean;
  enableReferralProgram: boolean;
  enableAutoCashbackApproval: boolean;
}

/**
 * Admin cập nhật cấu hình nghiệp vụ. Có hiệu lực ngay lập tức cho các đơn
 * ghi nhận sau đó — không tác động hồi tố tới các đơn đã có bản chụp tỷ lệ.
 */
export async function updateBusinessConfig(
  db: Database,
  appConfig: AppConfig,
  request: FastifyRequest,
  patch: BusinessConfigPatch,
): Promise<BusinessConfig> {
  if (patch.buyerCashbackPercent < 0 || patch.buyerCashbackPercent > 100) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Tỷ lệ hoàn cho người mua phải trong khoảng 0-100.",
    );
  }
  if (
    patch.sharerRewardFromPlatformPercent < 0 ||
    patch.sharerRewardFromPlatformPercent > 100
  ) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Tỷ lệ thưởng chủ link (trên phần nền tảng) phải trong khoảng 0-100.",
    );
  }
  if (patch.referrerRewardAmountVnd < 0 || patch.referredUserBonusAmountVnd < 0) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Số tiền thưởng giới thiệu không được âm.",
    );
  }
  if (patch.affiliateAttributionDays < 1 || patch.cashbackHoldDays < 0) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Số ngày ghi nhận/giữ tiền không hợp lệ.",
    );
  }
  if (patch.minWithdrawAmountVnd <= 0) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Số tiền rút tối thiểu phải lớn hơn 0.",
    );
  }

  const platformSharePercent = 100 - patch.buyerCashbackPercent;
  const before = await getBusinessConfig(db, appConfig);

  const updated = await query<BusinessConfigRow>(
    db,
    `
      UPDATE business_config SET
        buyer_cashback_percent = $1,
        platform_share_percent = $2,
        sharer_reward_from_platform_percent = $3,
        referrer_reward_amount_vnd = $4,
        referred_user_bonus_amount_vnd = $5,
        affiliate_attribution_days = $6,
        cashback_hold_days = $7,
        min_withdraw_amount_vnd = $8,
        enable_share_link = $9,
        enable_referral_program = $10,
        enable_auto_cashback_approval = $11,
        updated_by = $12
      WHERE id = true
      RETURNING buyer_cashback_percent, platform_share_percent,
        sharer_reward_from_platform_percent, referrer_reward_amount_vnd::text,
        referred_user_bonus_amount_vnd::text, referral_reward_trigger,
        affiliate_attribution_days, cashback_hold_days,
        min_withdraw_amount_vnd::text, enable_share_link,
        enable_referral_program, enable_auto_cashback_approval, updated_at
    `,
    [
      patch.buyerCashbackPercent,
      platformSharePercent,
      patch.sharerRewardFromPlatformPercent,
      patch.referrerRewardAmountVnd,
      patch.referredUserBonusAmountVnd,
      patch.affiliateAttributionDays,
      patch.cashbackHoldDays,
      patch.minWithdrawAmountVnd,
      patch.enableShareLink,
      patch.enableReferralProgram,
      patch.enableAutoCashbackApproval,
      request.currentUser?.id ?? null,
    ],
  );
  const after = mapRow(updated.rows[0]!);

  await writeAuditLog(db, appConfig, request, {
    action: "BUSINESS_CONFIG_UPDATED",
    targetType: "BUSINESS_CONFIG",
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });

  return after;
}
