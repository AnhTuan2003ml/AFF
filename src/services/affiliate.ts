import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { randomClickId } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import {
  generateShopeeShortLink,
  isShopeeOpenApiConfigured,
} from "./shopee-open-api.js";
import {
  generateTikTokAffiliateSharingLink,
  isTikTokOpenApiConfigured,
  parseTikTokProductId,
} from "./tiktok-open-api.js";
import {
  generateLazadaAffiliateLink,
  readProfileCookieHeader,
} from "./browser-control.js";
import { listHarvestProfiles } from "./discover-harvest.js";
import {
  getLazadaCookie,
  getPlatformSyncSettings,
  setPlatformCookie,
} from "./platform-sync-settings.js";

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

export const PRODUCT_PLATFORMS = ["SHOPEE", "TIKTOK", "LAZADA"] as const;
export type ProductPlatform = (typeof PRODUCT_PLATFORMS)[number];

const PLATFORM_LABELS: Record<ProductPlatform, string> = {
  SHOPEE: "Shopee",
  TIKTOK: "TikTok Shop",
  LAZADA: "Lazada",
};

const PLATFORM_HOSTS: Record<ProductPlatform, ReadonlySet<string>> = {
  SHOPEE: new Set([
    "shopee.vn",
    "www.shopee.vn",
    "s.shopee.vn",
    "shp.ee",
    "vn.shp.ee",
  ]),
  TIKTOK: new Set([
    "tiktok.com",
    "www.tiktok.com",
    "shop.tiktok.com",
    "vt.tiktok.com",
    "vm.tiktok.com",
  ]),
  LAZADA: new Set([
    "lazada.vn",
    "www.lazada.vn",
    "m.lazada.vn",
    "s.lazada.vn",
    "c.lazada.vn",
  ]),
};

const COMMON_TRACKING_PARAMS = new Set([
  "sp_atk",
  "xptdk",
  "smtt",
  "share_channel_code",
  "uls_trackid",
  "ttclid",
  "traffic_source",
  "exlaz",
  "laz_trackid",
  "mkttid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

// Các tham số xuất hiện trong link chia sẻ LazAffiliates trên app/web.
// Chúng định danh lượt chia sẻ hoặc token theo từng sản phẩm, không được
// lồng lại vào Master Link của hệ thống vì có thể tạo hai lớp attribution.
const LAZADA_TRACKING_PARAMS = new Set([
  "spm",
  "sbucket",
  "from_affiliate",
  "t",
  "exlaz",
  "dsource",
  "laz_share_info",
  "laz_token",
  "c",
  "laz_trackid",
  "mkttid",
]);

const LAZADA_SHORT_LINK_HOSTS = new Set(["s.lazada.vn", "c.lazada.vn"]);

export interface ResolvedProductLink {
  platform: ProductPlatform;
  normalizedUrl: string;
  supported: true;
}

export interface PurchaseProductSnapshot {
  platform?: ProductPlatform;
  productId: string | null;
  shopId: string | null;
  productName: string;
  shopName: string | null;
  imageUrl: string | null;
  priceVnd: number | null;
  originalPriceVnd?: number | null;
  affiliateCommissionVnd: number | null;
  buyerCashbackVnd: number | null;
  buyerCashbackPercent: number;
  commissionSource: string;
}

interface PlatformIntegrationConfig {
  affiliateId: string;
  apiUrl: string;
  apiToken: string;
  redirectHosts: string;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function integrationConfig(
  config: AppConfig,
  platform: ProductPlatform,
): PlatformIntegrationConfig {
  if (platform === "SHOPEE") {
    return {
      affiliateId: config.SHOPEE_AFFILIATE_ID,
      apiUrl: config.SHOPEE_PRODUCT_API_URL,
      apiToken: config.SHOPEE_PRODUCT_API_TOKEN,
      redirectHosts: config.SHOPEE_AFFILIATE_REDIRECT_HOSTS,
    };
  }
  if (platform === "TIKTOK") {
    return {
      affiliateId: config.TIKTOK_AFFILIATE_ID,
      apiUrl: config.TIKTOK_PRODUCT_API_URL,
      apiToken: config.TIKTOK_PRODUCT_API_TOKEN,
      redirectHosts: config.TIKTOK_AFFILIATE_REDIRECT_HOSTS,
    };
  }
  return {
    affiliateId: config.LAZADA_AFFILIATE_ID,
    apiUrl: config.LAZADA_PRODUCT_API_URL,
    apiToken: config.LAZADA_PRODUCT_API_TOKEN,
    redirectHosts: config.LAZADA_AFFILIATE_REDIRECT_HOSTS,
  };
}

export function platformLabel(platform: ProductPlatform): string {
  return PLATFORM_LABELS[platform];
}

export function isAllowedPlatformHost(
  platform: ProductPlatform,
  hostname: string,
): boolean {
  return PLATFORM_HOSTS[platform].has(normalizeHostname(hostname));
}

export function isAllowedShopeeHost(hostname: string): boolean {
  return isAllowedPlatformHost("SHOPEE", hostname);
}

export function detectProductPlatform(input: string | URL): ProductPlatform | null {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input.trim());
  } catch {
    return null;
  }
  const hostname = normalizeHostname(url.hostname);
  return (
    PRODUCT_PLATFORMS.find((platform) =>
      PLATFORM_HOSTS[platform].has(hostname),
    ) ?? null
  );
}

function configuredRedirectHosts(
  config: AppConfig | undefined,
  platform: ProductPlatform,
): Set<string> {
  if (!config) return new Set();
  return new Set(
    integrationConfig(config, platform)
      .redirectHosts.split(",")
      .map((host) => normalizeHostname(host.trim()))
      .filter(Boolean),
  );
}

export function isSafeAffiliateRedirect(
  input: string,
  expectedPlatform?: ProductPlatform,
  config?: AppConfig,
): boolean {
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    ) {
      return false;
    }
    const platform = expectedPlatform ?? detectProductPlatform(url);
    if (!platform) return false;
    const hostname = normalizeHostname(url.hostname);
    return (
      isAllowedPlatformHost(platform, hostname) ||
      configuredRedirectHosts(config, platform).has(hostname)
    );
  } catch {
    return false;
  }
}

export function resolveProductUrl(
  input: string,
  expectedPlatform?: ProductPlatform,
): ResolvedProductLink {
  if (input.length > 2_048) {
    throw new AppError("URL_TOO_LONG", "Đường dẫn sản phẩm quá dài.");
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError(
      "INVALID_PRODUCT_URL",
      expectedPlatform
        ? `Link chưa đúng định dạng. Hãy dán link sản phẩm từ ${platformLabel(expectedPlatform)}.`
        : "Link chưa đúng định dạng. Hãy dán link sản phẩm từ Shopee, TikTok Shop hoặc Lazada.",
    );
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new AppError(
      "UNSAFE_PRODUCT_URL",
      "Chỉ chấp nhận đường dẫn HTTPS công khai của sàn.",
    );
  }

  const detectedPlatform = detectProductPlatform(url);
  if (!detectedPlatform) {
    throw new AppError(
      "UNSUPPORTED_PLATFORM",
      "ShopTik chỉ nhận link Shopee, TikTok Shop hoặc Lazada Việt Nam.",
    );
  }
  if (expectedPlatform && expectedPlatform !== detectedPlatform) {
    throw new AppError(
      "PLATFORM_MISMATCH",
      `Link này thuộc ${platformLabel(detectedPlatform)}, không phải ${platformLabel(expectedPlatform)}.`,
      422,
      { detectedPlatform },
    );
  }

  if (
    detectedPlatform === "SHOPEE" &&
    normalizeHostname(url.hostname) === "s.shopee.vn" &&
    url.pathname === "/an_redir"
  ) {
    throw new AppError(
      "ALREADY_AFFILIATE_URL",
      "Đây đã là link Affiliate Shopee. Hãy dán link sản phẩm gốc.",
    );
  }

  url.hash = "";

  // Link rút gọn Lazada cần giữ nguyên query (`c`, `t`...) để máy chủ sàn
  // giải mã đúng đích. Sau khi resolve sang trang sản phẩm, các token này sẽ
  // được loại bỏ ở lượt chuẩn hoá tiếp theo.
  const preserveShortLazadaQuery =
    detectedPlatform === "LAZADA" &&
    LAZADA_SHORT_LINK_HOSTS.has(normalizeHostname(url.hostname));

  if (!preserveShortLazadaQuery) {
    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (
        COMMON_TRACKING_PARAMS.has(normalizedKey) ||
        normalizedKey.startsWith("utm_") ||
        (detectedPlatform === "LAZADA" &&
          LAZADA_TRACKING_PARAMS.has(normalizedKey))
      ) {
        url.searchParams.delete(key);
      }
    }
  }

  return {
    platform: detectedPlatform,
    normalizedUrl: url.toString(),
    supported: true,
  };
}

function cleanSubIdPart(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
  return cleaned || fallback;
}

export interface SubIdParts {
  clickId: string;
  /** Mã định danh cố định của người mua (`users.tracking_code`). */
  userCode?: string;
  /** Mã sản phẩm trên sàn, để đối soát khi mã lượt click không khớp. */
  productId?: string | null;
  source?: string;
  campaign?: string;
}

/**
 * Sub ID dạng c<clickId>-u<userCode>-p<productId>-<source>-<campaign>.
 * Tiền tố giúp tách ngược từ utm_content dù sàn cắt bớt đuôi; chỉ giữ
 * [a-zA-Z0-9_] vì Shopee loại ký tự khác.
 */
export function buildSubIdParts(params: SubIdParts): string[] {
  const productId = String(params.productId ?? "").trim();
  return [
    cleanSubIdPart(`c${params.clickId}`, "click"),
    ...(params.userCode ? [cleanSubIdPart(`u${params.userCode}`, "user")] : []),
    ...(productId ? [cleanSubIdPart(`p${productId}`, "item")] : []),
    cleanSubIdPart(params.source ?? "web", "web"),
    cleanSubIdPart(params.campaign ?? "direct", "direct"),
  ];
}

function buildSubId(params: SubIdParts): string {
  return buildSubIdParts(params).join("-");
}

/** Tham số chung của mọi hàm dựng link mua. */
interface BuildLinkParams extends SubIdParts {
  productUrl: string;
}

export function buildShopeeAffiliateUrl(
  params: BuildLinkParams & { affiliateId: string },
): { affiliateUrl: string; subId: string } {
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(params.affiliateId)) {
    throw new AppError(
      "AFFILIATE_NOT_CONFIGURED",
      "Chương trình Shopee Affiliate chưa được cấu hình hợp lệ.",
      503,
    );
  }

  const normalized = resolveProductUrl(
    params.productUrl,
    "SHOPEE",
  ).normalizedUrl;
  const subId = buildSubId(params);
  const affiliateUrl = new URL("https://s.shopee.vn/an_redir");
  affiliateUrl.searchParams.set("origin_link", normalized);
  affiliateUrl.searchParams.set("affiliate_id", params.affiliateId);
  affiliateUrl.searchParams.set("sub_id", subId);
  return { affiliateUrl: affiliateUrl.toString(), subId };
}

/**
 * Link mua Shopee: ưu tiên short link chính thức từ Affiliate Open API
 * (s.shopee.vn/xxxx, đã gắn định danh hệ thống + subIds để đối soát đơn);
 * nếu chưa cấu hình hoặc API lỗi thì lùi về an_redir với affiliate_id.
 */
async function buildShopeeBuyUrl(
  config: AppConfig,
  params: BuildLinkParams & { affiliateId: string },
  fetcher: Fetcher,
): Promise<{ affiliateUrl: string; subId: string }> {
  const subId = buildSubId(params);
  if (isShopeeOpenApiConfigured(config)) {
    const shortLink = await generateShopeeShortLink(
      config,
      {
        originUrl: params.productUrl,
        // Shopee nhận tối đa 5 mảnh và nối lại thành `utm_content` trong báo
        // cáo — đúng thứ tự buildSubIdParts nên tách ngược được khi đối soát.
        subIds: buildSubIdParts(params).slice(0, 5),
      },
      fetcher,
    );
    if (shortLink && isSafeAffiliateRedirect(shortLink, "SHOPEE", config)) {
      return { affiliateUrl: shortLink, subId };
    }
  }
  return buildShopeeAffiliateUrl(params);
}


function normalizeLazadaMasterLink(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (
        normalizeHostname(url.hostname) !== "c.lazada.vn" ||
        !/^\/t\/c\.[a-zA-Z0-9_-]{3,64}\/?$/.test(url.pathname)
      ) {
        return null;
      }
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  // Chỉ nhận đúng mã Master Link có tiền tố `c.`. Affiliate ID, referral
  // code hoặc token trong link chia sẻ s.lazada.vn không phải Master Link và
  // tuyệt đối không được tự đoán/bọc thành c.lazada.vn vì có thể mất ghi nhận.
  if (!/^c\.[a-zA-Z0-9_-]{3,64}$/.test(raw)) return null;
  return `https://c.lazada.vn/t/${raw}`;
}

function configuredLazadaMasterLink(config: AppConfig): string | null {
  const explicit = normalizeLazadaMasterLink(
    config.LAZADA_AFFILIATE_MASTER_LINK,
  );
  if (explicit) return explicit;

  // Tương thích cấu hình cũ chỉ khi LAZADA_AFFILIATE_ID thực sự đã là một
  // Master Link đầy đủ hoặc mã dạng c.xxxxx. Không suy diễn từ mã `$...$`.
  return normalizeLazadaMasterLink(config.LAZADA_AFFILIATE_ID);
}

function lazadaProgramAffiliateId(config: AppConfig): string {
  if (config.LAZADA_AFFILIATE_ID.trim()) {
    return config.LAZADA_AFFILIATE_ID.trim();
  }
  const masterLink = configuredLazadaMasterLink(config);
  if (!masterLink) return "";
  try {
    return new URL(masterLink).pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return "";
  }
}

export function buildLazadaAffiliateUrl(
  config: AppConfig,
  params: BuildLinkParams,
): { affiliateUrl: string; subId: string } {
  const masterLink = configuredLazadaMasterLink(config);
  if (!masterLink) {
    throw new AppError(
      "AFFILIATE_NOT_CONFIGURED",
      "Chưa có Master Link Lazada hợp lệ. Link chia sẻ s.lazada.vn hoặc mã Affiliate đơn lẻ không đủ; hãy lấy link dạng https://c.lazada.vn/t/c.xxxxx trong LazAffiliates/Adsense rồi cấu hình LAZADA_AFFILIATE_MASTER_LINK.",
      503,
    );
  }

  const normalized = resolveProductUrl(params.productUrl, "LAZADA").normalizedUrl;
  const destination = new URL(normalized);
  // Lazada hướng dẫn link sản phẩm dùng tới phần `.html`. Loại query còn lại
  // (kể cả priceCompare/skuId) để Master Link luôn nhận URL đích sạch và
  // không kế thừa tracking của link người dùng đã dán.
  if (/^\/products\/.+\.html\/?$/i.test(destination.pathname)) {
    destination.search = "";
  }
  const subId = buildSubId(params);
  const affiliateUrl = new URL(masterLink);
  affiliateUrl.searchParams.set("url", destination.toString());
  affiliateUrl.searchParams.set(
    "sub_aff_id",
    cleanSubIdPart(params.source ?? "shoptik", "shoptik"),
  );
  // Lazada tách sub_id thành từng ô riêng: rải đúng các mảnh đã dựng
  // (c<clickId>, u<userCode>, p<productId>, source, campaign).
  buildSubIdParts(params)
    .slice(0, 4)
    .forEach((part, index) => {
      affiliateUrl.searchParams.set(`sub_id${index + 1}`, part);
    });
  return { affiliateUrl: affiliateUrl.toString(), subId };
}

/**
 * URL đích gửi cho API chuyển đổi Lazada: URL sản phẩm sạch + sub_aff_id và
 * sub_id1..6 để đối soát người mua (giống bộ tham số Master Link cũ dùng).
 */
function buildLazadaJumpUrl(params: BuildLinkParams): string {
  const normalized = resolveProductUrl(params.productUrl, "LAZADA").normalizedUrl;
  const destination = new URL(normalized);
  // URL sản phẩm Lazada tới `.html`; bỏ query của link người dùng dán để không
  // kế thừa tracking lạ, rồi tự gắn sub_aff_id/sub_id của mình.
  if (/^\/products\/.+\.html\/?$/i.test(destination.pathname)) {
    destination.search = "";
  }
  destination.searchParams.set(
    "sub_aff_id",
    cleanSubIdPart(params.source ?? "shoptik", "shoptik"),
  );
  buildSubIdParts(params)
    .slice(0, 6)
    .forEach((part, index) => {
      destination.searchParams.set(`sub_id${index + 1}`, part);
    });
  return destination.toString();
}

/** Profile Browser Control (nếu có) — dùng để sinh link Lazada đúng tài khoản. */
async function lazadaConvertProfileId(db: Database): Promise<string | null> {
  const profiles = await listHarvestProfiles(db);
  return profiles[0]?.id ?? null;
}

const LAZADA_CONVERT_API =
  "https://adsense.lazada.vn/newOffer/link-convert-v2.json";
const LAZADA_CONVERT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

/**
 * Gọi THẲNG API chuyển đổi Lazada từ server bằng cookie đã lưu (không mở
 * profile) — nhanh nhất. Trả link rút gọn `s.lazada.vn` mang exlaz=e_ của
 * tài khoản. Nếu cookie hỏng, Lazada trả HTML/anti-bot (không phải JSON) →
 * ném lỗi để tầng trên rơi về profile.
 */
async function convertLazadaLinkWithCookie(
  cookie: string,
  jumpUrl: string,
  fetcher: Fetcher,
): Promise<string> {
  const res = await fetcher(LAZADA_CONVERT_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      origin: "https://adsense.lazada.vn",
      referer: "https://adsense.lazada.vn/index.htm",
      "user-agent": LAZADA_CONVERT_UA,
      cookie,
    },
    body: JSON.stringify({ jumpUrl, subIdTemplateKey: "" }),
  });
  const text = await res.text();
  let json: JsonObject | null = null;
  try {
    json = JSON.parse(text) as JsonObject;
  } catch {
    throw new AppError(
      "LAZADA_SERVER_CONVERT_FAILED",
      "Gọi API Lazada từ server bị chặn (không phải JSON) — cookie có thể đã hỏng.",
      502,
    );
  }
  const data = (json?.data ?? {}) as JsonObject;
  if (!json?.success || Number(json?.resultCode) !== 1) {
    throw new AppError(
      "LAZADA_SERVER_CONVERT_FAILED",
      `Lazada từ chối chuyển đổi link: ${String(json?.message || "không rõ lý do")}.`,
      502,
    );
  }
  const link =
    typeof data.shortLink === "string" && data.shortLink ? data.shortLink : "";
  if (!link) {
    throw new AppError(
      "LAZADA_SERVER_CONVERT_FAILED",
      "API Lazada không trả shortLink.",
      502,
    );
  }
  return link;
}

/**
 * Link mua Lazada, ưu tiên theo thứ tự:
 *  1. COOKIE ĐÃ LƯU → gọi thẳng API từ server (nhanh, không mở profile).
 *  2. Profile Browser Control (adsense.lazada.vn) — khi chưa có cookie hoặc
 *     cookie hỏng; sinh xong thì tự LẤY LẠI cookie từ profile lưu vào DB để
 *     lần sau lại dùng đường (1).
 *  3. Master Link c.lazada.vn (cấu hình cũ) — chỉ khi không có cả cookie lẫn profile.
 *  4. Partner API tự cấu hình.
 * Link luôn phải qua allowlist host (isSafeAffiliateRedirect).
 */
async function buildLazadaBuyUrl(
  db: Database,
  config: AppConfig,
  params: BuildLinkParams,
  fetcher: Fetcher,
  profileId: string | null,
  actorId: string,
): Promise<{ affiliateUrl: string; subId: string }> {
  const subId = buildSubId(params);
  const jumpUrl = buildLazadaJumpUrl(params);

  const ensureSafe = (link: string): { affiliateUrl: string; subId: string } => {
    if (!isSafeAffiliateRedirect(link, "LAZADA", config)) {
      throw new AppError(
        "LAZADA_LINK_UNSAFE",
        "Link Affiliate Lazada trả về không nằm trong allowlist host.",
        502,
      );
    }
    return { affiliateUrl: link, subId };
  };

  // 1) Cookie đã lưu → gọi thẳng server.
  const storedCookie = await getLazadaCookie(db, config).catch(() => null);
  if (storedCookie) {
    try {
      return ensureSafe(await convertLazadaLinkWithCookie(storedCookie, jumpUrl, fetcher));
    } catch (error) {
      // Cookie hỏng: chỉ rơi xuống profile nếu có, không thì ném lỗi rõ.
      if (!profileId) throw error;
    }
  }

  // 2) Profile: sinh link + tự lấy lại cookie mới lưu để lần sau dùng đường (1).
  if (profileId) {
    const { link } = await generateLazadaAffiliateLink(config, {
      profileId,
      jumpUrl,
    });
    const result = ensureSafe(link);
    try {
      const fresh = await readProfileCookieHeader(config, profileId, "LAZADA");
      await setPlatformCookie(
        db,
        config,
        { platform: "LAZADA", cookie: fresh, source: "PROFILE" },
        actorId,
      );
    } catch {
      /* best-effort: không lưu được cookie thì lần sau lại đi qua profile */
    }
    return result;
  }

  // 3) Master Link cũ. 4) Partner API.
  if (configuredLazadaMasterLink(config)) {
    return buildLazadaAffiliateUrl(config, params);
  }
  return buildPartnerAffiliateUrl(config, "LAZADA", params, fetcher);
}

async function buildTikTokBuyUrl(
  config: AppConfig,
  params: BuildLinkParams,
  fetcher: Fetcher,
): Promise<{ affiliateUrl: string; subId: string }> {
  const subId = buildSubId(params);
  const productId = parseTikTokProductId(params.productUrl);
  if (productId && isTikTokOpenApiConfigured(config)) {
    const officialLink = await generateTikTokAffiliateSharingLink(
      config,
      {
        productId,
        ...(config.TIKTOK_AFFILIATE_CAMPAIGN_ID
          ? { campaignId: config.TIKTOK_AFFILIATE_CAMPAIGN_ID }
          : {}),
      },
      fetcher,
    );
    if (officialLink && isSafeAffiliateRedirect(officialLink, "TIKTOK", config)) {
      return { affiliateUrl: officialLink, subId };
    }
  }

  if (config.TIKTOK_PRODUCT_API_URL && config.TIKTOK_AFFILIATE_ID) {
    return buildPartnerAffiliateUrl(config, "TIKTOK", params, fetcher);
  }

  throw new AppError(
    "AFFILIATE_API_UNAVAILABLE",
    productId
      ? "TikTok Affiliate chưa tạo được link mua. Hãy kiểm tra quyền Creator API, access token và campaign."
      : "Link TikTok Shop chưa chứa product_id hợp lệ để tạo link Affiliate.",
    503,
  );
}

function findAffiliateUrl(payload: unknown): string | undefined {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const result = asObject(root?.result);
  const candidates = [
    root?.affiliateUrl,
    root?.affiliate_url,
    root?.promotionUrl,
    root?.promotion_url,
    root?.trackingUrl,
    root?.tracking_url,
    root?.deeplink,
    root?.link,
    data?.affiliateUrl,
    data?.affiliate_url,
    data?.promotionUrl,
    data?.promotion_url,
    data?.trackingUrl,
    data?.tracking_url,
    data?.deeplink,
    data?.link,
    result?.affiliateUrl,
    result?.affiliate_url,
    result?.promotionUrl,
    result?.promotion_url,
    result?.trackingUrl,
    result?.tracking_url,
    result?.deeplink,
    result?.link,
  ];
  return candidates.map(optionalString).find(Boolean);
}

async function buildPartnerAffiliateUrl(
  config: AppConfig,
  platform: Exclude<ProductPlatform, "SHOPEE">,
  params: BuildLinkParams,
  fetcher: Fetcher,
): Promise<{ affiliateUrl: string; subId: string }> {
  const integration = integrationConfig(config, platform);
  const label = platformLabel(platform);
  if (!integration.affiliateId || !integration.apiUrl) {
    throw new AppError(
      "AFFILIATE_NOT_CONFIGURED",
      `Chưa cấu hình tài khoản và API Affiliate ${label}.`,
      503,
    );
  }

  const normalized = resolveProductUrl(
    params.productUrl,
    platform,
  ).normalizedUrl;
  const subId = buildSubId(params);
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (integration.apiToken) {
    headers.authorization = `Bearer ${integration.apiToken}`;
  }

  let response: Response;
  try {
    response = await fetcher(integration.apiUrl, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        action: "convert",
        platform,
        link: normalized,
        productUrl: normalized,
        affiliateId: integration.affiliateId,
        subId,
        source: params.source ?? "web",
        campaign: params.campaign ?? "direct",
      }),
      signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(
      "AFFILIATE_API_UNAVAILABLE",
      `API Affiliate ${label} đang không phản hồi. Hãy thử lại sau.`,
      503,
    );
  }
  if (!response.ok) {
    throw new AppError(
      "AFFILIATE_API_REJECTED",
      `API Affiliate ${label} chưa tạo được link mua.`,
      503,
    );
  }

  let payload: unknown;
  try {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 1024 * 1024) throw new Error();
    payload = JSON.parse(text);
  } catch {
    throw new AppError(
      "AFFILIATE_API_INVALID_RESPONSE",
      `API Affiliate ${label} trả dữ liệu không hợp lệ.`,
      503,
    );
  }
  const affiliateUrl = findAffiliateUrl(payload);
  if (!affiliateUrl || !isSafeAffiliateRedirect(affiliateUrl, platform, config)) {
    throw new AppError(
      "UNSAFE_AFFILIATE_REDIRECT",
      `Link mua do API ${label} trả về chưa vượt qua kiểm tra an toàn.`,
      503,
    );
  }
  return { affiliateUrl, subId };
}

export function isPlatformPurchaseEnabled(
  config: AppConfig,
  platform: ProductPlatform,
): boolean {
  const integration = integrationConfig(config, platform);
  if (platform === "SHOPEE") return Boolean(integration.affiliateId);
  if (platform === "TIKTOK") {
    return Boolean(
      isTikTokOpenApiConfigured(config) ||
        (integration.affiliateId && integration.apiUrl),
    );
  }
  return Boolean(
    configuredLazadaMasterLink(config) ||
      (integration.affiliateId && integration.apiUrl),
  );
}

export async function createPurchaseIntent(
  db: Database,
  config: AppConfig,
  params: {
    userId: string;
    productUrl: string;
    cashbackRateBps: number;
    product: PurchaseProductSnapshot;
    source?: string;
    campaign?: string;
  },
  fetcher: Fetcher = fetch,
): Promise<{
  platform: ProductPlatform;
  clickId: string;
  buyUrl: string;
  normalizedUrl: string;
  subId: string;
}> {
  const resolved = resolveProductUrl(params.productUrl, params.product.platform);
  const integration = integrationConfig(config, resolved.platform);
  // Lazada: nếu có profile Browser Control thì sinh link đúng tài khoản qua
  // profile (không phụ thuộc Master Link nữa).
  const lazadaProfileId =
    resolved.platform === "LAZADA" ? await lazadaConvertProfileId(db) : null;
  // Lazada "sẵn sàng" khi có cookie đã lưu (gọi API thẳng) HOẶC có profile.
  const lazadaHasCookie =
    resolved.platform === "LAZADA"
      ? (await getPlatformSyncSettings(db)).lazadaHasCookie
      : false;
  const programAffiliateId =
    integration.affiliateId ||
    (resolved.platform === "TIKTOK"
      ? config.TIKTOK_OPEN_API_APP_KEY
      : resolved.platform === "LAZADA"
        ? lazadaProgramAffiliateId(config) ||
          (lazadaProfileId || lazadaHasCookie ? "lazada-profile" : "")
        : "");
  if (
    !isPlatformPurchaseEnabled(config, resolved.platform) ||
    !programAffiliateId
  ) {
    throw new AppError(
      "AFFILIATE_NOT_CONFIGURED",
      `Chưa cấu hình đầy đủ Affiliate ${platformLabel(resolved.platform)}.`,
      503,
    );
  }

  const clickId = randomClickId();
  const source = params.source ?? "web";
  const campaign = params.campaign ?? "direct";
  // Mã định danh cố định của người mua: nhờ nó mà báo cáo sàn vẫn chỉ đúng
  // chủ đơn kể cả khi mã lượt click trong Sub ID bị sàn cắt bớt.
  const trackingCode = await query<{ tracking_code: string }>(
    db,
    "SELECT tracking_code FROM users WHERE id = $1",
    [params.userId],
  );
  const userCode = trackingCode.rows[0]?.tracking_code;
  const buildParams = {
    productUrl: resolved.normalizedUrl,
    clickId,
    ...(userCode ? { userCode } : {}),
    productId: params.product.productId,
    source,
    campaign,
  };
  const built =
    resolved.platform === "SHOPEE"
      ? await buildShopeeBuyUrl(
          config,
          {
            ...buildParams,
            affiliateId: integration.affiliateId,
          },
          fetcher,
        )
      : resolved.platform === "TIKTOK"
        ? await buildTikTokBuyUrl(config, buildParams, fetcher)
        : await buildLazadaBuyUrl(
            db,
            config,
            buildParams,
            fetcher,
            lazadaProfileId,
            params.userId,
          );

  const program = await query<{ id: string }>(
    db,
    `
      INSERT INTO affiliate_programs (
        platform, affiliate_id, status, cashback_rate_bps
      ) VALUES ($1, $2, 'ACTIVE', $3)
      ON CONFLICT (platform, affiliate_id)
      DO UPDATE SET cashback_rate_bps = EXCLUDED.cashback_rate_bps
      RETURNING id
    `,
    [resolved.platform, programAffiliateId, params.cashbackRateBps],
  );
  const originalPriceVnd =
    params.product.originalPriceVnd !== null &&
    params.product.originalPriceVnd !== undefined &&
    params.product.priceVnd !== null &&
    params.product.originalPriceVnd > params.product.priceVnd
      ? params.product.originalPriceVnd
      : null;

  await query(
    db,
    `
      INSERT INTO affiliate_links (
        user_id, program_id, platform, click_id, original_url,
        normalized_url, affiliate_url, sub_id, source, campaign,
        product_id, shop_id, product_name, shop_name, product_image_url,
        product_price_vnd, product_original_price_vnd, estimated_commission_vnd,
        estimated_cashback_vnd, buyer_cashback_percent, commission_source
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
    `,
    [
      params.userId,
      program.rows[0]?.id,
      resolved.platform,
      clickId,
      params.productUrl,
      resolved.normalizedUrl,
      built.affiliateUrl,
      built.subId,
      cleanSubIdPart(source, "web"),
      cleanSubIdPart(campaign, "direct"),
      params.product.productId,
      params.product.shopId,
      params.product.productName,
      params.product.shopName,
      params.product.imageUrl,
      params.product.priceVnd,
      originalPriceVnd,
      params.product.affiliateCommissionVnd,
      params.product.buyerCashbackVnd,
      params.product.buyerCashbackPercent,
      params.product.commissionSource,
    ],
  );

  // "Mua ngay" ghi NGAY sản phẩm vào "đã xem" để hiển thị liền (không chờ job
  // dọn). Khóa (user, sub_id) chống trùng; mua lại cùng sản phẩm sinh Sub ID
  // mới nên vẫn vào, listViewedProducts gộp lại theo sản phẩm khi hiển thị.
  if (campaign === "instantbuy") {
    await query(
      db,
      `
        INSERT INTO viewed_products (
          user_id, platform, product_id, product_name, product_url,
          product_image_url, product_price_vnd, sub_id, click_id, campaign
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, sub_id) DO NOTHING
      `,
      [
        params.userId,
        resolved.platform,
        params.product.productId,
        params.product.productName,
        resolved.normalizedUrl,
        params.product.imageUrl,
        params.product.priceVnd,
        built.subId,
        clickId,
        campaign,
      ],
    );
  }

  return {
    platform: resolved.platform,
    clickId,
    buyUrl: `${config.APP_ORIGIN}/go/${clickId}`,
    normalizedUrl: resolved.normalizedUrl,
    subId: built.subId,
  };
}
