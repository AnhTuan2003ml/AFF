import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { doiTen } from '@/api/bank';
import { Mascot } from '@/components/Mascot';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { colors } from '@/theme/tokens';

/**
 * Nhắc chọn giới tính cho user chưa có (đăng ký bằng Google / tài khoản cũ).
 * Email đã có sẵn trường giới tính khi đăng ký nên không rơi vào đây. Bấm "Để
 * sau" thì ẩn tới khi mở lại app (cờ ở cấp module, sống trọn phiên chạy).
 */
let deSauTrongPhien = false;

export function GioiTinhModal() {
  const t = useT();
  const { user, lamMoiHoSo } = useSession();
  const [dangLuu, setDangLuu] = useState(false);
  const [an, setAn] = useState(false);

  const hien = Boolean(user) && user?.gender === 'UNKNOWN' && !deSauTrongPhien && !an;
  if (!hien) return null;

  async function chon(gender: 'MALE' | 'FEMALE') {
    if (dangLuu || !user) return;
    setDangLuu(true);
    try {
      await doiTen(user.fullName, gender);
      await lamMoiHoSo();
    } catch {
      // Lỗi mạng: đóng để không chặn app, lần sau nhắc lại.
      deSauTrongPhien = true;
      setAn(true);
    } finally {
      setDangLuu(false);
    }
  }

  function deSau() {
    deSauTrongPhien = true;
    setAn(true);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={deSau}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.mascot}><Mascot mood="vuive" size={64} /></View>
          <Text style={styles.title}>{t('Cho Camio biết bạn là anh hay chị nhé!', 'Let Camio know how to address you!')}</Text>
          <Text style={styles.desc}>{t('Để Camio xưng hô đúng khi trò chuyện với bạn.', 'So Camio addresses you correctly in chat.')}</Text>

          <View style={styles.opts}>
            {(['MALE', 'FEMALE'] as const).map((g) => (
              <Pressable
                key={g}
                onPress={() => chon(g)}
                disabled={dangLuu}
                style={({ pressed }) => [styles.opt, pressed && styles.optOn]}>
                <Text style={styles.optEmoji}>{g === 'MALE' ? '👨' : '👩'}</Text>
                <Text style={styles.optText}>{g === 'MALE' ? t('Nam', 'Male') : t('Nữ', 'Female')}</Text>
              </Pressable>
            ))}
          </View>

          {dangLuu ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 14 }} />
          ) : (
            <Pressable onPress={deSau} style={styles.later}>
              <Text style={styles.laterText}>{t('Để sau', 'Later')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1, backgroundColor: 'rgba(10,6,4,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 400, backgroundColor: colors.surface,
    borderRadius: 24, padding: 24, alignItems: 'center',
  },
  mascot: {
    width: 76, height: 76, borderRadius: 38, marginTop: -58, marginBottom: 8,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: colors.brand,
  },
  title: { fontSize: 17, fontWeight: '900', color: colors.text, textAlign: 'center', lineHeight: 23 },
  desc: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 18, lineHeight: 19 },
  opts: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  opt: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16,
    borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper,
  },
  optOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optEmoji: { fontSize: 30 },
  optText: { fontSize: 15, fontWeight: '800', color: colors.text },
  later: { marginTop: 14, padding: 6 },
  laterText: { fontSize: 13, fontWeight: '700', color: colors.muted },
});
