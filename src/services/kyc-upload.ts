import heicConvert from "heic-convert";
import sharp from "sharp";
import { AppError } from "../lib/errors.js";

/** Lấy Buffer từ field file của @fastify/multipart (mọi chế độ attach). */
export function multipartBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value.length ? value : null;
  const v = value as { _buf?: Buffer } | null;
  if (v && Buffer.isBuffer(v._buf)) return v._buf.length ? v._buf : null;
  return null;
}

/** Nhận diện MIME qua magic bytes (keyValues làm mất content-type). */
export function sniffMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  // Box ISO-BMFF: cùng magic "ftyp" ở offset 4 nhưng khác "brand" ở offset 8.
  // Ảnh iPhone (HEIC/HEIF) cũng là ftyp — không được nhầm thành video/mp4.
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand))
      return "image/heic";
    if (brand === "avif" || brand === "avis") return "image/avif";
    return "video/mp4";
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  )
    return "video/webm";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF")
    return "image/webp";
  return "application/octet-stream";
}

/**
 * Ảnh CCCD phải hiển thị nhanh trên trình duyệt admin. sharp đọc mọi định dạng
 * phổ biến (kể cả HEIC/HEIF iPhone mà <img> không render được), xoay theo EXIF,
 * thu nhỏ tối đa 1600px và nén JPEG ~80% → luôn ra ảnh JPEG nhẹ (thường vài trăm
 * KB) load tức thì thay vì ảnh gốc 3–8MB đen mãi. Ảnh không đọc được → báo lỗi.
 */
export async function toDisplayableImage(
  buf: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    // libvips prebuilt trên Linux KHÔNG decode được HEIF/HEIC (chỉ đăng ký format
    // chứ không có bộ giải mã) — nên ảnh iPhone phải qua heic-convert (WASM, chạy
    // mọi nền tảng) sang JPEG trước, rồi mới đưa vào sharp để resize/nén.
    let src = buf;
    if (mime === "image/heic" || mime === "image/heif") {
      const jpg = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
      src = Buffer.from(jpg);
    }
    const out = await sharp(src)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { buffer: out, contentType: "image/jpeg" };
  } catch {
    throw new AppError(
      "KOL_IMAGE_FORMAT",
      "Ảnh CCCD không đọc được. Vui lòng chọn ảnh JPG, PNG hoặc ảnh iPhone (HEIC).",
      400,
    );
  }
}
