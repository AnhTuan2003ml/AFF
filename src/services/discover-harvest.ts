import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { getBusinessConfig } from "./business-config.js";

/**
 * Lấy sản phẩm đề xuất từ Shopee Affiliate bằng profile trình duyệt.
 *
 * Server không đụng tới cookie hay dữ liệu đăng nhập: một worker Playwright
 * chạy trên máy host giữ các thư mục profile bền vững, nhận lệnh qua
 * /api/v1/harvest/*:
 * - LOGIN: mở cửa sổ trình duyệt bằng profile để admin đăng nhập
 *   affiliate.shopee.vn, worker tự kiểm tra đã đăng nhập được chưa.
 * - FETCH: mở https://affiliate.shopee.vn/offer/product_offer bằng profile,
 *   gọi api/v3/offer/product/list trong ngữ cảnh trang và gửi response thô
 *   về đây. Server parse + đổ vào content_items (trang Khám phá).
 */

export const SHOPEE_OFFER_PAGE_URL =
  "https://affiliate.shopee.vn/offer/product_offer";
/** Trang "Ưu đãi cho tôi" (list_type=8) — bố cục không có tab, chỉ phân trang. */
export const SHOPEE_OFFER_FOR_ME_URL =
  "https://affiliate.shopee.vn/offer/offer_for_me";
/** Đường dẫn API offer CHƯA gắn list_type — worker tự thêm theo lệnh. */
export const SHOPEE_OFFER_API_PATH =
  "/api/v3/offer/product/list?sort_type=1&client_type=1";
/**
 * list_type: 0 = đề xuất (đổ vào Khám phá), 2 = bán chạy nhất, 8 = ưu đãi
 * độc quyền ("cho tôi", trang offer_for_me). Tất cả dùng chung cơ chế cache
 * theo trang.
 */
export const RECOMMEND_LIST_TYPE = 0;
export const BEST_SELLER_LIST_TYPE = 2;
export const EXCLUSIVE_LIST_TYPE = 8;
/** Danh mục HOT — sản phẩm voucher giá sốc từ shopee.vn/m/ma-giam-gia. Không
 * phải list_type của Shopee; chỉ dùng nội bộ để lưu chung bảng offer. */
export const HOT_DEALS_LIST_TYPE = 99;
export const OFFER_PAGE_SIZE = 20;

/** Số tiền trong API Shopee affiliate nhân sẵn 100.000. */
const SHOPEE_AMOUNT_SCALE = 100_000;
const HARVEST_SOURCE = "SHOPEE_AUTO";
/** Worker được coi là online nếu poll trong khoảng này. */
export const WORKER_ONLINE_WINDOW_SECONDS = 120;

type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Cấu hình singleton

export interface HarvestSettings {
  enabled: boolean;
  intervalMinutes: number;
  pages: number;
  pageLimit: number;
  maxItems: number;
  workerLastSeenAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  lastImportedCount: number;
}

interface SettingsRow {
  enabled: boolean;
  interval_minutes: number;
  pages: number;
  page_limit: number;
  max_items: number;
  worker_last_seen_at: Date | null;
  last_run_at: Date | null;
  last_status: string | null;
  last_error: string | null;
  last_imported_count: number;
}

const SETTINGS_SQL = `
  SELECT enabled, interval_minutes, pages, page_limit, max_items,
    worker_last_seen_at, last_run_at, last_status, last_error,
    last_imported_count
  FROM harvest_settings WHERE id = true
`;

function mapSettings(row: SettingsRow): HarvestSettings {
  return {
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    pages: row.pages,
    pageLimit: row.page_limit,
    maxItems: row.max_items,
    workerLastSeenAt: row.worker_last_seen_at,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastImportedCount: row.last_imported_count,
  };
}

export async function getHarvestSettings(
  db: Database,
): Promise<HarvestSettings> {
  const existing = await query<SettingsRow>(db, SETTINGS_SQL);
  if (existing.rows[0]) return mapSettings(existing.rows[0]);
  await query(
    db,
    `INSERT INTO harvest_settings (id) VALUES (true)
     ON CONFLICT (id) DO NOTHING`,
  );
  const seeded = await query<SettingsRow>(db, SETTINGS_SQL);
  return mapSettings(seeded.rows[0]!);
}

export async function updateHarvestSettings(
  db: Database,
  patch: {
    enabled: boolean;
    intervalMinutes: number;
    pages: number;
    maxItems: number;
  },
  actorId: string,
): Promise<HarvestSettings> {
  if (
    !Number.isInteger(patch.intervalMinutes) ||
    patch.intervalMinutes < 15 ||
    patch.intervalMinutes > 10080
  ) {
    throw new AppError(
      "INVALID_HARVEST_CONFIG",
      "Tần suất lấy sản phẩm phải từ 15 phút đến 7 ngày.",
    );
  }
  if (!Number.isInteger(patch.pages) || patch.pages < 1 || patch.pages > 10) {
    throw new AppError(
      "INVALID_HARVEST_CONFIG",
      "Số trang mỗi lượt phải từ 1 đến 10.",
    );
  }
  if (
    !Number.isInteger(patch.maxItems) ||
    patch.maxItems < 10 ||
    patch.maxItems > 200
  ) {
    throw new AppError(
      "INVALID_HARVEST_CONFIG",
      "Số sản phẩm hiển thị tối đa phải từ 10 đến 200.",
    );
  }
  await getHarvestSettings(db);
  const updated = await query<SettingsRow>(
    db,
    `
      UPDATE harvest_settings SET
        enabled = $1, interval_minutes = $2, pages = $3, max_items = $4,
        updated_by = $5, updated_at = now()
      WHERE id = true
      RETURNING enabled, interval_minutes, pages, page_limit, max_items,
        worker_last_seen_at, last_run_at, last_status, last_error,
        last_imported_count
    `,
    [patch.enabled, patch.intervalMinutes, patch.pages, patch.maxItems, actorId],
  );
  return mapSettings(updated.rows[0]!);
}

export function isWorkerOnline(
  settings: HarvestSettings,
  now = new Date(),
): boolean {
  return Boolean(
    settings.workerLastSeenAt &&
      now.getTime() - settings.workerLastSeenAt.getTime() <
        WORKER_ONLINE_WINDOW_SECONDS * 1000,
  );
}

export function isHarvestDue(
  settings: HarvestSettings,
  now = new Date(),
): boolean {
  if (!settings.enabled) return false;
  if (!settings.lastRunAt) return true;
  return (
    now.getTime() - settings.lastRunAt.getTime() >=
    settings.intervalMinutes * 60_000
  );
}

// ---------------------------------------------------------------------------
// Profile

export interface HarvestProfile {
  id: string;
  name: string;
  status: "NEEDS_LOGIN" | "READY" | "DISABLED";
  last_login_at: Date | null;
  last_fetch_at: Date | null;
  last_status: string | null;
  last_error: string | null;
  last_fetched_count: number;
  created_at: Date;
}

const PROFILE_COLUMNS = `
  id, name, status, last_login_at, last_fetch_at, last_status, last_error,
  last_fetched_count, created_at
`;

export async function listHarvestProfiles(
  db: Database,
): Promise<HarvestProfile[]> {
  const result = await query<HarvestProfile>(
    db,
    `SELECT ${PROFILE_COLUMNS} FROM harvest_profiles ORDER BY created_at`,
  );
  return result.rows;
}

const UUID_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Đăng ký một profile của ứng dụng Browser Control: `id` chính là profile id
 * bên Browser Control — worker dùng id này để start/goto/stop profile.
 */
export async function createHarvestProfile(
  db: Database,
  input: { id: string; name: string },
  actorId: string,
): Promise<HarvestProfile> {
  const id = input.id.trim().toLowerCase();
  if (!UUID_ID_PATTERN.test(id)) {
    throw new AppError(
      "INVALID_PROFILE_ID",
      "Profile ID phải là UUID lấy từ ứng dụng Browser Control (GET /api/profiles).",
    );
  }
  const trimmed = input.name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new AppError(
      "INVALID_PROFILE_NAME",
      "Tên profile cần từ 2 đến 80 ký tự.",
    );
  }
  const inserted = await query<HarvestProfile>(
    db,
    `
      INSERT INTO harvest_profiles (id, name, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO NOTHING
      RETURNING ${PROFILE_COLUMNS}
    `,
    [id, trimmed, actorId],
  );
  if (!inserted.rows[0]) {
    throw new AppError(
      "PROFILE_EXISTS",
      "Profile ID này đã được đăng ký rồi.",
      409,
    );
  }
  return inserted.rows[0];
}

/**
 * Đặt DUY NHẤT một profile Browser Control để dùng (upsert theo id, xóa mọi
 * profile khác). Dùng cho trang gọn: chỉ một ô Profile ID, không quản lý
 * danh sách. Không đụng tới phiên đăng nhập — phiên nằm ở Browser Control.
 */
export async function setSingleHarvestProfile(
  db: Database,
  input: { id: string; name?: string | undefined },
  actorId: string,
): Promise<HarvestProfile> {
  const id = input.id.trim().toLowerCase();
  if (!UUID_ID_PATTERN.test(id)) {
    throw new AppError(
      "INVALID_PROFILE_ID",
      "Profile ID phải là UUID lấy từ ứng dụng Browser Control (GET /api/profiles).",
    );
  }
  const name = (input.name?.trim() || "Profile Shopee").slice(0, 80);
  const rows = await query<HarvestProfile>(
    db,
    `
      WITH del AS (DELETE FROM harvest_profiles WHERE id <> $1)
      INSERT INTO harvest_profiles (id, name, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, updated_by = EXCLUDED.updated_by,
            updated_at = now()
      RETURNING ${PROFILE_COLUMNS}
    `,
    [id, name, actorId],
  );
  return rows.rows[0]!;
}

export async function deleteHarvestProfile(
  db: Database,
  profileId: string,
): Promise<boolean> {
  const result = await query(
    db,
    `DELETE FROM harvest_profiles WHERE id = $1`,
    [profileId],
  );
  return Boolean(result.rowCount);
}

export async function setHarvestProfileDisabled(
  db: Database,
  profileId: string,
  disabled: boolean,
): Promise<boolean> {
  const result = await query(
    db,
    `
      UPDATE harvest_profiles
      SET status = CASE
            WHEN $2 THEN 'DISABLED'
            WHEN last_login_at IS NULL THEN 'NEEDS_LOGIN'
            ELSE 'READY'
          END,
          updated_at = now()
      WHERE id = $1
    `,
    [profileId, disabled],
  );
  return Boolean(result.rowCount);
}

// ---------------------------------------------------------------------------
// Hàng đợi job cho worker

export type HarvestJobKind = "LOGIN" | "FETCH" | "FETCH_PAGE" | "FETCH_RANGE";

/** Tham số lệnh FETCH_PAGE / FETCH_RANGE (lưu trong harvest_jobs.params). */
export interface HarvestJobParams {
  listType?: number;
  pageNo?: number;
  fromPage?: number;
  toPage?: number;
}

/** Số trang tối đa mỗi lệnh lấy dải, chặn job chạy quá dài. */
export const MAX_RANGE_PAGES = 40;

export interface HarvestJob {
  id: string;
  profile_id: string;
  kind: HarvestJobKind;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  error: string | null;
  params: HarvestJobParams;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  profile_name?: string;
}

export async function enqueueHarvestJob(
  db: Database,
  profileId: string,
  kind: HarvestJobKind,
  actorId: string | null,
): Promise<HarvestJob> {
  const profile = await query<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM harvest_profiles WHERE id = $1`,
    [profileId],
  );
  if (!profile.rows[0]) {
    throw new AppError("PROFILE_NOT_FOUND", "Không tìm thấy profile.", 404);
  }
  if (profile.rows[0].status === "DISABLED" && kind === "FETCH") {
    throw new AppError(
      "PROFILE_DISABLED",
      "Profile đang tắt — bật lại trước khi lấy sản phẩm.",
    );
  }
  // Mỗi profile chỉ giữ một lệnh đang chờ/chạy để worker không làm trùng.
  const existing = await query<{ id: string }>(
    db,
    `
      SELECT id FROM harvest_jobs
      WHERE profile_id = $1 AND status IN ('PENDING', 'RUNNING')
      LIMIT 1
    `,
    [profileId],
  );
  if (existing.rows[0]) {
    throw new AppError(
      "JOB_ALREADY_QUEUED",
      "Profile này đang có lệnh chờ worker xử lý. Hãy đợi lệnh đó xong.",
      409,
    );
  }
  const inserted = await query<HarvestJob>(
    db,
    `
      INSERT INTO harvest_jobs (profile_id, kind, requested_by)
      VALUES ($1, $2, $3)
      RETURNING id, profile_id, kind, status, error, params, created_at,
        started_at, finished_at
    `,
    [profileId, kind, actorId],
  );
  return inserted.rows[0]!;
}

/**
 * Xếp lệnh lấy MỘT trang sản phẩm (mục Bán chạy). Khác FETCH thường: cho
 * phép nhiều lệnh chờ cùng lúc trên một profile (worker xử lý tuần tự),
 * chỉ khử trùng theo (list_type, page).
 */
/**
 * Chọn profile để điều khiển. KHÔNG đòi status='READY': phiên đăng nhập thật
 * nằm trong Browser Control (port 9222) và worker tự start profile qua port
 * (ensureProfileRunning). Trạng thái DB chỉ phản ánh lần lấy gần nhất, không
 * phải "đã đăng nhập hay chưa" — nên chỉ loại profile bị DISABLED tay.
 */
async function pickUsableProfile(db: Database): Promise<string> {
  const profile = await query<{ id: string }>(
    db,
    `
      SELECT id FROM harvest_profiles
      WHERE status <> 'DISABLED'
      ORDER BY (status = 'READY') DESC, last_fetch_at ASC NULLS FIRST
      LIMIT 1
    `,
  );
  if (!profile.rows[0]) {
    throw new AppError(
      "NO_PROFILE",
      "Chưa có profile Shopee nào. Hãy thêm một profile ở trang Backoffice.",
      503,
    );
  }
  return profile.rows[0].id;
}

export async function enqueueOfferPageFetch(
  db: Database,
  listType: number,
  pageNo: number,
): Promise<"QUEUED" | "ALREADY_QUEUED"> {
  const duplicate = await query<{ id: string }>(
    db,
    `
      SELECT id FROM harvest_jobs
      WHERE kind = 'FETCH_PAGE' AND status IN ('PENDING', 'RUNNING')
        AND (params->>'listType')::int = $1
        AND (params->>'pageNo')::int = $2
      LIMIT 1
    `,
    [listType, pageNo],
  );
  if (duplicate.rows[0]) return "ALREADY_QUEUED";

  const profileId = await pickUsableProfile(db);
  await query(
    db,
    `
      INSERT INTO harvest_jobs (profile_id, kind, params)
      VALUES ($1, 'FETCH_PAGE', $2::jsonb)
    `,
    [profileId, JSON.stringify({ listType, pageNo })],
  );
  return "QUEUED";
}

/**
 * Xếp lệnh lấy DẢI TRANG [fromPage..toPage] cho một danh mục. Worker click
 * qua từng trang, lưu vào cache DB. Ví dụ: hôm nay lấy 10→100, mai 101→200.
 */
export async function enqueueOfferRangeFetch(
  db: Database,
  listType: number,
  fromPage: number,
  toPage: number,
  actorId: string | null,
): Promise<HarvestJob> {
  if (
    !Number.isInteger(fromPage) ||
    !Number.isInteger(toPage) ||
    fromPage < 1 ||
    toPage < fromPage
  ) {
    throw new AppError(
      "INVALID_RANGE",
      "Dải trang không hợp lệ: trang đầu ≥ 1 và trang cuối ≥ trang đầu.",
    );
  }
  if (toPage - fromPage + 1 > MAX_RANGE_PAGES) {
    throw new AppError(
      "RANGE_TOO_LARGE",
      `Mỗi lượt lấy tối đa ${MAX_RANGE_PAGES} trang. Hãy chia nhỏ dải trang.`,
    );
  }
  const profileId = await pickUsableProfile(db);
  // Dọn job treo trước khi kiểm tra "bận": RUNNING quá 15 phút = worker chết
  // giữa chừng; PENDING quá 15 phút = không worker nào nhận (offline). Nếu
  // không dọn, một job kẹt sẽ chặn vĩnh viễn mọi lệnh mới của profile này.
  // Cùng ngưỡng 15 phút với cơ chế thu hồi RUNNING trong claimNextHarvestJob.
  await query(
    db,
    `
      UPDATE harvest_jobs
      SET status = 'ERROR', finished_at = now(),
          error = 'Tự hủy: job treo quá 15 phút (worker offline hoặc dừng giữa chừng)'
      WHERE profile_id = $1
        AND (
          (status = 'RUNNING' AND started_at < now() - interval '15 minutes')
          OR (status = 'PENDING' AND created_at < now() - interval '2 minutes')
        )
    `,
    [profileId],
  );
  const busy = await query<{ id: string }>(
    db,
    `
      SELECT id FROM harvest_jobs
      WHERE profile_id = $1 AND status IN ('PENDING', 'RUNNING')
      LIMIT 1
    `,
    [profileId],
  );
  if (busy.rows[0]) {
    throw new AppError(
      "JOB_ALREADY_QUEUED",
      "Profile đang bận với một lệnh khác. Hãy đợi lệnh đó xong.",
      409,
    );
  }
  const inserted = await query<HarvestJob>(
    db,
    `
      INSERT INTO harvest_jobs (profile_id, kind, params, requested_by)
      VALUES ($1, 'FETCH_RANGE', $2::jsonb, $3)
      RETURNING id, profile_id, kind, status, error, params, created_at,
        started_at, finished_at
    `,
    [
      profileId,
      JSON.stringify({ listType, fromPage, toPage }),
      actorId,
    ],
  );
  return inserted.rows[0]!;
}

/** Worker gọi định kỳ: nhận job PENDING cũ nhất (đánh dấu RUNNING). */
export async function claimNextHarvestJob(
  db: Database,
): Promise<(HarvestJob & { profile_name: string }) | null> {
  await query(
    db,
    `
      INSERT INTO harvest_settings (id, worker_last_seen_at)
      VALUES (true, now())
      ON CONFLICT (id) DO UPDATE SET worker_last_seen_at = now()
    `,
  );
  // Job RUNNING quá 15 phút coi như worker chết giữa chừng — trả lại hàng đợi.
  await query(
    db,
    `
      UPDATE harvest_jobs SET status = 'PENDING', started_at = NULL
      WHERE status = 'RUNNING' AND started_at < now() - interval '15 minutes'
    `,
  );
  const claimed = await query<HarvestJob & { profile_name: string }>(
    db,
    `
      UPDATE harvest_jobs j
      SET status = 'RUNNING', started_at = now()
      FROM harvest_profiles p
      WHERE j.id = (
          SELECT id FROM harvest_jobs
          WHERE status = 'PENDING'
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        AND p.id = j.profile_id
      RETURNING j.id, j.profile_id, j.kind, j.status, j.error, j.params,
        j.created_at, j.started_at, j.finished_at, p.name AS profile_name
    `,
  );
  return claimed.rows[0] ?? null;
}

export async function listRecentHarvestJobs(
  db: Database,
  limit = 20,
): Promise<HarvestJob[]> {
  const result = await query<HarvestJob>(
    db,
    `
      SELECT j.id, j.profile_id, j.kind, j.status, j.error, j.params,
        j.created_at, j.started_at, j.finished_at, p.name AS profile_name
      FROM harvest_jobs j
      JOIN harvest_profiles p ON p.id = j.profile_id
      ORDER BY j.created_at DESC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Parse response api/v3/offer/product/list

export interface HarvestedProduct {
  itemId: string;
  name: string;
  imageUrl: string | null;
  priceVnd: number | null;
  commissionRateBps: number | null;
  shopName: string | null;
  productUrl: string;
  salesCount: number | null;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return "";
}

function numberOf(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/** Giá Shopee affiliate là "micro" (nhân 100.000); giá thường thì giữ nguyên. */
function priceToVnd(value: unknown): number | null {
  const raw = numberOf(value);
  if (raw === null || raw <= 0) return null;
  const vnd = raw >= 1_000_000_000 ? Math.floor(raw / SHOPEE_AMOUNT_SCALE) : Math.floor(raw);
  return Number.isSafeInteger(vnd) && vnd > 0 ? vnd : null;
}

/** Tỷ lệ hoa hồng: "2%", "0.055" (thập phân), "5.5" (%) hay 550 (bps). */
function commissionToBps(value: unknown): number | null {
  const cleaned =
    typeof value === "string" ? value.replace("%", "").trim() : value;
  const raw = numberOf(cleaned);
  if (raw === null || raw < 0) return null;
  const bps =
    raw <= 1 ? Math.round(raw * 10000) : raw <= 100 ? Math.round(raw * 100) : Math.round(raw);
  return bps >= 0 && bps <= 10000 ? bps : null;
}

/** Các nguồn field của một item (bản ghi gốc + object lồng bên trong). */
type FieldSources = JsonObject[];

function pickString(sources: FieldSources, keys: string[]): string {
  for (const source of sources) {
    for (const key of keys) {
      const value = stringOf(source[key]);
      if (value) return value;
    }
  }
  return "";
}

function pickRaw(sources: FieldSources, keys: string[]): unknown {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return source[key];
      }
    }
  }
  return null;
}

function normalizeImageUrl(value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  // API đôi khi chỉ trả mã ảnh (vd "vn-11134201-...") — ghép về CDN Shopee.
  if (/^[0-9a-z-]{10,}$/i.test(value)) {
    return `https://down-vn.img.susercontent.com/file/${value}`;
  }
  return null;
}

/**
 * Parse MỘT trang response của api/v3/offer/product/list.
 *
 * Định dạng thực tế (đo 2026-08): mỗi phần tử `data.list` có `item_id`,
 * `product_link`, hoa hồng dạng chuỗi phần trăm (`seller_commission_rate`
 * "2%", `default_commission_rate` "5%"), còn tên/ảnh/giá/lượt bán nằm LỒNG
 * trong `batch_item_for_item_card_full` (itemid, shopid, name, image,
 * price_min ×100.000, sold…). Parser đọc cả hai tầng và chịu được khác biệt
 * nhỏ về tên field.
 */
export function parseShopeeOfferPage(payload: unknown): HarvestedProduct[] {
  const root = asObject(payload);
  if (!root) return [];
  const code = numberOf(root.code);
  if (code !== null && code !== 0) return [];
  const data = asObject(root.data) ?? root;
  const list = Array.isArray(data.list)
    ? data.list
    : Array.isArray(data.items)
      ? data.items
      : [];

  const products: HarvestedProduct[] = [];
  for (const entry of list) {
    const node = asObject(entry);
    if (!node) continue;
    const card = asObject(node.batch_item_for_item_card_full);
    const sources: FieldSources = card ? [node, card] : [node];

    const itemId = pickString(sources, ["item_id", "itemid", "itemId", "id"]);
    const name = pickString(sources, ["item_name", "name", "title", "product_name"]);
    if (!itemId || !name) continue;
    const shopId = pickString(sources, ["shop_id", "shopid", "shopId"]);
    const explicitUrl = pickString(sources, [
      "product_link",
      "product_url",
      "item_link",
      "offer_link",
    ]);
    const productUrl =
      explicitUrl && /^https?:\/\//i.test(explicitUrl)
        ? explicitUrl
        : shopId
          ? `https://shopee.vn/product/${shopId}/${itemId}`
          : `https://shopee.vn/product/i/${itemId}`;

    // Hoa hồng lấy đúng con số Shopee in trên thẻ ("Tỉ lệ hoa hồng X%") —
    // đối chiếu UI thật thì đó là default_commission_rate, KHÔNG phải tổng
    // seller + default. Thiếu thì lùi dần về seller rồi các tên field cũ.
    const commissionRateBps =
      commissionToBps(pickRaw(sources, ["default_commission_rate"])) ??
      commissionToBps(pickRaw(sources, ["seller_commission_rate"])) ??
      commissionToBps(
        pickRaw(sources, ["commission_rate", "comm_rate", "commissionRate"]),
      );

    products.push({
      itemId,
      name,
      imageUrl: normalizeImageUrl(
        pickString(sources, ["image", "image_url", "picture", "cover"]),
      ),
      priceVnd: priceToVnd(
        pickRaw(sources, ["price_min", "price", "item_price", "price_max"]),
      ),
      commissionRateBps,
      shopName: pickString(sources, ["shop_name", "shopName"]) || null,
      productUrl,
      salesCount: numberOf(
        pickRaw(sources, ["historical_sold", "sold", "sales"]),
      ),
    });
  }
  return products;
}

/**
 * Parse response của shopee.vn/api/v4/microsite/get_collection_items (trang
 * Mã giảm giá / voucher). Mỗi phần tử `data.items[]` có
 * `customised_item_card.{item_data, item_card_displayed_asset}`. Giá đã áp
 * khuyến mãi nằm ở `item_data.item_card_display_price.price` (nhân sẵn 100k).
 */
export function parseShopeeMicrositeItems(payload: unknown): HarvestedProduct[] {
  const root = asObject(payload);
  if (!root) return [];
  const data = asObject(root.data);
  const items = data && Array.isArray(data.items) ? data.items : [];

  const products: HarvestedProduct[] = [];
  for (const entry of items) {
    const node = asObject(entry);
    if (!node) continue;
    const card = asObject(node.customised_item_card);
    const itemData = asObject(card?.item_data);
    const asset = asObject(card?.item_card_displayed_asset);
    if (!itemData) continue;

    const numId = (v: unknown): string =>
      typeof v === "number" && Number.isFinite(v)
        ? String(Math.trunc(v))
        : stringOf(v);
    const itemId = numId(itemData.itemid ?? itemData.item_id);
    const shopId = numId(itemData.shopid ?? itemData.shop_id);
    if (!itemId) continue;
    const name = pickString([asset ?? {}], ["name", "title"]);
    if (!name) continue;

    const priceInfo = asObject(itemData.item_card_display_price);
    const shopData = asObject(itemData.shop_data);

    products.push({
      itemId,
      name,
      imageUrl: normalizeImageUrl(pickString([asset ?? {}], ["image"])),
      priceVnd: priceToVnd(priceInfo?.price ?? priceInfo?.applied_product_promo_price),
      commissionRateBps: null,
      shopName: shopData ? stringOf(shopData.shop_name) || null : null,
      productUrl: shopId
        ? `https://shopee.vn/product/${shopId}/${itemId}`
        : `https://shopee.vn/product/i/${itemId}`,
      salesCount: null,
    });
  }
  return products;
}

// ---------------------------------------------------------------------------
// Import vào trang Khám phá (content_items)

export interface HarvestImportResult {
  parsed: number;
  imported: number;
  archived: number;
}

/**
 * Upsert sản phẩm đã lấy vào content_items (type PRODUCT, nguồn SHOPEE_AUTO).
 * Tỷ lệ hoàn cho người dùng = hoa hồng × buyerCashbackPercent — cùng công
 * thức với luồng mua hoàn tiền. Sản phẩm tự nhập không còn trong đợt mới sẽ
 * bị ẩn (ARCHIVED) để trang Khám phá luôn tươi.
 */
export async function importHarvestedProducts(
  db: Database,
  config: AppConfig,
  products: HarvestedProduct[],
  maxItems: number,
): Promise<HarvestImportResult> {
  const businessConfig = await getBusinessConfig(db, config);
  const seen = new Set<string>();
  const batch = products
    .filter((product) => {
      if (seen.has(product.itemId)) return false;
      seen.add(product.itemId);
      return true;
    })
    .slice(0, maxItems);

  let imported = 0;
  for (const [index, product] of batch.entries()) {
    const cashbackRateBps =
      product.commissionRateBps !== null
        ? Math.floor(
            (product.commissionRateBps * businessConfig.buyerCashbackPercent) /
              100,
          )
        : null;
    const soldLabel =
      product.salesCount !== null && product.salesCount > 0
        ? ` · Đã bán ${Intl.NumberFormat("vi-VN").format(product.salesCount)}`
        : "";
    const description = `${product.shopName ?? "Shopee"}${soldLabel} · Đề xuất tự động từ Shopee Affiliate`;
    await query(
      db,
      `
        INSERT INTO content_items (
          type, title, description, target_url, image_url, badge, category,
          sort_order, platform, price_vnd, cashback_rate_bps, status,
          source, external_key, published_at
        ) VALUES (
          'PRODUCT', $1, $2, $3, $4, 'Đề xuất', 'Đề xuất',
          $5, 'SHOPEE', $6, $7, 'PUBLISHED', '${HARVEST_SOURCE}', $8, now()
        )
        ON CONFLICT (external_key) WHERE external_key IS NOT NULL
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          target_url = EXCLUDED.target_url,
          image_url = COALESCE(EXCLUDED.image_url, content_items.image_url),
          sort_order = EXCLUDED.sort_order,
          price_vnd = EXCLUDED.price_vnd,
          cashback_rate_bps = EXCLUDED.cashback_rate_bps,
          status = 'PUBLISHED',
          published_at = now()
      `,
      [
        product.name.slice(0, 200),
        description.slice(0, 500),
        product.productUrl,
        product.imageUrl,
        100 + index,
        product.priceVnd,
        cashbackRateBps,
        `SHOPEE:${product.itemId}`,
      ],
    );
    imported += 1;
  }

  let archived = 0;
  if (batch.length) {
    const keys = batch.map((product) => `SHOPEE:${product.itemId}`);
    const result = await query(
      db,
      `
        UPDATE content_items SET status = 'ARCHIVED'
        WHERE source = '${HARVEST_SOURCE}'
          AND status = 'PUBLISHED'
          AND NOT (external_key = ANY($1::text[]))
      `,
      [keys],
    );
    archived = result.rowCount ?? 0;
  }
  return { parsed: products.length, imported, archived };
}

// ---------------------------------------------------------------------------
// Cache trang sản phẩm theo (list_type, page) — mục "Bán chạy nhất"

export interface StoredOfferProduct {
  item_id: string;
  name: string;
  image_url: string | null;
  price_vnd: string | null;
  commission_rate_bps: number | null;
  shop_name: string | null;
  product_url: string;
  sales_count: string | null;
}

/** Trang đã từng lấy chưa (kể cả trang rỗng)? */
export async function hasOfferPage(
  db: Database,
  listType: number,
  pageNo: number,
): Promise<boolean> {
  const state = await query(
    db,
    `SELECT 1 FROM shopee_offer_pages WHERE list_type = $1 AND page_no = $2`,
    [listType, pageNo],
  );
  return Boolean(state.rows[0]);
}

export async function getStoredOfferPage(
  db: Database,
  listType: number,
  pageNo: number,
): Promise<StoredOfferProduct[]> {
  const result = await query<StoredOfferProduct>(
    db,
    `
      SELECT item_id, name, image_url, price_vnd::text, commission_rate_bps,
        shop_name, product_url, sales_count::text
      FROM shopee_offer_products
      WHERE list_type = $1 AND page_no = $2
      ORDER BY position
    `,
    [listType, pageNo],
  );
  return result.rows;
}

/** Số trang đã cache (max page_no) — để vẽ phân trang. */
export async function getKnownOfferPageCount(
  db: Database,
  listType: number,
): Promise<number> {
  const result = await query<{ max: number | null }>(
    db,
    `SELECT MAX(page_no)::int AS max FROM shopee_offer_pages WHERE list_type = $1`,
    [listType],
  );
  return result.rows[0]?.max ?? 0;
}

export interface CachedPageRange {
  minPage: number | null;
  maxPage: number | null;
  pageCount: number;
  productCount: number;
  lastFetchedAt: Date | null;
}

/** Dải trang đã cache của một danh mục — để admin biết "đã lấy từ đâu đến đâu". */
export async function getCachedPageRange(
  db: Database,
  listType: number,
): Promise<CachedPageRange> {
  const result = await query<{
    min_page: number | null;
    max_page: number | null;
    page_count: string;
    last_fetched: Date | null;
  }>(
    db,
    `
      SELECT MIN(page_no)::int AS min_page, MAX(page_no)::int AS max_page,
        count(*)::text AS page_count, MAX(fetched_at) AS last_fetched
      FROM shopee_offer_pages WHERE list_type = $1
    `,
    [listType],
  );
  const products = await query<{ count: string }>(
    db,
    `SELECT count(*)::text AS count FROM shopee_offer_products WHERE list_type = $1`,
    [listType],
  );
  const row = result.rows[0];
  return {
    minPage: row?.min_page ?? null,
    maxPage: row?.max_page ?? null,
    pageCount: Number(row?.page_count ?? 0),
    productCount: Number(products.rows[0]?.count ?? 0),
    lastFetchedAt: row?.last_fetched ?? null,
  };
}

export async function saveOfferPage(
  db: Database,
  listType: number,
  pageNo: number,
  products: HarvestedProduct[],
): Promise<void> {
  await query(
    db,
    `DELETE FROM shopee_offer_products WHERE list_type = $1 AND page_no = $2`,
    [listType, pageNo],
  );
  for (const [position, product] of products.entries()) {
    await query(
      db,
      `
        INSERT INTO shopee_offer_products (
          list_type, page_no, position, item_id, name, image_url, price_vnd,
          commission_rate_bps, shop_name, product_url, sales_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        listType,
        pageNo,
        position,
        product.itemId,
        product.name.slice(0, 300),
        product.imageUrl,
        product.priceVnd,
        product.commissionRateBps,
        product.shopName,
        product.productUrl,
        product.salesCount,
      ],
    );
  }
  // Ghi trạng thái trang kể cả khi rỗng — tránh gọi lại Shopee vô ích.
  await query(
    db,
    `
      INSERT INTO shopee_offer_pages (list_type, page_no, item_count, fetched_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (list_type, page_no)
      DO UPDATE SET item_count = EXCLUDED.item_count, fetched_at = now()
    `,
    [listType, pageNo, products.length],
  );
}

// ---------------------------------------------------------------------------
// Worker trả kết quả job

export interface HarvestJobCompletion {
  ok: boolean;
  error?: string;
  /** Các trang JSON thô của api/v3/offer/product/list (job FETCH). */
  payloads?: unknown[];
  /** Worker xác nhận profile đã đăng nhập được (job LOGIN). */
  loginOk?: boolean;
  /**
   * Tổng sản phẩm đã lưu tăng dần qua /harvest/offer-page (FETCH_RANGE /
   * FETCH_PAGE lưu từng trang ngay khi lấy, không gửi lại payloads).
   */
  savedItems?: number;
}

export async function completeHarvestJob(
  db: Database,
  config: AppConfig,
  jobId: string,
  completion: HarvestJobCompletion,
): Promise<HarvestImportResult | null> {
  const job = await query<HarvestJob>(
    db,
    `
      SELECT id, profile_id, kind, status, error, params, created_at,
        started_at, finished_at
      FROM harvest_jobs WHERE id = $1
    `,
    [jobId],
  );
  const row = job.rows[0];
  if (!row || row.status === "DONE" || row.status === "ERROR") {
    throw new AppError("JOB_NOT_FOUND", "Job không tồn tại hoặc đã kết thúc.", 404);
  }

  const errorText = (completion.error ?? "").slice(0, 500) || null;
  // Chỉ đánh dấu job kết thúc SAU khi dữ liệu đã ghi xong — đánh dấu trước
  // sẽ mở khe cho lượt poll của trang web xếp thêm lệnh trùng (job DONE
  // nhưng trang chưa kịp lưu).
  try {
    return await applyHarvestJobResult(db, config, row, completion, errorText);
  } finally {
    await query(
      db,
      `
        UPDATE harvest_jobs
        SET status = $2, error = $3, finished_at = now()
        WHERE id = $1
      `,
      [jobId, completion.ok ? "DONE" : "ERROR", errorText],
    );
  }
}

async function applyHarvestJobResult(
  db: Database,
  config: AppConfig,
  row: HarvestJob,
  completion: HarvestJobCompletion,
  errorText: string | null,
): Promise<HarvestImportResult | null> {
  if (row.kind === "LOGIN") {
    await query(
      db,
      `
        UPDATE harvest_profiles SET
          status = CASE WHEN $2 THEN 'READY' ELSE 'NEEDS_LOGIN' END,
          last_login_at = CASE WHEN $2 THEN now() ELSE last_login_at END,
          last_status = CASE WHEN $2 THEN 'OK' ELSE 'LOGIN_FAILED' END,
          last_error = $3,
          updated_at = now()
        WHERE id = $1
      `,
      [row.profile_id, completion.ok && completion.loginOk === true, errorText],
    );
    return null;
  }

  // FETCH_PAGE: lưu một trang "Bán chạy" vào cache theo (list_type, page).
  if (row.kind === "FETCH_PAGE") {
    const listType = Number(row.params?.listType ?? BEST_SELLER_LIST_TYPE);
    const pageNo = Number(row.params?.pageNo ?? 1);
    if (!completion.ok) {
      await query(
        db,
        `
          UPDATE harvest_profiles SET
            last_fetch_at = now(), last_status = 'ERROR', last_error = $2,
            status = CASE WHEN $3 THEN 'NEEDS_LOGIN' ELSE status END,
            updated_at = now()
          WHERE id = $1
        `,
        [
          row.profile_id,
          errorText,
          /đăng nhập|login/i.test(completion.error ?? ""),
        ],
      );
      return null;
    }
    // Lưu tăng dần: nếu worker đã gửi trang qua /harvest/offer-page thì
    // completion không kèm payloads — chỉ cập nhật trạng thái. Vẫn hỗ trợ
    // payloads (đường cũ / test) làm fallback.
    let savedCount: number;
    if (completion.payloads?.length) {
      const products = completion.payloads.flatMap((payload) =>
        parseShopeeOfferPage(payload),
      );
      await saveOfferPage(db, listType, pageNo, products);
      savedCount = products.length;
    } else {
      savedCount = completion.savedItems ?? 0;
    }
    await query(
      db,
      `
        UPDATE harvest_profiles SET
          status = 'READY', last_fetch_at = now(), last_status = 'OK',
          last_error = NULL, last_fetched_count = $2, updated_at = now()
        WHERE id = $1
      `,
      [row.profile_id, savedCount],
    );
    return { parsed: savedCount, imported: savedCount, archived: 0 };
  }

  // FETCH_RANGE: mỗi payload là một trang liên tiếp từ fromPage — lưu từng
  // trang vào cache. Worker dừng sớm khi hết danh sách nên số payload có thể
  // ít hơn dải yêu cầu.
  if (row.kind === "FETCH_RANGE") {
    const listType = Number(row.params?.listType ?? BEST_SELLER_LIST_TYPE);
    const fromPage = Number(row.params?.fromPage ?? 1);
    if (!completion.ok) {
      await query(
        db,
        `
          UPDATE harvest_profiles SET
            last_fetch_at = now(), last_status = 'ERROR', last_error = $2,
            status = CASE WHEN $3 THEN 'NEEDS_LOGIN' ELSE status END,
            updated_at = now()
          WHERE id = $1
        `,
        [
          row.profile_id,
          errorText,
          /đăng nhập|login/i.test(completion.error ?? ""),
        ],
      );
      return null;
    }
    // Lưu tăng dần qua /harvest/offer-page → completion không có payloads;
    // dùng savedItems. Vẫn lưu từ payloads nếu có (fallback / test).
    let saved = 0;
    if (completion.payloads?.length) {
      for (const [index, payload] of completion.payloads.entries()) {
        const products = parseShopeeOfferPage(payload);
        await saveOfferPage(db, listType, fromPage + index, products);
        saved += products.length;
      }
    } else {
      saved = completion.savedItems ?? 0;
    }
    await query(
      db,
      `
        UPDATE harvest_profiles SET
          status = 'READY', last_fetch_at = now(), last_status = 'OK',
          last_error = NULL, last_fetched_count = $2, updated_at = now()
        WHERE id = $1
      `,
      [row.profile_id, saved],
    );
    return { parsed: saved, imported: saved, archived: 0 };
  }

  // FETCH
  if (!completion.ok) {
    await query(
      db,
      `
        UPDATE harvest_profiles SET
          last_fetch_at = now(), last_status = 'ERROR', last_error = $2,
          status = CASE
            WHEN $3 THEN 'NEEDS_LOGIN' ELSE status
          END,
          updated_at = now()
        WHERE id = $1
      `,
      [
        row.profile_id,
        errorText,
        /đăng nhập|login/i.test(completion.error ?? ""),
      ],
    );
    await recordHarvestRun(db, { status: "ERROR", imported: 0, error: errorText });
    return null;
  }

  const products = (completion.payloads ?? []).flatMap((payload) =>
    parseShopeeOfferPage(payload),
  );
  if (!products.length) {
    const message =
      "Response không có sản phẩm nào — profile có thể chưa đăng nhập hoặc Shopee đổi định dạng.";
    await query(
      db,
      `
        UPDATE harvest_profiles SET
          last_fetch_at = now(), last_status = 'EMPTY', last_error = $2,
          updated_at = now()
        WHERE id = $1
      `,
      [row.profile_id, message],
    );
    await recordHarvestRun(db, { status: "ERROR", imported: 0, error: message });
    return { parsed: 0, imported: 0, archived: 0 };
  }

  const settings = await getHarvestSettings(db);
  const result = await importHarvestedProducts(
    db,
    config,
    products,
    settings.maxItems,
  );
  await query(
    db,
    `
      UPDATE harvest_profiles SET
        status = 'READY', last_fetch_at = now(), last_status = 'OK',
        last_error = NULL, last_fetched_count = $2, updated_at = now()
      WHERE id = $1
    `,
    [row.profile_id, result.imported],
  );
  await recordHarvestRun(db, {
    status: "SUCCESS",
    imported: result.imported,
    error: null,
  });
  return result;
}

async function recordHarvestRun(
  db: Database,
  outcome: { status: "SUCCESS" | "ERROR"; imported: number; error: string | null },
): Promise<void> {
  await getHarvestSettings(db);
  await query(
    db,
    `
      UPDATE harvest_settings SET
        last_run_at = now(), last_status = $1, last_error = $2,
        last_imported_count = $3
      WHERE id = true
    `,
    [outcome.status, outcome.error, outcome.imported],
  );
}

/**
 * Nhịp tự động (gọi từ sync-scheduler): đến hạn và worker online thì xếp
 * lệnh FETCH cho profile READY đầu tiên chưa có lệnh chờ.
 */
export async function enqueueDueHarvest(db: Database): Promise<boolean> {
  const settings = await getHarvestSettings(db);
  if (!isHarvestDue(settings) || !isWorkerOnline(settings)) return false;
  const profile = await query<{ id: string }>(
    db,
    `
      SELECT p.id FROM harvest_profiles p
      WHERE p.status = 'READY'
        AND NOT EXISTS (
          SELECT 1 FROM harvest_jobs j
          WHERE j.profile_id = p.id AND j.status IN ('PENDING', 'RUNNING')
        )
      ORDER BY p.last_fetch_at ASC NULLS FIRST
      LIMIT 1
    `,
  );
  if (!profile.rows[0]) return false;
  // Đặt mốc chạy ngay khi xếp lệnh để nhịp sau không xếp trùng.
  await query(
    db,
    `UPDATE harvest_settings SET last_run_at = now(), last_status = 'QUEUED'
     WHERE id = true`,
  );
  await enqueueHarvestJob(db, profile.rows[0].id, "FETCH", null);
  return true;
}
