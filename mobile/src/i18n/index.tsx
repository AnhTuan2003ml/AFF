import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'vi' | 'en';

const LANG_KEY = 'shoptik.lang';

type LangValue = { lang: Lang; setLang: (l: Lang) => void; ready: boolean };

const LangContext = createContext<LangValue | null>(null);

/**
 * Ngôn ngữ TOÀN CỤC của app (Việt/English). Lưu lựa chọn vào SecureStore để mở
 * lại app vẫn giữ. Cách dịch: nội tuyến qua `useT()` → `t('tiếng Việt','English')`
 * — không cần từ điển key riêng, retrofit dần từng chuỗi ở mỗi màn.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('vi');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void SecureStore.getItemAsync(LANG_KEY)
      .then((v) => {
        if (alive && (v === 'vi' || v === 'en')) setLangState(v);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    void SecureStore.setItemAsync(LANG_KEY, l);
  }

  return <LangContext.Provider value={{ lang, setLang, ready }}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang phải nằm trong LanguageProvider');
  return ctx;
}

/**
 * Hàm dịch nội tuyến. Dùng: `const t = useT(); t('Đơn hàng', 'Orders')`.
 */
export function useT(): (vi: string, en: string) => string {
  const { lang } = useLang();
  return (vi, en) => (lang === 'vi' ? vi : en);
}
