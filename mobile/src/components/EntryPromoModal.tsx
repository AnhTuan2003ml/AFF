import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '@/api/client';
import { colors, radius, shadow } from '@/theme/tokens';

/**
 * Popup quảng cáo khi mở app — bản native của `entry-promo` trên web:
 * lấy đúng nội dung admin đăng (GET /app/entry-promo, mục PUBLISHED có ảnh),
 * kích thước theo bản 60% của web (khung hẹp, ảnh 216, chữ nhỏ), nút ✕ ở
 * CHÂN popup là cách đóng duy nhất; đã đóng thì không hiện lại đến hết ngày
 * (giống localStorage theo ngày của web — ở app lưu SecureStore).
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

const SKIP_KEY = 'shoptik-entry-promo-skip';

function homNay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EntryPromoModal() {
  const [promo, setPromo] = useState<EntryPromo | null>(null);
  const [mo, setMo] = useState(false);

  useEffect(() => {
    let dangSong = true;
    (async () => {
      try {
        // Đã bấm ✕ hôm nay thì thôi — không gọi mạng nữa.
        const skipped = await SecureStore.getItemAsync(SKIP_KEY).catch(() => null);
        if (skipped === homNay()) return;
        const data = await apiFetch<{ promo: EntryPromo | null }>('/app/entry-promo', {
          auth: false,
        });
        if (dangSong && data.promo) {
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
    void SecureStore.setItemAsync(SKIP_KEY, homNay()).catch(() => {});
  }

  async function moLink() {
    if (!promo?.targetUrl) return;
    dong();
    await WebBrowser.openBrowserAsync(promo.targetUrl).catch(() => {});
  }

  if (!promo) return null;

  return (
    <Modal visible={mo} transparent animationType="fade" onRequestClose={dong}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <ScrollView bounces={false} style={{ maxHeight: 430 }}>
            {promo.imageUrl ? (
              <Pressable onPress={moLink} disabled={!promo.targetUrl}>
                <Image
                  source={{ uri: promo.imageUrl }}
                  style={styles.visual}
                  contentFit="cover"
                />
              </Pressable>
            ) : null}
            <View style={styles.body}>
              <View style={styles.chipRow}>
                <Text style={styles.chip}>{promo.typeLabel}</Text>
                {promo.badge ? <Text style={styles.badge}>{promo.badge}</Text> : null}
              </View>
              <Text style={styles.title}>{promo.title}</Text>
              {promo.description ? (
                <Text style={styles.desc} numberOfLines={4}>
                  {promo.description}
                </Text>
              ) : null}
              {promo.targetUrl ? (
                <Pressable
                  onPress={moLink}
                  style={({ pressed }) => [
                    styles.cta,
                    pressed && { backgroundColor: colors.brandStrong },
                  ]}>
                  <Text style={styles.ctaText}>Xem chi tiết</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
          {/* Nút ✕ ở chân popup — cách đóng duy nhất, tắt đến hết ngày. */}
          <View style={styles.closebar}>
            <Pressable onPress={dong} hitSlop={8} style={styles.close} accessibilityLabel="Đóng quảng cáo">
              <Ionicons name="close" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(57,36,27,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  // ~60% bản web gốc: hẹp (76% ngang, tối đa 372) — khớp bản web đã thu nhỏ.
  card: {
    width: '76%',
    maxWidth: 372,
    borderRadius: 20,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.card,
  },
  visual: { width: '100%', height: 216 },
  body: { padding: 15, gap: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
    color: colors.brand,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
  },
  badge: { color: colors.brand, fontSize: 11, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '900', color: colors.text, letterSpacing: -0.4 },
  desc: { fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  cta: {
    marginTop: 8,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onBrand, fontWeight: '800', fontSize: 13.5 },
  closebar: { alignItems: 'center', paddingVertical: 10 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
});
