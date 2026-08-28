import http from "node:http";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import {
  OFFER_PAGE_SIZE,
  SHOPEE_OFFER_API_PATH,
  SHOPEE_OFFER_FOR_ME_URL,
  SHOPEE_OFFER_PAGE_URL,
  parseShopeeOfferPage,
  saveOfferPage,
} from "./discover-harvest.js";

/**
 * Điều khiển TRỰC TIẾP profile Browser Control qua CDP — server tự lái trình
 * duyệt, KHÔNG cần tiến trình worker riêng. Đã kiểm chứng chạy được cả khi
 * server ở trong Docker: gọi Browser Control qua host.docker.internal, các
 * endpoint HTTP của CDP cần Host header = 127.0.0.1 (Chrome chặn host lạ),
 * còn WebSocket CDP thì kết nối thẳng host.docker.internal được.
 *
 * Lấy trang bằng fetch() NGAY TRONG TRANG (phiên đăng nhập của profile) với
 * page_offset cụ thể — đã đo thực tế: offset 0/20/40 ra đúng ba trang khác
 * nhau, nên không cần mô phỏng click phân trang như worker.
 */

const AFFILIATE_ORIGIN = "https://affiliate.shopee.vn";

function bcOrigin(config: AppConfig): { base: string; host: string } {
  const base = config.BROWSER_CONTROL_URL.replace(/\/$/, "");
  const host = new URL(base).hostname;
  return { base, host };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gọi HTTP API của Browser Control (host.docker.internal:9222). */
async function bc(
  config: AppConfig,
  route: string,
  init?: RequestInit,
): Promise<any> {
  const { base } = bcOrigin(config);
  const res = await fetch(`${base}${route}`, {
    headers: { "content-type": "application/json", accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError(
      "BROWSER_CONTROL_ERROR",
      `Browser Control ${route}: HTTP ${res.status} ${text.slice(0, 160)}`,
      502,
    );
  }
  return res.json().catch(() => null);
}

/**
 * GET một endpoint HTTP của CDP (/json/list…) với Host header = 127.0.0.1:port
 * để vượt kiểm tra host của Chrome khi gọi từ ngoài loopback (Docker).
 */
function cdpHttpGet(
  cdpHost: string,
  port: number,
  path: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: cdpHost, port, path, headers: { Host: `127.0.0.1:${port}` } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`CDP ${path}: phản hồi không phải JSON`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error(`CDP ${path}: timeout`)));
    req.end();
  });
}

/** Chạy MỘT lệnh Runtime.evaluate qua WebSocket CDP, trả về giá trị JS. */
function cdpEvaluate(
  wsUrl: string,
  expression: string,
  timeoutMs = 45_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const done = (fn: () => void) => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      fn();
    };
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String((event as MessageEvent).data));
      } catch {
        return;
      }
      if (msg.id !== 1) return;
      if (msg.error) return done(() => reject(new Error(`CDP: ${msg.error.message}`)));
      const ex = msg.result?.exceptionDetails;
      if (ex) {
        const detail = ex.exception?.description || ex.text || "lỗi trong trang";
        return done(() => reject(new Error(String(detail).slice(0, 200))));
      }
      done(() => resolve(msg.result?.result?.value));
    };
    ws.onerror = () => done(() => reject(new Error("Không kết nối được CDP của profile.")));
    setTimeout(() => done(() => reject(new Error("CDP timeout."))), timeoutMs);
  });
}

/** Start profile nếu chưa chạy, trả về host+port CDP đã đổi về host của Docker. */
async function ensureProfileRunning(
  config: AppConfig,
  profileId: string,
): Promise<{ cdpHost: string; cdpPort: number }> {
  let profile = await bc(config, `/api/profiles/${profileId}`).catch((e) => {
    if (String(e?.message || e).includes("404")) {
      throw new AppError(
        "PROFILE_NOT_FOUND_BC",
        "Profile ID không tồn tại trong Browser Control — kiểm tra lại Profile ID.",
        400,
      );
    }
    throw e;
  });
  const ready = (p: any) => p?.status === "running" && p?.cdp_url;
  if (!ready(profile)) {
    profile = await bc(config, `/api/profiles/${profileId}/start`, { method: "POST" });
    for (let i = 0; i < 20 && !ready(profile); i += 1) {
      await sleep(1000);
      profile = await bc(config, `/api/profiles/${profileId}`).catch(() => profile);
    }
  }
  if (!ready(profile)) {
    throw new AppError(
      "PROFILE_START_FAILED",
      "Browser Control không mở được profile (không có cdp_url).",
      502,
    );
  }
  const { host } = bcOrigin(config);
  const port = Number(String(profile.cdp_url).match(/:(\d+)/)?.[1]);
  return { cdpHost: host, cdpPort: port };
}

/** Chọn tab affiliate.shopee.vn (mở nếu chưa có), trả về webSocketDebuggerUrl. */
async function ensureAffiliateTab(
  config: AppConfig,
  profileId: string,
  cdpHost: string,
  cdpPort: number,
  pageUrl: string,
): Promise<string> {
  const pickTab = async (): Promise<any> => {
    const targets: any[] = await cdpHttpGet(cdpHost, cdpPort, "/json/list");
    const pages = targets.filter(
      (t) => t.type === "page" && t.webSocketDebuggerUrl,
    );
    return (
      pages.find((t) => String(t.url || "").startsWith(AFFILIATE_ORIGIN)) ??
      pages[0] ??
      null
    );
  };
  let tab = await pickTab().catch(() => null);
  if (!tab || !String(tab.url || "").startsWith(AFFILIATE_ORIGIN)) {
    await bc(config, `/api/profiles/${profileId}/goto`, {
      method: "POST",
      body: JSON.stringify({ url: pageUrl }),
    });
    await sleep(3500);
    tab = await pickTab();
  }
  if (!tab?.webSocketDebuggerUrl) {
    throw new AppError(
      "NO_TAB",
      "Không mở được tab affiliate.shopee.vn trong profile.",
      502,
    );
  }
  // cdp_url dùng 127.0.0.1 → đổi sang host của Docker để container kết nối được.
  return String(tab.webSocketDebuggerUrl).replace("127.0.0.1", cdpHost);
}

function offerPageUrl(listType: number): string {
  return listType === 8 ? SHOPEE_OFFER_FOR_ME_URL : SHOPEE_OFFER_PAGE_URL;
}

/** fetch() một trang offer NGAY TRONG TRANG bằng phiên đăng nhập của profile. */
async function fetchOfferPageInPage(
  wsUrl: string,
  listType: number,
  pageNo: number,
): Promise<any> {
  const offset = (pageNo - 1) * OFFER_PAGE_SIZE;
  const url = `${AFFILIATE_ORIGIN}${SHOPEE_OFFER_API_PATH}&list_type=${listType}&page_offset=${offset}&page_limit=${OFFER_PAGE_SIZE}`;
  const expr = `fetch(${JSON.stringify(url)},{credentials:"include",headers:{accept:"application/json"}}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.text();})`;
  const text = await cdpEvaluate(wsUrl, expr);
  return JSON.parse(String(text));
}

export interface DirectFetchResult {
  savedPages: number;
  savedItems: number;
  stoppedAt: number | null;
  note: string | null;
}

/**
 * ĐIỀU KHIỂN TRỰC TIẾP: lấy dải trang [fromPage..toPage] của một danh mục và
 * lưu vào kho. Không dùng worker, không hàng đợi — chạy tại chỗ.
 */
export async function directFetchOfferRange(
  db: Database,
  config: AppConfig,
  input: { profileId: string; listType: number; fromPage: number; toPage: number },
): Promise<DirectFetchResult> {
  const { profileId, listType } = input;
  const fromPage = Math.max(1, input.fromPage);
  const toPage = Math.max(fromPage, input.toPage);

  const { cdpHost, cdpPort } = await ensureProfileRunning(config, profileId);
  const wsUrl = await ensureAffiliateTab(
    config,
    profileId,
    cdpHost,
    cdpPort,
    offerPageUrl(listType),
  );

  let savedPages = 0;
  let savedItems = 0;
  let stoppedAt: number | null = null;
  let note: string | null = null;

  for (let pageNo = fromPage; pageNo <= toPage; pageNo += 1) {
    let data: any;
    try {
      data = await fetchOfferPageInPage(wsUrl, listType, pageNo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (pageNo === fromPage) {
        throw new AppError(
          "DIRECT_FETCH_FAILED",
          `Lấy trang ${pageNo} lỗi: ${message}. Profile có thể cần đăng nhập lại Shopee.`,
          502,
        );
      }
      stoppedAt = pageNo;
      note = `Dừng ở trang ${pageNo}: ${message}`;
      break;
    }
    if (data?.code !== 0) {
      if (pageNo === fromPage) {
        throw new AppError(
          "SHOPEE_REJECTED",
          `Shopee từ chối (code=${data?.code}). Profile có thể cần đăng nhập lại.`,
          502,
        );
      }
      stoppedAt = pageNo;
      note = `Shopee từ chối ở trang ${pageNo} (code=${data?.code}).`;
      break;
    }
    const products = parseShopeeOfferPage(data);
    await saveOfferPage(db, listType, pageNo, products);
    savedPages += 1;
    savedItems += products.length;
    if (products.length < OFFER_PAGE_SIZE) {
      stoppedAt = pageNo;
      note = `Hết danh sách ở trang ${pageNo} (chỉ ${products.length} sản phẩm).`;
      break;
    }
    await sleep(400);
  }

  // Ghi mốc lấy gần nhất cho profile để trang hiển thị.
  await query(
    db,
    `UPDATE harvest_profiles
     SET status = 'READY', last_fetch_at = now(), last_status = 'OK',
         last_error = NULL, last_fetched_count = $2, updated_at = now()
     WHERE id = $1`,
    [profileId, savedItems],
  );

  return { savedPages, savedItems, stoppedAt, note };
}
