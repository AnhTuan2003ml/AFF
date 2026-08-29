import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ngay, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Nhiệm vụ — hai nhóm mốc: mời bạn và mua sắm.
 *
 * Backend trả về theo nhóm chứ không phải danh sách phẳng, vì tiến độ được tính
 * gộp cho cả nhóm (`currentProgress` so với `maxThreshold`) rồi mới chia ra
 * từng mốc. Giữ nguyên cấu trúc đó ở app để không tự tính lại và lệch số.
 */
const TEN_NHOM: Record<string, string> = {
  REFERRAL_MILESTONE: 'Mời bạn bè',
  PURCHASE_MILESTONE: 'Mua sắm',
};

export default function MissionsScreen() {
  const { user } = useSession();
  const qc = useQueryClient();
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
      Alert.alert('Đã nhận thưởng', 'Phần thưởng đã được cộng vào ví của bạn.');
    },
    onError: (e) =>
      Alert.alert('Chưa nhận được', e instanceof Error ? e.message : 'Thử lại sau.'),
  });

  if (!user) return <CanDangNhap mo_ta="Đăng nhập để xem tiến độ nhiệm vụ và nhận thưởng." />;

  return (
    <FormScreen title="Nhiệm vụ" subtitle="Hoàn thành mốc để nhận thưởng vào ví.">
      {isPending ? (
        <Text style={styles.loading}>Đang tải…</Text>
      ) : (
        Object.entries(data ?? {}).map(([khoa, nhom]) => (
          <Nhom
            key={khoa}
            ten={TEN_NHOM[khoa] ?? khoa}
            nhom={nhom as MissionGroup}
            onNhan={(id) => nhan.mutate(id)}
            dangNhan={nhan.isPending}
          />
        ))
      )}

      {nguoiMoi && nguoiMoi.people.length > 0 && (
        <View style={styles.people}>
          <View style={styles.peopleHead}>
            <Text style={styles.groupTitle}>Người bạn đã mời</Text>
            <Text style={styles.peopleCount}>{nguoiMoi.people.length} người</Text>
          </View>
          {nguoiMoi.people.map((p, i) => (
            <NguoiMoi key={`${p.fullName}-${i}`} p={p} dau={i === 0} />
          ))}
        </View>
      )}
    </FormScreen>
  );
}

function Nhom({
  ten,
  nhom,
  onNhan,
  dangNhan,
}: {
  ten: string;
  nhom: MissionGroup;
  onNhan: (id: string) => void;
  dangNhan: boolean;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text style={styles.groupTitle}>{ten}</Text>
        <Text style={styles.groupProgress}>
          {nhom.currentProgress}/{nhom.maxThreshold}
        </Text>
      </View>

      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, nhom.fillPercent)}%` }]} />
      </View>

      {nhom.items.map((m) => (
        <Moc key={m.definition.id} m={m} onNhan={onNhan} dangNhan={dangNhan} />
      ))}
    </View>
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
  const daNhan = m.claimStatus === 'CLAIMED' || m.claimStatus === 'PAID';
  return (
    <View style={styles.item}>
      <View
        style={[
          styles.itemIcon,
          { backgroundColor: daNhan ? colors.successSoft : colors.surfaceMuted },
        ]}>
        <Ionicons
          name={daNhan ? 'checkmark-circle' : 'flag-outline'}
          size={17}
          color={daNhan ? colors.success : colors.muted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{m.definition.title}</Text>
        <Text style={styles.itemDesc} numberOfLines={2}>
          {m.definition.description}
        </Text>
        <Text style={styles.itemReward}>Thưởng {vnd(m.definition.rewardAmountVnd)}</Text>
      </View>
      {m.claimable && !daNhan ? (
        <Pressable
          onPress={() => onNhan(m.definition.id)}
          disabled={dangNhan}
          style={({ pressed }) => [
            styles.claim,
            (dangNhan || pressed) && { backgroundColor: colors.brandStrong },
          ]}>
          <Text style={styles.claimText}>Nhận</Text>
        </Pressable>
      ) : (
        <Text style={styles.itemState}>
          {daNhan ? 'Đã nhận' : `${m.progress}/${m.definition.threshold}`}
        </Text>
      )}
    </View>
  );
}

function NguoiMoi({ p, dau }: { p: MissionReferralPerson; dau: boolean }) {
  return (
    <View style={[styles.person, !dau && styles.personDivider]}>
      <View style={[styles.personAvatar, !p.qualified && styles.personAvatarOff]}>
        <Text style={styles.personAvatarText}>
          {(p.fullName || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.personName} numberOfLines={1}>
          {p.fullName}
        </Text>
        <Text style={styles.personMeta}>
          Tham gia {ngay(p.joinedAt)}
          {p.approvedOrders > 0 ? ` · ${p.approvedOrders} đơn đã duyệt` : ''}
        </Text>
      </View>
      <View style={[styles.badge, p.qualified ? styles.badgeOk : styles.badgeWait]}>
        <Text style={[styles.badgeText, p.qualified ? styles.badgeTextOk : styles.badgeTextWait]}>
          {p.qualified ? 'Đã tính' : 'Chờ xác nhận'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { fontSize: 13, color: colors.muted, paddingVertical: 20 },
  people: {
    marginTop: 4,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  peopleHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
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
  group: { marginBottom: spacing.lg },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  groupProgress: { fontSize: 13, fontWeight: '800', color: colors.brand },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
  },
  barFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 4 },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  itemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  itemDesc: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  itemReward: { fontSize: 12, fontWeight: '800', color: colors.success, marginTop: 3 },
  itemState: { fontSize: 12, fontWeight: '800', color: colors.muted },
  claim: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  claimText: { color: colors.onBrand, fontWeight: '800', fontSize: 13 },
});
