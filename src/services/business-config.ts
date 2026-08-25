import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database, type Transaction } from "../db.js";
import { AppError } from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";

export interface BusinessConfig {
  buyerCashbackPercent: number;
  platformSharePercent: number;
  /** LEGACY — không còn dùng trong tính toán (giữ để đọc dữ liệu cũ). */
  sharerRewardFromPlatformPercent: number;
  /** % hoa hồng cho đối tác giới thiệu — TRỰC TIẾP trên hoa hồng. */
  referrerSharePercent: number;
  /** % cho ĐỐI TÁC ĐẶC BIỆT (users.is_special_partner) — thay cho mức thường. */
  specialPartnerSharePercent: number;
  /** Đơn có giá trị ≤ ngưỡng này (₫) thì người mua nhận smallOrderBuyerPercent. */
  smallOrderThresholdVnd: number;
  smallOrderBuyerPercent: number;
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
  referrer_share_percent: number;
  special_partner_share_percent: number;
  small_order_threshold_vnd: string;
  small_order_buyer_percent: number;
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
    referrerSharePercent: row.referrer_share_percent,
    specialPartnerSharePercent: row.special_partner_share_percent,
    smallOrderThresholdVnd: Number(row.small_order_threshold_vnd),
    smallOrderBuyerPercent: row.small_order_buyer_percent,
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
    sharer_reward_from_platform_percent, referrer_share_percent,
    special_partner_share_percent, small_order_threshold_vnd::text,
    small_order_buyer_percent, referrer_reward_amount_vnd::text,
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
        min_withdraw_amount_vnd, enable_share_link, enable_referral_program,
        referrer_share_percent, special_partner_share_percent,
        small_order_threshold_vnd, small_order_buyer_percent
      ) VALUES (
        true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 5, 10, 25000, 80
      )
      ON CONFLICT (id) DO UPDATE SET id = business_config.id
      RETURNING buyer_cashback_percent, platform_share_percent,
        sharer_reward_from_platform_percent, referrer_share_percent,
        special_partner_share_percent, small_order_threshold_vnd::text,
        small_order_buyer_percent, referrer_reward_amount_vnd::text,
        referred_user_bonus_amount_vnd::text, referral_reward_trigger,
        affiliate_attribution_days, cashback_hold_days,
        min_withdraw_amount_vnd::text, enable_share_link,
        enable_referral_program, enable_auto_cashback_approval, updated_at
    `,
    [
      appConfig.BUYER_CASHBACK_PERCENT,
      // Nền tảng = phần còn lại sau người mua và 5% đối tác giới thiệu (seed).
      Math.max(0, 100 - appConfig.BUYER_CASHBACK_PERCENT - 5),
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
  referrerSharePercent: number;
  specialPartnerSharePercent: number;
  smallOrderThresholdVnd: number;
  smallOrderBuyerPercent: number;
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
  for (const [nhan, giaTri] of [
    ["đối tác giới thiệu", patch.referrerSharePercent],
    ["đối tác đặc biệt", patch.specialPartnerSharePercent],
    ["người mua với đơn nhỏ", patch.smallOrderBuyerPercent],
  ] as const) {
    if (giaTri < 0 || giaTri > 100) {
      throw new AppError(
        "INVALID_BUSINESS_CONFIG",
        `Tỷ lệ ${nhan} phải trong khoảng 0-100.`,
      );
    }
  }
  const sharerToiDa = Math.max(
    patch.referrerSharePercent,
    patch.specialPartnerSharePercent,
  );
  if (
    patch.buyerCashbackPercent + sharerToiDa > 100 ||
    patch.smallOrderBuyerPercent + sharerToiDa > 100
  ) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Tổng tỷ lệ người mua + đối tác không được vượt 100%.",
    );
  }
  if (patch.smallOrderThresholdVnd < 0) {
    throw new AppError(
      "INVALID_BUSINESS_CONFIG",
      "Ngưỡng đơn nhỏ không được âm.",
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

  // Nền tảng giữ phần còn lại sau người mua và đối tác giới thiệu (mức thường).
  const platformSharePercent =
    100 - patch.buyerCashbackPercent - patch.referrerSharePercent;
  const before = await getBusinessConfig(db, appConfig);

  const updated = await query<BusinessConfigRow>(
    db,
    `
      UPDATE business_config SET
        buyer_cashback_percent = $1,
        platform_share_percent = $2,
        referrer_share_percent = $3,
        special_partner_share_percent = $4,
        small_order_threshold_vnd = $5,
        small_order_buyer_percent = $6,
        referrer_reward_amount_vnd = $7,
        referred_user_bonus_amount_vnd = $8,
        affiliate_attribution_days = $9,
        cashback_hold_days = $10,
        min_withdraw_amount_vnd = $11,
        enable_share_link = $12,
        enable_referral_program = $13,
        enable_auto_cashback_approval = $14,
        updated_by = $15
      WHERE id = true
      RETURNING buyer_cashback_percent, platform_share_percent,
        sharer_reward_from_platform_percent, referrer_share_percent,
        special_partner_share_percent, small_order_threshold_vnd::text,
        small_order_buyer_percent, referrer_reward_amount_vnd::text,
        referred_user_bonus_amount_vnd::text, referral_reward_trigger,
        affiliate_attribution_days, cashback_hold_days,
        min_withdraw_amount_vnd::text, enable_share_link,
        enable_referral_program, enable_auto_cashback_approval, updated_at
    `,
    [
      patch.buyerCashbackPercent,
      platformSharePercent,
      patch.referrerSharePercent,
      patch.specialPartnerSharePercent,
      patch.smallOrderThresholdVnd,
      patch.smallOrderBuyerPercent,
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
