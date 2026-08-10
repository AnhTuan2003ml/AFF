import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  extractShopeeCookie,
  fetchShopeeReport,
  parseShopeeReportOrders,
  SHOPEE_REPORT_MAX_PAGE_SIZE,
} from "../src/services/shopee-report.js";

const DEFAULT_PURCHASE_TIME_START = 1_780_246_800;
const DEFAULT_PURCHASE_TIME_END = 1_785_776_399;

interface CliOptions {
  cookieFile: string;
  outputFile: string;
  purchaseTimeStart: number;
  purchaseTimeEnd: number;
  pageSize: number;
}

function usage(): never {
  console.error(
    "Cách dùng: npm run shopee:report:test -- <cookie.txt> [output.json] " +
      "[purchase_time_s] [purchase_time_e] [page_size]",
  );
  process.exit(1);
}

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} phải là số nguyên dương.`);
  }
  return parsed;
}

function parseCli(argv: string[]): CliOptions {
  if (argv.length < 1 || argv.includes("--help") || argv.includes("-h")) usage();
  const pageSize = argv[4]
    ? positiveInteger(argv[4], "page_size")
    : SHOPEE_REPORT_MAX_PAGE_SIZE;
  if (pageSize > SHOPEE_REPORT_MAX_PAGE_SIZE) {
    throw new Error(`page_size tối đa là ${SHOPEE_REPORT_MAX_PAGE_SIZE}.`);
  }

  return {
    cookieFile: resolve(argv[0]!),
    outputFile: resolve(argv[1] ?? "shopee-report.json"),
    purchaseTimeStart: argv[2]
      ? positiveInteger(argv[2], "purchase_time_s")
      : DEFAULT_PURCHASE_TIME_START,
    purchaseTimeEnd: argv[3]
      ? positiveInteger(argv[3], "purchase_time_e")
      : DEFAULT_PURCHASE_TIME_END,
    pageSize,
  };
}

/**
 * Công cụ kiểm tra thủ công: lấy đúng dữ liệu mà tiến trình đồng bộ tự động
 * đang dùng (`src/services/shopee-report.ts`), ghi ra file JSON để đối chiếu
 * và in bảng tóm tắt trạng thái đơn sau khi chuẩn hóa.
 */
async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const cookie = extractShopeeCookie(await readFile(options.cookieFile, "utf8"));
  const report = await fetchShopeeReport(cookie, {
    purchaseTimeStart: options.purchaseTimeStart,
    purchaseTimeEnd: options.purchaseTimeEnd,
    pageSize: options.pageSize,
  });

  const output = {
    code: 0,
    msg: "success",
    data: {
      page_num: 1,
      page_size: options.pageSize,
      total_count: report.totalCount,
      fetched_count: report.list.length,
      list: report.list,
    },
  };
  await writeFile(
    options.outputFile,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  console.info(
    `Đã lưu ${report.list.length} bản ghi vào ${options.outputFile}`,
  );

  const orders = parseShopeeReportOrders(report.list);
  const byStatus = orders.reduce<Record<string, number>>((counts, order) => {
    counts[order.status] = (counts[order.status] ?? 0) + 1;
    return counts;
  }, {});
  console.info(`Chuẩn hóa được ${orders.length} đơn:`, byStatus);
  for (const order of orders.slice(0, 10)) {
    console.info(
      `- ${order.orderSn} | ${order.status} (${order.externalStatus}) | ` +
        `${order.orderAmountVnd.toLocaleString("vi-VN")}đ | ` +
        `hoa hồng ${order.commissionVnd.toLocaleString("vi-VN")}đ | ` +
        `subId ${order.subId || "(trống)"}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lỗi không xác định.");
  process.exitCode = 1;
});
