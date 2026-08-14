// Profile-worker: chạy TRÊN MÁY HOST, điều khiển trình duyệt qua ứng dụng
// "Browser Control" (http://127.0.0.1:9222 — xem /api-docs). KHÔNG dùng
// Playwright; chỉ cần Node 22+ (fetch + WebSocket có sẵn).
//
// Nhận lệnh từ server ShopTik qua /api/v1/harvest/*:
// - LOGIN: start profile trong Browser Control (cửa sổ hiện lên cho admin
//   đăng nhập affiliate.shopee.vn), worker tự kiểm tra đã đăng nhập chưa.
// - FETCH: start profile → goto https://affiliate.shopee.vn/offer/product_offer
//   → gọi api/v3/offer/product/list NGAY TRONG TRANG (qua CDP Runtime.evaluate,
//   dùng phiên đăng nhập của profile) → gửi các trang JSON thô về server.
//
// profile_id trong hệ thống ShopTik = profile id của Browser Control.
//
// Cấu hình qua biến môi trường (hoặc ../.env):
//   SERVER_URL            mặc định http://localhost:3000
//   HARVEST_WORKER_TOKEN  bắt buộc, khớp .env của server
//   BROWSER_CONTROL_URL   mặc định http://127.0.0.1:9222

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readEnvFallback(name) {
  try {
    const contents = fs.readFileSync(path.join(here, "..", ".env"), "utf8");
    const match = contents.match(new RegExp(`^${name}=(.+)$`, "m"));
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

const SERVER_URL = (process.env.SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.HARVEST_WORKER_TOKEN || readEnvFallback("HARVEST_WORKER_TOKEN");
const BROWSER_CONTROL_URL = (process.env.BROWSER_CONTROL_URL || "http://127.0.0.1:9222").replace(/\/$/, "");
const POLL_INTERVAL_MS = 5000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const AFFILIATE_ORIGIN = "https://affiliate.shopee.vn";

if (!TOKEN) {
  console.error("Thiếu HARVEST_WORKER_TOKEN (đặt biến môi trường hoặc trong ../.env).");
  process.exit(1);
}
if (typeof WebSocket === "undefined") {
  console.error("Cần Node 22 trở lên (WebSocket có sẵn).");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Server ShopTik

async function api(route, body) {
  const response = await fetch(`${SERVER_URL}/api/v1${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-harvest-token": TOKEN,
      accept: "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${route}: ${message}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Browser Control (http://127.0.0.1:9222/api-docs)

async function bc(route, options = {}) {
  const response = await fetch(`${BROWSER_CONTROL_URL}${route}`, {
    headers: { "content-type": "application/json", accept: "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Browser Control ${route}: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json().catch(() => null);
}

async function getBcProfile(profileId) {
  try {
    return await bc(`/api/profiles/${profileId}`);
  } catch (error) {
    if (String(error.message).includes("404")) {
      throw new Error(
        `Profile ${profileId} không tồn tại trong Browser Control — kiểm tra Profile ID trong trang admin.`,
      );
    }
    throw error;
  }
}

/** Start profile nếu chưa chạy; trả về { cdpUrl, wasRunning }. */
async function ensureProfileRunning(profileId) {
  let profile = await getBcProfile(profileId);
  const wasRunning = profile.status === "running" && profile.cdp_url;
  if (!wasRunning) {
    profile = await bc(`/api/profiles/${profileId}/start`, { method: "POST" });
    await sleep(3000); // chờ trình duyệt mở xong
  }
  if (!profile?.cdp_url) {
    throw new Error("Browser Control không trả về cdp_url sau khi start profile.");
  }
  return { cdpUrl: profile.cdp_url.replace(/\/$/, ""), wasRunning };
}

async function gotoUrl(profileId, url) {
  await bc(`/api/profiles/${profileId}/goto`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

async function stopProfile(profileId) {
  await bc(`/api/profiles/${profileId}/stop`, { method: "POST" }).catch(() => {});
}

// ---------------------------------------------------------------------------
// CDP thuần: chọn tab affiliate.shopee.vn và chạy JS trong trang

async function pickPageTarget(cdpUrl) {
  const targets = await fetch(`${cdpUrl}/json/list`).then((r) => r.json());
  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  return (
    pages.find((t) => (t.url || "").startsWith(AFFILIATE_ORIGIN)) ?? pages[0] ?? null
  );
}

/**
 * Đảm bảo có MỘT tab affiliate.shopee.vn để gọi API. Đã có tab rồi thì dùng
 * lại luôn — không goto nữa (goto của Browser Control mở tab mới, bấm sang
 * trang 2/3/4 sẽ sinh cả loạt tab thừa).
 */
async function ensureAffiliateTab(cdpUrl, profileId, url) {
  const existing = await pickPageTarget(cdpUrl).catch(() => null);
  if (existing && (existing.url || "").startsWith(AFFILIATE_ORIGIN)) return;
  await gotoUrl(profileId, url);
  await sleep(3000);
}

// ---------------------------------------------------------------------------
// Luồng "người thật": click tab danh mục + click số trang trong
// .PaginationNoTotal__wrap, rồi THEO DÕI response ở tầng CDP Network.
//
// Đo thực tế: hook fetch/XHR trong trang KHÔNG bắt được response phân trang
// (Shopee gọi qua cơ chế khác), nhưng CDP Network domain bắt trọn. Click số
// trang N làm app tự phát request `page_offset=(N-1)*20` — đúng data trang N.

// Tab UI ứng với từng list_type (đối chiếu thực tế). list_type=8 (Ưu đãi cho
// tôi) nằm ở trang riêng offer_for_me, KHÔNG có tab → null (bỏ qua click tab).
const TAB_BY_LIST_TYPE = { 0: "Tất cả", 2: "Bán chạy nhất", 8: null };

/** URL trang offer theo list_type (server gửi trong config.pageUrlByListType). */
function offerPageUrlFor(listType, config) {
  var byType = config.pageUrlByListType || {};
  return byType[listType] || config.offerPageUrl;
}

/**
 * Mở một phiên CDP BỀN tới tab affiliate và bật Network domain để gom mọi
 * response `offer/product/list` theo page_offset. Dùng cho cả một job (nhiều
 * lần click/chờ) rồi đóng.
 */
async function openCdpSession(cdpUrl) {
  const target = await pickPageTarget(cdpUrl);
  if (!target) throw new Error("Không tìm thấy tab nào trong profile.");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("Không kết nối được CDP của profile."));
    setTimeout(() => reject(new Error("CDP timeout khi kết nối.")), 10_000);
  });

  let seq = 0;
  const pending = new Map();
  // "listType:offset" -> { requestId, at } — phải phân biệt list_type vì
  // mỗi danh mục đều đánh page_offset từ 0.
  const offerByKey = new Map();
  const keyOf = (listType, offset) => `${listType}:${offset}`;

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (
      msg.method === "Network.responseReceived" &&
      String(msg.params?.response?.url || "").includes("/api/v3/offer/product/list")
    ) {
      const url = msg.params.response.url;
      const listType = Number(url.match(/list_type=(\d+)/)?.[1] ?? -1);
      const offset = Number(url.match(/page_offset=(\d+)/)?.[1] ?? -1);
      if (listType >= 0 && offset >= 0) {
        offerByKey.set(keyOf(listType, offset), {
          requestId: msg.params.requestId,
          at: Date.now(),
        });
      }
    }
  });

  const command = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (msg) =>
        msg.error ? reject(new Error(`CDP ${method}: ${msg.error.message}`)) : resolve(msg.result),
      );
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });

  await command("Network.enable");

  return {
    async evaluate(expression) {
      const result = await command("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result?.exceptionDetails) {
        const detail =
          result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          "lỗi trong trang";
        throw new Error(`JS trong trang lỗi: ${String(detail).slice(0, 200)}`);
      }
      return result?.result?.value;
    },
    hasOffer(listType, offset) {
      return offerByKey.has(keyOf(listType, offset));
    },
    /** Đợi trang offer nạp xong (có khối phân trang). */
    async waitForOfferPage(timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const ready = await this.evaluate(
          `document.readyState === "complete" && !!document.querySelector(".PaginationNoTotal__wrap")`,
        ).catch(() => false);
        if (ready) return true;
        await sleep(600);
      }
      return false;
    },
    /** Lấy JSON body của response đã gom (Network.getResponseBody). */
    async getOfferData(listType, offset) {
      const entry = offerByKey.get(keyOf(listType, offset));
      if (!entry) return null;
      const body = await command("Network.getResponseBody", {
        requestId: entry.requestId,
      }).catch(() => null);
      if (!body?.body) return null;
      try {
        return JSON.parse(body.body);
      } catch {
        return null;
      }
    },
    /** Reload trang offer TRONG session (Network đã bật) để bắt trọn request
     *  khởi tạo — offset=0 của tab mặc định phát ngay khi trang nạp. */
    async reloadOffer(offerPageUrl) {
      await this.evaluate(`location.assign(${JSON.stringify(offerPageUrl)})`).catch(() => {});
      await this.waitForOfferPage();
      await sleep(2500); // để request khởi tạo + prefetch kịp phát
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

/** Click tab danh mục; trả "ACTIVE" nếu đã đứng sẵn, "NO_TAB_NEEDED" nếu
 *  list_type này không dùng tab (trang riêng). */
async function selectListTab(session, listType) {
  const tabName =
    listType in TAB_BY_LIST_TYPE ? TAB_BY_LIST_TYPE[listType] : "Tất cả";
  if (tabName === null) return "NO_TAB_NEEDED";
  return session.evaluate(
    `(() => {
      const tabs = [...document.querySelectorAll(".rc-tabs-tab")];
      const tab = tabs.find((el) => el.textContent.trim() === ${JSON.stringify(tabName)});
      if (!tab) return "NO_TAB";
      if (tab.classList.contains("rc-tabs-tab-active")) return "ACTIVE";
      (tab.querySelector(".rc-tabs-tab-btn") || tab).click();
      return "CLICKED";
    })()`,
  );
}

/**
 * Một bước điều hướng: cuộn tới .PaginationNoTotal__wrap và click số trang
 * đích (hoặc next để trượt cửa sổ số trang khi đích chưa hiển thị).
 */
async function paginationStep(session, targetPage) {
  return session.evaluate(
    `(() => {
      const wrap = document.querySelector(".PaginationNoTotal__wrap");
      if (!wrap) return { state: "NO_PAGINATION" };
      wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      const pages = [...wrap.querySelectorAll(".page-page")];
      const nums = pages.map((el) => Number(el.textContent.trim())).filter(Number.isFinite);
      const active = Number(wrap.querySelector(".page-page.active")?.textContent.trim() || "0");
      const target = ${Number(targetPage)};
      if (active === target) return { state: "ARRIVED", active };
      const targetEl = pages.find((el) => Number(el.textContent.trim()) === target);
      if (targetEl) { targetEl.click(); return { state: "CLICKED_PAGE", active }; }
      if (nums.length && target > Math.max(...nums)) {
        const next = wrap.querySelector(".page-next");
        if (next && !next.className.includes("disabled")) { next.click(); return { state: "CLICKED_NEXT", active }; }
        return { state: "END", active };
      }
      const prev = wrap.querySelector(".page-prev");
      if (prev && !prev.className.includes("disabled")) { prev.click(); return { state: "CLICKED_PREV", active }; }
      return { state: "STUCK", active };
    })()`,
  );
}

/**
 * Lấy MỘT trang bằng thao tác thật: chọn tab danh mục, cuộn xuống, click số
 * trang tương ứng, rồi theo dõi Network để hứng response
 * `list_type=<t>&page_offset=(pageNo-1)*20`. Trả JSON của trang hoặc ném lỗi.
 * Yêu cầu: session đã reloadOffer() trước (để bắt sẵn trang 1 của tab mặc định).
 */
async function capturePageByClick(session, listType, pageNo, pageLimit) {
  const offset = (pageNo - 1) * pageLimit;

  const tabResult = await selectListTab(session, listType);
  if (tabResult === "NO_TAB") {
    throw new Error("Không thấy tab danh mục trên trang — profile có thể cần đăng nhập lại.");
  }
  // Click tab (danh mục khác mặc định) tự phát trang 1 của tab đó — chờ hứng.
  if (tabResult === "CLICKED") {
    for (let wait = 0; wait < 12 && !session.hasOffer(listType, 0); wait += 1) {
      await sleep(700);
    }
  }

  // Trang đã có (đã reload bắt trang 1, hoặc lượt trước đã hứng) → dùng luôn.
  if (!session.hasOffer(listType, offset)) {
    for (let step = 0; step < 40 && !session.hasOffer(listType, offset); step += 1) {
      const result = await paginationStep(session, pageNo);
      if (result.state === "NO_PAGINATION") {
        throw new Error("Không thấy khối phân trang trên trang offer.");
      }
      if (result.state === "END") {
        throw new Error(`Danh sách không có tới trang ${pageNo}.`);
      }
      if (result.state === "STUCK") {
        throw new Error("Không điều hướng được phân trang trên trang offer.");
      }
      if (result.state === "ARRIVED" && session.hasOffer(listType, offset)) break;
      // Đợi app phát request (click trang N → page_offset=(N-1)*20) và gom xong.
      for (let wait = 0; wait < 8 && !session.hasOffer(listType, offset); wait += 1) {
        await sleep(700);
      }
    }
  }

  const data = await session.getOfferData(listType, offset);
  if (!data) {
    throw new Error(
      `Không bắt được response trang ${pageNo} (list_type=${listType}, offset=${offset}).`,
    );
  }
  if (data.code !== 0) {
    throw new Error(
      `Shopee từ chối (code=${data.code}, msg=${data.msg ?? ""}) — profile có thể cần đăng nhập lại.`,
    );
  }
  return data;
}

/** Runtime.evaluate (awaitPromise) trên tab affiliate — trả về giá trị JS. */
async function cdpEvaluate(cdpUrl, expression) {
  const target = await pickPageTarget(cdpUrl);
  if (!target) throw new Error("Không tìm thấy tab nào trong profile.");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("Không kết nối được CDP của profile."));
      setTimeout(() => reject(new Error("CDP timeout khi kết nối.")), 10_000);
    });
    const message = await new Promise((resolve, reject) => {
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === 1) resolve(data);
      };
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
      setTimeout(() => reject(new Error("CDP timeout khi chạy lệnh trong trang.")), 45_000);
    });
    if (message.error) throw new Error(`CDP: ${message.error.message}`);
    if (message.result?.exceptionDetails) {
      const detail =
        message.result.exceptionDetails.exception?.description ||
        message.result.exceptionDetails.text ||
        "lỗi trong trang";
      throw new Error(`JS trong trang lỗi: ${String(detail).slice(0, 200)}`);
    }
    return message.result?.result?.value;
  } finally {
    try { ws.close(); } catch {}
  }
}

/** Gọi API offer bằng phiên đăng nhập của profile, trả JSON đã parse.
 *  listType: 0 = đề xuất, 2 = bán chạy nhất. */
async function fetchOfferPage(cdpUrl, offerApiPath, listType, offset, limit) {
  const url = `${AFFILIATE_ORIGIN}${offerApiPath}&list_type=${listType}&page_offset=${offset}&page_limit=${limit}`;
  const expression = `fetch(${JSON.stringify(url)}, { credentials: "include", headers: { accept: "application/json" } }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })`;
  const text = await cdpEvaluate(cdpUrl, expression);
  return JSON.parse(text);
}

async function isLoggedIn(cdpUrl, offerApiPath) {
  try {
    const data = await fetchOfferPage(cdpUrl, offerApiPath, 0, 0, 1);
    return Boolean(data) && data.code === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Xử lý job

async function runLoginJob(job, config) {
  console.log(`[login] Mở profile "${job.profileName}" (${job.profileId}) để đăng nhập…`);
  const { cdpUrl, wasRunning } = await ensureProfileRunning(job.profileId);
  await ensureAffiliateTab(cdpUrl, job.profileId, `${AFFILIATE_ORIGIN}/dashboard`).catch(() => {});

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let loginOk = false;
  while (Date.now() < deadline) {
    const profile = await getBcProfile(job.profileId).catch(() => null);
    if (!profile || profile.status !== "running") break; // admin đã đóng profile
    loginOk = await isLoggedIn(cdpUrl, config.offerApiPath);
    if (loginOk) break;
    await sleep(5000);
  }
  if (loginOk && !wasRunning) await stopProfile(job.profileId);
  console.log(loginOk ? "[login] Đã đăng nhập thành công." : "[login] Chưa xác nhận được đăng nhập.");
  return { ok: true, loginOk };
}

async function runFetchJob(job, config) {
  console.log(`[fetch] Lấy sản phẩm bằng profile "${job.profileName}" (click như người thật)…`);
  const { cdpUrl, wasRunning } = await ensureProfileRunning(job.profileId);
  await ensureAffiliateTab(cdpUrl, job.profileId, config.offerPageUrl);
  const session = await openCdpSession(cdpUrl);
  try {
    // Reload trong session (Network đã bật) để bắt trọn trang 1 của tab mặc định.
    await session.reloadOffer(config.offerPageUrl);
    const payloads = [];
    for (let pageNo = 1; pageNo <= config.pages; pageNo += 1) {
      let data;
      try {
        data = await capturePageByClick(session, 0, pageNo, config.pageLimit);
      } catch (error) {
        if (pageNo === 1) throw error;
        break;
      }
      payloads.push(data);
      const count = Array.isArray(data?.data?.list) ? data.data.list.length : 0;
      console.log(`[fetch] Trang ${pageNo}: ${count} sản phẩm.`);
      if (count < config.pageLimit) break; // hết danh sách
      await sleep(1200);
    }
    return { ok: true, payloads };
  } finally {
    session.close();
    if (!wasRunning) await stopProfile(job.profileId);
  }
}

/** Lưu NGAY một trang offer vào kho server (trước khi sang trang kế). */
async function saveOfferPageToServer(listType, pageNo, payload) {
  const result = await api("/harvest/offer-page", { listType, pageNo, payload });
  return Number(result?.saved ?? 0);
}

/** FETCH_RANGE: lấy dải trang [fromPage..toPage], LƯU NGAY từng trang. */
async function runFetchRangeJob(job, config) {
  const listType = Number(job.params?.listType ?? 2);
  const fromPage = Math.max(1, Number(job.params?.fromPage ?? 1));
  const toPage = Math.max(fromPage, Number(job.params?.toPage ?? fromPage));
  const limit = config.pageLimit;
  const pageUrl = offerPageUrlFor(listType, config);
  console.log(`[fetch-range] list_type=${listType}, trang ${fromPage}→${toPage} bằng profile "${job.profileName}"…`);
  const { cdpUrl } = await ensureProfileRunning(job.profileId);
  await ensureAffiliateTab(cdpUrl, job.profileId, pageUrl);
  const session = await openCdpSession(cdpUrl);
  try {
    await session.reloadOffer(pageUrl);
    let savedItems = 0;
    for (let pageNo = fromPage; pageNo <= toPage; pageNo += 1) {
      let data;
      try {
        data = await capturePageByClick(session, listType, pageNo, limit);
      } catch (error) {
        // Trang đầu lỗi = lỗi thật; giữa chừng hết trang = dừng êm (các trang
        // trước đã lưu vào DB nên không mất).
        if (pageNo === fromPage) throw error;
        console.log(`[fetch-range] Dừng ở trang ${pageNo}: ${error.message}`);
        break;
      }
      const count = Array.isArray(data?.data?.list) ? data.data.list.length : 0;
      // Lấy được trang nào lưu luôn DB trang đó rồi mới sang trang kế.
      const saved = await saveOfferPageToServer(listType, pageNo, data);
      savedItems += saved;
      console.log(`[fetch-range] Trang ${pageNo}: ${count} sản phẩm — đã lưu DB.`);
      if (count < limit) break; // hết danh sách
      await sleep(1200);
    }
    return { ok: true, savedItems };
  } finally {
    session.close();
  }
}

/** FETCH_PAGE: lấy đúng MỘT trang theo params {listType, pageNo}. */
async function runFetchPageJob(job, config) {
  const listType = Number(job.params?.listType ?? 2);
  const pageNo = Math.max(1, Number(job.params?.pageNo ?? 1));
  const limit = config.pageLimit;
  const pageUrl = offerPageUrlFor(listType, config);
  console.log(`[fetch-page] list_type=${listType}, trang ${pageNo} bằng profile "${job.profileName}" (click như người thật)…`);
  const { cdpUrl } = await ensureProfileRunning(job.profileId);
  // Dùng lại đúng MỘT tab cho mọi trang; không stop profile để các cú bấm
  // trang tiếp theo không phải mở lại trình duyệt.
  await ensureAffiliateTab(cdpUrl, job.profileId, pageUrl);
  const session = await openCdpSession(cdpUrl);
  try {
    await session.reloadOffer(pageUrl);
    const data = await capturePageByClick(session, listType, pageNo, limit);
    const count = Array.isArray(data?.data?.list) ? data.data.list.length : 0;
    // Lưu ngay vào DB rồi mới báo hoàn tất.
    const saved = await saveOfferPageToServer(listType, pageNo, data);
    console.log(`[fetch-page] Trang ${pageNo}: ${count} sản phẩm — đã lưu DB.`);
    return { ok: true, savedItems: saved };
  } finally {
    session.close();
  }
}

async function handleJob(job, config) {
  try {
    const result =
      job.kind === "LOGIN"
        ? await runLoginJob(job, config)
        : job.kind === "FETCH_PAGE"
          ? await runFetchPageJob(job, config)
          : job.kind === "FETCH_RANGE"
            ? await runFetchRangeJob(job, config)
            : await runFetchJob(job, config);
    await api(`/harvest/jobs/${job.id}/complete`, result);
    console.log(`[job] ${job.kind} hoàn tất.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[job] ${job.kind} lỗi: ${message}`);
    await api(`/harvest/jobs/${job.id}/complete`, { ok: false, error: message }).catch(
      (reportError) => console.error("[job] Không báo được lỗi về server:", reportError.message),
    );
  }
}

// ---------------------------------------------------------------------------

console.log(
  `Profile-worker khởi động — server: ${SERVER_URL}, Browser Control: ${BROWSER_CONTROL_URL}`,
);
try {
  const health = await fetch(`${BROWSER_CONTROL_URL}/health`).then((r) => r.json());
  console.log(`Browser Control OK: ${health.app ?? "?"} v${health.version ?? "?"}`);
} catch {
  console.warn("Chưa thấy Browser Control chạy ở " + BROWSER_CONTROL_URL + " — hãy mở ứng dụng.");
}

let warnedOffline = false;
for (;;) {
  try {
    const { job, config } = await api("/harvest/poll");
    warnedOffline = false;
    if (job) await handleJob(job, config);
  } catch (error) {
    if (!warnedOffline) {
      console.error(
        `Không kết nối được server (${error instanceof Error ? error.message : error}). Sẽ thử lại mỗi ${POLL_INTERVAL_MS / 1000}s…`,
      );
      warnedOffline = true;
    }
  }
  await sleep(POLL_INTERVAL_MS);
}
