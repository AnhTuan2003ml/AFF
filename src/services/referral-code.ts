import { query, withTransaction, type Database, type Transaction } from "../db.js";
import { AppError } from "../lib/errors.js";
import { camioVoice } from "./camio-voice.js";
import { createNotification } from "./mission.js";

/**
 * Mã giới thiệu theo chính sách:
 *   - Khách thường: 6 chữ số random (randomReferralCode), KHÔNG được sửa.
 *   - Đối tác/KOL (users.is_special_partner): được đổi MỘT lần sang mã tự chọn
 *     3–9 ký tự chữ + số, phải được admin phê duyệt mới có hiệu lực.
 *   - Quan hệ giới thiệu lưu theo user id nên đổi mã không mất dữ liệu cũ;
 *     mã cũ (old_code của yêu cầu đã duyệt) vẫn quy về đúng người khi có
 *     người đăng ký bằng link cũ.
 */

const CUSTOM_CODE_PATTERN = /^[A-Za-z0-9]{3,9}$/;

export interface ReferralCodeRequestRow {
  id: string;
  user_id: string;
  old_code: string;
  requested_code: string;
  status: string;
  created_at: Date;
  email?: string;
  full_name?: string;
}

/** Chuẩn hóa input mã tự chọn; ném AppError nếu sai định dạng. */
export function normalizeCustomReferralCode(raw: string): string {
  const code = raw.trim();
  if (!CUSTOM_CODE_PATTERN.test(code)) {
    throw new AppError(
      "REFERRAL_CODE_INVALID",
      "Mã giới thiệu tự chọn chỉ gồm chữ và số, dài 3–9 ký tự.",
      400,
    );
  }
  return code;
}

/**
 * Tìm người giới thiệu theo mã — KHÔNG phân biệt hoa thường, và chấp nhận cả
 * mã cũ của đối tác đã đổi mã (link chia sẻ trước đây vẫn dùng được).
 */
export async function resolveReferrerByCode(
  db: Database | Transaction,
  rawCode: string,
): Promise<string | null> {
  const code = rawCode.trim();
  if (!code) return null;
  const direct = await query<{ id: string }>(
    db,
    "SELECT id FROM users WHERE upper(referral_code) = upper($1) AND status = 'ACTIVE'",
    [code],
  );
  if (direct.rows[0]) return direct.rows[0].id;
  const legacy = await query<{ user_id: string }>(
    db,
    `SELECT r.user_id
     FROM referral_code_requests r
     JOIN users u ON u.id = r.user_id AND u.status = 'ACTIVE'
     WHERE r.status = 'APPROVED' AND upper(r.old_code) = upper($1)
     ORDER BY r.decided_at DESC
     LIMIT 1`,
    [code],
  );
  return legacy.rows[0]?.user_id ?? null;
}

/**
 * Gán người giới thiệu cho tài khoản CHƯA có (đăng ký Google không qua form,
 * hoặc nhập mã sau khi vào app). Trả về true nếu gán thành công.
 */
export async function applyReferralToUser(
  db: Database,
  userId: string,
  rawCode: string,
): Promise<boolean> {
  const referrerId = await resolveReferrerByCode(db, rawCode);
  if (!referrerId || referrerId === userId) return false;
  return withTransaction(db, async (client) => {
    const updated = await query(
      client,
      `UPDATE users SET referred_by_user_id = $2
       WHERE id = $1 AND referred_by_user_id IS NULL`,
      [userId, referrerId],
    );
    if (!updated.rowCount) return false;
    await query(
      client,
      `INSERT INTO referrals (referrer_user_id, referred_user_id)
       VALUES ($1, $2)
       ON CONFLICT (referred_user_id) DO NOTHING`,
      [referrerId, userId],
    );
    return true;
  });
}

async function codeAlreadyTaken(
  db: Database | Transaction,
  code: string,
): Promise<boolean> {
  const dupUser = await query(
    db,
    "SELECT 1 FROM users WHERE upper(referral_code) = upper($1)",
    [code],
  );
  if (dupUser.rows.length) return true;
  const dupPending = await query(
    db,
    "SELECT 1 FROM referral_code_requests WHERE status = 'PENDING' AND upper(requested_code) = upper($1)",
    [code],
  );
  return dupPending.rows.length > 0;
}

/** Trạng thái cho trang /app/referrals của một người dùng. */
export async function getReferralCodeState(
  db: Database,
  userId: string,
): Promise<{
  isPartner: boolean;
  customizedAt: Date | null;
  pendingCode: string | null;
}> {
  const user = await query<{
    is_special_partner: boolean;
    referral_code_customized_at: Date | null;
  }>(
    db,
    "SELECT is_special_partner, referral_code_customized_at FROM users WHERE id = $1",
    [userId],
  );
  const pending = await query<{ requested_code: string }>(
    db,
    "SELECT requested_code FROM referral_code_requests WHERE user_id = $1 AND status = 'PENDING'",
    [userId],
  );
  return {
    isPartner: Boolean(user.rows[0]?.is_special_partner),
    customizedAt: user.rows[0]?.referral_code_customized_at ?? null,
    pendingCode: pending.rows[0]?.requested_code ?? null,
  };
}

/** Đối tác gửi yêu cầu đổi mã — chờ admin duyệt. */
export async function requestReferralCodeChange(
  db: Database,
  userId: string,
  rawCode: string,
): Promise<void> {
  const code = normalizeCustomReferralCode(rawCode);
  await withTransaction(db, async (client) => {
    const user = await query<{
      referral_code: string;
      is_special_partner: boolean;
      referral_code_customized_at: Date | null;
    }>(
      client,
      `SELECT referral_code, is_special_partner, referral_code_customized_at
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const row = user.rows[0];
    if (!row) throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
    if (!row.is_special_partner) {
      throw new AppError(
        "REFERRAL_CODE_FORBIDDEN",
        "Chỉ đối tác/KOL mới được đổi mã giới thiệu. Khách thường dùng mã 6 số do hệ thống cấp.",
        403,
      );
    }
    if (row.referral_code_customized_at) {
      throw new AppError(
        "REFERRAL_CODE_ALREADY_CHANGED",
        "Bạn đã dùng quyền đổi mã giới thiệu (mỗi đối tác được đổi 1 lần).",
        409,
      );
    }
    const pending = await query(
      client,
      "SELECT 1 FROM referral_code_requests WHERE user_id = $1 AND status = 'PENDING'",
      [userId],
    );
    if (pending.rows.length) {
      throw new AppError(
        "REFERRAL_CODE_PENDING",
        "Bạn đã có một yêu cầu đổi mã đang chờ duyệt.",
        409,
      );
    }
    if (row.referral_code.toUpperCase() === code.toUpperCase()) {
      throw new AppError(
        "REFERRAL_CODE_SAME",
        "Mã mới trùng mã hiện tại của bạn.",
        400,
      );
    }
    if (await codeAlreadyTaken(client, code)) {
      throw new AppError(
        "REFERRAL_CODE_TAKEN",
        "Mã này đã có người dùng. Hãy chọn mã khác.",
        409,
      );
    }
    await query(
      client,
      `INSERT INTO referral_code_requests (user_id, old_code, requested_code)
       VALUES ($1, $2, $3)`,
      [userId, row.referral_code, code],
    );
  });
}

/** Danh sách yêu cầu cho backoffice: đang chờ + vài quyết định gần nhất. */
export async function listReferralCodeRequests(
  db: Database,
): Promise<{ pending: ReferralCodeRequestRow[]; recent: ReferralCodeRequestRow[] }> {
  const pending = await query<ReferralCodeRequestRow>(
    db,
    `SELECT r.id, r.user_id, r.old_code, r.requested_code, r.status, r.created_at,
            u.email, u.full_name
     FROM referral_code_requests r JOIN users u ON u.id = r.user_id
     WHERE r.status = 'PENDING'
     ORDER BY r.created_at ASC`,
  );
  const recent = await query<ReferralCodeRequestRow>(
    db,
    `SELECT r.id, r.user_id, r.old_code, r.requested_code, r.status, r.created_at,
            u.email, u.full_name
     FROM referral_code_requests r JOIN users u ON u.id = r.user_id
     WHERE r.status <> 'PENDING'
     ORDER BY r.decided_at DESC NULLS LAST
     LIMIT 10`,
  );
  return { pending: pending.rows, recent: recent.rows };
}

/** Admin duyệt/từ chối. Duyệt thì đổi mã ngay và báo cho đối tác (push + danh sách). */
export async function decideReferralCodeRequest(
  db: Database,
  requestId: string,
  approve: boolean,
  adminId: string,
): Promise<ReferralCodeRequestRow> {
  return withTransaction(db, async (client) => {
    const found = await query<ReferralCodeRequestRow>(
      client,
      `SELECT id, user_id, old_code, requested_code, status, created_at
       FROM referral_code_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    const request = found.rows[0];
    if (!request) {
      throw new AppError("REFERRAL_REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu.", 404);
    }
    if (request.status !== "PENDING") {
      throw new AppError(
        "REFERRAL_REQUEST_DECIDED",
        "Yêu cầu này đã được xử lý trước đó.",
        409,
      );
    }
    if (approve) {
      if (await codeAlreadyTakenExcludingRequest(client, request)) {
        throw new AppError(
          "REFERRAL_CODE_TAKEN",
          "Mã này vừa bị người khác dùng mất. Hãy từ chối để đối tác chọn mã mới.",
          409,
        );
      }
      await query(
        client,
        `UPDATE users
         SET referral_code = $2, referral_code_customized_at = now()
         WHERE id = $1`,
        [request.user_id, request.requested_code],
      );
    }
    await query(
      client,
      `UPDATE referral_code_requests
       SET status = $2, decided_by = $3, decided_at = now()
       WHERE id = $1`,
      [requestId, approve ? "APPROVED" : "REJECTED", adminId],
    );
    const notice = approve
      ? camioVoice.referralCodeApproved({ code: request.requested_code })
      : camioVoice.referralCodeRejected({ code: request.requested_code });
    await createNotification(client, {
      userId: request.user_id,
      type: approve ? "REFERRAL_CODE_APPROVED" : "REFERRAL_CODE_REJECTED",
      title: notice.title,
      body: notice.body,
    });
    return { ...request, status: approve ? "APPROVED" : "REJECTED" };
  });
}

async function codeAlreadyTakenExcludingRequest(
  client: Transaction,
  request: ReferralCodeRequestRow,
): Promise<boolean> {
  const dupUser = await query(
    client,
    "SELECT 1 FROM users WHERE upper(referral_code) = upper($1) AND id <> $2",
    [request.requested_code, request.user_id],
  );
  return dupUser.rows.length > 0;
}
