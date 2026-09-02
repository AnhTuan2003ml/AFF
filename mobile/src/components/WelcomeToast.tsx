import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/Mascot';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { camio } from '@/lib/camio-voice';
import { colors, radius, shadow } from '@/theme/tokens';

/**
 * Linh vật chào ngay sau khi đăng nhập — dựng lại `blob-welcome` của web.
 * Hiện toast ở trên cùng vài giây rồi tự tắt.
 */
export function WelcomeToast() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { chaoMung, xoaChaoMung } = useSession();
  const loiChao = useRef(camio('welcome')).current;

  useEffect(() => {
    if (!chaoMung) return;
    const t = setTimeout(xoaChaoMung, 3200);
    return () => clearTimeout(t);
  }, [chaoMung, xoaChaoMung]);

  if (!chaoMung) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
      <View style={styles.toast}>
        <Mascot mood="thichthu" size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{loiChao}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {t('Đi săn hoàn tiếp thôi', 'Back to cashback hunting')}, {chaoMung}!
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 360,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  title: { fontSize: 14, fontWeight: '900', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
});
