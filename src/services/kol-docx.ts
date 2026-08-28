import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { KOL_AGREEMENT_DISPLAY } from "./kol-agreement.js";
import type { KolApplicationRow } from "./kol-application.js";

const BLANK = "……………………………………";

function body(text: string, opts?: { justify?: boolean }): Paragraph {
  return new Paragraph({
    alignment: opts?.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function center(text: string, bold = true): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text, bold, size: 24 })],
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 23 })],
  });
}

function field(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: value, size: 22 }),
    ],
  });
}

/** Khối thông tin hai Bên: Bên A để trống cho admin điền, Bên B điền sẵn. */
function partyBlock(app: KolApplicationRow): Paragraph[] {
  return [
    body("Hôm nay, ngày …… tháng …… năm 2026, các Bên gồm:"),
    heading("BÊN A – ĐƠN VỊ VẬN HÀNH NỀN TẢNG/ỨNG DỤNG SHOPTIK"),
    field("Tên pháp nhân", BLANK),
    field("Mã số thuế", BLANK),
    field("Địa chỉ trụ sở", BLANK),
    field("Đại diện", BLANK),
    field("Chức vụ", BLANK),
    field("Điện thoại / Email", BLANK),
    field("Tên nền tảng", "ShopTik"),
    heading("BÊN B – KOL/KOC/ĐỐI TÁC TIẾP THỊ LIÊN KẾT"),
    field("Họ và tên", app.full_name || BLANK),
    field("Ngày sinh", app.birth_date || BLANK),
    field("Số CCCD/Thẻ căn cước", app.cccd_number || BLANK),
    field("Ngày cấp / Nơi cấp", app.cccd_issue || BLANK),
    field("Địa chỉ liên hệ", app.address || BLANK),
    field("Điện thoại", app.phone || BLANK),
    field("Email", app.email || app.account_email || BLANK),
    field("Mã số thuế cá nhân", app.tax_code || BLANK),
    field("Tài khoản ngân hàng", app.bank_account || BLANK),
    field("Chủ tài khoản / Ngân hàng", app.bank_name || BLANK),
    field("Kênh mạng xã hội", app.social_links || BLANK),
  ];
}

/**
 * Sinh file .docx hợp đồng có sẵn thông tin Bên B (từ hồ sơ đăng ký) để admin
 * tải về, điền tiếp thông tin Bên A, xuất PDF rồi upload khi duyệt.
 */
export async function buildKolDocx(app: KolApplicationRow): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const p of KOL_AGREEMENT_DISPLAY) {
    // Chèn khối thông tin hai Bên ngay trước câu dẫn vào các điều khoản.
    if (p.startsWith("Bên A và Bên B sau đây gọi riêng")) {
      children.push(...partyBlock(app));
    }
    const upper = p.toUpperCase();
    if (p.toLowerCase().startsWith("điều ")) {
      children.push(heading(p));
    } else if (p === upper && p.length < 90) {
      children.push(center(p));
    } else if (p.startsWith("Độc lập") || p === "Căn cứ:") {
      children.push(
        p === "Căn cứ:" ? body(p) : center(p, false),
      );
    } else {
      children.push(body(p, { justify: true }));
    }
  }
  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
