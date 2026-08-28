import { readFileSync } from "node:fs";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { KolApplicationRow } from "./kol-application.js";

/**
 * File hợp đồng cho admin tải về là BẢN COPY của chính file mẫu
 * (templates/mau-hop-dong-kol-koc.docx — nguồn từ Thoa_thuan_hop_tac_KOL_KOC_
 * ShopTik_V2.docx, đã chèn placeholder cho các ô Bên B), điền sẵn thông tin
 * người đăng ký; các ô Bên A để trống cho admin điền + ký. Giữ NGUYÊN định dạng,
 * bố cục, con dấu văn bản gốc thay vì dựng lại từ đầu.
 */
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "mau-hop-dong-kol-koc.docx",
);

export function buildKolDocx(app: KolApplicationRow): Buffer {
  const zip = new PizZip(readFileSync(TEMPLATE_PATH));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render({
    hoTen: app.full_name || "",
    ngaySinh: app.birth_date || "",
    soCccd: app.cccd_number || "",
    ngayCap: app.cccd_issue || "",
    diaChi: app.address || "",
    dienThoai: app.phone || "",
    email: app.email || app.account_email || "",
    mst: app.tax_code || "",
    taiKhoan: app.bank_account || "",
    chuTk: app.bank_name || "",
  });
  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Buffer;
}
