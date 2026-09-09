import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) thuần bằng `crypto` — không thêm dependency. Dùng cho xác
 * thực hai lớp của tài khoản quản trị. Tương thích Google Authenticator,
 * Microsoft Authenticator, Authy… (SHA1, 6 số, chu kỳ 30 giây).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Sinh secret base32 ngẫu nhiên (mặc định 20 byte = 160 bit). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

function equalToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Mã TOTP hiện tại (dùng cho test/kiểm chứng). */
export function totpToken(
  secret: string,
  at: number = Date.now(),
  step = 30,
): string {
  return hotp(base32Decode(secret), Math.floor(at / 1000 / step));
}

/**
 * Xác thực mã người dùng nhập; chấp nhận trượt ±window bước (mặc định ±1 =
 * ±30s) để bù lệch đồng hồ. So sánh thời gian hằng số.
 */
export function verifyTotp(
  secret: string,
  token: string,
  opts: { at?: number; window?: number; step?: number } = {},
): boolean {
  const t = (token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  const at = opts.at ?? Date.now();
  const step = opts.step ?? 30;
  const window = opts.window ?? 1;
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / step);
  for (let w = -window; w <= window; w += 1) {
    if (equalToken(hotp(key, counter + w), t)) return true;
  }
  return false;
}

/** URI otpauth:// để quét QR hoặc nhập tay vào app Authenticator. */
export function totpKeyUri(
  secret: string,
  account: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Chia secret thành nhóm 4 ký tự cho dễ nhập tay. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
