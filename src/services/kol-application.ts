import { query, withTransaction, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { camioVoice } from "./camio-voice.js";
import { createNotification } from "./mission.js";

/**
 * Đăng ký KOL/KOC: lưu hồ sơ + 3 file KYC (2 mặt CCCD + video khuôn mặt).
 * Admin duyệt để so video với ảnh CCCD; duyệt xong người dùng thành đối tác
 * đặc biệt (is_special_partner).
 */

export interface KolApplicationInput {
  fullName: string;
  birthDate?: string | undefined;
  cccdNumber: string;
  cccdIssue?: string | undefined;
  address?: string | undefined;
  phone: string;
  email?: string | undefined;
  taxCode?: string | undefined;
  bankAccount?: string | undefined;
  bankName?: string | undefined;
  socialLinks?: string | undefined;
  agreementVersion: number;
}

export interface KolFileUpload {
  kind: "CCCD_FRONT" | "CCCD_BACK" | "FACE_VIDEO";
  contentType: string;
  buffer: Buffer;
}

const s = (v: string | undefined, max = 300): string | null =>
  v && v.trim() ? v.trim().slice(0, max) : null;

/** Nộp hồ sơ KOL/KOC + file KYC. Một người chỉ có một hồ sơ đang chờ. */
export async function submitKolApplication(
  db: Database,
  userId: string,
  input: KolApplicationInput,
  files: KolFileUpload[],
): Promise<string> {
  if (!input.fullName?.trim() || !input.cccdNumber?.trim() || !input.phone?.trim()) {
    throw new AppError(
      "KOL_MISSING_FIELDS",
      "Vui lòng điền họ tên, số CCCD và số điện thoại.",
      400,
    );
  }
  const need: KolFileUpload["kind"][] = ["CCCD_FRONT", "CCCD_BACK", "FACE_VIDEO"];
  for (const k of need) {
    if (!files.find((f) => f.kind === k && f.buffer.length > 0)) {
      throw new AppError(
        "KOL_MISSING_FILES",
        "Cần đủ ảnh 2 mặt CCCD và video khuôn mặt.",
        400,
      );
    }
  }

  return withTransaction(db, async (client) => {
    const existing = await query<{ status: string }>(
      client,
      "SELECT status FROM kol_applications WHERE user_id = $1 AND status IN ('PENDING','APPROVED') LIMIT 1",
      [userId],
    );
    if (existing.rows.length) {
      throw new AppError(
        "KOL_ALREADY",
        existing.rows[0]!.status === "APPROVED"
          ? "Bạn đã là đối tác KOL/KOC, không cần đăng ký lại."
          : "Bạn đã có hồ sơ đang chờ duyệt.",
        409,
      );
    }
    const app = await query<{ id: string }>(
      client,
      `INSERT INTO kol_applications (
         user_id, full_name, birth_date, cccd_number, cccd_issue, address,
         phone, email, tax_code, bank_account, bank_name, social_links,
         agreement_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        userId,
        s(input.fullName)!,
        s(input.birthDate),
        s(input.cccdNumber, 30)!,
        s(input.cccdIssue),
        s(input.address, 500),
        s(input.phone, 30)!,
        s(input.email, 200),
        s(input.taxCode, 30),
        s(input.bankAccount, 40),
        s(input.bankName, 120),
        s(input.socialLinks, 1000),
        input.agreementVersion,
      ],
    );
    const appId = app.rows[0]!.id;
    for (const f of files) {
      await query(
        client,
        `INSERT INTO kol_application_files (application_id, kind, content_type, byte_size, content)
         VALUES ($1,$2,$3,$4,$5)`,
        [appId, f.kind, f.contentType.slice(0, 100), f.buffer.length, f.buffer],
      );
    }
    return appId;
  });
}

export interface KolApplicationRow {
  id: string;
  user_id: string;
  status: string;
  full_name: string;
  birth_date: string | null;
  cccd_number: string;
  cccd_issue: string | null;
  address: string | null;
  phone: string;
  email: string | null;
  tax_code: string | null;
  bank_account: string | null;
  bank_name: string | null;
  social_links: string | null;
  reject_reason: string | null;
  created_at: Date;
  account_email?: string;
  account_name?: string;
}

/** Danh sách hồ sơ cho backoffice: chờ duyệt trước, kèm vài quyết định gần đây. */
export async function listKolApplications(
  db: Database,
): Promise<{ pending: KolApplicationRow[]; recent: KolApplicationRow[] }> {
  const cols = `a.id, a.user_id, a.status, a.full_name, a.birth_date, a.cccd_number,
    a.cccd_issue, a.address, a.phone, a.email, a.tax_code, a.bank_account,
    a.bank_name, a.social_links, a.reject_reason, a.created_at,
    u.email AS account_email, u.full_name AS account_name`;
  const pending = await query<KolApplicationRow>(
    db,
    `SELECT ${cols} FROM kol_applications a JOIN users u ON u.id = a.user_id
     WHERE a.status = 'PENDING' ORDER BY a.created_at ASC`,
  );
  const recent = await query<KolApplicationRow>(
    db,
    `SELECT ${cols} FROM kol_applications a JOIN users u ON u.id = a.user_id
     WHERE a.status <> 'PENDING' ORDER BY a.decided_at DESC NULLS LAST LIMIT 10`,
  );
  return { pending: pending.rows, recent: recent.rows };
}

export async function getKolApplication(
  db: Database,
  id: string,
): Promise<KolApplicationRow | null> {
  const r = await query<KolApplicationRow>(
    db,
    `SELECT a.id, a.user_id, a.status, a.full_name, a.birth_date, a.cccd_number,
       a.cccd_issue, a.address, a.phone, a.email, a.tax_code, a.bank_account,
       a.bank_name, a.social_links, a.reject_reason, a.created_at,
       u.email AS account_email, u.full_name AS account_name
     FROM kol_applications a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export type KolFileKind =
  | "CCCD_FRONT"
  | "CCCD_BACK"
  | "FACE_VIDEO"
  | "CONTRACT_PDF";

/** Đọc một file KYC/hợp đồng để stream. */
export async function getKolFile(
  db: Database,
  applicationId: string,
  kind: KolFileKind,
): Promise<{ contentType: string; content: Buffer } | null> {
  const r = await query<{ content_type: string; content: Buffer }>(
    db,
    `SELECT content_type, content FROM kol_application_files
     WHERE application_id = $1 AND kind = $2`,
    [applicationId, kind],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { contentType: row.content_type, content: Buffer.from(row.content) };
}

/** Lưu (hoặc thay) file PDF hợp đồng admin upload khi duyệt, để xem lại/gửi lại. */
export async function saveKolContractFile(
  db: Database,
  applicationId: string,
  pdf: Buffer,
): Promise<void> {
  await query(
    db,
    `INSERT INTO kol_application_files (application_id, kind, content_type, byte_size, content)
     VALUES ($1, 'CONTRACT_PDF', 'application/pdf', $2, $3)
     ON CONFLICT (application_id, kind)
     DO UPDATE SET content = EXCLUDED.content, byte_size = EXCLUDED.byte_size, content_type = EXCLUDED.content_type`,
    [applicationId, pdf.length, pdf],
  );
}

/** Hồ sơ KOL/KOC đang chờ của người dùng (để trang đăng ký hiện trạng thái). */
export async function getUserKolStatus(
  db: Database,
  userId: string,
): Promise<{ status: string | null }> {
  const r = await query<{ status: string }>(
    db,
    `SELECT status FROM kol_applications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return { status: r.rows[0]?.status ?? null };
}

/** Hồ sơ mới nhất của người dùng kèm cờ có file hợp đồng chưa (để hiện lại sau duyệt). */
export async function getUserKolApplication(
  db: Database,
  userId: string,
): Promise<(KolApplicationRow & { has_contract: boolean }) | null> {
  const r = await query<KolApplicationRow & { has_contract: boolean }>(
    db,
    `SELECT a.id, a.user_id, a.status, a.full_name, a.birth_date, a.cccd_number,
       a.cccd_issue, a.address, a.phone, a.email, a.tax_code, a.bank_account,
       a.bank_name, a.social_links, a.reject_reason, a.created_at,
       EXISTS(SELECT 1 FROM kol_application_files f
         WHERE f.application_id = a.id AND f.kind = 'CONTRACT_PDF') AS has_contract
     FROM kol_applications a WHERE a.user_id = $1
     ORDER BY a.created_at DESC LIMIT 1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

/** Admin duyệt/từ chối. Duyệt → user thành đối tác đặc biệt + thông báo. */
export async function decideKolApplication(
  db: Database,
  applicationId: string,
  approve: boolean,
  adminId: string,
  reason?: string,
): Promise<{ userId: string; fullName: string }> {
  return withTransaction(db, async (client) => {
    const found = await query<{ user_id: string; full_name: string; status: string }>(
      client,
      "SELECT user_id, full_name, status FROM kol_applications WHERE id = $1 FOR UPDATE",
      [applicationId],
    );
    const app = found.rows[0];
    if (!app) throw new AppError("KOL_NOT_FOUND", "Không tìm thấy hồ sơ.", 404);
    if (app.status !== "PENDING") {
      throw new AppError("KOL_DECIDED", "Hồ sơ đã được xử lý.", 409);
    }
    await query(
      client,
      `UPDATE kol_applications
       SET status = $2, decided_by = $3, decided_at = now(),
           reject_reason = $4, updated_at = now()
       WHERE id = $1`,
      [applicationId, approve ? "APPROVED" : "REJECTED", adminId, approve ? null : reason ?? null],
    );
    if (approve) {
      await query(
        client,
        "UPDATE users SET is_special_partner = true WHERE id = $1",
        [app.user_id],
      );
    }
    const notice = approve
      ? camioVoice.kolApproved()
      : camioVoice.kolRejected({ reason });
    await createNotification(client, {
      userId: app.user_id,
      type: approve ? "KOL_APPROVED" : "KOL_REJECTED",
      title: notice.title,
      body: notice.body,
    });
    return { userId: app.user_id, fullName: app.full_name };
  });
}
