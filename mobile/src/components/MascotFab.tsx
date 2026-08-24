import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot, type CamioMood } from '@/components/Mascot';
import { colors, radius } from '@/theme/tokens';

/**
 * Nút nổi linh vật CamiO — tự đổi biểu cảm, KHÔNG nền thẻ. Bấm là mở THẲNG màn
 * Hỗ trợ (bỏ bước hộp thoại xác nhận trung gian).
 */

// Vòng biểu cảm như blob-fab.js (đã map qua 6 biểu cảm CamiO).
const CYCLE: CamioMood[] = ['haohung', 'vuive', 'thichthu', 'baocao', 'haohung', 'tutin'];

export function MascotFab() {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % CYCLE.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <Pressable
      onPress={() => router.push('/support')}
      accessibilityLabel="Mở hỗ trợ"
      style={({ pressed }) => [
        styles.fab,
        { bottom: insets.bottom + 62 + 14 },
        pressed && { opacity: 0.85 },
      ]}>
      <Mascot mood={CYCLE[i]} size={38} />
      <Text style={styles.label}>Camio</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Linh vật nổi "trần", không thẻ nền/viền/bóng.
  fab: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  label: { fontSize: 11, fontWeight: '900', color: colors.brand },
});
