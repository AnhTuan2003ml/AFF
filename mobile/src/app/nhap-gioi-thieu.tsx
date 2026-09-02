import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { guiMaNguoiGioiThieu } from '@/api/features';
import { Mascot, type CamioMood } from '@/components/Mascot';
import { useT } from '@/i18n';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Mời nhập mã giới thiệu (tài khoản mới qua Google, hoặc nhập bù từ tab
 * Giới thiệu). CamiO dẫn chuyện và ĐỔI BIỂU CẢM theo thao tác: tò mò khi
 * chưa gõ → hào hứng khi đang gõ → ngạc nhiên nếu mã sai → tự tin khi xong.
 */
export default function NhapGioiThieuScreen() {
  const t = useT();
  const qc = useQueryClient();
  const [ma, setMa] = useState('');
  const [trangThai, setTrangThai] = useState<'cho' | 'loi' | 'xong'>('cho');

  const gui = useMutation({
    mutationFn: guiMaNguoiGioiThieu,
    onSuccess: () => {
      setTrangThai('xong');
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      // Cho CamiO khoe biểu cảm "tự tin" một nhịp rồi mới rời màn.
      setTimeout(thoat, 1400);
    },
    onError: () => setTrangThai('loi'),
  });

  function thoat() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  const dangGo = ma.trim().length > 0;
  const mood: CamioMood =
    trangThai === 'xong' ? 'tutin' : trangThai === 'loi' ? 'ngacnhien' : dangGo ? 'haohung' : 'thichthu';
  const loiNhan =
    trangThai === 'xong'
      ? 'Tuyệt! Đã ghi nhận người giới thiệu của bạn 🧡'
      : trangThai === 'loi'
        ? 'Ơ, mã này Camio tìm không ra… kiểm tra lại giúp mình nha!'
        : dangGo
          ? 'Nhìn ổn đấy! Bấm xác nhận là xong 🎯'
          : 'Có mã của bạn bè không? Nhập vào là cả hai cùng có quà đó!';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* CamiO dẫn chuyện — lơ lửng sẵn trong component Mascot. */}
        <View style={styles.hero}>
          <Mascot mood={mood} size={116} noi={loiNhan} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.giftBadge}>
              <Ionicons name="gift" size={17} color={colors.onBrand} />
            </View>
            <Text style={styles.title}>{t('Bạn có mã giới thiệu?', 'Have a referral code?')}</Text>
          </View>
          <Text style={styles.subtitle}>
            {t(
              'Nhập mã của bạn bè/đối tác để cả hai cùng nhận quyền lợi. Không có thì bỏ qua — sau vẫn nhập bù được ở mục Giới thiệu.',
              'Enter a friend or partner code so both of you get benefits. No code? Skip it — you can still add one later under Referrals.',
            )}
          </Text>

          <TextInput
            value={ma}
            onChangeText={(v) => {
              setMa(v);
              if (trangThai === 'loi') setTrangThai('cho');
            }}
            placeholder={t('VD: 557922 hoặc NamDong', 'e.g. 557922 or NamDong')}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            editable={trangThai !== 'xong'}
            style={[
              styles.input,
              trangThai === 'loi' && styles.inputLoi,
              trangThai === 'xong' && styles.inputXong,
            ]}
          />

          <Pressable
            onPress={() => dangGo && gui.mutate(ma.trim())}
            disabled={gui.isPending || !dangGo || trangThai === 'xong'}
            style={({ pressed }) => [
              styles.submit,
              trangThai === 'xong' && styles.submitXong,
              (pressed || gui.isPending || !dangGo) && trangThai !== 'xong' && { opacity: 0.7 },
            ]}>
            <Ionicons
              name={trangThai === 'xong' ? 'checkmark-circle' : 'sparkles'}
              size={17}
              color={colors.onBrand}
            />
            <Text style={styles.submitText}>
              {trangThai === 'xong' ? t('Đã ghi nhận!', 'Recorded!') : gui.isPending ? t('Đang gửi…', 'Sending…') : t('Xác nhận mã', 'Confirm code')}
            </Text>
          </Pressable>
        </View>

        {trangThai !== 'xong' && (
          <Pressable
            onPress={thoat}
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}>
            <Text style={styles.skipText}>{t('Không có mã — bỏ qua bước này', 'No code — skip this step')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    paddingBottom: 40,
  },
  hero: { alignItems: 'center', marginBottom: 6 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  giftBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '900', color: colors.text, flex: 1 },
  subtitle: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 8 },

  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: colors.paper,
    marginTop: spacing.md,
  },
  inputLoi: { borderColor: colors.danger },
  inputXong: { borderColor: colors.success, color: colors.success },

  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    marginTop: spacing.md,
  },
  submitXong: { backgroundColor: colors.success },
  submitText: { color: colors.onBrand, fontWeight: '900', fontSize: 15 },

  skip: { alignItems: 'center', paddingVertical: 18 },
  skipText: { color: colors.muted, fontWeight: '700', fontSize: 13.5 },
});
