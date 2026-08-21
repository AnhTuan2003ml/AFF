import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import type { SlackLogger } from "./slack.js";
import { getBusinessConfig } from "./business-config.js";
import { listOrderHistory } from "./order-history.js";
import {
  sendSupportChatMessage,
  type SupportChatMessage,
} from "./support-chat.js";

// Form hỗ trợ theo mẫu: người dùng chọn loại vấn đề, gắn đơn hàng liên quan
// và mô tả chi tiết. Yêu cầu được chuẩn hóa thành MỘT tin nhắn rồi đi chung
// đường ống chat hỗ trợ (lưu hội thoại + đổ vào thread Slack CSKH) — không
// có hệ ticket riêng.

/**
 * Cách gắn đơn hàng vào yêu cầu:
 * - `list` — chọn một bản ghi trong lịch sử đơn của chính người dùng.
 * - `code` — nhập mã đơn hiển thị trên sàn (đơn chưa có trong hệ thống).
 * - `none` — vấn đề không gắn với đơn nào.
 */
export type SupportOrderMode = "list" | "code" | "none";

export interface SupportTopic {
  value: string;
  label: string;
  orderMode: SupportOrderMode;
  /** true = bắt buộc gắn đơn khi gửi. */
  orderRequired: boolean;
}

export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  {
    value: "ORDER_NOT_RECORDED",
    label: "Đơn đã mua nhưng chưa ghi nhận",
    orderMode: "code",
    orderRequired: true,
  },
  {
    value: "CASHBACK_ISSUE",
    label: "Tiền hoàn sai hoặc chưa về ví",
    orderMode: "list",
    orderRequired: true,
  },
  {
    value: "ORDER_CANCELLED",
    label: "Đơn bị hủy, cần biết lý do",
    orderMode: "list",
    orderRequired: true,
  },
  {
    value: "WITHDRAWAL",
    label: "Rút tiền, tài khoản ngân hàng",
    orderMode: "none",
    orderRequired: false,
  },
  {
    value: "ACCOUNT",
    label: "Tài khoản, bảo mật",
    orderMode: "none",
    orderRequired: false,
  },
  {
    value: "OTHER",
    label: "Vấn đề khác",
    orderMode: "list",
    orderRequired: false,
  },
];

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã duyệt",
  CANCELLED: "Đã hủy",
  INVALID: "Không hợp lệ",
  REVERSED: "Đã đảo khoản",
  AWAITING: "Chờ sàn xác nhận",
  UNTRACKED: "Không ghi nhận được",
};

export function platformDisplayName(platform: string): string {
  const normalized = platform.trim().toUpperCase();
  if (normalized === "SHOPEE") return "Shopee";
  if (normalized === "TIKTOK") return "TikTok Shop";
  if (normalized === "LAZADA") return "Lazada";
  return platform;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const orderNotFoundError = () =>
  new AppError(
    "ORDER_NOT_FOUND",
    "Không tìm thấy đơn hàng đã chọn trong tài khoản của bạn.",
    404,
  );

/**
 * Dịch orderKey (`ORDER:<id>` từ bảng orders, `INTENT:<id>` từ lượt bấm mua)
 * thành dòng mô tả đơn — chỉ chấp nhận bản ghi thuộc đúng người dùng.
 */
async function describeOrderReference(
  db: Database,
  userId: string,
  orderKey: string,
): Promise<string> {
  const [kind, id] = orderKey.split(":", 2);
  if (!id || !UUID_PATTERN.test(id)) throw orderNotFoundError();

  if (kind === "ORDER") {
    const result = await query<{
      platform: string;
      platform_order_id: string;
      status: string;
      product_name: string | null;
    }>(
      db,
      `
        SELECT o.platform, o.platform_order_id, o.status,
          COALESCE(oi.item_name, l.product_name) AS product_name
        FROM orders o
        LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
        LEFT JOIN LATERAL (
          SELECT item_name
          FROM order_items
          WHERE order_id = o.id
          ORDER BY CASE source WHEN 'REPORT' THEN 0 ELSE 1 END, id
          LIMIT 1
        ) oi ON true
        WHERE o.id = $1 AND o.user_id = $2
      `,
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) throw orderNotFoundError();
    return [
      `Đơn ${platformDisplayName(row.platform)} #${row.platform_order_id}`,
      row.product_name,
      ORDER_STATUS_LABELS[row.status] ?? row.status,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (kind === "INTENT") {
    const result = await query<{
      platform: string;
      product_name: string | null;
      created_at: Date;
    }>(
      db,
      `
        SELECT platform, product_name, created_at
        FROM affiliate_links
        WHERE id = $1 AND user_id = $2 AND campaign = 'instantbuy'
      `,
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) throw orderNotFoundError();
    const boughtAt = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      dateStyle: "short",
    }).format(new Date(row.created_at));
    return [
      `Lượt mua ${platformDisplayName(row.platform)} ngày ${boughtAt}`,
      row.product_name,
      "Chờ sàn xác nhận",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  throw orderNotFoundError();
}

export interface SupportRequestInput {
  userId: string;
  userEmail: string;
  userFullName?: string;
  topic: string;
  /** `ORDER:<id>` hoặc `INTENT:<id>` khi orderMode = "list". */
  orderKey?: string;
  /** Mã đơn trên sàn khi orderMode = "code". */
  orderCode?: string;
  description: string;
  /** Email nhận kết quả phản hồi; trống = dùng email đăng ký. */
  notifyEmail?: string;
  logger?: SlackLogger;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitSupportRequest(
  db: Database,
  config: AppConfig,
  input: SupportRequestInput,
): Promise<SupportChatMessage> {
  const topic = SUPPORT_TOPICS.find((item) => item.value === input.topic);
  if (!topic) {
    throw new AppError(
      "INVALID_TOPIC",
      "Vui lòng chọn vấn đề cần hỗ trợ.",
      400,
    );
  }

  const description = input.description.trim();
  if (description.length < 10 || description.length > 2000) {
    throw new AppError(
      "INVALID_DESCRIPTION",
      "Mô tả cần từ 10 đến 2000 ký tự.",
      400,
    );
  }

  let orderLine: string | null = null;
  if (topic.orderMode === "code") {
    const code = (input.orderCode ?? "").trim();
    if (code.length < 3 || code.length > 100) {
      throw new AppError(
        "INVALID_ORDER_CODE",
        "Vui lòng nhập mã đơn hàng trên sàn (3–100 ký tự).",
        400,
      );
    }
    orderLine = `Mã đơn trên sàn: #${code}`;
  } else if (topic.orderMode === "list") {
    const orderKey = (input.orderKey ?? "").trim();
    if (orderKey) {
      orderLine = await describeOrderReference(db, input.userId, orderKey);
    } else if (topic.orderRequired) {
      throw new AppError(
        "ORDER_REQUIRED",
        "Vui lòng chọn đơn hàng cần hỗ trợ.",
        400,
      );
    }
  }

  const notifyEmail = (input.notifyEmail ?? "").trim().toLowerCase();
  if (notifyEmail && (notifyEmail.length > 254 || !EMAIL_PATTERN.test(notifyEmail))) {
    throw new AppError(
      "INVALID_NOTIFY_EMAIL",
      "Email nhận phản hồi chưa đúng định dạng.",
      400,
    );
  }

  const body = [
    `[Yêu cầu hỗ trợ] ${topic.label}`,
    ...(orderLine ? [orderLine] : []),
    description,
  ].join("\n");

  const message = await sendSupportChatMessage(db, config, {
    userId: input.userId,
    userEmail: input.userEmail,
    ...(input.userFullName ? { userFullName: input.userFullName } : {}),
    body,
    // Yêu cầu theo mẫu hiện cả ra ngoài kênh Slack để không bị chìm trong thread cũ.
    broadcast: true,
    ...(input.logger ? { logger: input.logger } : {}),
  });

  // Ghi nhớ email nhận phản hồi cho hội thoại (trống = dùng email đăng ký).
  await query(
    db,
    `
      UPDATE support_conversations
      SET notify_email = $2, updated_at = now()
      WHERE user_id = $1
    `,
    [input.userId, notifyEmail],
  );

  return message;
}

/** Một dòng trong ô "Đơn hàng liên quan" của form hỗ trợ (web + app dùng chung). */
export interface SupportOrderOption {
  /** `ORDER:<id>` hoặc `INTENT:<id>` — khớp `orderKey` khi gửi. */
  key: string;
  label: string;
}

const ORDER_OPTION_DATE = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "short",
});

/** Nhãn ngắn cho một bản ghi lịch sử đơn: "Shopee · #MÃ · Tên sản phẩm…". */
export function toSupportOrderOption(row: {
  record_kind: string;
  id: string;
  platform: string;
  platform_order_id: string | null;
  product_name: string | null;
  purchased_at: Date | string | null;
  created_at: Date | string;
}): SupportOrderOption {
  return {
    key: `${row.record_kind}:${row.id}`,
    label: [
      platformDisplayName(row.platform),
      row.platform_order_id
        ? `#${row.platform_order_id}`
        : `mua ngày ${ORDER_OPTION_DATE.format(new Date(row.purchased_at ?? row.created_at))}`,
      row.product_name
        ? row.product_name.length > 48
          ? `${row.product_name.slice(0, 47)}…`
          : row.product_name
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Danh sách đơn (50 gần nhất) để người dùng chọn trong form hỗ trợ. */
export async function listSupportOrderOptions(
  db: Database,
  config: AppConfig,
  userId: string,
): Promise<SupportOrderOption[]> {
  const businessConfig = await getBusinessConfig(db, config);
  const history = await listOrderHistory(db, {
    userId,
    status: "ALL",
    released: "ALL",
    searchTerm: "",
    attributionDays: businessConfig.affiliateAttributionDays,
    limit: 50,
  });
  return history.map(toSupportOrderOption);
}
