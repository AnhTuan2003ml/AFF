import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { normalizeEmail } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { getBusinessConfig } from "./business-config.js";
import { computeCommissionSplit, resolveBuyerPercent } from "./commission.js";
import {
  creditSplitCashback,
  moveSplitPendingToAvailable,
  reverseSplitCashback,
  type CommissionAllocation,
} from "./ledger.js";
import { maybeRewardReferral } from "./referral-reward.js";
import { camioVoice } from "./camio-voice.js";
import { createNotification } from "./mission.js";
import {
  PRODUCT_PLATFORMS,
  type ProductPlatform,
} from "./affiliate.js";

export type ImportOrderStatus =
  | "PENDING"
  | "APPROVED"
  | "INVALID"
  | "CANCELLED"
  | "REVERSED";

type AttributionMethod = "CLICK_ID" | "SUB_ID" | "EMAIL";
type EvidenceStatus = "VERIFIED" | "MANUAL_REVIEW";
type ItemSource = "REPORT" | "CLICK_SNAPSHOT";

/**
 * Mặt hàng lấy trực tiếp từ báo cáo sàn (một đơn có thể nhiều sản phẩm).
 * Chỉ dùng cho luồng đồng bộ API; luồng CSV vẫn giữ các cột phẳng bên dưới.
 */
export interface OrderImportItem {
  item_id: string;
  item_name: string;
  quantity: number;
  amount_vnd: number;
  item_image_url?: string | null;
}

export interface OrderImportRow {
  platform?: ProductPlatform | string;
  platform_order_id: string;
  status: ImportOrderStatus;
  order_amount_vnd: string;
  commission_vnd: string;
  /** Trạng thái gốc của sàn, hiển thị lại cho người dùng và đội vận hành. */
  external_status?: string;
  cancel_reason?: string;
  /** Mốc sàn ghi nhận đơn Hoàn thành — gốc để tính ngày giải ngân. */
  completed_at?: string;
  items?: OrderImportItem[];
  click_id?: string;
  sub_id?: string;
  sub_id1?: string;
  sub_id2?: string;
  sub_id3?: string;
  sub_id4?: string;
  sub_id5?: string;
  email?: string;
  purchased_at?: string;
  item_id?: string;
  item_name?: string;
  quantity?: string;
  item_amount_vnd?: string;
  /** Chỉ điền khi đối soát thủ công xác nhận người chia sẻ KHÁC người mua. */
  sharer_email?: string;
}

interface AffiliateLinkAttributionRow {
  id: string;
  user_id: string;
  platform: string;
  click_id: string;
  sub_id: string;
  campaign: string;
  product_id: string | null;
  product_name: string | null;
  product_image_url: string | null;
  product_price_vnd: string | null;
}

interface ResolvedOrderOwner {
  userId: string;
  linkId: string | null;
  linkSharerUserId?: string;
  attributionMethod: AttributionMethod;
  attributionValue: string;
  evidenceStatus: EvidenceStatus;
  productId: string | null;
  productName: string | null;
  productImageUrl: string | null;
  productPriceVnd: number | null;
}

const STATUS_TRANSITIONS: Record<string, readonly ImportOrderStatus[]> = {
  PENDING: ["PENDING", "APPROVED", "INVALID", "CANCELLED", "REVERSED"],
  APPROVED: ["APPROVED", "REVERSED", "CANCELLED", "INVALID"],
  INVALID: ["INVALID"],
  CANCELLED: ["CANCELLED"],
  REVERSED: ["REVERSED"],
};

const HEADER_ALIASES = {
  platform: ["platform", "san", "nen tang", "network"],
  platform_order_id: [
    "platform_order_id",
    "order_id",
    "order id",
    "orderid",
    "ma don",
    "ma don hang",
    "ma giao dich",
  ],
  status: ["status", "order_status", "order status", "trang thai"],
  order_amount_vnd: [
    "order_amount_vnd",
    "order amount",
    "order value",
    "total order value",
    "net sales",
    "gmv",
    "gia tri don",
    "gia tri don hang",
    "doanh thu",
  ],
  commission_vnd: [
    "commission_vnd",
    "commission",
    "total commission",
    "estimated commission",
    "hoa hong",
    "hoa hong du kien",
  ],
  click_id: ["click_id", "click id", "clickid", "tracking id"],
  sub_id: ["sub_id", "sub id", "subid"],
  sub_id1: ["sub_id1", "sub id 1", "subid1", "sub_id_1"],
  sub_id2: ["sub_id2", "sub id 2", "subid2", "sub_id_2"],
  sub_id3: ["sub_id3", "sub id 3", "subid3", "sub_id_3"],
  sub_id4: ["sub_id4", "sub id 4", "subid4", "sub_id_4"],
  sub_id5: ["sub_id5", "sub id 5", "subid5", "sub_id_5"],
  email: ["email", "buyer email", "customer email", "email nguoi mua"],
  purchased_at: [
    "purchased_at",
    "purchase time",
    "order time",
    "conversion time",
    "created time",
    "ngay mua",
    "thoi gian mua",
  ],
  sharer_email: ["sharer_email", "sharer email", "email nguoi chia se"],
  item_id: ["item_id", "item id", "product id", "product_id", "ma san pham"],
  item_name: [
    "item_name",
    "item name",
    "product name",
    "product_name",
    "ten san pham",
  ],
  quantity: ["quantity", "qty", "so luong"],
  item_amount_vnd: [
    "item_amount_vnd",
    "item amount",
    "item price",
    "product price",
    "gia san pham",
  ],
} as const;

function normalizedHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
    field,
    new Set(aliases.map(normalizedHeader)),
  ]),
) as Record<keyof typeof HEADER_ALIASES, Set<string>>;

function valueFromRecord(
  record: Record<string, unknown>,
  field: keyof typeof HEADER_ALIASES,
): string | undefined {
  const aliases = NORMALIZED_ALIASES[field];
  for (const [key, value] of Object.entries(record)) {
    if (!aliases.has(normalizedHeader(key))) continue;
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeImportStatus(value: string | undefined): ImportOrderStatus {
  const normalized = normalizedHeader(value ?? "");
  if (["pending", "processing", "open", "cho", "choduyet"].includes(normalized)) {
    return "PENDING";
  }
  if (
    [
      "approved",
      "complete",
      "completed",
      "validated",
      "valid",
      "success",
      "successful",
      "paid",
      "daduyet",
      "hoantat",
    ].includes(normalized)
  ) {
    return "APPROVED";
  }
  if (["invalid", "rejected", "reject", "tuchoi", "khonghople"].includes(normalized)) {
    return "INVALID";
  }
  if (["cancelled", "canceled", "cancel", "dahuy", "huy"].includes(normalized)) {
    return "CANCELLED";
  }
  if (["reversed", "refunded", "returned", "reverse", "hoantra", "thuhoi"].includes(normalized)) {
    return "REVERSED";
  }
  return String(value ?? "").trim().toUpperCase() as ImportOrderStatus;
}

// Chuẩn hóa tên cột báo cáo (Anh/Việt, CSV cũ lẫn mới) về cấu trúc nội bộ.
export function normalizeOrderImportRecord(
  record: Record<string, unknown>,
): OrderImportRow {
  const result: OrderImportRow = {
    platform_order_id: valueFromRecord(record, "platform_order_id") ?? "",
    status: normalizeImportStatus(valueFromRecord(record, "status")),
    order_amount_vnd: valueFromRecord(record, "order_amount_vnd") ?? "",
    commission_vnd: valueFromRecord(record, "commission_vnd") ?? "",
  };

  for (const field of [
    "platform",
    "click_id",
    "sub_id",
    "sub_id1",
    "sub_id2",
    "sub_id3",
    "sub_id4",
    "sub_id5",
    "email",
    "purchased_at",
    "sharer_email",
    "item_id",
    "item_name",
    "quantity",
    "item_amount_vnd",
  ] as const) {
    const value = valueFromRecord(record, field);
    if (value) result[field] = value;
  }
  return result;
}

function parseVnd(value: string, field: string): number {
  const raw = String(value ?? "")
    .trim()
    .replace(/[₫đvnd\s]/gi, "")
    .replace(/[^0-9.,-]/g, "");
  if (!raw || raw.startsWith("-")) {
    throw new AppError("INVALID_IMPORT_ROW", `${field} không hợp lệ.`);
  }

  let normalized = raw;
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    normalized = raw.replace(/[.,]/g, "");
  } else {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const lastSeparator = Math.max(lastComma, lastDot);
    if (lastSeparator >= 0) {
      const decimalDigits = raw.length - lastSeparator - 1;
      if (decimalDigits > 0 && decimalDigits <= 2) {
        normalized = `${raw.slice(0, lastSeparator).replace(/[.,]/g, "")}.${raw.slice(lastSeparator + 1)}`;
      } else {
        normalized = raw.replace(/[.,]/g, "");
      }
    }
  }

  const parsed = Number(normalized);
  const rounded = Math.round(parsed);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(rounded) || rounded < 0) {
    throw new AppError("INVALID_IMPORT_ROW", `${field} không hợp lệ.`);
  }
  return rounded;
}

function parseQuantity(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(String(value).replace(/[^0-9]/g, ""));
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 10_000) {
    throw new AppError("INVALID_IMPORT_ROW", "Số lượng sản phẩm không hợp lệ.");
  }
  return parsed;
}

function checksumRow(row: OrderImportRow): string {
  return createHash("sha256")
    .update(JSON.stringify(row, Object.keys(row).sort()))
    .digest("hex");
}

function cleanTrackingValue(value: string | undefined): string | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 200) return undefined;
  return normalized;
}

function normalizedShopeeSubToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

interface TrackingValues {
  clickIds: string[];
  subIds: string[];
  normalizedSubTokens: string[];
  /** Mã định danh người mua tách từ mảnh `u<tracking_code>` của Sub ID. */
  userCodes: string[];
  /** Mã sản phẩm tách từ mảnh `p<productId>` của Sub ID. */
  productIds: string[];
  hasTracking: boolean;
}

/**
 * Tách manh mối định danh từ Sub ID `c<clickId>-u<userCode>-p<productId>-...`.
 * Sàn có thể cắt bớt đuôi utm_content nên duyệt từng mảnh, không so cả chuỗi.
 */
function trackingValues(row: OrderImportRow): TrackingValues {
  const clickIds = new Set<string>();
  const subIds = new Set<string>();
  const normalizedSubTokens = new Set<string>();
  const userCodes = new Set<string>();
  const productIds = new Set<string>();
  const directClick = cleanTrackingValue(row.click_id);
  if (directClick) clickIds.add(directClick);

  for (const raw of [
    row.sub_id,
    row.sub_id1,
    row.sub_id2,
    row.sub_id3,
    row.sub_id4,
    row.sub_id5,
  ]) {
    const value = cleanTrackingValue(raw);
    if (!value) continue;
    for (const part of value.split(/[;,|]/).map((entry) => entry.trim()).filter(Boolean)) {
      subIds.add(part);
      const normalizedToken = normalizedShopeeSubToken(part);
      if (normalizedToken) normalizedSubTokens.add(normalizedToken);

      // Duyệt từng mảnh: mảnh đầu là "c" + clickId, các mảnh sau mang tiền tố
      // "u" (người mua) và "p" (sản phẩm).
      const segments = part.split("-").map((entry) => entry.trim()).filter(Boolean);
      for (const [index, segment] of segments.entries()) {
        if (index === 0 && segment !== part) {
          const headToken = normalizedShopeeSubToken(segment);
          if (headToken) normalizedSubTokens.add(headToken);
        }
        if (/^u[a-z0-9]{6,32}$/i.test(segment)) {
          userCodes.add(segment.slice(1).toLowerCase());
        }
        if (/^p[0-9]{3,32}$/.test(segment)) {
          productIds.add(segment.slice(1));
        }
      }
      // Chỉ bỏ đúng ký tự c đầu, không đoán từ chuỗi ghép dài.
      if (/^c[A-Za-z0-9_-]{3,64}$/.test(part)) {
        clickIds.add(part.slice(1));
      }
    }
  }

  // Báo cáo có thể trả mã sản phẩm ở cột riêng — cũng là manh mối đối soát.
  for (const reported of [row.item_id, ...(row.items ?? []).map((i) => i.item_id)]) {
    const value = String(reported ?? "").trim();
    if (/^[0-9]{3,32}$/.test(value)) productIds.add(value);
  }

  return {
    clickIds: [...clickIds],
    subIds: [...subIds],
    normalizedSubTokens: [...normalizedSubTokens],
    userCodes: [...userCodes],
    productIds: [...productIds],
    hasTracking: clickIds.size > 0 || subIds.size > 0,
  };
}

async function findActiveUserByEmail(
  db: Database,
  email: string | undefined,
): Promise<string | undefined> {
  if (!email) return undefined;
  const user = await query<{ id: string }>(
    db,
    "SELECT id FROM users WHERE lower(email) = $1 AND status = 'ACTIVE'",
    [normalizeEmail(email)],
  );
  return user.rows[0]?.id;
}

/**
 * Fallback khi click id không khớp: tìm theo cặp (mã người mua, mã sản phẩm),
 * chọn lượt bấm gần nhất TRƯỚC giờ mua và chưa gắn đơn nào.
 */
async function resolveLinkByUserAndProduct(
  db: Database,
  tracking: TrackingValues,
  platform: ProductPlatform,
  row: OrderImportRow,
): Promise<
  | {
      link: AffiliateLinkAttributionRow;
      matchedBy: { userCode: string; productId: string };
    }
  | undefined
> {
  if (!tracking.userCodes.length || !tracking.productIds.length) return undefined;

  const links = await query<
    AffiliateLinkAttributionRow & { tracking_code: string }
  >(
    db,
    `
      SELECT l.id, l.user_id, l.platform, l.click_id, l.sub_id, l.campaign,
        l.product_id, l.product_name, l.product_image_url,
        l.product_price_vnd::text, u.tracking_code
      FROM affiliate_links l
      JOIN users u ON u.id = l.user_id
      WHERE u.tracking_code = ANY($1::text[])
        AND l.platform = $2
        AND l.product_id = ANY($3::text[])
        AND NOT EXISTS (
          SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id
        )
        AND ($4 = '' OR l.created_at <= $4::timestamptz)
      ORDER BY l.created_at DESC
      LIMIT 1
    `,
    [
      tracking.userCodes,
      platform,
      tracking.productIds,
      row.purchased_at ?? "",
    ],
  );
  const link = links.rows[0];
  if (!link) return undefined;
  return {
    link,
    matchedBy: {
      userCode: link.tracking_code,
      productId: link.product_id ?? tracking.productIds[0]!,
    },
  };
}

async function resolveUser(
  db: Database,
  row: OrderImportRow,
  platform: ProductPlatform,
): Promise<ResolvedOrderOwner> {
  const tracking = trackingValues(row);
  if (tracking.hasTracking) {
    const links = await query<AffiliateLinkAttributionRow>(
      db,
      `
        SELECT id, user_id, platform, click_id, sub_id, campaign,
          product_id, product_name, product_image_url, product_price_vnd::text
        FROM affiliate_links
        WHERE click_id = ANY($1::text[])
          OR sub_id = ANY($2::text[])
          OR regexp_replace('c' || click_id, '[^a-zA-Z0-9]', '', 'g') = ANY($3::text[])
        ORDER BY created_at DESC
        LIMIT 3
      `,
      [tracking.clickIds, tracking.subIds, tracking.normalizedSubTokens],
    );
    if (links.rows.length > 1) {
      throw new AppError(
        "ORDER_TRACKING_AMBIGUOUS",
        `Mã theo dõi của đơn ${row.platform_order_id} khớp nhiều link. Hãy kiểm tra lại Sub ID.`,
      );
    }
    // Dự phòng: mã lượt click không khớp (sàn cắt bớt Sub ID, hoặc người dùng
    // mua ở phiên sau) nhưng vẫn còn mã người mua + mã sản phẩm. Cặp này đủ
    // để chỉ ra chính xác một lượt bấm mua, nên vẫn coi là bằng chứng hợp lệ.
    const fallback = links.rows[0]
      ? undefined
      : await resolveLinkByUserAndProduct(db, tracking, platform, row);
    const matchedByUserProduct = fallback?.matchedBy;
    const link = links.rows[0] ?? fallback?.link;
    if (!link) {
      throw new AppError(
        "ORDER_TRACKING_NOT_FOUND",
        `Không tìm thấy link ShopTik tương ứng với Click ID/Sub ID của đơn ${row.platform_order_id}.`,
      );
    }
    if (link.platform !== platform) {
      throw new AppError(
        "ORDER_PLATFORM_MISMATCH",
        `Link theo dõi thuộc ${link.platform}, không khớp sàn ${platform} của đơn.`,
      );
    }

    const matchedBySubId = tracking.subIds.includes(link.sub_id);
    const matchedOpenApiToken = tracking.subIds.find(
      (value) =>
        normalizedShopeeSubToken(value) ===
        normalizedShopeeSubToken(`c${link.click_id}`),
    );
    const attributionMethod: AttributionMethod = matchedBySubId
      ? "SUB_ID"
      : row.click_id && tracking.clickIds.includes(link.click_id)
        ? "CLICK_ID"
        : "SUB_ID";
    const attributionValue = matchedBySubId
      ? link.sub_id
      : row.click_id && row.click_id === link.click_id
        ? link.click_id
        : matchedOpenApiToken ??
          // Khớp qua cặp người mua + sản phẩm: ghi lại đúng manh mối đã dùng
          // để đội vận hành đọc được vì sao đơn thuộc về tài khoản này.
          (matchedByUserProduct
            ? `u${matchedByUserProduct.userCode}-p${matchedByUserProduct.productId}`
            : `c${link.click_id}`);

    let buyerUserId = link.user_id;
    let linkSharerUserId: string | undefined;
    if (link.campaign === "sharelink") {
      throw new AppError(
        "SHARED_LINK_BUYER_NOT_VERIFIABLE",
        `Đơn ${row.platform_order_id} phát sinh từ link chia sẻ. Sub ID chỉ chứng minh chủ link, không chứng minh tài khoản người nhận link. Không tự động hoàn tiền cho đến khi luồng mua tạo Sub ID riêng sau khi người mua đăng nhập ShopTik.`,
      );
    } else if (row.email) {
      const explicitBuyer = await findActiveUserByEmail(db, row.email);
      if (explicitBuyer && explicitBuyer !== link.user_id) {
        throw new AppError(
          "ORDER_OWNER_MISMATCH",
          `Email người mua không khớp tài khoản đã tạo link cho đơn ${row.platform_order_id}.`,
        );
      }
    }

    return {
      userId: buyerUserId,
      linkId: link.id,
      ...(linkSharerUserId ? { linkSharerUserId } : {}),
      attributionMethod,
      attributionValue,
      evidenceStatus: "VERIFIED",
      productId: link.product_id,
      productName: link.product_name,
      productImageUrl: link.product_image_url,
      productPriceVnd:
        link.product_price_vnd === null ? null : Number(link.product_price_vnd),
    };
  }

  const userId = await findActiveUserByEmail(db, row.email);
  if (userId) {
    if (platform === "SHOPEE") {
      throw new AppError(
        "SHOPEE_TRACKING_REQUIRED",
        `Đơn ${row.platform_order_id} chưa có Sub ID/Click ID từ báo cáo Shopee. Không thể dùng email để khẳng định người mua và không được cộng tiền hoàn.`,
      );
    }
    return {
      userId,
      linkId: null,
      attributionMethod: "EMAIL",
      attributionValue: normalizeEmail(row.email!),
      evidenceStatus: "MANUAL_REVIEW",
      productId: null,
      productName: null,
      productImageUrl: null,
      productPriceVnd: null,
    };
  }
  throw new AppError(
    "ORDER_OWNER_NOT_FOUND",
    `Không xác định được người dùng cho đơn ${row.platform_order_id}. Cần Sub ID/Click ID hợp lệ hoặc email tài khoản ShopTik.`,
  );
}

async function resolveSharer(
  db: Database,
  sharerEmail: string | undefined,
  buyerUserId: string,
): Promise<string | undefined> {
  const sharerId = await findActiveUserByEmail(db, sharerEmail);
  if (!sharerId || sharerId === buyerUserId) return undefined;
  return sharerId;
}

/**
 * Người giới thiệu tài khoản của người mua. B do A mời thì MỌI đơn của B,
 * A hưởng referrerSharePercent% hoa hồng (đối tác đặc biệt:
 * specialPartnerSharePercent%) — trừ khi đơn đã có chủ link chia sẻ đích danh.
 */
async function resolveReferralSharer(
  db: Database,
  buyerUserId: string,
): Promise<string | undefined> {
  const referrer = await query<{ id: string }>(
    db,
    `
      SELECT r.id FROM users u
      JOIN users r ON r.id = u.referred_by_user_id
      WHERE u.id = $1 AND r.status = 'ACTIVE'
    `,
    [buyerUserId],
  );
  const referrerId = referrer.rows[0]?.id;
  if (!referrerId || referrerId === buyerUserId) return undefined;
  return referrerId;
}

function normalizePlatform(value: string | undefined): ProductPlatform {
  const platform = String(value || "SHOPEE").trim().toUpperCase();
  if (!PRODUCT_PLATFORMS.includes(platform as ProductPlatform)) {
    throw new AppError(
      "INVALID_IMPORT_ROW",
      "Nền tảng phải là SHOPEE, TIKTOK hoặc LAZADA.",
    );
  }
  return platform as ProductPlatform;
}

async function writeOrderItem(
  db: Database,
  params: {
    orderId: string;
    externalItemKey: string;
    itemName: string;
    quantity: number;
    amountVnd: number;
    source: ItemSource;
    imageUrl: string | null;
  },
): Promise<void> {
  await query(
    db,
    `
      INSERT INTO order_items (
        order_id, external_item_key, item_name, quantity, amount_vnd,
        source, item_image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (order_id, external_item_key)
      DO UPDATE SET
        item_name = CASE
          WHEN EXCLUDED.source = 'REPORT' THEN EXCLUDED.item_name
          ELSE order_items.item_name
        END,
        quantity = CASE
          WHEN EXCLUDED.source = 'REPORT' THEN EXCLUDED.quantity
          ELSE order_items.quantity
        END,
        amount_vnd = CASE
          WHEN EXCLUDED.source = 'REPORT' THEN EXCLUDED.amount_vnd
          ELSE order_items.amount_vnd
        END,
        source = CASE
          WHEN EXCLUDED.source = 'REPORT' THEN 'REPORT'
          ELSE order_items.source
        END,
        item_image_url = COALESCE(
          EXCLUDED.item_image_url, order_items.item_image_url
        )
    `,
    [
      params.orderId,
      params.externalItemKey.slice(0, 250),
      params.itemName.slice(0, 500),
      params.quantity,
      params.amountVnd,
      params.source,
      params.imageUrl,
    ],
  );
}

async function upsertOrderItem(
  db: Database,
  params: {
    orderId: string;
    row: OrderImportRow;
    owner: ResolvedOrderOwner;
    orderAmount: number;
  },
): Promise<void> {
  // Báo cáo API trả sẵn danh sách mặt hàng thật — ưu tiên tuyệt đối.
  if (params.row.items?.length) {
    for (const item of params.row.items) {
      const itemName = String(item.item_name ?? "").trim();
      const itemId = String(item.item_id ?? "").trim();
      if (!itemName && !itemId) continue;
      await writeOrderItem(db, {
        orderId: params.orderId,
        externalItemKey: itemId || itemName,
        itemName: itemName || `Sản phẩm ${itemId}`,
        quantity: Math.max(1, Math.trunc(item.quantity) || 1),
        amountVnd: Math.max(0, Math.trunc(item.amount_vnd) || 0),
        source: "REPORT",
        imageUrl: item.item_image_url ?? null,
      });
    }
    return;
  }

  const reportName = String(params.row.item_name ?? "").trim();
  const reportId = String(params.row.item_id ?? "").trim();
  const hasReportItem = Boolean(reportName || reportId);
  const itemName = reportName || params.owner.productName;
  if (!itemName) return;

  const source: ItemSource = hasReportItem ? "REPORT" : "CLICK_SNAPSHOT";
  const externalItemKey =
    reportId ||
    params.owner.productId ||
    `${source.toLowerCase()}:${params.owner.linkId ?? params.orderId}`;
  const amountVnd = params.row.item_amount_vnd
    ? parseVnd(params.row.item_amount_vnd, "Giá sản phẩm")
    : params.owner.productPriceVnd ?? params.orderAmount;
  const quantity = parseQuantity(params.row.quantity);

  await writeOrderItem(db, {
    orderId: params.orderId,
    externalItemKey,
    itemName,
    quantity,
    amountVnd,
    source,
    imageUrl: params.owner.productImageUrl,
  });
}

export async function importOrderRow(
  db: Database,
  config: AppConfig,
  row: OrderImportRow,
  actorId: string,
): Promise<{ orderId: string; status: ImportOrderStatus }> {
  const platform = normalizePlatform(row.platform);
  const platformOrderId = String(row.platform_order_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(platformOrderId)) {
    throw new AppError(
      "INVALID_IMPORT_ROW",
      "Mã đơn chỉ được chứa chữ, số, gạch ngang hoặc gạch dưới.",
    );
  }
  if (!STATUS_TRANSITIONS[row.status]) {
    throw new AppError("INVALID_IMPORT_ROW", "Trạng thái đơn không hợp lệ.");
  }

  const orderAmount = parseVnd(row.order_amount_vnd, "Giá trị đơn");
  const commission = parseVnd(row.commission_vnd, "Hoa hồng");
  const owner = await resolveUser(db, { ...row, platform_order_id: platformOrderId }, platform);
  const businessConfig = await getBusinessConfig(db, config);
  const holdDays = Math.max(0, businessConfig.cashbackHoldDays);

  const manualSharer = businessConfig.enableShareLink
    ? await resolveSharer(db, row.sharer_email, owner.userId)
    : undefined;
  const linkSharer = businessConfig.enableShareLink
    ? owner.linkSharerUserId
    : undefined;
  if (manualSharer && linkSharer && manualSharer !== linkSharer) {
    throw new AppError(
      "SHARER_MISMATCH",
      `Email người chia sẻ không khớp chủ link của đơn ${platformOrderId}.`,
    );
  }
  const explicitSharer = linkSharer ?? manualSharer;
  const referralSharer =
    !explicitSharer && businessConfig.enableReferralProgram
      ? await resolveReferralSharer(db, owner.userId)
      : undefined;
  const sharerUserId = explicitSharer ?? referralSharer;

  // Đối tác ĐẶC BIỆT hưởng specialPartnerSharePercent thay cho mức thường.
  let sharerLaDacBiet = false;
  if (sharerUserId) {
    const sharerRow = await query<{ is_special_partner: boolean }>(
      db,
      "SELECT is_special_partner FROM users WHERE id = $1",
      [sharerUserId],
    );
    sharerLaDacBiet = sharerRow.rows[0]?.is_special_partner ?? false;
  }

  // Chính sách 2026-08-29: người mua 60% (đơn ≤ 25k: 80%), đối tác giới thiệu
  // 10% (F1) TRỰC TIẾP trên hoa hồng, nền tảng giữ phần còn lại.
  const split = computeCommissionSplit(
    commission,
    {
      buyerCashbackPercent: resolveBuyerPercent(
        orderAmount > 0 ? orderAmount : null,
        businessConfig,
      ),
      sharerSharePercent: sharerLaDacBiet
        ? businessConfig.specialPartnerSharePercent
        : businessConfig.referrerSharePercent,
    },
    Boolean(sharerUserId),
  );
  const cashback = split.buyerVnd;
  const normalizedRow = { ...row, platform_order_id: platformOrderId };
  const checksum = checksumRow(normalizedRow);

  const raw = await query<{ id: string }>(
    db,
    `
      INSERT INTO conversion_raw (source, event_id, checksum, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (source, checksum)
      DO UPDATE SET processing_error = NULL
      RETURNING id
    `,
    [
      `${platform}_CSV`,
      platformOrderId,
      checksum,
      JSON.stringify({ ...normalizedRow, platform }),
    ],
  );
  const rawId = raw.rows[0]!.id;

  try {
    const previous = await query<{
      id: string;
      user_id: string;
      affiliate_link_id: string | null;
      status: ImportOrderStatus;
      cashback_vnd: string;
      evidence_status: EvidenceStatus;
      cashback_revision: number;
      cashback_released_at: Date | null;
      entry_user_amount_vnd: string | null;
      entry_referral_amount_vnd: string | null;
      entry_platform_amount_vnd: string | null;
      entry_sharer_user_id: string | null;
    }>(
      db,
      `
        SELECT o.id, o.user_id, o.affiliate_link_id, o.status,
          o.cashback_vnd::text, o.evidence_status, o.cashback_revision,
          o.cashback_released_at,
          ce.user_amount_vnd::text AS entry_user_amount_vnd,
          ce.referral_amount_vnd::text AS entry_referral_amount_vnd,
          ce.platform_amount_vnd::text AS entry_platform_amount_vnd,
          ce.sharer_user_id AS entry_sharer_user_id
        FROM orders o
        LEFT JOIN commission_entries ce
          ON ce.order_id = o.id AND ce.user_id = o.user_id
        WHERE o.platform = $1 AND o.platform_order_id = $2
      `,
      [platform, platformOrderId],
    );
    const existing = previous.rows[0];
    if (existing && !STATUS_TRANSITIONS[existing.status]?.includes(row.status)) {
      throw new AppError(
        "INVALID_ORDER_TRANSITION",
        `Không thể chuyển đơn từ ${existing.status} sang ${row.status}.`,
      );
    }
    if (existing && existing.user_id !== owner.userId) {
      throw new AppError(
        "ORDER_OWNER_CHANGED",
        `Đơn ${platformOrderId} đã được gán cho tài khoản khác. Không tự động chuyển chủ đơn.`,
      );
    }

    // Sàn có thể cập nhật lại hoa hồng khi đơn còn đang chờ (hoàn một phần,
    // đổi tỷ lệ...). Khi tiền chưa giải ngân, hệ thống đảo khoản cũ rồi ghi
    // khoản mới ở revision kế tiếp; nếu đã giải ngân thì bắt buộc đối soát tay.
    const previousCashback = existing ? Number(existing.cashback_vnd) : cashback;
    const cashbackChanged = Boolean(existing) && previousCashback !== cashback;
    const alreadyReleased = Boolean(existing?.cashback_released_at);
    if (cashbackChanged && alreadyReleased) {
      throw new AppError(
        "CASHBACK_CHANGED",
        `Hoa hồng của đơn ${platformOrderId} thay đổi sau khi đã cộng vào số dư khả dụng. Hãy đối soát và tạo điều chỉnh có phê duyệt.`,
      );
    }
    const previousRevision = Number(existing?.cashback_revision ?? 0);
    // Đơn chuyển sang trạng thái kết thúc (hủy/không hợp lệ) thì không ghi
    // khoản mới nữa — giữ nguyên revision để khối đảo khoản bên dưới xử lý.
    const closingStatus = ["INVALID", "CANCELLED", "REVERSED"].includes(
      row.status,
    );
    const revision =
      cashbackChanged && !closingStatus ? previousRevision + 1 : previousRevision;
    const previousAllocation: CommissionAllocation | null = existing
      ? {
          buyerUserId: existing.user_id,
          buyerVnd: Number(existing.entry_user_amount_vnd ?? 0),
          ...(existing.entry_sharer_user_id
            ? { sharerUserId: existing.entry_sharer_user_id }
            : {}),
          sharerVnd: Number(existing.entry_referral_amount_vnd ?? 0),
          platformVnd: Number(existing.entry_platform_amount_vnd ?? 0),
        }
      : null;
    const previousCredited = Boolean(
      existing &&
        existing.evidence_status === "VERIFIED" &&
        ["PENDING", "APPROVED"].includes(existing.status),
    );

    if (cashbackChanged && !closingStatus && previousCredited && previousAllocation) {
      await reverseSplitCashback(db, {
        orderId: existing!.id,
        allocation: previousAllocation,
        source: "PENDING",
        createdBy: actorId,
        revision: previousRevision,
      });
    }

    const upserted = await query<{ id: string }>(
      db,
      `
        INSERT INTO orders (
          user_id, affiliate_link_id, platform, platform_order_id,
          status, order_amount_vnd, commission_vnd, cashback_vnd,
          purchased_at, approved_at, raw_conversion_id,
          attribution_method, attribution_value, attributed_at,
          evidence_status, evidence_verified_at,
          completed_at, cashback_available_at, external_status,
          cancel_reason, cashback_revision
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          NULLIF($9, '')::timestamptz,
          CASE WHEN $5 = 'APPROVED' THEN now() ELSE NULL END,
          $10, $11, $12, now(), $13,
          CASE WHEN $13 = 'VERIFIED' THEN now() ELSE NULL END,
          CASE
            WHEN $5 = 'APPROVED'
            THEN COALESCE(NULLIF($14, '')::timestamptz, now())
            ELSE NULLIF($14, '')::timestamptz
          END,
          CASE
            WHEN $5 = 'APPROVED'
            THEN COALESCE(NULLIF($14, '')::timestamptz, now())
              + ($15::text || ' days')::interval
            ELSE NULL
          END,
          NULLIF($16, ''), NULLIF($17, ''), $18
        )
        ON CONFLICT (platform, platform_order_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          completed_at = COALESCE(orders.completed_at, EXCLUDED.completed_at),
          cashback_available_at = CASE
            WHEN EXCLUDED.status = 'APPROVED'
            THEN COALESCE(orders.cashback_available_at, EXCLUDED.cashback_available_at)
            ELSE orders.cashback_available_at
          END,
          external_status = COALESCE(EXCLUDED.external_status, orders.external_status),
          cancel_reason = COALESCE(EXCLUDED.cancel_reason, orders.cancel_reason),
          cashback_revision = EXCLUDED.cashback_revision,
          order_amount_vnd = EXCLUDED.order_amount_vnd,
          commission_vnd = EXCLUDED.commission_vnd,
          cashback_vnd = EXCLUDED.cashback_vnd,
          affiliate_link_id = COALESCE(orders.affiliate_link_id, EXCLUDED.affiliate_link_id),
          attribution_method = COALESCE(orders.attribution_method, EXCLUDED.attribution_method),
          attribution_value = COALESCE(orders.attribution_value, EXCLUDED.attribution_value),
          attributed_at = COALESCE(orders.attributed_at, EXCLUDED.attributed_at),
          evidence_status = CASE
            WHEN orders.evidence_status = 'VERIFIED' THEN 'VERIFIED'
            ELSE EXCLUDED.evidence_status
          END,
          evidence_verified_at = COALESCE(
            orders.evidence_verified_at, EXCLUDED.evidence_verified_at
          ),
          purchased_at = COALESCE(EXCLUDED.purchased_at, orders.purchased_at),
          approved_at = CASE
            WHEN EXCLUDED.status = 'APPROVED'
            THEN COALESCE(orders.approved_at, now())
            ELSE orders.approved_at
          END,
          raw_conversion_id = EXCLUDED.raw_conversion_id
        RETURNING id
      `,
      [
        owner.userId,
        owner.linkId,
        platform,
        platformOrderId,
        row.status,
        orderAmount,
        commission,
        cashback,
        row.purchased_at ?? "",
        rawId,
        owner.attributionMethod,
        owner.attributionValue,
        owner.evidenceStatus,
        row.completed_at ?? "",
        holdDays,
        row.external_status ?? "",
        row.cancel_reason ?? "",
        revision,
      ],
    );
    const orderId = upserted.rows[0]!.id;

    await upsertOrderItem(db, {
      orderId,
      row,
      owner,
      orderAmount,
    });

    if (!existing) {
      await query(
        db,
        `
          INSERT INTO commission_entries (
            order_id, user_id, sharer_user_id, user_amount_vnd,
            referral_amount_vnd, platform_amount_vnd,
            buyer_percent, platform_percent, sharer_percent, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
          ON CONFLICT (order_id, user_id) DO NOTHING
        `,
        [
          orderId,
          owner.userId,
          sharerUserId ?? null,
          split.buyerVnd,
          split.sharerVnd,
          split.platformVnd,
          split.buyerPercent,
          split.platformPercent,
          split.sharerPercent,
        ],
      );
    } else if (cashbackChanged) {
      // Hoa hồng được sàn cập nhật lại: ghi đè bản chụp chia tiền cho khớp
      // với bút toán vừa tạo ở revision mới.
      await query(
        db,
        `
          UPDATE commission_entries
          SET sharer_user_id = $2, user_amount_vnd = $3,
            referral_amount_vnd = $4, platform_amount_vnd = $5,
            buyer_percent = $6, platform_percent = $7, sharer_percent = $8,
            status = 'PENDING'
          WHERE order_id = $1
        `,
        [
          orderId,
          sharerUserId ?? null,
          split.buyerVnd,
          split.sharerVnd,
          split.platformVnd,
          split.buyerPercent,
          split.platformPercent,
          split.sharerPercent,
        ],
      );
    }

    const allocation: CommissionAllocation = {
      buyerUserId: owner.userId,
      buyerVnd: split.buyerVnd,
      ...(sharerUserId ? { sharerUserId } : {}),
      sharerVnd: split.sharerVnd,
      platformVnd: split.platformVnd,
    };

    const verifiedForPayout = owner.evidenceStatus === "VERIFIED";
    if (
      commission > 0 &&
      verifiedForPayout &&
      ["PENDING", "APPROVED"].includes(row.status)
    ) {
      await creditSplitCashback(db, {
        orderId,
        allocation,
        createdBy: actorId,
        revision,
      });
    }
    if (commission > 0 && verifiedForPayout && row.status === "APPROVED") {
      // Đơn Hoàn thành chỉ được cộng vào số dư khả dụng sau khi qua thời gian
      // giữ tiền (cashback_hold_days) tính từ mốc hoàn thành. Trong lúc chờ,
      // tiền nằm ở ví CHỜ và job `releaseDueCashback` sẽ giải ngân đúng hạn.
      if (holdDays === 0) {
        await moveSplitPendingToAvailable(db, {
          orderId,
          allocation,
          createdBy: actorId,
          revision,
        });
        await query(
          db,
          "UPDATE commission_entries SET status = 'AVAILABLE' WHERE order_id = $1",
          [orderId],
        );
        await query(
          db,
          `
            UPDATE orders
            SET cashback_available_at = COALESCE(cashback_available_at, now()),
              cashback_released_at = COALESCE(cashback_released_at, now())
            WHERE id = $1
          `,
          [orderId],
        );
      }
      await maybeRewardReferral(db, config, businessConfig, {
        buyerUserId: owner.userId,
        orderId,
        actorId,
      });
    }
    // Đảo khoản phải dùng đúng số tiền ĐÃ ghi nhận trước đó: đơn hủy thường
    // được sàn trả về với hoa hồng bằng 0 nên không thể lấy split mới.
    const reversalAllocation = previousAllocation ?? allocation;
    const reversalTotal =
      reversalAllocation.buyerVnd +
      reversalAllocation.sharerVnd +
      reversalAllocation.platformVnd;
    if (
      reversalTotal > 0 &&
      ["INVALID", "CANCELLED", "REVERSED"].includes(row.status) &&
      existing &&
      existing.evidence_status === "VERIFIED" &&
      ["PENDING", "APPROVED"].includes(existing.status)
    ) {
      await reverseSplitCashback(db, {
        orderId,
        allocation: reversalAllocation,
        source: existing.cashback_released_at ? "AVAILABLE" : "PENDING",
        createdBy: actorId,
        revision,
      });
      await query(
        db,
        "UPDATE commission_entries SET status = 'REVERSED' WHERE order_id = $1",
        [orderId],
      );
    }

    await query(
      db,
      `
        UPDATE conversion_raw
        SET processed_at = now(), processing_error = NULL
        WHERE id = $1
      `,
      [rawId],
    );
    // Đơn vừa được sàn XÁC NHẬN (lần đầu chuyển sang APPROVED) → báo cho khách.
    if (
      row.status === "APPROVED" &&
      (!existing || existing.status !== "APPROVED") &&
      split.buyerVnd > 0
    ) {
      await createNotification(db, {
        userId: owner.userId,
        type: "ORDER_APPROVED",
        ...camioVoice.orderApproved({
          orderCode: platformOrderId,
          platform,
          amount: `${split.buyerVnd.toLocaleString("vi-VN")}₫`,
        }),
      });
    }
    return { orderId, status: row.status };
  } catch (error) {
    await query(
      db,
      `
        UPDATE conversion_raw
        SET processing_error = $2
        WHERE id = $1
      `,
      [
        rawId,
        error instanceof AppError ? error.code : "UNEXPECTED_PROCESSING_ERROR",
      ],
    );
    throw error;
  }
}
