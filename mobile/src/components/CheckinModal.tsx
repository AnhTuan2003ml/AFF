import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { diemDanh, layDiemDanh } from '@/api/features';
import { Mascot } from '@/components/Mascot';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Điểm danh hằng ngày — POPUP đè lên màn hình hiện tại (giống popup của web
 * mở từ nút "Điểm danh mỗi ngày"), có nút ✕ để đóng, không phải màn riêng.
 *
 * Ngày "hôm nay" do BACKEND quyết định (`today`), không lấy giờ máy: dịch vụ
 * tính theo múi giờ Việt Nam, điện thoại có thể đặt múi giờ khác.
 */
export function CheckinModal({ mo, dong }: { mo: boolean; dong: () => void }) {
  const { user } = useSession();
  const t = useT();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['checkin'],
    queryFn: layDiemDanh,
    enabled: !!user && mo,
  });

  const ghi = useMutation({
    mutationFn: diemDanh,
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['checkin'] });
      if (r.justCheckedIn) {
        Alert.alert(
          t('Đã điểm danh 🔥', 'Checked in 🔥'),
          t(
            `Chuỗi hiện tại: ${r.streak} ngày liên tiếp.`,
            `Current streak: ${r.streak} days in a row.`,
          ),
        );
      }
    },
    onError: (e) =>
      Alert.alert(
        t('Chưa điểm danh được', 'Could not check in'),
        e instanceof Error ? e.message : t('Thử lại sau.', 'Please try again later.'),
      ),
  });

  const bayNgay = (() => {
    if (!data?.today) return [];
    const moc = new Date(`${data.today}T00:00:00Z`);
    const daCo = new Set(data.dates ?? []);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(moc);
      d.setUTCDate(moc.getUTCDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      return { iso, thu: d.getUTCDate(), xong: daCo.has(iso), homNay: iso === data.today };
    });
  })();

  return (
    <Modal visible={mo} transparent animationType="fade" onRequestClose={dong}>
      {/* Bấm nền mờ hoặc nút ✕ đều đóng; bấm trong thẻ thì không. */}
      <Pressable style={styles.scrim} onPress={dong}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Pressable style={styles.close} hitSlop={8} onPress={dong} accessibilityLabel={t('Đóng', 'Close')}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>

          <View style={styles.head}>
            <Mascot mood="thichthu" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('Điểm danh mỗi ngày', 'Daily check-in')}</Text>
              <Text style={styles.sub}>
                {t('Mở app mỗi ngày để giữ chuỗi liên tiếp.', 'Open the app every day to keep your streak.')}
              </Text>
            </View>
          </View>

          {!user ? (
            <Text style={styles.loading}>
              {t('Đăng nhập để điểm danh và giữ chuỗi nhé.', 'Sign in to check in and keep your streak.')}
            </Text>
          ) : isPending ? (
            <Text style={styles.loading}>{t('Đang tải…', 'Loading…')}</Text>
          ) : (
            <>
              <View style={styles.streakBox}>
                <Ionicons name="flame" size={24} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.streakValue}>
                    {data?.streak ?? 0} {t('ngày', 'days')}
                  </Text>
                  <Text style={styles.streakLabel}>
                    {t('liên tiếp · tổng', 'in a row · total')} {data?.totalDays ?? 0}{' '}
                    {t('ngày đã điểm danh', 'days checked in')}
                  </Text>
                </View>
              </View>

              <View style={styles.week}>
                {bayNgay.map((n) => (
                  <View
                    key={n.iso}
                    style={[
                      styles.day,
                      n.xong && styles.dayDone,
                      n.homNay && !n.xong && styles.dayToday,
                    ]}>
                    {n.xong ? (
                      <Ionicons name="checkmark" size={15} color={colors.onBrand} />
                    ) : (
                      <Text style={[styles.dayText, n.homNay && { color: colors.brand }]}>
                        {n.thu}
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => ghi.mutate()}
                disabled={data?.checkedInToday || ghi.isPending}
                style={({ pressed }) => [
                  styles.btn,
                  (data?.checkedInToday || ghi.isPending) && { opacity: 0.5 },
                  pressed && { backgroundColor: colors.brandStrong },
                ]}>
                <Text style={styles.btnText}>
                  {data?.checkedInToday
                    ? t('Hôm nay đã điểm danh ✓', 'Checked in today ✓')
                    : t('Điểm danh hôm nay', 'Check in today')}
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(40,22,14,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    paddingTop: 18,
    gap: 12,
    ...shadow.card,
  },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 30 },
  title: { fontSize: 17, fontWeight: '900', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  loading: { fontSize: 13, color: colors.muted, paddingVertical: 14 },

  streakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  streakValue: { fontSize: 22, fontWeight: '900', color: colors.brand, letterSpacing: -0.6 },
  streakLabel: { fontSize: 12, color: colors.muted, marginTop: 1 },

  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dayDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayToday: { borderColor: colors.brand, borderWidth: 2 },
  dayText: { fontSize: 13, fontWeight: '800', color: colors.muted },

  btn: {
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.onBrand, fontWeight: '800', fontSize: 14.5 },
});
