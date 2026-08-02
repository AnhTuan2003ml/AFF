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

function buildSubId(params: {
  clickId: string;
  source?: string;
  campaign?: string;
}): string {
  return [
    cleanSubIdPart(`c${params.clickId}`, "click"),
    cleanSubIdPart(params.source ?? "web", "web"),
    cleanSubIdPart(params.campaign ?? "direct", "direct"),
    "v2",
  ].join("-");
}

export function buildShopeeAffiliateUrl(params: {
  productUrl: string;
  affiliateId: string;
  clickId: string;
  source?: string;
  campaign?: string;
}): { affiliateUrl: string; subId: string } {
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
  params: {
    productUrl: string;
    affiliateId: string;
    clickId: string;
    source?: string;
    campaign?: string;
  },
  fetcher: Fetcher,
): Promise<{ affiliateUrl: string; subId: string }> {
  const subId = buildSubId(params);
  if (isShopeeOpenApiConfigured(config)) {
    const shortLink = await generateShopeeShortLink(
      config,
      {
        originUrl: params.productUrl,
        subIds: [
          cleanSubIdPart(`c${params.clickId}`, "click"),
          cleanSubIdPart(params.source ?? "web", "web"),
          cleanSubIdPart(params.campaign ?? "direct", "direct"),
        ],
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
  params: {
    productUrl: string;
    clickId: string;
    source?: string;
    campaign?: string;
  },
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
  affiliateUrl.searchParams.set(
    "sub_id1",
    cleanSubIdPart(`c${params.clickId}`, "click"),
  );
  affiliateUrl.searchParams.set(
    "sub_id2",
    cleanSubIdPart(params.source ?? "web", "web"),
  );
  affiliateUrl.searchParams.set(
    "sub_id3",
    cleanSubIdPart(params.campaign ?? "direct", "direct"),
  );
  return { affiliateUrl: affiliateUrl.toString(), subId };
}

async function buildTikTokBuyUrl(
  config: AppConfig,
  params: {
    productUrl: string;
    clickId: string;
    source?: string;
    campaign?: string;
  },
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
  params: {
    productUrl: string;
    clickId: string;
    source?: string;
    campaign?: string;
  },
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
  const programAffiliateId =
    integration.affiliateId ||
    (resolved.platform === "TIKTOK"
      ? config.TIKTOK_OPEN_API_APP_KEY
      : resolved.platform === "LAZADA"
        ? lazadaProgramAffiliateId(config)
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
  const buildParams = {
    productUrl: resolved.normalizedUrl,
    clickId,
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
        : configuredLazadaMasterLink(config)
          ? buildLazadaAffiliateUrl(config, buildParams)
          : await buildPartnerAffiliateUrl(
              config,
              "LAZADA",
              buildParams,
              fetcher,
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

  return {
    platform: resolved.platform,
    clickId,
    buyUrl: `${config.APP_ORIGIN}/go/${clickId}`,
    normalizedUrl: resolved.normalizedUrl,
    subId: built.subId,
  };
}
