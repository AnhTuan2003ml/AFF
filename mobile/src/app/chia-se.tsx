import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { layLinkChiaSe } from '@/api/features';
import { taoLinkChiaSe } from '@/api/products';
import { traCuu } from '@/api/products';
import { CanDangNhap } from '@/components/CanDangNhap';
import { FormScreen } from '@/components/FormScreen';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { ngay } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Chia sẻ — tạo link Affiliate từ một link sản phẩm. Khi có người mua qua link,
 * người tạo được hưởng hoa hồng chia sẻ (mặc định 6% hoa hồng sàn). Cùng cơ
 * chế với trang /app/links trên web (campaign 'sharelink').
 */
export default function ChiaSeScreen() {
  const t = useT();
  const { user } = useSession();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');

  const { data } = useQuery({
    queryKey: ['share-links'],
    queryFn: layLinkChiaSe,
    enabled: !!user,
  });

  const tao = useMutation({
    mutationFn: async (productUrl: string) => {
      const kq = await traCuu(productUrl);
      return taoLinkChiaSe(kq.previewId);
    },
    onSuccess: async (r) => {
      setUrl('');
      void qc.invalidateQueries({ queryKey: ['share-links'] });
      await Clipboard.setStringAsync(r.shareUrl);
      Alert.alert(
        t('Đã tạo link chia sẻ', 'Share link created'),
        `${t('Link cho', 'Link for')} "${r.productName}" ${t('đã sao chép. Gửi cho người mua để nhận', 'copied. Send it to buyers to earn')} ${r.sharerSharePercent}% ${t('hoa hồng sàn.', 'platform commission.')}`,
      );
    },
    onError: (e) =>
      Alert.alert(t('Chưa tạo được', "Couldn't create"), e instanceof Error ? e.message : t('Kiểm tra lại link nhé.', 'Please check the link.')),
  });

  if (!user) return <CanDangNhap mo_ta={t('Đăng nhập để tạo link chia sẻ và nhận hoa hồng.', 'Log in to create share links and earn commission.')} />;

  const percent = data?.sharerSharePercent ?? 6;

  async function chep(link: string) {
    await Clipboard.setStringAsync(link);
    Alert.alert(t('Đã sao chép', 'Copied'), t('Gửi link cho người mua nhé.', 'Send the link to buyers.'));
  }

  return (
    <FormScreen
      title={t('Chia sẻ nhận hoa hồng', 'Share to earn commission')}
      subtitle={`${t('Dán link sản phẩm bất kỳ (Shopee/TikTok/Lazada) để tạo link chia sẻ. Có người mua qua link, bạn nhận', 'Paste any product link (Shopee/TikTok/Lazada) to create a share link. When someone buys through it, you earn')} ${percent}% ${t('hoa hồng sàn của sản phẩm đó.', "of that product's platform commission.")}`}>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder={t('Dán link sản phẩm vào đây…', 'Paste a product link here…')}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={styles.input}
      />
      <Pressable
        onPress={() => url.trim() && tao.mutate(url.trim())}
        disabled={tao.isPending || !url.trim()}
        style={({ pressed }) => [
          styles.submit,
          (pressed || tao.isPending || !url.trim()) && { opacity: 0.7 },
        ]}>
        <Ionicons name="link" size={17} color={colors.onBrand} />
        <Text style={styles.submitText}>{tao.isPending ? t('Đang tạo…', 'Creating…') : t('Tạo link chia sẻ', 'Create share link')}</Text>
      </Pressable>

      <View style={styles.earnBox}>
        <Text style={styles.earnLabel}>{t('Hoa hồng chia sẻ đã nhận', 'Share commission earned')}</Text>
        <Text style={styles.earnValue}>
          {(data?.totalEarnedVnd ?? 0).toLocaleString('vi-VN')} đ
        </Text>
      </View>

      <Text style={styles.h2}>{t('Link đã tạo', 'Links created')} ({data?.links.length ?? 0})</Text>
      {(data?.links.length ?? 0) === 0 ? (
        <Text style={styles.empty}>{t('Chưa có link nào. Dán link sản phẩm phía trên để bắt đầu.', 'No links yet. Paste a product link above to get started.')}</Text>
      ) : (
        data!.links.map((l, i) => (
          <View key={l.shareUrl} style={[styles.row, i > 0 && styles.rowDivider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {l.productName || t('Sản phẩm', 'Product')}
              </Text>
              <Text style={styles.meta}>
                {l.clickCount} {t('lượt mở', 'opens')} · {l.ordersCount} {t('đơn', 'orders')} · {ngay(l.createdAt)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => chep(l.shareUrl)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="copy-outline" size={18} color={colors.brand} />
              </Pressable>
              <Pressable
                onPress={() => Share.share({ message: l.shareUrl }).catch(() => {})}
                hitSlop={8}
                style={styles.iconBtn}>
                <Ionicons name="share-social-outline" size={18} color={colors.brand} />
              </Pressable>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(l.shareUrl).catch(() => {})}
                hitSlop={8}
                style={styles.iconBtn}>
                <Ionicons name="open-outline" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    marginTop: spacing.md,
  },
  submitText: { color: colors.onBrand, fontWeight: '900', fontSize: 15 },

  earnBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.successSoft,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  earnLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  earnValue: { fontSize: 22, fontWeight: '900', color: colors.success, marginTop: 4 },

  h2: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 8 },
  empty: { fontSize: 13, color: colors.muted, lineHeight: 20, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
});
