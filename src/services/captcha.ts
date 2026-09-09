import type { AppConfig } from "../config.js";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** CAPTCHA chỉ bật khi đủ cả site key lẫn secret key. */
export function captchaEnabled(config: AppConfig): boolean {
  return Boolean(config.TURNSTILE_SITE_KEY && config.TURNSTILE_SECRET_KEY);
}

/** Site key để nhúng widget (rỗng khi tắt). */
export function captchaSiteKey(config: AppConfig): string {
  return captchaEnabled(config) ? config.TURNSTILE_SITE_KEY : "";
}

/**
 * Xác minh token Turnstile ở phía server. Khi CAPTCHA tắt → luôn trả true để
 * không chặn luồng. Lỗi mạng/không có token → false (fail-closed khi đã bật).
 */
export async function verifyCaptcha(
  config: AppConfig,
  token: string | undefined,
  ip?: string,
): Promise<boolean> {
  if (!captchaEnabled(config)) return true;
  if (!token) return false;
  const body = new URLSearchParams({
    secret: config.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const json = (await res.json()) as { success?: boolean };
    return Boolean(json.success);
  } catch {
    return false;
  }
}
