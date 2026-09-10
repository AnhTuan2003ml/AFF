import { query, withTransaction, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { sniffMime } from "./kyc-upload.js";

export type HeroMediaKind = "image" | "video";

/** Mục media đã sẵn sàng cho frontend hero (nguồn đã resolve, thời lượng). */
export interface HeroMediaItem {
  id: string;
  kind: HeroMediaKind;
  src: string;
  durationMs: number;
}

/** Dòng cho trang quản trị (đủ thông tin để hiển thị + quản lý). */
export interface HeroMediaAdminRow {
  id: string;
  kind: HeroMediaKind;
  src: string;
  isUpload: boolean;
  url: string | null;
  durationMs: number;
  sortOrder: number;
  active: boolean;
}

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

function resolveSrc(row: { id: string; url: string | null }): string {
  // Không dùng tiền tố /assets/* để tránh đụng handler static; route riêng bên dưới.
  return row.url ? row.url : `/hero-media/${row.id}`;
}

/** Danh sách ĐANG BẬT cho hero, theo thứ tự — frontend xoay vòng theo đây. */
export async function listActiveHeroMedia(db: Database): Promise<HeroMediaItem[]> {
  const result = await query<{
    id: string;
    kind: HeroMediaKind;
    url: string | null;
    duration_ms: number;
  }>(
    db,
    `SELECT id, kind, url, duration_ms
       FROM hero_media
      WHERE active = true
      ORDER BY sort_order, created_at`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    src: resolveSrc(row),
    durationMs: row.duration_ms,
  }));
}

/** Toàn bộ media cho trang quản trị. */
export async function listAllHeroMedia(db: Database): Promise<HeroMediaAdminRow[]> {
  const result = await query<{
    id: string;
    kind: HeroMediaKind;
    url: string | null;
    has_data: boolean;
    duration_ms: number;
    sort_order: number;
    active: boolean;
  }>(
    db,
    `SELECT id, kind, url, (data IS NOT NULL) AS has_data,
       duration_ms, sort_order, active
       FROM hero_media
      ORDER BY sort_order, created_at`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    src: resolveSrc(row),
    isUpload: row.has_data,
    url: row.url,
    durationMs: row.duration_ms,
    sortOrder: row.sort_order,
    active: row.active,
  }));
}

function clampDuration(seconds: number): number {
  const ms = Math.round((Number.isFinite(seconds) ? seconds : 6) * 1000);
  return Math.max(500, Math.min(300000, ms));
}

async function nextSortOrder(db: Database): Promise<number> {
  const res = await query<{ next: string }>(
    db,
    "SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM hero_media",
  );
  return Number(res.rows[0]?.next ?? 1);
}

/** Thêm mục media từ URL ngoài. */
export async function addHeroMediaUrl(
  db: Database,
  params: { kind: HeroMediaKind; url: string; durationSeconds: number },
): Promise<void> {
  const url = params.url.trim();
  if (!/^https:\/\/\S+$/i.test(url)) {
    throw new AppError("HERO_URL", "Link ảnh/video phải là đường dẫn https hợp lệ.", 400);
  }
  const sort = await nextSortOrder(db);
  await query(
    db,
    `INSERT INTO hero_media (kind, url, duration_ms, sort_order)
     VALUES ($1, $2, $3, $4)`,
    [params.kind, url, clampDuration(params.durationSeconds), sort],
  );
}

/** Thêm mục media từ tệp tải lên (lưu bytea). */
export async function addHeroMediaUpload(
  db: Database,
  params: { buffer: Buffer; durationSeconds: number },
): Promise<void> {
  if (params.buffer.length === 0) {
    throw new AppError("HERO_EMPTY", "Chưa chọn tệp ảnh/video.", 400);
  }
  if (params.buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError("HERO_TOO_LARGE", "Tệp vượt quá 30 MB.", 400);
  }
  const mime = sniffMime(params.buffer);
  const kind: HeroMediaKind = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("image/")
      ? "image"
      : (() => {
          throw new AppError(
            "HERO_FORMAT",
            "Chỉ nhận tệp ảnh (JPG/PNG/WEBP/GIF) hoặc video (MP4/WEBM).",
            400,
          );
        })();
  const sort = await nextSortOrder(db);
  await query(
    db,
    `INSERT INTO hero_media (kind, content_type, data, duration_ms, sort_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [kind, mime, params.buffer, clampDuration(params.durationSeconds), sort],
  );
}

export async function deleteHeroMedia(db: Database, id: string): Promise<void> {
  await query(db, "DELETE FROM hero_media WHERE id = $1", [id]);
}

export async function setHeroMediaActive(
  db: Database,
  id: string,
  active: boolean,
): Promise<void> {
  await query(db, "UPDATE hero_media SET active = $2 WHERE id = $1", [id, active]);
}

/** Đổi chỗ với mục liền kề (lên/xuống) để đổi thứ tự hiển thị. */
export async function moveHeroMedia(
  db: Database,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await withTransaction(db, async (client) => {
    const cur = await query<{ sort_order: number }>(
      client,
      "SELECT sort_order FROM hero_media WHERE id = $1 FOR UPDATE",
      [id],
    );
    const sortOrder = cur.rows[0]?.sort_order;
    if (sortOrder == null) return;
    const neighbor = await query<{ id: string; sort_order: number }>(
      client,
      direction === "up"
        ? `SELECT id, sort_order FROM hero_media WHERE sort_order < $1
             ORDER BY sort_order DESC LIMIT 1`
        : `SELECT id, sort_order FROM hero_media WHERE sort_order > $1
             ORDER BY sort_order ASC LIMIT 1`,
      [sortOrder],
    );
    const other = neighbor.rows[0];
    if (!other) return;
    await query(client, "UPDATE hero_media SET sort_order = $2 WHERE id = $1", [
      id,
      other.sort_order,
    ]);
    await query(client, "UPDATE hero_media SET sort_order = $2 WHERE id = $1", [
      other.id,
      sortOrder,
    ]);
  });
}

export async function getHeroMediaBlob(
  db: Database,
  id: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  const res = await query<{ content_type: string | null; data: Buffer | null }>(
    db,
    "SELECT content_type, data FROM hero_media WHERE id = $1 AND data IS NOT NULL",
    [id],
  );
  const row = res.rows[0];
  return row && row.data
    ? { contentType: row.content_type ?? "application/octet-stream", data: row.data }
    : null;
}
