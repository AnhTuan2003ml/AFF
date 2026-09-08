import { query, withTransaction, type Database, type Transaction } from "../db.js";

export interface EntryPromoItem {
  id: string;
  type: string;
  title: string;
  description: string;
  targetUrl: string | null;
  imageUrl: string;
  badge: string | null;
}

export interface EntryPromoResult {
  promo: EntryPromoItem | null;
  rotationKey: string | null;
  rotationMinutes: number;
}

export interface EntryPromoOverview {
  rotationMinutes: number;
  selectedCount: number;
  currentContentItemId: string | null;
  currentTitle: string | null;
  currentStartedAt: Date | null;
  nextRotationAt: Date | null;
}

interface PromoRow {
  id: string;
  type: string;
  title: string;
  description: string;
  target_url: string | null;
  image_url: string;
  badge: string | null;
}

interface SettingsRow {
  rotation_minutes: number;
  current_content_item_id: string | null;
  current_started_at: Date | null;
}

function mapPromo(row: PromoRow): EntryPromoItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    targetUrl: row.target_url,
    imageUrl: row.image_url,
    badge: row.badge,
  };
}

function rotationKey(itemId: string, startedAt: Date): string {
  return `${itemId}:${startedAt.toISOString()}`;
}

async function resolveActiveCurrent(
  db: Database | Transaction,
  settings: SettingsRow,
  now: Date,
): Promise<EntryPromoResult | null> {
  if (!settings.current_content_item_id || !settings.current_started_at) {
    return null;
  }
  const elapsedMs = now.getTime() - settings.current_started_at.getTime();
  if (elapsedMs >= settings.rotation_minutes * 60_000) return null;

  const current = await query<PromoRow>(
    db,
    `
      SELECT id, type, title, description, target_url, image_url, badge
      FROM content_items
      WHERE id = $1
        AND entry_promo_enabled = true
        AND status = 'PUBLISHED'
        AND COALESCE(NULLIF(trim(image_url), ''), '') <> ''
    `,
    [settings.current_content_item_id],
  );
  if (!current.rows[0]) return null;
  return {
    promo: mapPromo(current.rows[0]),
    rotationKey: rotationKey(current.rows[0].id, settings.current_started_at),
    rotationMinutes: settings.rotation_minutes,
  };
}

/**
 * Trả về một quảng cáo ổn định trong cả chu kỳ. Khi đến hạn, chọn ngẫu nhiên
 * trong kho admin đã bật và ưu tiên mục khác quảng cáo vừa hết hạn.
 */
export async function resolveEntryPromo(
  db: Database,
  now = new Date(),
): Promise<EntryPromoResult> {
  // Đường đọc phổ biến không khóa: trong cả chu kỳ chỉ cần đọc cấu hình và
  // quảng cáo hiện tại. Chỉ request đầu tiên khi hết hạn mới vào transaction.
  const initialSettings = await query<SettingsRow>(
    db,
    `SELECT rotation_minutes, current_content_item_id, current_started_at
     FROM entry_promo_settings WHERE id = true`,
  );
  const active = await resolveActiveCurrent(db, initialSettings.rows[0]!, now);
  if (active) return active;

  return withTransaction(db, async (client) => {
    const settingsResult = await query<SettingsRow>(
      client,
      `
        SELECT rotation_minutes, current_content_item_id, current_started_at
        FROM entry_promo_settings
        WHERE id = true
        FOR UPDATE
      `,
    );
    const settings = settingsResult.rows[0]!;
    // Request khác có thể vừa xoay xong trong lúc chờ khóa; đọc lại để không
    // chọn thêm một sản phẩm lần nữa ở cùng mốc.
    const refreshedActive = await resolveActiveCurrent(client, settings, now);
    if (refreshedActive) return refreshedActive;

    const next = await query<PromoRow>(
      client,
      `
        SELECT id, type, title, description, target_url, image_url, badge
        FROM content_items
        WHERE entry_promo_enabled = true
          AND status = 'PUBLISHED'
          AND COALESCE(NULLIF(trim(image_url), ''), '') <> ''
        ORDER BY
          CASE WHEN id = $1::uuid THEN 1 ELSE 0 END,
          random()
        LIMIT 1
      `,
      [settings.current_content_item_id],
    );
    const promo = next.rows[0];
    if (!promo) {
      await query(
        client,
        `UPDATE entry_promo_settings
         SET current_content_item_id = NULL, current_started_at = NULL
         WHERE id = true`,
      );
      return {
        promo: null,
        rotationKey: null,
        rotationMinutes: settings.rotation_minutes,
      };
    }

    await query(
      client,
      `
        UPDATE entry_promo_settings
        SET current_content_item_id = $1, current_started_at = $2
        WHERE id = true
      `,
      [promo.id, now],
    );
    return {
      promo: mapPromo(promo),
      rotationKey: rotationKey(promo.id, now),
      rotationMinutes: settings.rotation_minutes,
    };
  });
}

export async function getEntryPromoOverview(
  db: Database,
): Promise<EntryPromoOverview> {
  const result = await query<{
    rotation_minutes: number;
    selected_count: string;
    current_content_item_id: string | null;
    current_title: string | null;
    current_started_at: Date | null;
  }>(
    db,
    `
      SELECT s.rotation_minutes,
        (SELECT count(*) FROM content_items
          WHERE entry_promo_enabled = true
            AND status = 'PUBLISHED'
            AND COALESCE(NULLIF(trim(image_url), ''), '') <> '')::text
          AS selected_count,
        s.current_content_item_id,
        c.title AS current_title,
        s.current_started_at
      FROM entry_promo_settings s
      LEFT JOIN content_items c
        ON c.id = s.current_content_item_id
        AND c.entry_promo_enabled = true
        AND c.status = 'PUBLISHED'
        AND COALESCE(NULLIF(trim(c.image_url), ''), '') <> ''
      WHERE s.id = true
    `,
  );
  const row = result.rows[0]!;
  const currentStartedAt = row.current_title ? row.current_started_at : null;
  return {
    rotationMinutes: row.rotation_minutes,
    selectedCount: Number(row.selected_count),
    currentContentItemId: row.current_title ? row.current_content_item_id : null,
    currentTitle: row.current_title,
    currentStartedAt,
    nextRotationAt: currentStartedAt
      ? new Date(currentStartedAt.getTime() + row.rotation_minutes * 60_000)
      : null,
  };
}

export async function updateEntryPromoRotation(
  db: Database,
  rotationMinutes: number,
  updatedBy: string,
): Promise<void> {
  await query(
    db,
    `
      UPDATE entry_promo_settings
      SET rotation_minutes = $1, updated_at = now(), updated_by = $2
      WHERE id = true
    `,
    [rotationMinutes, updatedBy],
  );
}

export type EntryPromoSelectionResult =
  | "UPDATED"
  | "NOT_FOUND"
  | "IMAGE_REQUIRED";

export async function setEntryPromoSelection(
  db: Database,
  contentItemId: string,
  enabled: boolean,
): Promise<EntryPromoSelectionResult> {
  return withTransaction(db, async (client) => {
    const found = await query<{ image_url: string | null }>(
      client,
      "SELECT image_url FROM content_items WHERE id = $1 FOR UPDATE",
      [contentItemId],
    );
    const item = found.rows[0];
    if (!item) return "NOT_FOUND";
    if (enabled && !item.image_url?.trim()) return "IMAGE_REQUIRED";

    await query(
      client,
      "UPDATE content_items SET entry_promo_enabled = $2 WHERE id = $1",
      [contentItemId, enabled],
    );
    if (!enabled) {
      await query(
        client,
        `
          UPDATE entry_promo_settings
          SET current_content_item_id = NULL, current_started_at = NULL
          WHERE id = true AND current_content_item_id = $1
        `,
        [contentItemId],
      );
    }
    return "UPDATED";
  });
}
