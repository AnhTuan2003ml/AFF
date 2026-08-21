import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { diemDanh, layDiemDanh } from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { FormScreen } from '@/components/FormScreen';
import { useSession } from '@/hooks/useSession';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Điểm danh hằng ngày.
 *
 * Ngày "hôm nay" do BACKEND quyết định (`today` trong phản hồi), không lấy giờ
 * máy: dịch vụ tính theo múi giờ Việt Nam, còn điện thoại có thể đang đặt múi
 * giờ khác hoặc sai đồng hồ. Lấy giờ máy sẽ vẽ lịch lệch một ô.
 */
export default function CheckinScreen() {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['checkin'],
    queryFn: layDiemDanh,
    enabled: !!user,
  });

  const ghi = useMutation({
    mutationFn: diemDanh,
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['checkin'] });
      if (r.justCheckedIn) {
        Alert.alert('Đã điểm danh', `Chuỗi hiện tại: ${r.streak} ngày liên tiếp.`);
      }
    },
    onError: (e) =>
      Alert.alert('Chưa điểm danh được', e instanceof Error ? e.message : 'Thử lại sau.'),
  });

  // Bảy ngày gần nhất, tính lùi từ mốc "hôm nay" của server.
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

  if (!user) return <CanDangNhap mo_ta="Đăng nhập để điểm danh mỗi ngày và giữ chuỗi liên tiếp." />;

  return (
    <FormScreen title="Điểm danh" subtitle="Mở app mỗi ngày để giữ chuỗi liên tiếp.">
      {isPending ? (
        <Text style={styles.loading}>Đang tải…</Text>
      ) : (
        <>
          <View style={styles.streakBox}>
            <Ionicons name="flame" size={26} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.streakValue}>{data?.streak ?? 0} ngày</Text>
              <Text style={styles.streakLabel}>
                liên tiếp · tổng {data?.totalDays ?? 0} ngày đã điểm danh
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
              {data?.checkedInToday ? 'Hôm nay đã điểm danh' : 'Điểm danh hôm nay'}
            </Text>
          </Pressable>
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  loading: { fontSize: 13, color: colors.muted, paddingVertical: 20 },
  streakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  streakValue: { fontSize: 24, fontWeight: '900', color: colors.brand, letterSpacing: -0.8 },
  streakLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },

  week: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.lg },
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
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },
});
