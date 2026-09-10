import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '@/api/client';
import { useT } from '@/i18n';
import { colors, shadow } from '@/theme/tokens';

/**
 * Popup quảng cáo khi mở app — bản native của `entry-promo` trên web:
 * lấy đúng nội dung admin đăng (GET /app/entry-promo, mục PUBLISHED có ảnh),
 * kích thước theo bản 60% của web (khung hẹp, ảnh 216, chữ nhỏ), nút ✕ ở
 * CHÂN popup là cách đóng duy nhất; mỗi vòng xoay chỉ hiện một lần trên thiết
 * bị (giống localStorage của web — ở app lưu SecureStore).
 */

interface EntryPromo {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  description: string;
  targetUrl: string | null;
  imageUrl: string | null;
  badge: string | null;
}

// Hiện MỘT LẦN mỗi lần mở app: cờ nằm ở cấp module nên sống trọn phiên chạy
// (chuyển tab/màn không hiện lại), mở app lần sau reset và hiện lại.
let daHienTrongPhien = false;
const SEEN_ROTATION_KEY = 'shoptik-entry-promo-seen-rotation';

export function EntryPromoModal() {
  const t = useT();
  const [promo, setPromo] = useState<EntryPromo | null>(null);
  const [mo, setMo] = useState(false);

  useEffect(() => {
    let dangSong = true;
    (async () => {
      try {
        if (daHienTrongPhien) return;
        const data = await apiFetch<{
          promo: EntryPromo | null;
          rotationKey: string | null;
        }>('/app/entry-promo', { auth: false });
        if (dangSong && data.promo) {
          const currentRotationKey = data.rotationKey ?? data.promo.id;
          let seenRotationKey: string | null = null;
          try {
            seenRotationKey = await SecureStore.getItemAsync(SEEN_ROTATION_KEY);
          } catch {
            // SecureStore không khả dụng: vẫn cho quảng cáo hiển thị bình thường.
          }
          if (!dangSong) return;
          if (seenRotationKey === currentRotationKey) {
            daHienTrongPhien = true;
            return;
          }
          daHienTrongPhien = true;
          void SecureStore.setItemAsync(SEEN_ROTATION_KEY, currentRotationKey).catch(() => {});
          setPromo(data.promo);
          setMo(true);
        }
      } catch {
        // Không có quảng cáo / lỗi mạng — im lặng, không chặn app.
      }
    })();
    return () => {
      dangSong = false;
    };
  }, []);

  function dong() {
    setMo(false);
  }

  async function moLink() {
    if (!promo?.targetUrl) return;
    dong();
    await WebBrowser.openBrowserAsync(promo.targetUrl).catch(() => {});
  }

  if (!promo) return null;

  const coCta = Boolean(promo.targetUrl);
  const coND = Boolean(promo.title || promo.description);

  return (
    <Modal visible={mo} transparent animationType="fade" onRequestClose={dong}>
      <Pressable style={styles.scrim} onPress={dong}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Ảnh quảng cáo — bấm ảnh mở link (nếu có). */}
          <Pressable onPress={moLink} disabled={!coCta} accessibilityLabel={promo.title}>
            {promo.imageUrl ? (
              <Image source={{ uri: promo.imageUrl }} style={styles.visual} contentFit="cover" />
            ) : null}
            {promo.badge ? (
              <View style={styles.badge}><Text style={styles.badgeText}>{promo.badge}</Text></View>
            ) : null}
          </Pressable>

          {/* Nút ✕ ở GÓC thẻ — gọn, không đè lung tung ra ngoài. */}
          <Pressable onPress={dong} hitSlop={10} style={styles.close} accessibilityLabel={t('Đóng', 'Close')}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>

          {coND ? (
            <View style={styles.body}>
              {promo.title ? <Text style={styles.title} numberOfLines={2}>{promo.title}</Text> : null}
              {promo.description ? <Text style={styles.desc} numberOfLines={3}>{promo.description}</Text> : null}
              {coCta ? (
                <Pressable onPress={moLink} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
                  <Text style={styles.ctaText}>{t('Xem ngay', 'View now')}</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(18,10,6,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '86%',
    maxWidth: 400,
    borderRadius: 22,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.card,
  },
  visual: { width: '100%', aspectRatio: 1, backgroundColor: colors.paper },
  badge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: colors.brand, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  badgeText: { color: colors.onBrand, fontSize: 11, fontWeight: '900' },
  close: {
    position: 'absolute', top: 12, right: 12,
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  body: { padding: 16, gap: 8 },
  title: { fontSize: 16, fontWeight: '900', color: colors.text, lineHeight: 22 },
  desc: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  cta: {
    marginTop: 4, height: 46, borderRadius: 12, backgroundColor: colors.brand,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  ctaText: { color: colors.onBrand, fontWeight: '800', fontSize: 14.5 },
});
