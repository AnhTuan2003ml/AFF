import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../lib/errors.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface StoredContentImage {
  url: string;
  absolutePath: string;
}

function imageExtension(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "gif";
  }

  return null;
}

export function normalizeContentImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/assets/")) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError(
      "INVALID_IMAGE_URL",
      "Link ảnh không hợp lệ. Hãy dùng link bắt đầu bằng http:// hoặc https://.",
      400,
    );
  }

  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new AppError(
      "INVALID_IMAGE_URL",
      "Link ảnh chỉ hỗ trợ giao thức http:// hoặc https://.",
      400,
    );
  }

  return parsed.toString();
}


export function normalizeContentTargetUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError(
      "INVALID_TARGET_URL",
      "Đường dẫn chi tiết không hợp lệ. Hãy dùng link bắt đầu bằng http:// hoặc https://.",
      400,
    );
  }

  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new AppError(
      "INVALID_TARGET_URL",
      "Đường dẫn chi tiết chỉ hỗ trợ giao thức http:// hoặc https://.",
      400,
    );
  }

  return parsed.toString();
}

export async function saveContentImage(
  buffer: Buffer,
): Promise<StoredContentImage> {
  if (buffer.length === 0) {
    throw new AppError("EMPTY_IMAGE", "File ảnh đang trống.", 400);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new AppError(
      "IMAGE_TOO_LARGE",
      "Ảnh vượt quá 5 MB. Hãy giảm dung lượng rồi thử lại.",
      400,
    );
  }

  const extension = imageExtension(buffer);
  if (!extension) {
    throw new AppError(
      "UNSUPPORTED_IMAGE",
      "Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.",
      400,
    );
  }

  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "discover",
  );
  const absolutePath = path.join(uploadDir, fileName);

  await mkdir(uploadDir, { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });

  return {
    url: `/assets/uploads/discover/${fileName}`,
    absolutePath,
  };
}

export async function removeContentImage(
  absolutePath: string | null | undefined,
): Promise<void> {
  if (!absolutePath) return;
  await unlink(absolutePath).catch(() => undefined);
}
