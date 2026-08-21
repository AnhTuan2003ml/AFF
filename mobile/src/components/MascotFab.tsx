import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot, type CamioMood } from '@/components/Mascot';
import { colors, radius, shadow } from '@/theme/tokens';

/**
 * Nút "Hỗ trợ" nổi có LINH VẬT CamiO tự đổi biểu cảm — dựng lại `st-support-fab`
 * + `blob-fab.js` của web. Hiện trên mọi tab. Bấm vào: linh vật chào và mở hộp
 * thoại hỗ trợ (mở trang CSKH của web bằng trình duyệt hệ thống).
 */

// Vòng biểu cảm như blob-fab.js (đã map qua 6 biểu cảm CamiO).
const CYCLE: CamioMood[] = ['haohung', 'vuive', 'thichthu', 'baocao', 'haohung', 'tutin'];

export function MascotFab() {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [noi, setNoi] = useState<string | null>(null);
  const [mo, setMo] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % CYCLE.length), 2600);
    return () => clearInterval(t);
  }, []);

  function bam() {
    setNoi('Cần giúp gì không?');
    setMo(true);
    setTimeout(() => setNoi(null), 2200);
  }

  return (
    <>
      <Pressable
        onPress={bam}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 62 + 14 },
          pressed && { opacity: 0.9 },
        ]}>
        <Mascot mood={CYCLE[i]} size={38} noi={noi} />
        <Text style={styles.label}>Hỗ trợ</Text>
      </Pressable>

      <Modal visible={mo} transparent animationType="fade" onRequestClose={() => setMo(false)}>
        <Pressable style={styles.scrim} onPress={() => setMo(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Mascot mood="haohung" size={56} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Trợ lý ShopTik</Text>
                <Text style={styles.sheetSub}>
                  Cần giúp gì không? Đội CSKH luôn sẵn sàng hỗ trợ bạn.
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }]}
              onPress={() => {
                setMo(false);
                router.push('/support');
              }}>
              <Text style={styles.primaryText}>Nhắn đội hỗ trợ</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => setMo(false)}>
              <Text style={styles.ghostText}>Để sau</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  label: { fontSize: 11, fontWeight: '900', color: colors.brand },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(40,22,14,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 20,
    paddingBottom: 34,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 14,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 19 },
  primary: {
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },
  ghost: { alignItems: 'center', paddingVertical: 6 },
  ghostText: { color: colors.muted, fontWeight: '700', fontSize: 13.5 },
});
