/**
 * Probe các nguồn PUBLIC của Shopee VN — KHÔNG cookie account, KHÔNG affiliate.
 * Mục đích duy nhất: xác minh endpoint nào còn trả dữ liệu thật hôm nay để
 * quyết định tích hợp. Đây là công cụ phát triển, KHÔNG chạy trong production.
 *
 * Chạy:  npx tsx scripts/test-shopee-public.ts
 */

const SHOP_ID = "727244389";
const ITEM_ID = "29050118705";
const TIMEOUT_MS = 8_000;

const BASE_HEADERS: Record<string, string> = {
  accept: "application/json",
  "accept-language": "vi-VN,vi;q=0.9,en;q=0.5",
  referer: `https://shopee.vn/product/${SHOP_ID}/${ITEM_ID}`,
  "x-api-source": "pc",
  "x-requested-with": "XMLHttpRequest",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

interface ProbeResult {
  label: string;
  url: string;
  status: number | string;
  jsonOk: boolean;
  hasData: boolean;
  note: string;
}

async function fetchGuestCookie(): Promise<string> {
  // Một số endpoint chấp nhận session KHÁCH ẩn danh do chính Shopee cấp qua
  // Set-Cookie (không phải cookie đăng nhập). Thử lấy để dùng trong bộ nhớ.
  try {
    const res = await fetch("https://shopee.vn/", {
      headers: { ...BASE_HEADERS, accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  } catch {
    return "";
  }
}

async function probe(
  label: string,
  url: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<ProbeResult> {
  const { cookie, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        ...BASE_HEADERS,
        ...(cookie ? { cookie } : {}),
        ...(rest.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let jsonOk = false;
    let hasData = false;
    let note = "";
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      jsonOk = true;
      const error = json.error;
      const data = json.data as Record<string, unknown> | null | undefined;
      hasData = data != null && Object.keys(data).length > 0;
      const bits: string[] = [];
      if (error !== undefined && error !== null && error !== 0) {
        bits.push(`error=${JSON.stringify(error)}`);
      }
      if (json.name) bits.push(`name="${String(json.name).slice(0, 30)}"`);
      const item = (data?.item ?? data) as Record<string, unknown> | undefined;
      if (item?.name) bits.push(`itemName="${String(item.name).slice(0, 30)}"`);
      if (Array.isArray(data?.sections)) {
        bits.push(`sections=${(data.sections as unknown[]).length}`);
      }
      if (Array.isArray((data as { items?: unknown[] })?.items)) {
        bits.push(`items=${((data as { items: unknown[] }).items).length}`);
      }
      note = bits.join(" ") || `keys=${Object.keys(json).slice(0, 5).join(",")}`;
    } catch {
      note = `non-json len=${text.length} head="${text.slice(0, 60).replace(/\s+/g, " ")}"`;
    }
    return { label, url, status: res.status, jsonOk, hasData, note };
  } catch (error) {
    return {
      label,
      url,
      status: "THROW",
      jsonOk: false,
      hasData: false,
      note: error instanceof Error ? `${error.name}: ${error.message}` : "?",
    };
  }
}

function line(r: ProbeResult): string {
  const ok = r.hasData ? "PASS" : "FAIL";
  const short = r.url.replace("https://shopee.vn", "");
  return `[${ok}] ${r.label}\n      ${short}\n      HTTP ${r.status} | json=${r.jsonOk} data=${r.hasData} | ${r.note}`;
}

async function main(): Promise<void> {
  console.info("=== PROBE SHOPEE PUBLIC (không cookie) ===\n");

  const noCookie: ProbeResult[] = [];
  noCookie.push(
    await probe(
      "item/get",
      `https://shopee.vn/api/v4/item/get?itemid=${ITEM_ID}&shopid=${SHOP_ID}`,
    ),
  );
  noCookie.push(
    await probe(
      "pdp/get_pc",
      `https://shopee.vn/api/v4/pdp/get_pc?item_id=${ITEM_ID}&shop_id=${SHOP_ID}&detail_level=0`,
    ),
  );
  noCookie.push(
    await probe(
      "recommend/daily_discover",
      "https://shopee.vn/api/v4/recommend/recommend?bundle=daily_discover_main&limit=10&offset=0",
    ),
  );
  noCookie.push(
    await probe(
      "recommend/pdp",
      `https://shopee.vn/api/v4/recommend/recommend?bundle=product_detail_page&item_id=${ITEM_ID}&shop_id=${SHOP_ID}&limit=10`,
    ),
  );
  noCookie.push(
    await probe(
      "search/search_items",
      "https://shopee.vn/api/v4/search/search_items?by=relevancy&keyword=tay%20cam%20choi%20game&limit=10&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2",
    ),
  );
  noCookie.push(
    await probe(
      "flash_sale/sessions",
      "https://shopee.vn/api/v4/flash_sale/get_all_sessions?category_personalization_type=0",
    ),
  );
  noCookie.push(
    await probe(
      "voucher landing /m/ma-giam-gia",
      "https://shopee.vn/m/ma-giam-gia",
      { headers: { accept: "text/html" } },
    ),
  );
  noCookie.push(
    await probe("voucher landing /m/VoucherXtra", "https://shopee.vn/m/VoucherXtra", {
      headers: { accept: "text/html" },
    }),
  );

  console.info("--- KHÔNG COOKIE ---");
  for (const r of noCookie) console.info(line(r));

  // Thử lại các endpoint API với cookie KHÁCH ẩn danh (nếu Shopee cấp).
  const guest = await fetchGuestCookie();
  console.info(
    `\n--- COOKIE KHÁCH ẩn danh (len=${guest.length}) ---`,
  );
  if (guest) {
    const withGuest = [
      await probe(
        "item/get + guest",
        `https://shopee.vn/api/v4/item/get?itemid=${ITEM_ID}&shopid=${SHOP_ID}`,
        { cookie: guest },
      ),
      await probe(
        "recommend + guest",
        "https://shopee.vn/api/v4/recommend/recommend?bundle=daily_discover_main&limit=10&offset=0",
        { cookie: guest },
      ),
      await probe(
        "search + guest",
        "https://shopee.vn/api/v4/search/search_items?by=relevancy&keyword=tay%20cam&limit=10&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2",
        { cookie: guest },
      ),
    ];
    for (const r of withGuest) console.info(line(r));
  } else {
    console.info("Không lấy được cookie khách.");
  }

  const passed = noCookie.filter((r) => r.hasData).length;
  console.info(
    `\n=== KẾT LUẬN: ${passed}/${noCookie.length} nguồn no-cookie trả dữ liệu ===`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lỗi không xác định.");
  process.exitCode = 1;
});
