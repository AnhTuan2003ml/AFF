import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, withTransaction, type Database, type Transaction } from "../db.js";
import { AppError } from "../lib/errors.js";
import { formatVnd } from "../lib/format.js";
import { writeAuditLog } from "./audit.js";
import { creditFixedReward } from "./ledger.js";
import { sendPushToUser } from "./push.js";

export type MissionType = "REFERRAL_MILESTONE" | "PURCHASE_MILESTONE";
export type MissionClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface MissionDefinition {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  threshold: number;
  rewardAmountVnd: number;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
  createdAt: Date;
}

interface MissionDefinitionRow {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  threshold: number;
  reward_amount_vnd: string;
  status: "ACTIVE" | "INACTIVE";
  sort_order: number;
  created_at: Date;
}

function mapDefinition(row: MissionDefinitionRow): MissionDefinition {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    threshold: row.threshold,
    rewardAmountVnd: Number(row.reward_amount_vnd),
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

const DEFINITION_SELECT = `
  SELECT id, type, title, description, threshold, reward_amount_vnd::text,
    status, sort_order, created_at
  FROM mission_definitions
`;

function currentPurchasePeriodKey(): string {
  return new Date().toISOString().slice(0, 7);
}

interface MissionTierSeed {
  threshold: number;
  rewardVnd: number;
  title: string;
  description?: string;
}

function parseTiers(json: string): MissionTierSeed[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (tier): tier is MissionTierSeed =>
        !!tier &&
        typeof tier === "object" &&
        typeof (tier as MissionTierSeed).threshold === "number" &&
        typeof (tier as MissionTierSeed).rewardVnd === "number" &&
        typeof (tier as MissionTierSeed).title === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Seed mốc nhiệm vụ từ ENV chỉ khi bảng còn trống (lần khởi tạo đầu tiên).
 * Sau đó admin sửa trong Backoffice, DB là nguồn thật, không đọc lại ENV nữa.
 */
export async function ensureMissionDefinitionsSeeded(
  db: Database,
  config: AppConfig,
): Promise<void> {
  const existing = await query<{ count: string }>(
    db,
    "SELECT count(*)::text FROM mission_definitions",
  );
  if (Number(existing.rows[0]!.count) > 0) return;

  const referralTiers = parseTiers(config.MISSION_REFERRAL_MILESTONES_JSON);
  const purchaseTiers = parseTiers(config.MISSION_PURCHASE_MILESTONES_JSON);
  if (referralTiers.length === 0 && purchaseTiers.length === 0) return;

  await withTransaction(db, async (client) => {
    let sortOrder = 0;
    for (const tier of referralTiers) {
      await query(
        client,
        `INSERT INTO mission_definitions
          (type, title, description, threshold, reward_amount_vnd, sort_order)
         VALUES ('REFERRAL_MILESTONE', $1, $2, $3, $4, $5)`,
        [tier.title, tier.description ?? "", tier.threshold, tier.rewardVnd, sortOrder++],
      );
    }
    for (const tier of purchaseTiers) {
      await query(
        client,
        `INSERT INTO mission_definitions
          (type, title, description, threshold, reward_amount_vnd, sort_order)
         VALUES ('PURCHASE_MILESTONE', $1, $2, $3, $4, $5)`,
        [tier.title, tier.description ?? "", tier.threshold, tier.rewardVnd, sortOrder++],
      );
    }
  });
}

export async function listMissionDefinitions(
  db: Database,
): Promise<MissionDefinition[]> {
  const result = await query<MissionDefinitionRow>(
    db,
    `${DEFINITION_SELECT} ORDER BY type, sort_order, threshold`,
  );
  return result.rows.map(mapDefinition);
}

export interface MissionDefinitionInput {
  type: MissionType;
  title: string;
  description: string;
  threshold: number;
  rewardAmountVnd: number;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
}

function validateDefinitionInput(input: MissionDefinitionInput): void {
  if (!input.title.trim()) {
    throw new AppError("VALIDATION_ERROR", "Tiêu đề nhiệm vụ không được để trống.");
  }
  if (!Number.isInteger(input.threshold) || input.threshold <= 0) {
    throw new AppError("VALIDATION_ERROR", "Mốc nhiệm vụ phải là số nguyên dương.");
  }
  if (!Number.isInteger(input.rewardAmountVnd) || input.rewardAmountVnd <= 0) {
    throw new AppError("VALIDATION_ERROR", "Số tiền thưởng phải là số nguyên dương.");
  }
}

export async function createMissionDefinition(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  input: MissionDefinitionInput,
): Promise<MissionDefinition> {
  validateDefinitionInput(input);
  const result = await query<MissionDefinitionRow>(
    db,
    `INSERT INTO mission_definitions
      (type, title, description, threshold, reward_amount_vnd, status, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, type, title, description, threshold, reward_amount_vnd::text,
       status, sort_order, created_at`,
    [
      input.type,
      input.title.trim(),
      input.description.trim(),
      input.threshold,
      input.rewardAmountVnd,
      input.status,
      input.sortOrder,
    ],
  );
  const created = mapDefinition(result.rows[0]!);
  await writeAuditLog(db, config, request, {
    action: "MISSION_DEFINITION_CREATED",
    targetType: "MISSION_DEFINITION",
    targetId: created.id,
    after: created as unknown as Record<string, unknown>,
  });
  return created;
}

export async function updateMissionDefinition(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  id: string,
  input: MissionDefinitionInput,
): Promise<MissionDefinition> {
  validateDefinitionInput(input);
  const beforeResult = await query<MissionDefinitionRow>(
    db,
    `${DEFINITION_SELECT} WHERE id = $1`,
    [id],
  );
  const before = beforeResult.rows[0];
  if (!before) {
    throw new AppError("NOT_FOUND", "Không tìm thấy nhiệm vụ.", 404);
  }
  const result = await query<MissionDefinitionRow>(
    db,
    `UPDATE mission_definitions SET
      type = $1, title = $2, description = $3, threshold = $4,
      reward_amount_vnd = $5, status = $6, sort_order = $7, updated_at = now()
     WHERE id = $8
     RETURNING id, type, title, description, threshold, reward_amount_vnd::text,
       status, sort_order, created_at`,
    [
      input.type,
      input.title.trim(),
      input.description.trim(),
      input.threshold,
      input.rewardAmountVnd,
      input.status,
      input.sortOrder,
      id,
    ],
  );
  const after = mapDefinition(result.rows[0]!);
  await writeAuditLog(db, config, request, {
    action: "MISSION_DEFINITION_UPDATED",
    targetType: "MISSION_DEFINITION",
    targetId: id,
    before: mapDefinition(before) as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });
  return after;
}

export async function deleteMissionDefinition(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  id: string,
): Promise<void> {
  const result = await query<MissionDefinitionRow>(
    db,
    `DELETE FROM mission_definitions WHERE id = $1
     RETURNING id, type, title, description, threshold, reward_amount_vnd::text,
       status, sort_order, created_at`,
    [id],
  );
  const deleted = result.rows[0];
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Không tìm thấy nhiệm vụ.", 404);
  }
  await writeAuditLog(db, config, request, {
    action: "MISSION_DEFINITION_DELETED",
    targetType: "MISSION_DEFINITION",
    targetId: id,
    before: mapDefinition(deleted) as unknown as Record<string, unknown>,
  });
}

export async function createNotification(
  db: Database | Transaction,
  params: { userId: string; type: string; title: string; body?: string },
): Promise<void> {
  await query(
    db,
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)`,
    [params.userId, params.type, params.title, params.body ?? ""],
  );
  // Bắn push ra thiết bị (fire-and-forget) để báo ngoài app như các app khác.
  void sendPushToUser(db, params.userId, {
    title: params.title,
    body: params.body ?? "",
    data: { type: params.type },
  });
}

export async function getUnreadNotificationCount(
  db: Database,
  userId: string,
): Promise<number> {
  const result = await query<{ count: string }>(
    db,
    `SELECT count(*)::text FROM notifications WHERE user_id = $1 AND NOT is_read`,
    [userId],
  );
  return Number(result.rows[0]!.count);
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
}

export async function listNotifications(
  db: Database,
  userId: string,
  limit = 30,
): Promise<NotificationItem[]> {
  const result = await query<{
    id: string;
    type: string;
    title: string;
    body: string;
    is_read: boolean;
    created_at: Date;
  }>(
    db,
    `SELECT id, type, title, body, is_read, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}

export async function markAllNotificationsRead(
  db: Database,
  userId: string,
): Promise<void> {
  await query(
    db,
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read`,
    [userId],
  );
}

interface UserProgressCounts {
  referralCount: number;
  purchaseCount: number;
  purchasePeriodKey: string;
}

/**
 * Đếm tiến độ THẬT của user tại thời điểm gọi — không ghi gì vào DB. Dùng
 * chung cho cả màn hình xem tiến độ lẫn lúc xác nhận yêu cầu nhận thưởng.
 */
async function computeUserProgress(
  db: Database,
  userId: string,
): Promise<UserProgressCounts> {
  const purchasePeriodKey = currentPurchasePeriodKey();
  const [referralCountResult, purchaseCountResult] = await Promise.all([
    query<{ count: string }>(
      db,
      `SELECT count(*)::text FROM referrals WHERE referrer_user_id = $1 AND status = 'REWARDED'`,
      [userId],
    ),
    query<{ count: string }>(
      db,
      `SELECT count(*)::text FROM orders
       WHERE user_id = $1 AND status = 'APPROVED'
         AND to_char(COALESCE(approved_at, created_at), 'YYYY-MM') = $2`,
      [userId, purchasePeriodKey],
    ),
  ]);
  return {
    referralCount: Number(referralCountResult.rows[0]!.count),
    purchaseCount: Number(purchaseCountResult.rows[0]!.count),
    purchasePeriodKey,
  };
}

function progressFor(
  definition: MissionDefinition,
  counts: UserProgressCounts,
): { progress: number; periodKey: string } {
  return definition.type === "REFERRAL_MILESTONE"
    ? { progress: counts.referralCount, periodKey: "LIFETIME" }
    : { progress: counts.purchaseCount, periodKey: counts.purchasePeriodKey };
}

export interface MissionProgressView {
  definition: MissionDefinition;
  progress: number;
  claimStatus: MissionClaimStatus | null;
  claimable: boolean;
  tickPercent: number;
}

export interface MissionGroupOverview {
  maxThreshold: number;
  currentProgress: number;
  fillPercent: number;
  items: MissionProgressView[];
}

/** Làm tròn về bội số của 5 (0-100) — CSP chặn style nội tuyến nên thanh tiến
 * độ phải dùng sẵn 21 lớp CSS rời rạc (0,5,10,...,100) thay vì width tính tay. */
function roundPercentStep5(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped / 5) * 5;
}

// Tiến độ gộp theo loại nhiệm vụ; không tự tạo yêu cầu nhận thưởng —
// người dùng phải bấm "Nhận thưởng" (claimMissionReward).
export async function getUserMissionOverview(
  db: Database,
  userId: string,
): Promise<Record<"REFERRAL_MILESTONE" | "PURCHASE_MILESTONE", MissionGroupOverview>> {
  const definitions = (await listMissionDefinitions(db)).filter(
    (def) => def.status === "ACTIVE",
  );
  const counts = await computeUserProgress(db, userId);

  const claimsResult = await query<{
    mission_definition_id: string;
    period_key: string;
    status: MissionClaimStatus;
  }>(
    db,
    `SELECT mission_definition_id, period_key, status FROM user_mission_claims
     WHERE user_id = $1`,
    [userId],
  );
  const claimByKey = new Map(
    claimsResult.rows.map((row) => [`${row.mission_definition_id}:${row.period_key}`, row.status]),
  );

  const buildGroup = (type: MissionType): MissionGroupOverview => {
    const groupDefinitions = definitions
      .filter((def) => def.type === type)
      .sort((left, right) => left.threshold - right.threshold);
    const maxThreshold = groupDefinitions.reduce(
      (max, def) => Math.max(max, def.threshold),
      0,
    );
    const currentProgress =
      type === "REFERRAL_MILESTONE" ? counts.referralCount : counts.purchaseCount;
    const items = groupDefinitions.map((definition) => {
      const { progress, periodKey } = progressFor(definition, counts);
      const claimStatus = claimByKey.get(`${definition.id}:${periodKey}`) ?? null;
      return {
        definition,
        progress,
        claimStatus,
        claimable: claimStatus === null && progress >= definition.threshold,
        tickPercent:
          maxThreshold > 0
            ? roundPercentStep5((definition.threshold / maxThreshold) * 100)
            : 0,
      };
    });
    const fillPercent =
      maxThreshold > 0 ? roundPercentStep5((currentProgress / maxThreshold) * 100) : 0;
    return { maxThreshold, currentProgress, fillPercent, items };
  };

  return {
    REFERRAL_MILESTONE: buildGroup("REFERRAL_MILESTONE"),
    PURCHASE_MILESTONE: buildGroup("PURCHASE_MILESTONE"),
  };
}

// Tạo yêu cầu PENDING chờ admin duyệt — tiền chỉ đổi ở approveMissionClaim.
// Chặn nếu chưa đạt mốc hoặc đã gửi yêu cầu trước đó.
export async function claimMissionReward(
  db: Database,
  userId: string,
  missionDefinitionId: string,
): Promise<void> {
  const definitionResult = await query<MissionDefinitionRow>(
    db,
    `${DEFINITION_SELECT} WHERE id = $1 AND status = 'ACTIVE'`,
    [missionDefinitionId],
  );
  const row = definitionResult.rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", "Không tìm thấy mốc nhiệm vụ này.", 404);
  }
  const definition = mapDefinition(row);

  const counts = await computeUserProgress(db, userId);
  const { progress, periodKey } = progressFor(definition, counts);
  if (progress < definition.threshold) {
    throw new AppError(
      "MISSION_NOT_REACHED",
      "Bạn chưa đạt mốc này nên chưa thể nhận thưởng.",
    );
  }

  const inserted = await query<{ id: string }>(
    db,
    `INSERT INTO user_mission_claims
      (user_id, mission_definition_id, period_key, progress_value, reward_amount_vnd)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, mission_definition_id, period_key) DO NOTHING
     RETURNING id`,
    [userId, definition.id, periodKey, progress, definition.rewardAmountVnd],
  );
  if (!inserted.rows[0]) {
    throw new AppError(
      "MISSION_ALREADY_CLAIMED",
      "Bạn đã gửi yêu cầu nhận thưởng cho mốc này rồi, đang chờ duyệt.",
    );
  }

  await createNotification(db, {
    userId,
    type: "MISSION_CLAIM_SENT",
    title: `Đã gửi yêu cầu nhận thưởng: ${definition.title}`,
    body: `ShopTik sẽ kiểm tra và duyệt trong thời gian sớm nhất — thưởng ${formatVnd(definition.rewardAmountVnd)}.`,
  });
}

interface PendingClaimRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  mission_title: string;
  mission_type: MissionType;
  period_key: string;
  progress_value: number;
  reward_amount_vnd: string;
  status: MissionClaimStatus;
  created_at: Date;
}

export interface MissionClaimListItem {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  missionTitle: string;
  missionType: MissionType;
  periodKey: string;
  progressValue: number;
  rewardAmountVnd: number;
  status: MissionClaimStatus;
  createdAt: Date;
}

export async function listMissionClaims(
  db: Database,
  status?: MissionClaimStatus,
): Promise<MissionClaimListItem[]> {
  const result = await query<PendingClaimRow>(
    db,
    `
      SELECT c.id, c.user_id, u.email, u.full_name,
        d.title AS mission_title, d.type AS mission_type,
        c.period_key, c.progress_value, c.reward_amount_vnd::text,
        c.status, c.created_at
      FROM user_mission_claims c
      JOIN users u ON u.id = c.user_id
      JOIN mission_definitions d ON d.id = c.mission_definition_id
      WHERE ($1::text IS NULL OR c.status = $1)
      ORDER BY c.created_at DESC
      LIMIT 200
    `,
    [status ?? null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.email,
    userDisplayName: row.full_name,
    missionTitle: row.mission_title,
    missionType: row.mission_type,
    periodKey: row.period_key,
    progressValue: row.progress_value,
    rewardAmountVnd: Number(row.reward_amount_vnd),
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function approveMissionClaim(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  claimId: string,
): Promise<void> {
  const adminId = request.currentUser?.id;
  if (!adminId) {
    throw new AppError("UNAUTHORIZED", "Thiếu thông tin quản trị viên.", 401);
  }

  const claimResult = await query<{
    id: string;
    user_id: string;
    status: MissionClaimStatus;
    reward_amount_vnd: string;
    mission_title: string;
  }>(
    db,
    `SELECT c.id, c.user_id, c.status, c.reward_amount_vnd::text, d.title AS mission_title
     FROM user_mission_claims c
     JOIN mission_definitions d ON d.id = c.mission_definition_id
     WHERE c.id = $1`,
    [claimId],
  );
  const claim = claimResult.rows[0];
  if (!claim) throw new AppError("NOT_FOUND", "Không tìm thấy yêu cầu nhận thưởng.", 404);
  if (claim.status !== "PENDING") {
    throw new AppError("INVALID_STATE", "Yêu cầu này đã được xử lý trước đó.");
  }

  // creditFixedReward tự mở transaction riêng (không thể lồng transaction của
  // chính nó vào transaction ở đây) — an toàn nhờ idempotencyKey nếu bị gọi
  // trùng, nên tách bước cộng ví và bước cập nhật claim thành 2 pha.
  const rewardAmountVnd = Number(claim.reward_amount_vnd);
  await creditFixedReward(db, {
    userId: claim.user_id,
    referenceId: claim.id,
    idempotencyKey: `mission:claim:${claim.id}`,
    description: `Thưởng nhiệm vụ: ${claim.mission_title}`,
    amountVnd: rewardAmountVnd,
    createdBy: adminId,
    type: "MISSION_REWARD",
    referenceType: "MISSION_CLAIM",
  });

  const updated = await withTransaction(db, async (client) => {
    const updateResult = await query<{ id: string }>(
      client,
      `UPDATE user_mission_claims SET status = 'APPROVED', approved_by = $1, approved_at = now()
       WHERE id = $2 AND status = 'PENDING'
       RETURNING id`,
      [adminId, claimId],
    );
    if (!updateResult.rows[0]) return false;
    await createNotification(client, {
      userId: claim.user_id,
      type: "MISSION_APPROVED",
      title: `Nhiệm vụ "${claim.mission_title}" đã được duyệt`,
      body: `Bạn vừa nhận ${formatVnd(rewardAmountVnd)} vào ví.`,
    });
    return true;
  });
  if (!updated) return;

  await writeAuditLog(db, config, request, {
    action: "MISSION_CLAIM_APPROVED",
    targetType: "MISSION_CLAIM",
    targetId: claim.id,
    after: { userId: claim.user_id, rewardAmountVnd } as unknown as Record<string, unknown>,
  });
}

export async function rejectMissionClaim(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  claimId: string,
): Promise<void> {
  const adminId = request.currentUser?.id;
  if (!adminId) {
    throw new AppError("UNAUTHORIZED", "Thiếu thông tin quản trị viên.", 401);
  }

  const result = await query<{
    id: string;
    user_id: string;
    status: MissionClaimStatus;
    mission_title: string;
  }>(
    db,
    `UPDATE user_mission_claims c SET status = 'REJECTED', approved_by = $1, approved_at = now()
     FROM mission_definitions d
     WHERE c.id = $2 AND c.mission_definition_id = d.id AND c.status = 'PENDING'
     RETURNING c.id, c.user_id, c.status, d.title AS mission_title`,
    [adminId, claimId],
  );
  const claim = result.rows[0];
  if (!claim) {
    throw new AppError("NOT_FOUND", "Không tìm thấy yêu cầu đang chờ duyệt.", 404);
  }

  await createNotification(db, {
    userId: claim.user_id,
    type: "MISSION_REJECTED",
    title: `Nhiệm vụ "${claim.mission_title}" không được duyệt`,
    body: "Vui lòng liên hệ hỗ trợ nếu bạn cho rằng đây là nhầm lẫn.",
  });

  await writeAuditLog(db, config, request, {
    action: "MISSION_CLAIM_REJECTED",
    targetType: "MISSION_CLAIM",
    targetId: claim.id,
  });
}
