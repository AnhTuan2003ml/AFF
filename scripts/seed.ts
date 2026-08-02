import { loadConfig } from "../src/config.js";
import { createDatabase, query } from "../src/db.js";

const config = loadConfig();
const db = createDatabase(config);

const content = [
  {
    type: "GUIDE",
    title: "3 bước để đơn được ghi nhận",
    description:
      "Tạo link trong ShopTik, bấm Mua và nhận hoàn, sau đó hoàn tất đơn trong cùng phiên mua sắm.",
    badge: "Nên đọc",
    category: "Hướng dẫn",
    sort: 10,
  },
  {
    type: "TRENDING",
    title: "Danh mục đang được quan tâm",
    description:
      "Khám phá sản phẩm gia dụng, làm đẹp và phụ kiện công nghệ từ link Shopee hợp lệ.",
    badge: "Xu hướng",
    category: "Gia dụng",
    sort: 20,
  },
  {
    type: "VOUCHER",
    title: "Kiểm tra voucher trước khi thanh toán",
    description:
      "Voucher của sàn có thể áp dụng độc lập. Khoản hoàn cuối cùng vẫn dựa trên hoa hồng được đối tác duyệt.",
    badge: "Mẹo tiết kiệm",
    category: "Voucher",
    sort: 30,
  },
  {
    type: "ANNOUNCEMENT",
    title: "Tiền hoàn luôn có trạng thái rõ ràng",
    description:
      "Dự kiến là khoản đang chờ đối tác; khả dụng là khoản đã đủ điều kiện để yêu cầu rút.",
    badge: "Minh bạch",
    category: "Thông báo",
    sort: 40,
  },
] as const;

async function run(): Promise<void> {
  for (const item of content) {
    await query(
      db,
      `
        INSERT INTO content_items (
          type, title, description, badge, category, sort_order
        )
        SELECT $1, $2, $3, $4, $5, $6
        WHERE NOT EXISTS (
          SELECT 1 FROM content_items WHERE type = $1 AND title = $2
        )
      `,
      [
        item.type,
        item.title,
        item.description,
        item.badge,
        item.category,
        item.sort,
      ],
    );
  }
  console.info("Đã tạo nội dung mẫu.");
  await db.end();
}

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
