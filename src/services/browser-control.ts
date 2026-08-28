import http from "node:http";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import {
  HOT_DEALS_LIST_TYPE,
  OFFER_PAGE_SIZE,
  SHOPEE_OFFER_FOR_ME_URL,
  SHOPEE_OFFER_PAGE_URL,
  parseShopeeMicrositeItems,
  parseShopeeOfferPage,
  saveOfferPage,
  type HarvestedProduct,
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

/**
 * Phiên CDP BỀN tới tab affiliate: gửi lệnh (Runtime.evaluate,
 * Network.getResponseBody…) VÀ lắng nghe Network để gom response
 * `offer/product/list` theo (list_type, page_offset). Đúng cách worker làm —
 * vì với danh mục Đề xuất, Shopee phân trang bằng click chứ không nhận
 * page_offset qua fetch tay.
 */
interface CdpSession {
  evaluate(expression: string, timeoutMs?: number): Promise<unknown>;
  hasOffer(listType: number, offset: number): boolean;
  getOfferData(listType: number, offset: number): Promise<any>;
  waitForOfferPage(timeoutMs?: number): Promise<boolean>;
  reloadOffer(url: string): Promise<void>;
  /** Tất cả requestId của response microsite/get_collection_items đã bắt. */
  micrositeRequestIds(): string[];
  getBody(requestId: string): Promise<any>;
  /** Đưa tab ra trước để trang render + lazy-load khi cuộn (tab nền bị throttle). */
  bringToFront(): Promise<void>;
  close(): void;
}

function openCdpSession(wsUrl: string): Promise<CdpSession> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const pending = new Map<number, (msg: any) => void>();
    const offerByKey = new Map<string, { requestId: string }>();
    const micrositeIds: string[] = [];
    const keyOf = (listType: number, offset: number) => `${listType}:${offset}`;

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String((event as MessageEvent).data));
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
        return;
      }
      if (msg.method === "Network.responseReceived") {
        const url = String(msg.params?.response?.url || "");
        if (url.includes("/api/v3/offer/product/list")) {
          const listType = Number(url.match(/list_type=(\d+)/)?.[1] ?? -1);
          const offset = Number(url.match(/page_offset=(\d+)/)?.[1] ?? -1);
          if (listType >= 0 && offset >= 0) {
            offerByKey.set(keyOf(listType, offset), {
              requestId: msg.params.requestId,
            });
          }
        } else if (url.includes("/api/v4/microsite/get_collection_items")) {
          micrositeIds.push(msg.params.requestId);
        }
      }
    };

    const command = (method: string, params?: any, timeoutMs = 30_000) =>
      new Promise<any>((res, rej) => {
        const id = ++seq;
        pending.set(id, (msg) =>
          msg.error
            ? rej(new Error(`CDP ${method}: ${msg.error.message}`))
            : res(msg.result),
        );
        ws.send(JSON.stringify({ id, method, params: params || {} }));
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rej(new Error(`CDP timeout: ${method}`));
          }
        }, timeoutMs);
      });

    const session: CdpSession = {
      async evaluate(expression, timeoutMs) {
        const result = await command(
          "Runtime.evaluate",
          { expression, awaitPromise: true, returnByValue: true },
          timeoutMs,
        );
        if (result?.exceptionDetails) {
          const ex = result.exceptionDetails;
          throw new Error(
            String(ex.exception?.description || ex.text || "lỗi trong trang").slice(0, 200),
          );
        }
        return result?.result?.value;
      },
      hasOffer(listType, offset) {
        return offerByKey.has(keyOf(listType, offset));
      },
      async getOfferData(listType, offset) {
        const entry = offerByKey.get(keyOf(listType, offset));
        if (!entry) return null;
        const body = await command("Network.getResponseBody", {
          requestId: entry.requestId,
        }).catch(() => null);
        if (!body?.body) return null;
        try {
          const raw = body.base64Encoded
            ? Buffer.from(body.body, "base64").toString("utf8")
            : body.body;
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      async waitForOfferPage(timeoutMs = 15_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const ready = await this.evaluate(
            `document.readyState === "complete" && !!document.querySelector(".PaginationNoTotal__wrap")`,
            4000,
          ).catch(() => false);
          if (ready) return true;
          await sleep(600);
        }
        return false;
      },
      async reloadOffer(url) {
        await this.evaluate(`location.assign(${JSON.stringify(url)})`).catch(() => {});
        await this.waitForOfferPage();
        await sleep(2500);
      },
      micrositeRequestIds() {
        return [...micrositeIds];
      },
      async bringToFront() {
        await command("Page.enable").catch(() => {});
        await command("Page.bringToFront").catch(() => {});
      },
      async getBody(requestId) {
        const body = await command("Network.getResponseBody", { requestId }).catch(
          () => null,
        );
        if (!body?.body) return null;
        try {
          const raw = body.base64Encoded
            ? Buffer.from(body.body, "base64").toString("utf8")
            : body.body;
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      close() {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      },
    };

    ws.onopen = async () => {
      try {
        await command("Network.enable");
        resolve(session);
      } catch (e) {
        reject(e);
      }
    };
    ws.onerror = () => reject(new Error("Không kết nối được CDP của profile."));
    setTimeout(() => reject(new Error("CDP timeout khi kết nối.")), 12_000);
  });
}

// Tab UI theo list_type (nhận cả tiếng Việt lẫn tiếng Anh). list_type=8 ở trang
// riêng offer_for_me → không có tab.
const TAB_BY_LIST_TYPE: Record<number, string[] | null> = {
  0: ["Tất cả", "All"],
  2: ["Bán chạy nhất", "Top Performing"],
  8: null,
};

/** Click tab danh mục; "ACTIVE" nếu đã đứng sẵn, "NO_TAB_NEEDED" nếu trang riêng. */
async function selectListTab(session: CdpSession, listType: number): Promise<string> {
  const tabNames =
    listType in TAB_BY_LIST_TYPE ? TAB_BY_LIST_TYPE[listType] : ["Tất cả", "All"];
  if (tabNames === null) return "NO_TAB_NEEDED";
  return String(
    await session.evaluate(
      `(() => {
        const want = ${JSON.stringify(tabNames)};
        const tabs = [...document.querySelectorAll(".rc-tabs-tab")];
        const tab = tabs.find((el) => want.includes(el.textContent.trim()));
        if (!tab) return "NO_TAB";
        if (tab.classList.contains("rc-tabs-tab-active")) return "ACTIVE";
        (tab.querySelector(".rc-tabs-tab-btn") || tab).click();
        return "CLICKED";
      })()`,
    ),
  );
}

/** Một bước điều hướng: click số trang đích, hoặc nhảy tới số lớn nhất/next. */
async function paginationStep(
  session: CdpSession,
  targetPage: number,
): Promise<{ state: string; active?: number }> {
  return (await session.evaluate(
    `(() => {
      const wrap = document.querySelector(".PaginationNoTotal__wrap");
      if (!wrap) return { state: "NO_PAGINATION" };
      wrap.scrollIntoView({ block: "center" });
      const pages = [...wrap.querySelectorAll(".page-page")];
      const nums = pages.map((el) => Number(el.textContent.trim())).filter(Number.isFinite);
      const active = Number(wrap.querySelector(".page-page.active")?.textContent.trim() || "0");
      const target = ${Number(targetPage)};
      if (active === target) return { state: "ARRIVED", active };
      const targetEl = pages.find((el) => Number(el.textContent.trim()) === target);
      if (targetEl) { targetEl.click(); return { state: "CLICKED_PAGE", active }; }
      if (nums.length && target > Math.max(...nums)) {
        const next = wrap.querySelector(".page-next");
        if (!next || next.className.includes("disabled")) return { state: "END", active };
        const maxNum = Math.max(...nums);
        const jump = pages.find((el) => Number(el.textContent.trim()) === maxNum && !el.classList.contains("active"));
        if (jump) { jump.click(); return { state: "CLICKED_JUMP", active }; }
        next.click();
        return { state: "CLICKED_NEXT", active };
      }
      const prev = wrap.querySelector(".page-prev");
      if (prev && !prev.className.includes("disabled")) { prev.click(); return { state: "CLICKED_PREV", active }; }
      return { state: "STUCK", active };
    })()`,
  )) as { state: string; active?: number };
}

/**
 * Lấy MỘT trang bằng thao tác thật: chọn tab danh mục, click số trang tương
 * ứng, rồi hứng response Network `list_type=<t>&page_offset=(pageNo-1)*20`.
 */
async function capturePageByClick(
  session: CdpSession,
  listType: number,
  pageNo: number,
): Promise<any> {
  const offset = (pageNo - 1) * OFFER_PAGE_SIZE;

  const tabResult = await selectListTab(session, listType);
  if (tabResult === "NO_TAB") {
    throw new Error("Không thấy tab danh mục — profile có thể cần đăng nhập lại.");
  }
  if (tabResult === "CLICKED") {
    for (let wait = 0; wait < 12 && !session.hasOffer(listType, 0); wait += 1) {
      await sleep(700);
    }
  }

  if (!session.hasOffer(listType, offset)) {
    for (let step = 0; step < 60 && !session.hasOffer(listType, offset); step += 1) {
      const result = await paginationStep(session, pageNo);
      if (result.state === "NO_PAGINATION") {
        throw new Error("Không thấy khối phân trang trên trang offer.");
      }
      if (result.state === "END") {
        throw new Error(`Danh sách không có tới trang ${pageNo}.`);
      }
      if (result.state === "STUCK") {
        throw new Error("Không điều hướng được phân trang.");
      }
      if (result.state === "ARRIVED" && session.hasOffer(listType, offset)) break;
      for (let wait = 0; wait < 8 && !session.hasOffer(listType, offset); wait += 1) {
        await sleep(700);
      }
    }
  }

  const data = await session.getOfferData(listType, offset);
  if (!data) {
    throw new Error(`Không bắt được response trang ${pageNo}.`);
  }
  if (data.code !== 0) {
    throw new Error(
      `Shopee từ chối (code=${data.code}) — profile có thể cần đăng nhập lại.`,
    );
  }
  return data;
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

/** Chọn tab thuộc `origin` (mở nếu chưa có), trả về webSocketDebuggerUrl. */
async function ensureTabForOrigin(
  config: AppConfig,
  profileId: string,
  cdpHost: string,
  cdpPort: number,
  origin: string,
  pageUrl: string,
): Promise<string> {
  const pickTab = async (): Promise<any> => {
    const targets: any[] = await cdpHttpGet(cdpHost, cdpPort, "/json/list");
    const pages = targets.filter(
      (t) => t.type === "page" && t.webSocketDebuggerUrl,
    );
    return (
      pages.find((t) => String(t.url || "").startsWith(origin)) ??
      pages[0] ??
      null
    );
  };
  let tab = await pickTab().catch(() => null);
  if (!tab || !String(tab.url || "").startsWith(origin)) {
    await bc(config, `/api/profiles/${profileId}/goto`, {
      method: "POST",
      body: JSON.stringify({ url: pageUrl }),
    });
    await sleep(3500);
    tab = await pickTab();
  }
  if (!tab?.webSocketDebuggerUrl) {
    throw new AppError("NO_TAB", `Không mở được tab ${origin} trong profile.`, 502);
  }
  // cdp_url dùng 127.0.0.1 → đổi sang host của Docker để container kết nối được.
  return String(tab.webSocketDebuggerUrl).replace("127.0.0.1", cdpHost);
}

/** Tab affiliate.shopee.vn — dùng cho luồng lấy sản phẩm offer. */
function ensureAffiliateTab(
  config: AppConfig,
  profileId: string,
  cdpHost: string,
  cdpPort: number,
  pageUrl: string,
): Promise<string> {
  return ensureTabForOrigin(
    config,
    profileId,
    cdpHost,
    cdpPort,
    AFFILIATE_ORIGIN,
    pageUrl,
  );
}

function offerPageUrl(listType: number): string {
  return listType === 8 ? SHOPEE_OFFER_FOR_ME_URL : SHOPEE_OFFER_PAGE_URL;
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

  const pageUrl = offerPageUrl(listType);
  const { cdpHost, cdpPort } = await ensureProfileRunning(config, profileId);
  const wsUrl = await ensureAffiliateTab(config, profileId, cdpHost, cdpPort, pageUrl);

  let savedPages = 0;
  let savedItems = 0;
  let stoppedAt: number | null = null;
  let note: string | null = null;

  const session = await openCdpSession(wsUrl);
  try {
    // Reload trang offer TRONG phiên (Network đã bật) để bắt trọn trang 1 của
    // tab mặc định, rồi click phân trang tới từng trang cần lấy.
    await session.reloadOffer(pageUrl);
    for (let pageNo = fromPage; pageNo <= toPage; pageNo += 1) {
      let data: any;
      try {
        data = await capturePageByClick(session, listType, pageNo);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (pageNo === fromPage) {
          throw new AppError(
            "DIRECT_FETCH_FAILED",
            `Lấy trang ${pageNo} lỗi: ${message}`,
            502,
          );
        }
        stoppedAt = pageNo;
        note = `Dừng ở trang ${pageNo}: ${message}`;
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
      await sleep(800);
    }
  } finally {
    session.close();
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

const HOT_DEALS_URL = "https://shopee.vn/m/ma-giam-gia";
const SHOPEE_ORIGIN = "https://shopee.vn";

export interface HotDealsResult {
  savedPages: number;
  savedItems: number;
  collections: number;
}

/**
 * ĐIỀU KHIỂN TRỰC TIẾP: mở shopee.vn/m/ma-giam-gia bằng profile, cuộn trang để
 * kích các khối voucher tải thêm, bắt TẤT CẢ response
 * microsite/get_collection_items, parse sản phẩm giá voucher và lưu vào kho
 * HOT (list_type=99) — mọi luồng discover đọc chung từ đây.
 */
export async function directFetchHotDeals(
  db: Database,
  config: AppConfig,
  input: { profileId: string; maxItems?: number },
): Promise<HotDealsResult> {
  const maxItems = Math.min(Math.max(input.maxItems ?? 200, 20), 1000);
  const { cdpHost, cdpPort } = await ensureProfileRunning(config, input.profileId);
  const wsUrl = await ensureTabForOrigin(
    config,
    input.profileId,
    cdpHost,
    cdpPort,
    SHOPEE_ORIGIN,
    HOT_DEALS_URL,
  );

  const session = await openCdpSession(wsUrl);
  try {
    // Tab đã ở trang voucher (ensureTabForOrigin goto). Đưa ra trước (tab nền
    // bị throttle, không lazy-load), chờ render rồi CUỘN TĂNG DẦN — mỗi khối
    // voucher lazy-load get_collection_items khi cuộn tới.
    await session.bringToFront();
    // LUÔN nạp lại trang từ đầu: tab tái dùng có thể đã cuộn hết, không lazy-load
    // thêm. Reload rồi cuộn từ trên xuống mới kích get_collection_items.
    await session.evaluate(`location.replace(${JSON.stringify(HOT_DEALS_URL)})`).catch(() => {});
    await sleep(5000);
    const needBatches = Math.ceil(maxItems / 20) + 2;
    for (let i = 0; i < 20; i += 1) {
      await session.evaluate(`window.scrollBy(0, 2000)`).catch(() => {});
      await sleep(1500);
      if (session.micrositeRequestIds().length >= needBatches) break;
    }
    await sleep(1500);

    // Gom tất cả body microsite đã bắt, parse + dedupe theo item_id.
    const ids = session.micrositeRequestIds();
    const seen = new Set<string>();
    const products: HarvestedProduct[] = [];
    let collections = 0;
    for (const id of ids) {
      const body = await session.getBody(id);
      if (!body) continue;
      collections += 1;
      for (const p of parseShopeeMicrositeItems(body)) {
        if (seen.has(p.itemId)) continue;
        seen.add(p.itemId);
        products.push(p);
        if (products.length >= maxItems) break;
      }
      if (products.length >= maxItems) break;
    }

    // Lưu theo trang 20 sản phẩm vào list_type HOT (xóa dữ liệu cũ ở các trang
    // sẽ ghi đè để kho HOT luôn tươi theo lần lấy mới nhất).
    let savedPages = 0;
    for (let i = 0; i < products.length; i += OFFER_PAGE_SIZE) {
      const pageNo = savedPages + 1;
      await saveOfferPage(
        db,
        HOT_DEALS_LIST_TYPE,
        pageNo,
        products.slice(i, i + OFFER_PAGE_SIZE),
      );
      savedPages += 1;
    }

    await query(
      db,
      `UPDATE harvest_profiles
       SET last_fetch_at = now(), last_status = 'OK', last_error = NULL,
           updated_at = now()
       WHERE id = $1`,
      [input.profileId],
    );

    return { savedPages, savedItems: products.length, collections };
  } finally {
    session.close();
  }
}
