import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  layNhiemVu,
  layNguoiMoi,
  nhanThuong,
  type MissionGroup,
  type MissionItem,
  type MissionReferralPerson,
} from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { FormScreen } from '@/components/FormScreen';
import { useSession } from '@/hooks/useSession';
import { useLang, useT } from '@/i18n';
import { ngay, vnd } from '@/lib/format';
import { localizeMissionTitle } from '@/lib/mission-i18n';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Nhiệm vụ — hai nhóm mốc (mời bạn / mua sắm) chuyển bằng tab segmented, giống
 * web mobile. Backend trả tiến độ đã gộp cho cả nhóm (`currentProgress` so với
 * `maxThreshold`) nên app không tự tính lại để khỏi lệch số.
 */
type Tab = 'referral' | 'purchase';

export default function MissionsScreen() {
  const t = useT();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('referral');

  const { data, isPending } = useQuery({
    queryKey: ['missions'],
    queryFn: layNhiemVu,
    enabled: !!user,
  });
  const { data: nguoiMoi } = useQuery({
    queryKey: ['mission-referral-people'],
    queryFn: layNguoiMoi,
    enabled: !!user,
  });

  const nhan = useMutation({
    mutationFn: nhanThuong,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['missions'] });
      await qc.invalidateQueries({ queryKey: ['wallet'] });
      Alert.alert(t('Đã nhận thưởng', 'Reward claimed'), t('Phần thưởng đã được cộng vào ví của bạn.', 'The reward has been added to your wallet.'));
    },
    onError: (e) =>
      Alert.alert(t('Chưa nhận được', "Couldn't claim"), e instanceof Error ? e.message : t('Thử lại sau.', 'Please try again later.')),
  });

  if (!user) return <CanDangNhap mo_ta={t('Đăng nhập để xem tiến độ nhiệm vụ và nhận thưởng.', 'Log in to view mission progress and claim rewards.')} />;

  const nhom = tab === 'referral' ? data?.REFERRAL_MILESTONE : data?.PURCHASE_MILESTONE;
  const donVi = tab === 'referral' ? t('người', 'people') : t('đơn', 'orders');

  return (
    <FormScreen title={t('Nhiệm vụ', 'Missions')}>
      <View style={styles.tabs}>
        <TabBtn icon="people" label={t('Mời người', 'Invite people')} active={tab === 'referral'} onPress={() => setTab('referral')} />
        <TabBtn icon="receipt-outline" label={t('Mua hàng', 'Purchases')} active={tab === 'purchase'} onPress={() => setTab('purchase')} />
      </View>

      {isPending || !nhom ? (
        <Text style={styles.loading}>{t('Đang tải…', 'Loading…')}</Text>
      ) : (
        <>
          <View style={styles.meterHead}>
            <Text style={styles.meterValue}>
              {nhom.currentProgress} / {nhom.maxThreshold} {donVi}
            </Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(100, nhom.fillPercent)}%` }]} />
          </View>
          {nhom.currentProgress < nhom.maxThreshold ? (
            <Text style={styles.note}>
              {t(
                `Còn ${nhom.maxThreshold - nhom.currentProgress} ${donVi} nữa để đạt mốc cao nhất.`,
                `${nhom.maxThreshold - nhom.currentProgress} more ${donVi} to reach the highest milestone.`,
              )}
            </Text>
          ) : (
            <Text style={[styles.note, { color: colors.success }]}>{t('Đã đạt mốc cao nhất!', 'Highest milestone reached!')}</Text>
          )}

          <View style={styles.list}>
            {nhom.items.map((m) => (
              <Moc key={m.definition.id} m={m} onNhan={(id) => nhan.mutate(id)} dangNhan={nhan.isPending} />
            ))}
          </View>

          {tab === 'referral' && nguoiMoi && nguoiMoi.people.length > 0 && (
            <View style={styles.people}>
              <View style={styles.peopleHead}>
                <Text style={styles.peopleTitle}>{t('Người bạn đã mời', 'People you invited')}</Text>
                <Text style={styles.peopleCount}>{nguoiMoi.people.length} {t('người', 'people')}</Text>
              </View>
              {nguoiMoi.people.map((p, i) => (
                <NguoiMoi key={`${p.fullName}-${i}`} p={p} dau={i === 0} />
              ))}
            </View>
          )}

          <Pressable
            onPress={() => router.push(tab === 'referral' ? '/referrals' : '/')}
            style={({ pressed }) => [styles.cta, pressed && { backgroundColor: colors.brandStrong }]}>
            <Text style={styles.ctaText}>
              {tab === 'referral' ? t('Mời bạn bè ngay', 'Invite friends now') : t('Tìm sản phẩm để mua', 'Find products to buy')}
            </Text>
          </Pressable>
        </>
      )}
    </FormScreen>
  );
}

function TabBtn({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}>
      <Ionicons name={icon} size={17} color={active ? colors.onBrand : colors.muted} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Moc({
  m,
  onNhan,
  dangNhan,
}: {
  m: MissionItem;
  onNhan: (id: string) => void;
  dangNhan: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const daNhan = m.claimStatus === 'CLAIMED' || m.claimStatus === 'PAID';
  return (
    <View style={styles.item}>
      <View style={[styles.itemIcon, { backgroundColor: daNhan ? colors.successSoft : colors.brandSoft }]}>
        <Ionicons
          name={daNhan ? 'checkmark-circle' : 'trophy-outline'}
          size={18}
          color={daNhan ? colors.success : colors.brand}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{localizeMissionTitle(m.definition.title, lang)}</Text>
        <Text style={styles.itemReward}>{t('Thưởng', 'Reward')} {vnd(m.definition.rewardAmountVnd)}</Text>
      </View>
      {m.claimable && !daNhan ? (
        <Pressable
          onPress={() => onNhan(m.definition.id)}
          disabled={dangNhan}
          style={({ pressed }) => [styles.claim, (dangNhan || pressed) && { backgroundColor: colors.brandStrong }]}>
          <Text style={styles.claimText}>{t('Nhận', 'Claim')}</Text>
        </Pressable>
      ) : (
        <Text style={styles.itemState}>
          {daNhan ? t('Đã nhận', 'Claimed') : `${m.progress}/${m.definition.threshold}`}
        </Text>
      )}
    </View>
  );
}

function NguoiMoi({ p, dau }: { p: MissionReferralPerson; dau: boolean }) {
  const t = useT();
  return (
    <View style={[styles.person, !dau && styles.personDivider]}>
      <View style={[styles.personAvatar, !p.qualified && styles.personAvatarOff]}>
        <Text style={styles.personAvatarText}>{(p.fullName || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.personName} numberOfLines={1}>
          {p.fullName}
        </Text>
        <Text style={styles.personMeta}>
          {t('Tham gia', 'Joined')} {ngay(p.joinedAt)}
          {p.approvedOrders > 0 ? ` · ${p.approvedOrders} ${t('đơn đã duyệt', 'approved orders')}` : ''}
        </Text>
      </View>
      <View style={[styles.badge, p.qualified ? styles.badgeOk : styles.badgeWait]}>
        <Text style={[styles.badgeText, p.qualified ? styles.badgeTextOk : styles.badgeTextWait]}>
          {p.qualified ? t('Đã tính', 'Counted') : t('Chờ xác nhận', 'Pending confirmation')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { fontSize: 13, color: colors.muted, paddingVertical: 20 },

  tabs: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    marginTop: 14,
    marginBottom: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabText: { fontSize: 13.5, fontWeight: '800', color: colors.muted },
  tabTextActive: { color: colors.onBrand },

  meterHead: { marginBottom: 12 },
  meterValue: { fontSize: 27, fontWeight: '900', color: colors.brand, letterSpacing: -0.8 },
  bar: {
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 999 },
  note: { fontSize: 12.5, color: colors.muted, marginBottom: 8 },

  list: { marginTop: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  itemReward: { fontSize: 12.5, fontWeight: '800', color: colors.success, marginTop: 3 },
  itemState: { fontSize: 12.5, fontWeight: '800', color: colors.muted },
  claim: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  claimText: { color: colors.onBrand, fontWeight: '800', fontSize: 13 },

  people: {
    marginTop: 18,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  peopleHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  peopleTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  peopleCount: { fontSize: 12.5, fontWeight: '800', color: colors.brand },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  personDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarOff: { backgroundColor: colors.muted },
  personAvatarText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  personName: { fontSize: 14, fontWeight: '800', color: colors.text },
  personMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeOk: { backgroundColor: colors.successSoft },
  badgeWait: { backgroundColor: colors.surfaceMuted },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  badgeTextOk: { color: colors.success },
  badgeTextWait: { color: colors.muted },

  cta: {
    marginTop: 22,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaText: { color: colors.onBrand, fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
});
