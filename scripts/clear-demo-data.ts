/**
 * Dọn dữ liệu ảo (demo/QA/thử nghiệm) khỏi database.
 *
 * MẶC ĐỊNH LÀ DRY-RUN: chỉ đếm và in ra những gì sẽ bị xóa. Phải thêm
 * `--confirm` mới thực sự xóa.
 *
 * Ba nhóm, chọn bằng cờ (không cờ nào = cả ba):
 *   --accounts  Tài khoản demo/QA theo tên miền `@demo.shoptik`, `@shoptik.local`
 *               cùng toàn bộ dữ liệu bám theo (giới thiệu, nhiệm vụ, ví, bút toán).
 *   --orders    Đơn tạo tay có mã bắt đầu bằng `DEMO-` hoặc `MDEMO-`.
 *   --clicks    Lượt bấm mua/chia sẻ thử nghiệm CHƯA gắn với đơn nào
 *               (affiliate_links + click_events) và conversion_raw mồ côi.
 *   --orphans   Bản ghi con không còn bản ghi cha (order_items, click_events,
 *               commission_entries, ledger_accounts). Cần thiết vì script chạy
 *               với trigger tắt nên ON DELETE CASCADE không tự chạy, và vì các
 *               lần dọn dữ liệu thủ công trước đó có thể đã để lại rác.
 *
 * Chạy (từ máy có Docker):
 *   docker compose run --rm --entrypoint node migrate dist/scripts/clear-demo-data.js
 *   docker compose run --rm --entrypoint node migrate dist/scripts/clear-demo-data.js --confirm
 *
 * Chạy trực tiếp (khi DATABASE_URL truy cập được từ máy hiện tại):
 *   npm run data:clear-demo
 *   npm run data:clear-demo -- --confirm
 *
 * Ledger vốn bất biến (trigger chặn UPDATE/DELETE). Script tắt trigger trong
 * phạm vi transaction đúng như scripts/seed-demo.sql làm, và chỉ xóa trọn vẹn
 * từng giao dịch (cả hai chân bút toán) nên sổ không bao giờ lệch.
 */
import { Pool } from "pg";
import { loadConfig } from "../src/config.js";

const DEMO_EMAIL_PATTERNS = ["%@demo.shoptik", "%@shoptik.local"];
const DEMO_ORDER_PATTERNS = ["DEMO-%", "MDEMO-%"];

interface Scope {
  accounts: boolean;
  orders: boolean;
  clicks: boolean;
  orphans: boolean;
  confirm: boolean;
}

function parseScope(argv: string[]): Scope {
  const flags = new Set(argv);
  const picked = ["--accounts", "--orders", "--clicks", "--orphans"].some(
    (flag) => flags.has(flag),
  );
  return {
    accounts: picked ? flags.has("--accounts") : true,
    orders: picked ? flags.has("--orders") : true,
    clicks: picked ? flags.has("--clicks") : true,
    orphans: picked ? flags.has("--orphans") : true,
    confirm: flags.has("--confirm"),
  };
}

const config = loadConfig();
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
});

type Counter = { label: string; count: number };

async function countRows(
  client: { query: Pool["query"] },
  label: string,
  sql: string,
  params: unknown[],
): Promise<Counter> {
  const result = await client.query<{ count: string }>(sql, params);
  return { label, count: Number(result.rows[0]?.count ?? 0) };
}

async function run(): Promise<void> {
  const scope = parseScope(process.argv.slice(2));
  const client = await pool.connect();
  const removed: Counter[] = [];

  try {
    await client.query("BEGIN");
    // Cho phép xóa bút toán demo; bật lại ngay khi commit/rollback.
    await client.query("SET LOCAL session_replication_role = 'replica'");

    // Tập tài khoản ảo — dùng lại nhiều lần bên dưới.
    await client.query(
      `
        CREATE TEMP TABLE demo_users ON COMMIT DROP AS
        SELECT id FROM users
        WHERE ($1::boolean) AND email ILIKE ANY($2::text[])
      `,
      [scope.accounts, DEMO_EMAIL_PATTERNS],
    );
    await client.query(
      `
        CREATE TEMP TABLE demo_orders ON COMMIT DROP AS
        SELECT id, raw_conversion_id FROM orders
        WHERE (($1::boolean) AND platform_order_id ILIKE ANY($2::text[]))
           OR user_id IN (SELECT id FROM demo_users)
      `,
      [scope.orders, DEMO_ORDER_PATTERNS],
    );
    // Nhiệm vụ đã nhận thưởng nhờ mời tài khoản ảo: gỡ cả phần thưởng.
    await client.query(
      `
        CREATE TEMP TABLE demo_claims ON COMMIT DROP AS
        SELECT c.id, c.user_id, c.ledger_transaction_id
        FROM user_mission_claims c
        WHERE ($1::boolean) AND (
          c.user_id IN (SELECT id FROM demo_users)
          -- Mốc nhiệm vụ đạt được nhờ mời tài khoản ảo (liên kết giới thiệu
          -- nằm ở bảng referrals, không phải users.referred_by_user_id).
          OR EXISTS (
            SELECT 1 FROM referrals rf
            WHERE rf.referrer_user_id = c.user_id
              AND rf.referred_user_id IN (SELECT id FROM demo_users)
          )
          OR EXISTS (
            SELECT 1 FROM users ru
            WHERE ru.referred_by_user_id = c.user_id
              AND ru.id IN (SELECT id FROM demo_users)
          )
        )
      `,
      [scope.accounts],
    );
    // Mọi giao dịch ledger chạm tới ví ảo hoặc tới đơn/nhiệm vụ ảo.
    await client.query(
      `
        CREATE TEMP TABLE demo_ledger_tx ON COMMIT DROP AS
        SELECT DISTINCT t.id FROM ledger_transactions t
        WHERE t.id IN (
            SELECT e.transaction_id FROM ledger_entries e
            JOIN ledger_accounts la ON la.id = e.account_id
            WHERE la.owner_type = 'USER'
              AND la.owner_id IN (SELECT id FROM demo_users)
          )
          OR (
            t.reference_type = 'ORDER'
            AND t.reference_id IN (SELECT id::text FROM demo_orders)
          )
          -- Phần thưởng nhiệm vụ ảo: bắt theo cả hai đường vì
          -- user_mission_claims.ledger_transaction_id có thể chưa được điền.
          OR t.id IN (
            SELECT ledger_transaction_id FROM demo_claims
            WHERE ledger_transaction_id IS NOT NULL
          )
          OR (
            t.reference_type = 'MISSION_CLAIM'
            AND t.reference_id IN (SELECT id::text FROM demo_claims)
          )
      `,
    );

    const plan: Counter[] = [
      await countRows(client, "Tài khoản ảo", "SELECT count(*) FROM demo_users", []),
      await countRows(client, "Đơn ảo", "SELECT count(*) FROM demo_orders", []),
      await countRows(
        client,
        "Nhiệm vụ đã nhận thưởng từ tài khoản ảo",
        "SELECT count(*) FROM demo_claims",
        [],
      ),
      await countRows(
        client,
        "Giao dịch ledger liên quan",
        "SELECT count(*) FROM demo_ledger_tx",
        [],
      ),
      await countRows(
        client,
        "Lượt bấm mua/chia sẻ chưa có đơn",
        `
          SELECT count(*) FROM affiliate_links l
          WHERE ($1::boolean)
            AND NOT EXISTS (
              SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id
                AND o.id NOT IN (SELECT id FROM demo_orders)
            )
        `,
        [scope.clicks],
      ),
      await countRows(
        client,
        "Bản ghi con mồ côi (mặt hàng/lượt click/ví không còn cha)",
        `
          SELECT (
            (SELECT count(*) FROM order_items oi
              WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id))
            + (SELECT count(*) FROM click_events ce
              WHERE NOT EXISTS (
                SELECT 1 FROM affiliate_links l WHERE l.id = ce.affiliate_link_id
              ))
            + (SELECT count(*) FROM commission_entries c
              WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = c.order_id))
            + (SELECT count(*) FROM ledger_accounts a
              WHERE a.owner_type = 'USER'
                AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.owner_id))
          ) * ($1::int) AS count
        `,
        [scope.orphans ? 1 : 0],
      ),
    ];

    console.info(
      scope.confirm
        ? "== XÓA DỮ LIỆU ẢO =="
        : "== THỬ (DRY-RUN) — chưa xóa gì, thêm --confirm để xóa thật ==",
    );
    console.info(
      `Phạm vi: accounts=${scope.accounts} orders=${scope.orders} ` +
        `clicks=${scope.clicks} orphans=${scope.orphans}`,
    );
    for (const item of plan) {
      console.info(`  ${item.label}: ${item.count}`);
    }

    if (!scope.confirm) {
      await client.query("ROLLBACK");
      console.info("Không thay đổi gì. Chạy lại với --confirm để xóa.");
      return;
    }

    // 1) Ledger: xóa trọn giao dịch (cả hai chân) rồi tới ví của tài khoản ảo.
    const entries = await client.query(
      "DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM demo_ledger_tx)",
    );
    removed.push({ label: "ledger_entries", count: entries.rowCount ?? 0 });
    await client.query(
      "UPDATE user_mission_claims SET ledger_transaction_id = NULL WHERE ledger_transaction_id IN (SELECT id FROM demo_ledger_tx)",
    );
    const transactions = await client.query(
      "DELETE FROM ledger_transactions WHERE id IN (SELECT id FROM demo_ledger_tx)",
    );
    removed.push({
      label: "ledger_transactions",
      count: transactions.rowCount ?? 0,
    });

    // 2) Nhiệm vụ ảo và thông báo đi kèm.
    const notifications = await client.query(
      `
        DELETE FROM notifications
        WHERE user_id IN (SELECT id FROM demo_users)
          OR (
            user_id IN (SELECT user_id FROM demo_claims)
            AND type ILIKE 'MISSION%'
          )
      `,
    );
    removed.push({ label: "notifications", count: notifications.rowCount ?? 0 });
    const claims = await client.query(
      "DELETE FROM user_mission_claims WHERE id IN (SELECT id FROM demo_claims)",
    );
    removed.push({ label: "user_mission_claims", count: claims.rowCount ?? 0 });

    // 3) Đơn ảo và dữ liệu con.
    for (const [label, sql] of [
      [
        "commission_entries",
        "DELETE FROM commission_entries WHERE order_id IN (SELECT id FROM demo_orders)",
      ],
      [
        "order_items",
        "DELETE FROM order_items WHERE order_id IN (SELECT id FROM demo_orders)",
      ],
      ["orders", "DELETE FROM orders WHERE id IN (SELECT id FROM demo_orders)"],
    ] as const) {
      const result = await client.query(sql);
      removed.push({ label, count: result.rowCount ?? 0 });
    }

    // 4) Lượt bấm mua/chia sẻ chưa gắn đơn nào (click_events xóa theo CASCADE).
    if (scope.clicks) {
      const links = await client.query(
        `
          DELETE FROM affiliate_links l
          WHERE NOT EXISTS (
            SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id
          )
        `,
      );
      removed.push({ label: "affiliate_links", count: links.rowCount ?? 0 });
    }

    // 5) Bản ghi thô không còn đơn nào tham chiếu.
    const raws = await client.query(
      `
        DELETE FROM conversion_raw r
        WHERE NOT EXISTS (
          SELECT 1 FROM orders o WHERE o.raw_conversion_id = r.id
        )
      `,
    );
    removed.push({ label: "conversion_raw", count: raws.rowCount ?? 0 });

    // 6) Tài khoản ảo: gỡ liên kết giới thiệu trước khi xóa để không vướng FK.
    if (scope.accounts) {
      await client.query(
        "UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id IN (SELECT id FROM demo_users)",
      );
      for (const [label, sql] of [
        [
          "referrals",
          `DELETE FROM referrals
           WHERE referrer_user_id IN (SELECT id FROM demo_users)
              OR referred_user_id IN (SELECT id FROM demo_users)`,
        ],
        [
          "ledger_accounts",
          "DELETE FROM ledger_accounts WHERE owner_type = 'USER' AND owner_id IN (SELECT id FROM demo_users)",
        ],
        ["users", "DELETE FROM users WHERE id IN (SELECT id FROM demo_users)"],
      ] as const) {
        const result = await client.query(sql);
        removed.push({ label, count: result.rowCount ?? 0 });
      }
    }

    // 7) Quét bản ghi mồ côi. Bắt buộc phải làm tường minh: trong
    // `session_replication_role = 'replica'`, ON DELETE CASCADE không chạy.
    if (scope.orphans) {
      // Ví không còn chủ mà vẫn có bút toán: xóa trọn giao dịch chạm tới nó
      // (cả hai chân) để sổ cái không bị lệch.
      const orphanTx = await client.query(
        `
          DELETE FROM ledger_entries
          WHERE transaction_id IN (
            SELECT DISTINCT e.transaction_id
            FROM ledger_entries e
            JOIN ledger_accounts a ON a.id = e.account_id
            WHERE a.owner_type = 'USER'
              AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.owner_id)
          )
        `,
      );
      removed.push({
        label: "ledger_entries (ví không còn chủ)",
        count: orphanTx.rowCount ?? 0,
      });
      const emptyTx = await client.query(
        `
          DELETE FROM ledger_transactions t
          WHERE NOT EXISTS (
            SELECT 1 FROM ledger_entries e WHERE e.transaction_id = t.id
          )
        `,
      );
      removed.push({
        label: "ledger_transactions rỗng",
        count: emptyTx.rowCount ?? 0,
      });

      for (const [label, sql] of [
        [
          "order_items mồ côi",
          `DELETE FROM order_items oi
           WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id)`,
        ],
        [
          "click_events mồ côi",
          `DELETE FROM click_events ce
           WHERE NOT EXISTS (
             SELECT 1 FROM affiliate_links l WHERE l.id = ce.affiliate_link_id
           )`,
        ],
        [
          "commission_entries mồ côi",
          `DELETE FROM commission_entries c
           WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = c.order_id)`,
        ],
        [
          "ledger_accounts mồ côi",
          `DELETE FROM ledger_accounts a
           WHERE a.owner_type = 'USER'
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.owner_id)`,
        ],
      ] as const) {
        const result = await client.query(sql);
        removed.push({ label, count: result.rowCount ?? 0 });
      }
    }

    // Chốt an toàn: sổ cái phải cân sau khi dọn.
    const unbalanced = await client.query<{ count: string }>(
      `
        SELECT count(*) FROM (
          SELECT transaction_id FROM ledger_entries
          GROUP BY transaction_id
          HAVING sum(CASE WHEN direction = 'DEBIT' THEN amount_vnd ELSE -amount_vnd END) <> 0
        ) lech
      `,
    );
    if (Number(unbalanced.rows[0]?.count ?? 0) > 0) {
      throw new Error(
        "Sau khi dọn, sổ cái còn giao dịch lệch — đã hủy toàn bộ thay đổi.",
      );
    }

    await client.query("COMMIT");
    console.info("Đã xóa:");
    for (const item of removed) {
      if (item.count > 0) console.info(`  ${item.label}: ${item.count}`);
    }
    console.info("Xong.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lỗi không xác định.");
  process.exitCode = 1;
});
