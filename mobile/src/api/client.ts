import { clearTokens, readTokens, saveTokens } from './storage';

/**
 * Client gọi API ShopTik.
 *
 * Backend cấp access token sống 30 phút và refresh token sống 60 ngày
 * (xem src/services/mobile-token.ts ở repo gốc). App không nên bắt người dùng
 * đăng nhập lại mỗi nửa tiếng, nên client này tự xử lý: gặp 401 thì đổi refresh
 * token lấy cặp mới rồi phát lại đúng yêu cầu đó một lần.
 *
 * Điểm cần cẩn thận là ĐỒNG THỜI. Màn hình Ví gọi ba API cùng lúc; nếu access
 * token vừa hết hạn thì cả ba cùng nhận 401 và cùng đi làm mới. Vì backend
 * XOAY refresh token mỗi lần dùng, lượt làm mới đầu tiên thắng còn hai lượt sau
 * cầm token đã chết và đá người dùng ra màn hình đăng nhập oan. Nên ở đây chỉ
 * cho phép đúng một lượt làm mới tại một thời điểm — các yêu cầu khác chờ chung
 * kết quả đó.
 */

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Gọi khi refresh token cũng hết hiệu lực — app cần đưa về màn đăng nhập. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

/** Lượt làm mới đang chạy, nếu có. Chính là cơ chế chống giẫm chân ở trên. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const stored = await readTokens();
  if (!stored) return null;

  const response = await fetch(`${BASE_URL}/api/v1/auth/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
  });

  if (!response.ok) {
    await clearTokens();
    onSessionExpired();
    return null;
  }

  const data = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  await saveTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return data.accessToken;
}

function refreshOnce(): Promise<string | null> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  // Backend trả lỗi theo dạng { error: { code, message, requestId } } và
  // message đã là tiếng Việt dành cho người dùng — hiện thẳng lên được.
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Có lỗi xảy ra. Vui lòng thử lại.',
      response.status,
    );
  } catch {
    return new ApiError(
      'NETWORK',
      'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      response.status,
    );
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Đặt false cho các lệnh công khai như đăng nhập, đăng ký. */
  auth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const send = async (accessToken: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    return fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  let accessToken: string | null = null;
  if (auth) {
    accessToken = (await readTokens())?.accessToken ?? null;
  }

  let response = await send(accessToken);

  if (response.status === 401 && auth) {
    const renewed = await refreshOnce();
    if (!renewed) throw await toApiError(response);
    response = await send(renewed);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Máy chủ có sống không — dùng ở màn hình kiểm tra kết nối. */
export async function pingServer(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/-/ready`);
    return response.ok;
  } catch {
    return false;
  }
}

export const apiBaseUrl = BASE_URL;
