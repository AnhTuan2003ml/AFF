import path from "node:path";
import PDFDocument from "pdfkit";
import {
  KOL_AGREEMENT_PARAGRAPHS,
  KOL_AGREEMENT_VERSION,
} from "./kol-agreement.js";
import type { KolApplicationRow } from "./kol-application.js";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Roboto-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "Roboto-Bold.ttf");

function fmtDate(d: Date): string {
  // Giờ Việt Nam (UTC+7) — dd/mm/yyyy HH:MM.
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(vn.getUTCDate())}/${p(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())} (giờ VN)`;
}

/** Chữ ký điện tử: mã hợp đồng rút gọn từ id để in trên bản PDF. */
function signatureId(appId: string): string {
  return appId.replace(/-/g, "").slice(0, 16).toUpperCase();
}

/**
 * Sinh bản PDF "hợp đồng ký số" (xác nhận ký điện tử) cho một hồ sơ KOL/KOC đã
 * được duyệt. Bên B ký điện tử bằng việc xác nhận điều khoản + gửi KYC lúc nộp;
 * Bên A (ShopTik) ký bằng thao tác duyệt của quản trị viên. Font Roboto nhúng
 * sẵn nên tiếng Việt hiển thị đúng dấu.
 */
export function buildKolContractPdf(
  app: KolApplicationRow,
  opts: { signedAt: Date; approvedAt: Date; appOrigin: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: "Hợp đồng hợp tác KOL/KOC ShopTik",
        Author: "ShopTik",
      },
    });
    doc.registerFont("vn", FONT_REGULAR);
    doc.registerFont("vn-bold", FONT_BOLD);

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const sig = signatureId(app.id);

    // ── Tiêu đề ──────────────────────────────────────────────────────────
    doc
      .font("vn-bold")
      .fontSize(16)
      .fillColor("#1f2937")
      .text("HỢP ĐỒNG HỢP TÁC KOL/KOC", { align: "center" });
    doc
      .font("vn")
      .fontSize(10.5)
      .fillColor("#6b7280")
      .text(`ShopTik · Phiên bản thỏa thuận ${KOL_AGREEMENT_VERSION}`, {
        align: "center",
      })
      .text(`Mã hợp đồng: ${sig}`, { align: "center" });
    doc.moveDown(1);

    // ── Thông tin các bên ────────────────────────────────────────────────
    const label = (t: string) =>
      doc.font("vn-bold").fontSize(11).fillColor("#111827").text(t);
    const line = (t: string) =>
      doc.font("vn").fontSize(10.5).fillColor("#1f2937").text(t);

    label("BÊN A — ShopTik (Bên tổ chức nền tảng)");
    line("Nền tảng hoàn tiền & tiếp thị liên kết ShopTik.");
    doc.moveDown(0.5);

    label("BÊN B — Đối tác KOL/KOC");
    line(`Họ tên: ${app.full_name}`);
    if (app.birth_date) line(`Ngày sinh: ${app.birth_date}`);
    line(
      `Số CCCD: ${app.cccd_number}${app.cccd_issue ? ` · Nơi cấp: ${app.cccd_issue}` : ""}`,
    );
    if (app.address) line(`Địa chỉ: ${app.address}`);
    line(`Điện thoại: ${app.phone}`);
    line(`Email: ${app.email ?? app.account_email ?? "—"}`);
    if (app.tax_code) line(`Mã số thuế: ${app.tax_code}`);
    if (app.bank_account)
      line(`Tài khoản nhận tiền: ${app.bank_account} ${app.bank_name ?? ""}`);
    if (app.social_links) line(`Kênh mạng xã hội: ${app.social_links}`);
    doc.moveDown(1);

    // ── Nội dung thỏa thuận ──────────────────────────────────────────────
    for (const p of KOL_AGREEMENT_PARAGRAPHS) {
      const upper = p.toUpperCase();
      const isAllCaps = p === upper && p.length < 90;
      const isDieu = p.toLowerCase().startsWith("điều ");
      if (isAllCaps) {
        doc
          .moveDown(0.4)
          .font("vn-bold")
          .fontSize(11.5)
          .fillColor("#111827")
          .text(p, { align: "center" });
      } else if (isDieu) {
        doc
          .moveDown(0.4)
          .font("vn-bold")
          .fontSize(11)
          .fillColor("#c2410c")
          .text(p);
      } else {
        doc
          .font("vn")
          .fontSize(10)
          .fillColor("#1f2937")
          .text(p, { align: "justify", lineGap: 1.5 });
      }
    }

    // ── Khối ký điện tử ──────────────────────────────────────────────────
    doc.moveDown(1);
    doc
      .save()
      .rect(doc.x, doc.y, doc.page.width - 112, 118)
      .fill("#f8fafc")
      .restore();
    const boxTop = doc.y + 12;
    doc.y = boxTop;
    doc.x = 68;
    doc
      .font("vn-bold")
      .fontSize(11)
      .fillColor("#111827")
      .text("XÁC NHẬN KÝ ĐIỆN TỬ");
    doc
      .font("vn")
      .fontSize(9.5)
      .fillColor("#374151")
      .text(
        `Bên B đã đọc, đồng ý toàn bộ thỏa thuận và ký điện tử bằng thao tác xác nhận điều khoản kèm nộp hồ sơ định danh (KYC) lúc ${fmtDate(opts.signedAt)}.`,
        { width: doc.page.width - 136 },
      )
      .text(
        `Bên A (ShopTik) phê duyệt và ký xác nhận sau khi đối chiếu định danh lúc ${fmtDate(opts.approvedAt)}.`,
        { width: doc.page.width - 136 },
      )
      .fillColor("#6b7280")
      .fontSize(8.5)
      .text(
        `Mã chữ ký điện tử: ${sig} · Hợp đồng phát hành tự động bởi hệ thống ShopTik, có giá trị lưu trữ điện tử theo thỏa thuận giữa hai Bên.`,
        { width: doc.page.width - 136 },
      );

    doc.end();
  });
}
