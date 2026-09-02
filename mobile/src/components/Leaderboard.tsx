import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  layBangXepHang,
  type TopBuyer,
  type TopProduct,
} from '@/api/features';
import { Confetti } from '@/components/Confetti';
import { useT } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Bảng xếp hạng "đua top" — dựng lại `.lb2-card` của web ở khổ điện thoại: thẻ
 * cam, tiêu đề + kỳ, bộ chuyển Người mua / Bán chạy, và bục vinh danh top 3
 * (hạng 1 ở giữa cao nhất, có vương miện). Dữ liệu công khai từ /leaderboard.
 */

const MEDAL = {
  1: require('../../assets/images/medal-1.png'),
  2: require('../../assets/images/medal-2.png'),
  3: require('../../assets/images/medal-3.png'),
} as const;
const BLOCK_H = { 1: 78, 2: 60, 3: 48 } as const;

type Item = TopBuyer | TopProduct;

function Spot({ item, rank, product }: { item?: Item; rank: 1 | 2 | 3; product: boolean }) {
  const t = useT();
  const anh = item
    ? product
      ? (item as TopProduct).imageUrl
      : (item as TopBuyer).avatarUrl
    : null;
  const ten = item?.name ?? t('Chưa có', 'None yet');
  return (
    <View style={[s.spot, rank === 1 && s.spotCenter]}>
      <Text style={s.crown}>{rank === 1 ? '👑' : ' '}</Text>
      <View style={s.avatar}>
        {anh ? (
          <Image source={{ uri: anh }} style={s.avatarImg} contentFit="cover" />
        ) : (
          <Text style={s.avatarText}>
            {item ? ten.charAt(0).toUpperCase() : '?'}
          </Text>
        )}
      </View>
      <Text style={s.name} numberOfLines={1}>
        {ten}
      </Text>
      <Text style={s.count}>
        {item ? (
          <>
            <Text style={s.countB}>{item.count}</Text> {t('đơn', 'orders')}
          </>
        ) : (
          '—'
        )}
      </Text>
      <View style={[s.block, { height: BLOCK_H[rank] }]}>
        <Image source={MEDAL[rank]} style={s.medal} contentFit="contain" />
        <Text style={s.top}>TOP {rank}</Text>
      </View>
    </View>
  );
}

export function Leaderboard() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['leaderboard'], queryFn: layBangXepHang });
  const [tab, setTab] = useState<0 | 1>(0);

  if (!data || (data.topBuyers.length === 0 && data.topProducts.length === 0)) {
    return null;
  }
  const list: Item[] = tab === 0 ? data.topBuyers : data.topProducts;
  const product = tab === 1;

  return (
    <View style={s.section}>
      <LinearGradient
        colors={[colors.brand, colors.brandStrong]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.card}>
        <Confetti />
        <Text style={s.eyebrow}>{t('🔥  SỰ KIỆN THÁNG', '🔥  EVENT OF THE MONTH')}</Text>
        <Text style={s.title}>{t('Bảng xếp hạng', 'Leaderboard')}</Text>
        <Text style={s.period}>{data.monthLabel}</Text>

        <View style={s.seg}>
          <Pressable
            onPress={() => setTab(0)}
            style={[s.segBtn, tab === 0 && s.segActive]}>
            <Text style={[s.segText, tab === 0 && s.segTextActive]}>{t('Người mua', 'Top buyers')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab(1)}
            style={[s.segBtn, tab === 1 && s.segActive]}>
            <Text style={[s.segText, tab === 1 && s.segTextActive]}>{t('Bán chạy', 'Best sellers')}</Text>
          </Pressable>
        </View>

        <View style={s.podium}>
          <Spot item={list[1]} rank={2} product={product} />
          <Spot item={list[0]} rank={1} product={product} />
          <Spot item={list[2]} rank={3} product={product} />
        </View>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  eyebrow: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1, marginTop: 10 },
  period: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '700', marginTop: 2 },

  seg: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'center',
    marginTop: 14,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  segBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill },
  segActive: { backgroundColor: '#fff' },
  segText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  segTextActive: { color: colors.brand },

  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  spot: { flex: 1, alignItems: 'center' },
  spotCenter: { marginBottom: 0 },
  crown: { fontSize: 18, height: 22 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  avatarImg: { width: 54, height: 54 },
  avatarText: { fontSize: 22, fontWeight: '900', color: colors.brand },
  name: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 6, maxWidth: '100%' },
  count: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 1 },
  countB: { fontWeight: '900', color: '#fff' },

  block: {
    width: '100%',
    marginTop: 8,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 6,
  },
  medal: { width: 30, height: 30 },
  top: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
});
