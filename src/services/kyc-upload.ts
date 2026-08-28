import heicConvert from "heic-convert";
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
 * Ảnh CCCD phải hiển thị được trên trình duyệt admin. Ảnh iPhone (HEIC/HEIF) và
 * AVIF không render bằng <img> nên chuyển sang JPEG; JPG/PNG/WebP giữ nguyên.
 * Định dạng ảnh lạ → báo lỗi để người dùng tải lại đúng.
 */
export async function toDisplayableImage(
  buf: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    return { buffer: buf, contentType: mime };
  }
  if (mime === "image/heic" || mime === "image/heif" || mime === "image/avif") {
    const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.9 });
    return { buffer: Buffer.from(out), contentType: "image/jpeg" };
  }
  throw new AppError(
    "KOL_IMAGE_FORMAT",
    "Ảnh CCCD phải là JPG, PNG hoặc ảnh iPhone (HEIC). Vui lòng chọn lại ảnh.",
    400,
  );
}
