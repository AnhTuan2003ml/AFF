import { afterEach, describe, expect, it } from "vitest";

import { createVoucherAffiliateLink } from "../src/services/affiliate.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) await cleanup();
  cleanup = undefined;
});

describe("createVoucherAffiliateLink", () => {
  it("chuyển link voucher Shopee sang link affiliate gắn Sub ID người dùng + ghi affiliate_links", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email, full_name, status, role, referral_code, tracking_code)
       VALUES ('voucher-user@example.com', 'Voucher User', 'ACTIVE', 'USER', 'VOUCHER1', 'abc123def456')
       RETURNING id`,
    );
    const userId = user.rows[0]!.id;
    const config = testConfig();

    const voucherUrl =
      "https://shopee.vn/m/ma-giam-gia?voucherCode=ROI3XYZ&promotionId=999";
    const link = await createVoucherAffiliateLink(db, config, {
      userId,
      voucherUrl,
    });

    // buyUrl tuyệt đối trỏ /go/:clickId để vẫn 302 chuyển hướng bình thường.
    expect(link.buyUrl).toBe(`${config.APP_ORIGIN}/go/${link.clickId}`);
    // Open API tắt trong test → fallback an_redir kèm affiliate_id + sub_id.
    expect(link.affiliateUrl).toContain("s.shopee.vn/an_redir");
    expect(link.affiliateUrl).toContain(`affiliate_id=${config.SHOPEE_AFFILIATE_ID}`);
    expect(link.affiliateUrl).toContain("uabc123def456"); // Sub ID gắn tracking_code

    const row = await db.query<{
      platform: string;
      source: string;
      campaign: string;
      sub_id: string;
      affiliate_url: string;
      status: string;
    }>(
      `SELECT platform, source, campaign, sub_id, affiliate_url, status
       FROM affiliate_links WHERE click_id = $1`,
      [link.clickId],
    );
    expect(row.rows[0]).toMatchObject({
      platform: "SHOPEE",
      source: "voucher",
      campaign: "voucher",
      status: "ACTIVE",
    });
    expect(row.rows[0]?.sub_id).toContain("uabc123def456");
  });

  it("từ chối link không phải Shopee", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email, full_name, status, role, referral_code, tracking_code)
       VALUES ('voucher-user2@example.com', 'Voucher User 2', 'ACTIVE', 'USER', 'VOUCHER2', 'zzz999')
       RETURNING id`,
    );
    const config = testConfig();

    await expect(
      createVoucherAffiliateLink(db, config, {
        userId: user.rows[0]!.id,
        voucherUrl: "https://example.com/khong-phai-shopee",
      }),
    ).rejects.toThrow();
  });
});
