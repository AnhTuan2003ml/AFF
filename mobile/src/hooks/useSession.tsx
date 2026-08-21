import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { AuthUser } from '@/api/auth';
import * as authApi from '@/api/auth';
import { layMe } from '@/api/account';
import { readTokens } from '@/api/storage';

/**
 * Trạng thái đăng nhập dùng chung cho cả app.
 *
 * Khi mở app, token còn nằm trong SecureStore từ lần trước nên KHÔNG hỏi lại
 * mật khẩu — gọi /me một lần để lấy hồ sơ. Nếu access token đã hết hạn thì
 * `apiFetch` tự làm mới bằng refresh token; chỉ khi refresh cũng hỏng mới coi
 * là chưa đăng nhập.
 */

interface SessionValue {
  user: AuthUser | null;
  /** true trong lúc khôi phục phiên lúc mở app — chưa biết đăng nhập hay chưa. */
  dangKhoiPhuc: boolean;
  dangNhap: (email: string, password: string) => Promise<void>;
  dangXuat: () => Promise<void>;
  lamMoiHoSo: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dangKhoiPhuc, setDangKhoiPhuc] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let huy = false;
    (async () => {
      try {
        // Không có token thì khỏi gọi mạng — mở app lần đầu là trường hợp này.
        if (!(await readTokens())) return;
        const me = await layMe();
        if (!huy) setUser(me.user);
      } catch {
        // Token hỏng hoặc hết hạn cả refresh: coi như chưa đăng nhập, không
        // ném lỗi ra màn hình vì đây là đường chạy bình thường.
      } finally {
        if (!huy) setDangKhoiPhuc(false);
      }
    })();
    return () => {
      huy = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      dangKhoiPhuc,
      async dangNhap(email, password) {
        setUser(await authApi.login(email, password));
      },
      async dangXuat() {
        await authApi.logout();
        setUser(null);
        // Xoá cache: dữ liệu ví và đơn của người vừa đăng xuất không được phép
        // hiện ra cho người đăng nhập kế tiếp trên cùng máy.
        queryClient.clear();
      },
      async lamMoiHoSo() {
        const me = await layMe();
        setUser(me.user);
      },
    }),
    [user, dangKhoiPhuc, queryClient],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession phải nằm trong SessionProvider');
  return ctx;
}
