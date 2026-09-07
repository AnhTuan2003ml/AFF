import path from "node:path";
import PDFDocument from "pdfkit";
import type { AppConfig } from "../config.js";
import type { KolApplicationRow } from "./kol-application.js";

/**
 * Sinh PDF hợp đồng đối tác NGAY TRONG code (không tải/sửa file .docx, không cần
 * admin xuất PDF tay). Bản gọn chỉ phần THỦ TỤC: thông tin hai Bên, vài điều
 * khoản cốt lõi, và khối chữ ký — CHỮ KÝ BÊN B (đối tác) IN ĐẬM. Điều khoản chi
 * tiết + chính sách gửi kèm trong email duyệt, không lặp lại thành phụ lục.
 *
 * Font Roboto (có dấu tiếng Việt) nhúng từ templates/fonts — pdfkit mặc định
 * Helvetica KHÔNG hiển thị được ký tự tiếng Việt.
 */

const FONT_DIR = path.join(process.cwd(), "templates", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Roboto-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "Roboto-Bold.ttf");

export interface DocBlock {
  heading?: string;
  paragraphs?: string[];
  items?: string[];
}

/**
 * PDF văn bản dài tổng quát (Điều khoản hợp tác, Chính sách…) — tự xuống trang.
 * Dùng để đính kèm điều khoản & chính sách vào email duyệt đối tác.
 */
export function buildTextDocumentPdf(
  title: string,
  subtitle: string | undefined,
  blocks: DocBlock[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  doc.registerFont("R", FONT_REGULAR);
  doc.registerFont("B", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const ink = "#1f2937";
  doc.font("B").fontSize(15).fillColor("#ee4d2d").text(title, { align: "center" });
  if (subtitle) {
    doc.font("R").fontSize(10).fillColor("#6b7280").text(subtitle, { align: "center" });
  }
  doc.moveDown(0.8);
  for (const b of blocks) {
    if (b.heading) {
      doc.moveDown(0.3);
      doc.font("B").fontSize(11).fillColor(ink).text(b.heading);
    }
    for (const p of b.paragraphs ?? []) {
      doc.font("R").fontSize(9.5).fillColor(ink).text(p, { align: "justify" });
    }
    for (const it of b.items ?? []) {
      doc.font("R").fontSize(9.5).fillColor(ink).text(`•  ${it}`, { indent: 10 });
    }
  }
  doc.end();
  return done;
}

export interface KolContractPdfOptions {
  partnerCode?: string;
  approvedAt?: Date;
}

function vnDate(d: Date): { day: string; month: string; year: string } {
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    day: String(vn.getUTCDate()).padStart(2, "0"),
    month: String(vn.getUTCMonth() + 1).padStart(2, "0"),
    year: String(vn.getUTCFullYear()),
  };
}

export function buildKolContractPdf(
  config: AppConfig,
  app: KolApplicationRow,
  options: KolContractPdfOptions = {},
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  doc.registerFont("R", FONT_REGULAR);
  doc.registerFont("B", FONT_BOLD);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const brand = "#ee4d2d";
  const ink = "#1f2937";
  const muted = "#6b7280";
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const dateNow = vnDate(options.approvedAt ?? new Date());
  const contractNo = `${app.id.slice(0, 8).toUpperCase()}/${dateNow.year}/HT-KOLKOC`;
  const partnerEmail = app.email || app.account_email || "";

  const gap = (h = 8) => doc.moveDown(h / 12);

  // ── Quốc hiệu ──
  doc
    .font("B")
    .fontSize(11)
    .fillColor(ink)
    .text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center" });
  doc
    .font("R")
    .fontSize(10.5)
    .text("Độc lập - Tự do - Hạnh phúc", { align: "center" });
  doc
    .font("R")
    .fillColor(muted)
    .text("———————————", { align: "center" });
  gap(14);

  // ── Tiêu đề ──
  doc
    .font("B")
    .fontSize(15)
    .fillColor(brand)
    .text("HỢP ĐỒNG HỢP TÁC KOL/KOC", { align: "center" });
  doc
    .font("R")
    .fontSize(9.5)
    .fillColor(muted)
    .text(`Số: ${contractNo}`, { align: "center" })
    .text(
      `Hôm nay, ngày ${dateNow.day} tháng ${dateNow.month} năm ${dateNow.year}, các Bên gồm:`,
      { align: "center" },
    );
  gap(14);

  // ── Hai Bên ──
  const party = (heading: string, lines: Array<[string, string]>): void => {
    doc.font("B").fontSize(11).fillColor(ink).text(heading);
    doc.moveDown(0.2);
    for (const [k, v] of lines) {
      if (!v) continue;
      const y = doc.y;
      doc.font("R").fontSize(10).fillColor(muted).text(`${k}:`, doc.page.margins.left, y, {
        width: 150,
        continued: false,
      });
      doc
        .font("R")
        .fontSize(10)
        .fillColor(ink)
        .text(v, doc.page.margins.left + 150, y, { width: width - 150 });
    }
    gap(10);
  };

  party("BÊN A — ĐƠN VỊ VẬN HÀNH NỀN TẢNG", [
    ["Nền tảng", config.APP_NAME],
    ["Liên hệ", config.SUPPORT_EMAIL || config.SMTP_FROM_EMAIL],
    ["Vai trò", "Cung cấp công cụ tiếp thị liên kết, theo dõi đơn, đối soát và thanh toán hoa hồng"],
  ]);

  party("BÊN B — ĐỐI TÁC (KOL/KOC)", [
    ["Họ và tên", app.full_name || ""],
    ["Ngày sinh", app.birth_date || ""],
    ["Số CCCD", app.cccd_number || ""],
    ["Ngày cấp", app.cccd_issue || ""],
    ["Địa chỉ", app.address || ""],
    ["Điện thoại", app.phone || ""],
    ["Email", partnerEmail],
    ["Mã số thuế", app.tax_code || ""],
    ["Tài khoản NH", app.bank_account || ""],
    ["Ngân hàng / Chủ TK", app.bank_name || ""],
    ...(options.partnerCode
      ? ([["Mã đối tác", options.partnerCode]] as Array<[string, string]>)
      : []),
  ]);

  doc
    .font("R")
    .fontSize(10)
    .fillColor(ink)
    .text(
      "Hai Bên thống nhất hợp tác tiếp thị liên kết trên nền tảng ShopTik theo các điều khoản thủ tục dưới đây và theo Điều khoản hợp tác, Chính sách người dùng gửi kèm cùng thư duyệt này:",
      { align: "justify" },
    );
  gap(10);

  // ── Điều khoản thủ tục (gọn) ──
  const clause = (title: string, body: string): void => {
    doc.font("B").fontSize(10.5).fillColor(ink).text(title);
    doc.font("R").fontSize(10).fillColor(ink).text(body, { align: "justify" });
    doc.moveDown(0.4);
  };
  clause(
    "Điều 1. Phạm vi",
    "Bên B tạo, đăng tải nội dung giới thiệu sản phẩm/dịch vụ qua liên kết tiếp thị do Bên A cung cấp; Bên A ghi nhận đơn hàng hợp lệ và chi trả hoa hồng tương ứng.",
  );
  clause(
    "Điều 2. Hoa hồng & thanh toán",
    "Hoa hồng tính trên đơn hàng hợp lệ theo Chính sách hoa hồng hiện hành của Nền tảng; đối soát và thanh toán qua ví/tài khoản đã đăng ký của Bên B.",
  );
  clause(
    "Điều 3. Nghĩa vụ của Bên B",
    "Cung cấp thông tin trung thực; nội dung tuân thủ pháp luật quảng cáo, bảo vệ người tiêu dùng; không gian lận đơn/hoa hồng dưới mọi hình thức.",
  );
  clause(
    "Điều 4. Bảo mật & dữ liệu cá nhân",
    "Các Bên giữ bí mật thông tin trao đổi. Bên A xử lý dữ liệu cá nhân của Bên B đúng mục đích xác minh, đối soát, thanh toán theo pháp luật bảo vệ dữ liệu cá nhân.",
  );
  clause(
    "Điều 5. Hiệu lực & chấm dứt",
    "Hợp đồng có hiệu lực kể từ ngày Bên A phê duyệt hồ sơ. Mỗi Bên có quyền chấm dứt bằng thông báo; quyền lợi hoa hồng của đơn hợp lệ phát sinh trước đó vẫn được bảo đảm.",
  );
  clause(
    "Điều 6. Điều khoản đầy đủ",
    "Điều khoản hợp tác chi tiết và Chính sách gửi kèm là bộ phận không tách rời của Hợp đồng. Bên B xác nhận đã đọc, hiểu và đồng ý toàn bộ khi nộp hồ sơ và được phê duyệt.",
  );
  gap(18);

  // ── Chữ ký (Bên B in đậm) ──
  if (doc.y > doc.page.height - 180) doc.addPage();
  const colW = width / 2;
  const signY = doc.y;
  const left = doc.page.margins.left;
  const right = left + colW;

  doc.font("B").fontSize(10.5).fillColor(ink).text("ĐẠI DIỆN BÊN A", left, signY, {
    width: colW,
    align: "center",
  });
  doc.font("R").fontSize(9).fillColor(muted).text("(Ký, ghi rõ họ tên; đóng dấu nếu có)", left, doc.y, {
    width: colW,
    align: "center",
  });

  doc.font("B").fontSize(10.5).fillColor(ink).text("BÊN B — ĐỐI TÁC", right, signY, {
    width: colW,
    align: "center",
  });
  doc
    .font("R")
    .fontSize(9)
    .fillColor(muted)
    .text("(Đã đồng ý qua hệ thống điện tử)", right, doc.y, {
      width: colW,
      align: "center",
    });

  // Tên đối tác IN ĐẬM dưới cột Bên B.
  const nameY = Math.max(doc.y, signY) + 46;
  doc
    .font("B")
    .fontSize(12)
    .fillColor(ink)
    .text((app.full_name || "").toUpperCase(), right, nameY, {
      width: colW,
      align: "center",
    });

  doc.end();
  return done;
}
