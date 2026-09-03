import { query, type Database, withTransaction } from "../db.js";
import { AppError } from "../lib/errors.js";
import { verifyPassword } from "../lib/password.js";
import { getWalletBalances } from "./ledger.js";

/**
 * Xóa tài khoản tự phục vụ.
 *
 * Có mặt ở v1 không phải vì tính năng hay, mà vì cả App Store lẫn CH Play đều
 * trả hồ sơ nếu app có tài khoản mà không cho người dùng tự xóa ngay trong app.
 *
 * XÓA MỀM, không DELETE. Lý do là nghiệp vụ chứ không phải kỹ thuật: bút toán
 * ledger, đơn hàng và lệnh rút đã trả là chứng từ đối soát với sàn và với ngân
 * hàng — xóa cứng thì sổ sách thủng, và những khoản đã chi không truy lại được.
 * Cái bị gỡ là DANH TÍNH: email, tên, mật khẩu, số tài khoản ngân hàng.
 *
 * Dùng lại ĐÚNG cơ chế xóa mềm mà khu quản trị đã có (`deleted_at` +
 * `deletion_reason`, status DISABLED — xem routes/admin-users.ts). Không dựng
 * trạng thái riêng cho người dùng tự xóa, nếu không mọi màn hình vận hành lọc
 * theo `deleted_at IS NULL` sẽ phải sửa theo, và sẽ có hai định nghĩa "đã xóa".
 * Khác biệt duy nhất: `deleted_by` để trống, vì không có admin nào ra tay.
 *
 * Email được đổi sang dạng vô hiệu thay vì để nguyên, nhờ đó chỉ mục duy nhất
 * `users_email_unique_lower` được giải phóng và người dùng vẫn đăng ký lại
 * được bằng chính email cũ nếu đổi ý.
 */

const DELETION_REASON = "Người dùng tự xóa tài khoản trong ứng dụng.";

/** Lệnh rút đang trong luồng xử lý — tiền đã rời ví hoặc sắp rời. */
const IN_FLIGHT_WITHDRAWAL_STATUSES = [
  "REQUESTED",
  "FUNDS_HELD",
  "APPROVED",
  "PROCESSING",
  "UNKNOWN",
];

export interface DeleteAccountResult {
  forfeitedVnd: number;
}

export async function deleteOwnAccount(
  db: Database,
  params: {
    userId: string;
    /**
     * Người dùng đã hiểu và chấp nhận mất số dư còn lại. Bắt buộc phải là
     * `true` khi ví còn tiền — không tự ý xóa hộ tiền của người ta, nhưng
     * cũng không được chặn hẳn đường xóa vì hai cửa hàng đòi luôn xóa được.
     */
    forfeitBalance: boolean;
    /**
     * Mật khẩu người dùng nhập ở popup xác nhận — bắt buộc đúng nếu tài khoản
     * CÓ mật khẩu.
     */
    password?: string | undefined;
    /**
     * Email nhập để xác nhận — dùng cho tài khoản đăng nhập Google thuần
     * (không có mật khẩu). Phải trùng email tài khoản.
     */
    confirmEmail?: string | undefined;
  },
): Promise<DeleteAccountResult> {
  // Xác thực danh tính trước khi xóa (tránh người khác mượn phiên đang mở):
  // - Tài khoản có mật khẩu → phải nhập đúng mật khẩu.
  // - Tài khoản Google thuần (không mật khẩu) → xác nhận bằng đúng email.
  const acc = await query<{ password_hash: string | null; email: string }>(
    db,
    "SELECT password_hash, email FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [params.userId],
  );
  const accRow = acc.rows[0];
  if (!accRow) {
    throw new AppError("ACCOUNT_ALREADY_DELETED", "Tài khoản này đã được xóa.", 409);
  }
  if (accRow.password_hash) {
    const ok = params.password
      ? await verifyPassword(accRow.password_hash, params.password)
      : false;
    if (!ok) {
      throw new AppError(
        "WRONG_PASSWORD",
        "Mật khẩu không đúng. Nhập đúng mật khẩu để xóa tài khoản.",
        403,
      );
    }
  } else {
    const ok =
      !!params.confirmEmail &&
      params.confirmEmail.trim().toLowerCase() === accRow.email.toLowerCase();
    if (!ok) {
      throw new AppError(
        "WRONG_CONFIRM_EMAIL",
        "Tài khoản đăng nhập bằng Google không có mật khẩu. Nhập đúng email tài khoản để xác nhận xóa.",
        403,
      );
    }
  }

  const inFlight = await query<{ count: string }>(
    db,
    `
      SELECT count(*)::text AS count
      FROM withdrawals
      WHERE user_id = $1 AND status = ANY($2::text[])
    `,
    [params.userId, IN_FLIGHT_WITHDRAWAL_STATUSES],
  );
  if (Number(inFlight.rows[0]?.count ?? 0) > 0) {
    throw new AppError(
      "WITHDRAWAL_IN_PROGRESS",
      "Bạn đang có lệnh rút tiền chưa xử lý xong. Hãy đợi lệnh rút hoàn tất rồi xóa tài khoản.",
      409,
    );
  }

  const balances = await getWalletBalances(db, params.userId);
  const remaining = balances.available + balances.pending + balances.held;
  if (remaining > 0 && !params.forfeitBalance) {
    throw new AppError(
      "BALANCE_REMAINING",
      `Ví của bạn còn ${remaining.toLocaleString("vi-VN")} đồng. Hãy rút hết trước khi xóa, hoặc xác nhận chấp nhận mất số dư này.`,
      409,
      { remainingVnd: remaining },
    );
  }

  await withTransaction(db, async (client) => {
    const anonymized = await query<{ id: string }>(
      client,
      `
        UPDATE users
        SET status = 'DISABLED',
            role = 'USER',
            deleted_at = now(),
            deletion_reason = $2,
            email = 'deleted+' || id::text || '@shoptik.invalid',
            full_name = 'Người dùng đã xóa',
            password_hash = NULL,
            updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [params.userId, DELETION_REASON],
    );
    if (!anonymized.rows[0]) {
      throw new AppError(
        "ACCOUNT_ALREADY_DELETED",
        "Tài khoản này đã được xóa.",
        409,
      );
    }

    // Đăng xuất mọi thiết bị, cả web lẫn app.
    await query(
      client,
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [params.userId],
    );

    // Gỡ liên kết đăng nhập Google để tài khoản Google đó dùng lại được.
    await query(
      client,
      "DELETE FROM auth_identities WHERE user_id = $1",
      [params.userId],
    );

    // Xóa sạch thông tin ngân hàng. Giữ lại dòng (khóa ngoại từ
    // withdrawal_intents) nhưng không còn gì đọc ra được.
    await query(
      client,
      `
        UPDATE user_bank_accounts
        SET status = 'DISABLED',
            account_number_ciphertext = '',
            account_name_ciphertext = '',
            account_last4 = '****',
            account_name_masked = '***',
            updated_at = now()
        WHERE user_id = $1
      `,
      [params.userId],
    );
  });

  return { forfeitedVnd: remaining };
}
