import heicConvert from "heic-convert";
import sharp from "sharp";
import { query, withTransaction, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { multipartBuffer, sniffMime } from "./kyc-upload.js";

// Ảnh gốc từ điện thoại có thể vài MB; chuẩn hóa xong chỉ còn vài chục KB.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const AVATAR_SIZE = 256;

export interface StoredAvatar {
  url: string;
}

/**
 * Chuẩn hóa mọi ảnh (kể cả HEIC/HEIF iPhone) về JPEG vuông 256px: xoay theo
 * EXIF, cắt giữa theo vùng nổi bật, nén ~82%. <img> trình duyệt luôn hiển thị
 * được và file rất nhẹ.
 */
async function toAvatarJpeg(buf: Buffer): Promise<Buffer> {
  const mime = sniffMime(buf);
  if (!mime.startsWith("image/")) {
    throw new AppError(
      "AVATAR_FORMAT",
      "Vui lòng chọn một tệp ảnh (JPG, PNG, WEBP hoặc ảnh iPhone HEIC).",
      400,
    );
  }
  let src = buf;
  if (mime === "image/heic" || mime === "image/heif") {
    // libvips prebuilt không giải mã HEIF → qua heic-convert (WASM) sang JPEG.
    const jpg = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
    src = Buffer.from(jpg);
  }
  try {
    return await sharp(src)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new AppError(
      "AVATAR_FORMAT",
      "Ảnh không đọc được. Hãy chọn ảnh JPG, PNG hoặc ảnh iPhone (HEIC).",
      400,
    );
  }
}

/**
 * Nhận field file từ @fastify/multipart, chuẩn hóa và lưu avatar vào DB, rồi
 * cập nhật users.avatar_url = <origin>/avatar/<id>?v=<ts>. Trả về URL mới.
 * Dùng URL tuyệt đối để app di động (React Native) tải được thẳng.
 */
export async function saveUserAvatarFromField(
  db: Database,
  origin: string,
  userId: string,
  fileValue: unknown,
): Promise<StoredAvatar> {
  const raw = multipartBuffer(fileValue);
  if (!raw) {
    throw new AppError("AVATAR_EMPTY", "Chưa chọn ảnh đại diện.", 400);
  }
  if (raw.length > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "AVATAR_TOO_LARGE",
      "Ảnh vượt quá 8 MB. Hãy chọn ảnh nhỏ hơn.",
      400,
    );
  }
  const jpeg = await toAvatarJpeg(raw);
  return withTransaction(db, async (client) => {
    await query(
      client,
      `INSERT INTO user_avatars (user_id, content_type, data, updated_at)
       VALUES ($1, 'image/jpeg', $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET content_type = EXCLUDED.content_type,
             data = EXCLUDED.data,
             updated_at = now()`,
      [userId, jpeg],
    );
    const version = Date.now().toString(36);
    const url = `${origin.replace(/\/+$/, "")}/avatar/${userId}?v=${version}`;
    await query(client, "UPDATE users SET avatar_url = $2 WHERE id = $1", [
      userId,
      url,
    ]);
    return { url };
  });
}

/** Lấy ảnh avatar để phục vụ qua route. */
export async function getUserAvatar(
  db: Database,
  userId: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  const res = await query<{ content_type: string; data: Buffer }>(
    db,
    "SELECT content_type, data FROM user_avatars WHERE user_id = $1",
    [userId],
  );
  const row = res.rows[0];
  return row ? { contentType: row.content_type, data: row.data } : null;
}

/** Gỡ ảnh tự tải → quay về avatar chữ cái đầu. */
export async function removeUserAvatar(
  db: Database,
  userId: string,
): Promise<void> {
  await withTransaction(db, async (client) => {
    await query(client, "DELETE FROM user_avatars WHERE user_id = $1", [userId]);
    await query(client, "UPDATE users SET avatar_url = '' WHERE id = $1", [
      userId,
    ]);
  });
}
