import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { apiFetch } from '@/api/client';
import { colors, shadow } from '@/theme/tokens';

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

// Hiện MỘT LẦN mỗi lần mở app: cờ nằm ở cấp module nên sống trọn phiên chạy
// (chuyển tab/màn không hiện lại), mở app lần sau reset và hiện lại.
let daHienTrongPhien = false;

export function EntryPromoModal() {
  const [promo, setPromo] = useState<EntryPromo | null>(null);
  const [mo, setMo] = useState(false);

  useEffect(() => {
    let dangSong = true;
    (async () => {
      try {
        if (daHienTrongPhien) return;
        const data = await apiFetch<{ promo: EntryPromo | null }>('/app/entry-promo', {
          auth: false,
        });
        if (dangSong && data.promo) {
          daHienTrongPhien = true;
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

  return (
    <Modal visible={mo} transparent animationType="fade" onRequestClose={dong}>
      <View style={styles.scrim}>
        {/* CHỈ ảnh quảng cáo — bấm vào ảnh là mở; không chữ, không nút CTA. */}
        <Pressable
          onPress={moLink}
          disabled={!promo.targetUrl}
          accessibilityLabel={promo.title}
          style={styles.card}>
          <Image source={{ uri: promo.imageUrl ?? '' }} style={styles.visual} contentFit="cover" />
        </Pressable>
        {/* Nút ✕ TÁCH RIÊNG dưới thẻ quảng cáo — nổi trên nền mờ trong suốt. */}
        <View style={styles.closebar}>
          <Pressable onPress={dong} hitSlop={10} style={styles.close} accessibilityLabel="Đóng quảng cáo">
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
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
  visual: { width: '100%', height: 300 },
  // Nút ✕ nằm NGOÀI thẻ, trên nền mờ — nền khu vực này trong suốt.
  closebar: { alignItems: 'center', marginTop: 14 },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
