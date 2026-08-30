import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layGioiThieu } from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { useSession } from '@/hooks/useSession';
import { useLang, type Lang } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const T = {
  vi: {
    back: 'Quay lại',
    title: 'Xem lại tài khoản',
    intro: 'Dưới đây là dữ liệu tài khoản của bạn đang lưu trên ShopTik.',
    data: 'Dữ liệu tài khoản',
    email: 'Email',
    name: 'Họ và tên',
    refcode: 'Mã giới thiệu',
    role: 'Loại tài khoản',
    roleUser: 'Người dùng',
    rightsTitle: 'Quyền của bạn',
    rights: [
      'Truy cập: xem toàn bộ dữ liệu tài khoản tại đây và trong mục Thông tin cá nhân.',
      'Chỉnh sửa: cập nhật họ tên trong mục Thông tin cá nhân bất cứ lúc nào.',
      'Xóa: yêu cầu xóa tài khoản trong mục Xóa tài khoản (một số dữ liệu đối soát được giữ lại theo quy định kế toán).',
    ],
    linkPrivacy: 'Quyền riêng tư',
    linkDelete: 'Xóa tài khoản',
  },
  en: {
    back: 'Back',
    title: 'Account Review',
    intro: 'Below is the account data ShopTik currently stores for you.',
    data: 'Account data',
    email: 'Email',
    name: 'Full name',
    refcode: 'Referral code',
    role: 'Account type',
    roleUser: 'User',
    rightsTitle: 'Your rights',
    rights: [
      'Access: view all your account data here and in the Personal Info section.',
      'Edit: update your full name in the Personal Info section at any time.',
      'Delete: request account deletion in the Delete Account section (some reconciliation data is retained for accounting compliance).',
    ],
    linkPrivacy: 'Privacy Policy',
    linkDelete: 'Delete Account',
  },
} as const;

export default function AccountReviewScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { lang, setLang } = useLang();
  const t = T[lang];
  const { data: gioiThieu } = useQuery({
    queryKey: ['referrals'],
    queryFn: layGioiThieu,
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <CanDangNhap mo_ta="Đăng nhập để xem lại dữ liệu tài khoản." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={styles.backText}>{t.back}</Text>
          </Pressable>
          <View style={styles.langToggle}>
            <LangBtn label="VI" active={lang === 'vi'} onPress={() => setLang('vi')} />
            <LangBtn label="EN" active={lang === 'en'} onPress={() => setLang('en')} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={typography.screenTitle}>{t.title}</Text>
          <Text style={[typography.body, { marginTop: 10 }]}>{t.intro}</Text>

          <Text style={[typography.eyebrow, styles.blockLabel]}>{t.data.toUpperCase()}</Text>
          <Row label={t.email} value={user.email} />
          <Row label={t.name} value={user.fullName || '—'} />
          <Row label={t.refcode} value={gioiThieu?.referralCode || '—'} />
          <Row label={t.role} value={user.role === 'USER' ? t.roleUser : user.role} last />

          <Text style={[typography.eyebrow, styles.blockLabel]}>{t.rightsTitle.toUpperCase()}</Text>
          {t.rights.map((r, i) => (
            <View key={i} style={styles.rightRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginTop: 2 }} />
              <Text style={[typography.body, { flex: 1 }]}>{r}</Text>
            </View>
          ))}

          <View style={styles.links}>
            <LinkBtn icon="lock-closed-outline" label={t.linkPrivacy} onPress={() => router.push('/privacy')} />
            <LinkBtn icon="trash-outline" label={t.linkDelete} danger onPress={() => router.push('/delete-account')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={[typography.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[typography.cardTitle, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LangBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.langBtn, active && styles.langBtnActive]}>
      <Text style={[styles.langText, active && styles.langTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LinkBtn({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.brand} />
      <Text style={[typography.cardTitle, { flex: 1, color: danger ? colors.danger : colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.lineStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 },
  backText: { fontSize: 14, fontWeight: '700', color: colors.text },

  langToggle: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  langBtnActive: { backgroundColor: colors.brand },
  langText: { fontSize: 12.5, fontWeight: '800', color: colors.muted },
  langTextActive: { color: colors.onBrand },

  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  blockLabel: { marginTop: 22, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  links: { marginTop: 22, gap: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
});
