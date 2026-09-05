import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";

type Fetcher = typeof fetch;

const LAZADA_TEMPLATE_ADD =
  "https://adsense.lazada.vn/subId-templates/add.json";
const LAZADA_TEMPLATE_LIST =
  "https://adsense.lazada.vn/subId-templates/list.json";
const LAZADA_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

function lazadaHeaders(cookie: string, withBody: boolean): Record<string, string> {
  return {
    ...(withBody ? { "content-type": "application/json" } : {}),
    accept: "application/json, text/plain, */*",
    origin: "https://adsense.lazada.vn",
    referer: "https://adsense.lazada.vn/index.htm",
    "user-agent": LAZADA_UA,
    platform: "desktop",
    cookie,
  };
}

interface SubIdTemplate {
  subIdKey?: string;
  extraParam?: { subId1?: string } & Record<string, unknown>;
}

/**
 * Lấy `subIdTemplateKey` của Lazada cho một giá trị subId1 (thường là
 * `u<tracking_code>` của người mua). Có cache trong `lazada_subid_templates`;
 * nếu chưa có thì tạo template mới (add.json) rồi tra key qua list.json, lưu lại.
 *
 * Trả về `null` khi không có cookie hoặc Lazada từ chối — khi đó link vẫn sinh
 * bình thường (đúng tài khoản) nhưng KHÔNG kèm subid đối soát; lần mua sau (khi
 * cookie tốt) sẽ tạo được và cache lại.
 */
export async function getLazadaSubIdKey(
  db: Database,
  _config: AppConfig,
  subId1: string,
  cookie: string | null,
  fetcher: Fetcher,
): Promise<string | null> {
  const cached = await query<{ subid_key: string }>(
    db,
    "SELECT subid_key FROM lazada_subid_templates WHERE subid1 = $1",
    [subId1],
  );
  if (cached.rows[0]?.subid_key) return cached.rows[0].subid_key;
  if (!cookie) return null;

  try {
    // 1) Tạo template mang subId1 = <giá trị>. add.json chỉ trả success, KHÔNG có key.
    await fetcher(LAZADA_TEMPLATE_ADD, {
      method: "POST",
      headers: lazadaHeaders(cookie, true),
      body: JSON.stringify({
        extraParam: {
          linkFormat: "2",
          subAffId: "shoptik",
          subId1,
          subId2: "",
          subId3: "",
          subId4: "",
          subId5: "",
          subId6: "",
        },
      }),
    });

    // 2) Tra key: list.json (GET) trả data.subIdList[], khớp theo extraParam.subId1.
    const res = await fetcher(LAZADA_TEMPLATE_LIST, {
      headers: lazadaHeaders(cookie, false),
    });
    const json = (await res.json().catch(() => null)) as
      | { data?: { subIdList?: SubIdTemplate[] } }
      | null;
    const list = json?.data?.subIdList ?? [];
    const item = list.find((it) => it?.extraParam?.subId1 === subId1);
    const key = item?.subIdKey;
    if (!key) return null;

    await query(
      db,
      `INSERT INTO lazada_subid_templates (subid1, subid_key)
       VALUES ($1, $2)
       ON CONFLICT (subid1) DO UPDATE SET subid_key = EXCLUDED.subid_key`,
      [subId1, key],
    );
    return key;
  } catch {
    return null;
  }
}
