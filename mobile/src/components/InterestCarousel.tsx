import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiBaseUrl } from '@/api/client';
import { layQuanTam, type InterestedProduct } from '@/api/features';
import { taoLinkMua, traCuu } from '@/api/products';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * "Sản phẩm bạn quan tâm" — dựng lại `interest-carousel` của web: các sản phẩm
 * đã bấm Mua ngay nhưng chưa thành đơn (instantbuy). Bấm "Hoàn tất mua" chạy
 * thẳng luồng mua (tra cứu → tạo link affiliate → mở trình duyệt hệ thống).
 */
export function InterestCarousel() {
  const t = useT();
  const { user } = useSession();
  const { data } = useQuery({
    queryKey: ['interested'],
    queryFn: layQuanTam,
    enabled: !!user,
  });

  const sp = data?.data ?? [];
  if (!user || sp.length === 0) return null;

  return (
    <View style={s.section}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('Sản phẩm bạn quan tâm', 'Products you like')}</Text>
          <Text style={s.sub}>
            {sp.length}{' '}
            {t(
              'sản phẩm đã xem chưa mua — hoàn tất để nhận hoàn tiền.',
              'products viewed but not bought — complete the purchase to earn cashback.',
            )}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/orders')} hitSlop={8}>
          <Text style={s.more}>{t('Xem tất cả ›', 'See all ›')}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {sp.map((p, i) => (
          <Card key={`${p.productUrl ?? p.name}-${i}`} p={p} />
        ))}
      </ScrollView>
    </View>
  );
}

function Card({ p }: { p: InterestedProduct }) {
  const t = useT();
  const [dang, setDang] = useState(false);

  async function mua() {
    if (!p.productUrl || dang) return;
    setDang(true);
    try {
      const kq = await traCuu(p.productUrl);
      const { buyUrl } = await taoLinkMua(kq.previewId);
      await WebBrowser.openBrowserAsync(
        buyUrl.startsWith('http') ? buyUrl : `${apiBaseUrl}${buyUrl}`,
      );
    } catch (e) {
      Alert.alert(
        t('Chưa mua được', 'Could not purchase'),
        e instanceof Error && e.message ? e.message : t('Thử lại sau ít phút.', 'Please try again in a few minutes.'),
      );
    } finally {
      setDang(false);
    }
  }

  return (
    <View style={s.card}>
      <View style={s.media}>
        {p.imageUrl ? (
          <Image source={{ uri: p.imageUrl }} style={s.img} contentFit="cover" />
        ) : (
          <View style={[s.img, s.imgEmpty]} />
        )}
        <View style={s.badge}>
          <Text style={s.badgeText}>{t('Chưa mua', 'Not bought')}</Text>
        </View>
      </View>
      <View style={s.body}>
        <Text style={s.name} numberOfLines={2}>
          {p.name}
        </Text>
        <Pressable
          onPress={mua}
          disabled={dang || !p.productUrl}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
          <Text style={s.ctaText}>{dang ? t('Đang mở…', 'Opening…') : t('Hoàn tất mua  →', 'Complete purchase  →')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: spacing.md,
    marginBottom: 10,
  },
  title: { fontSize: 19, fontWeight: '900', color: colors.text, letterSpacing: -0.6, marginTop: 3 },
  sub: { fontSize: 11.5, color: colors.muted, marginTop: 3, lineHeight: 16 },
  more: { fontSize: 13, fontWeight: '800', color: colors.brand, marginTop: 3 },

  row: { paddingHorizontal: spacing.md, gap: 10 },
  card: {
    width: 150,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.card,
  },
  media: { position: 'relative' },
  img: { width: '100%', height: 150, backgroundColor: colors.surfaceMuted },
  imgEmpty: {},
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  body: { padding: 10, gap: 8 },
  name: { fontSize: 12, fontWeight: '700', color: colors.text, lineHeight: 16, minHeight: 32 },
  cta: {
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 12.5, fontWeight: '800', color: colors.onBrand },
});
