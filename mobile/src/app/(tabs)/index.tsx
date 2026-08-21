import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { layMe } from '@/api/account';
import { apiBaseUrl } from '@/api/client';
import { taoLinkMua, traCuu, type ProductPreview } from '@/api/products';
import { BrandHeader } from '@/components/BrandHeader';
import { HomeHero } from '@/components/HomeHero';
import {
  AppFooter,
  BankAlert,
  CheckinEntry,
  PlatformShowcase,
  ProductStrip,
  WalletPanel,
} from '@/components/home-blocks';
import { Leaderboard } from '@/components/Leaderboard';
import { PreviewCard } from '@/components/PreviewCard';
import { useSession } from '@/hooks/useSession';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Trang chủ — dựng lại `views/app/dashboard.njk` ở khổ điện thoại, giữ đúng
 * trình tự khối của web: hero → thẻ dán link → kết quả → thẻ ví.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: layMe, enabled: !!user });
  const [link, setLink] = useState('');
  const [dangTra, setDangTra] = useState(false);
  const [dangMua, setDangMua] = useState(false);
  const [ketQua, setKetQua] = useState<{ product: ProductPreview; previewId: string } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  async function tra() {
    const url = link.trim();
    if (url.length < 10 || dangTra) return;
    setLoi(null);
    setKetQua(null);
    setDangTra(true);
    try {
      setKetQua(await traCuu(url));
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Không tra cứu được link này.');
    } finally {
      setDangTra(false);
    }
  }

  async function mua() {
    if (!ketQua || dangMua) return;
    if (!user) {
      router.push('/login');
      return;
    }
    setDangMua(true);
    try {
      const { buyUrl } = await taoLinkMua(ketQua.previewId);
      /*
       * BẮT BUỘC mở bằng trình duyệt hệ thống (Chrome Custom Tabs / Safari View
       * Controller), TUYỆT ĐỐI không WebView nhúng. Chỉ trình duyệt hệ thống mới
       * bàn giao đúng sang app Shopee và giữ nguyên Sub ID trong đường dẫn.
       * WebView nhúng làm mất lượt chuyển đổi — người dùng mua thật mà không ai
       * được hoàn tiền.
       *
       * Dùng openBrowserAsync chứ không phải openAuthSessionAsync: quy kết ở
       * đây đi bằng Sub ID trong URL, không phụ thuộc cookie. Tài liệu SDK 57
       * ghi rõ trên iOS openBrowserAsync KHÔNG dùng chung cookie với Safari hệ
       * thống — với luồng này thì không sao, nhưng nếu sau này sàn nào đó đổi
       * sang quy kết bằng cookie thì phải xem lại chỗ này.
       */
      await WebBrowser.openBrowserAsync(`${apiBaseUrl}${buyUrl}`);
    } catch (e) {
      Alert.alert(
        'Chưa tạo được link mua',
        e instanceof Error && e.message ? e.message : 'Thử lại sau ít phút.',
      );
    } finally {
      setDangMua(false);
    }
  }

  return (
    <View style={styles.screen}>
      <BrandHeader onRegister={() => router.push('/login')} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <HomeHero me={me} />

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardIcon}>
              <Ionicons name="search" size={18} color={colors.brand} />
            </View>
            <View style={styles.cardHeadCopy}>
              <Text style={styles.cardTitle}>Dán link mua sắm để nhận hoàn tiền</Text>
              <Text style={styles.cardSub}>
                Tự nhận diện Shopee, TikTok Shop, Lazada và tính tiền hoàn dự kiến
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Link sản phẩm</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="Dán link sản phẩm vào đây..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              onSubmitEditing={tra}
              returnKeyType="search"
            />
            {link.length > 0 && (
              <Pressable onPress={() => setLink('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={tra}
            disabled={dangTra}
            style={({ pressed }) => [
              styles.primaryBtn,
              dangTra && { opacity: 0.6 },
              pressed && !dangTra && { backgroundColor: colors.brandStrong },
            ]}>
            {dangTra ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>Tra cứu</Text>
            )}
          </Pressable>

          {loi ? <Text style={styles.err}>{loi}</Text> : (
            <Text style={styles.hint}>
              Dán link là tự động tra cứu — hỗ trợ Shopee, TikTok Shop và Lazada.
            </Text>
          )}
        </View>

        {ketQua && (
          <PreviewCard
            product={ketQua.product}
            dangMua={dangMua}
            onMua={mua}
            daDangNhap={!!user}
          />
        )}

        {me ? <WalletPanel me={me} /> : <ViCard />}

        <PlatformShowcase />

        {user && (
          <>
            <CheckinEntry />
            <BankAlert />
          </>
        )}

        <Leaderboard />

        <ProductStrip tieuDe="Đề xuất" list="recommend" />
        <ProductStrip tieuDe="Bán chạy" list="best" />
        <ProductStrip tieuDe="Ưu đãi độc quyền" list="exclusive" />

        <AppFooter />
      </ScrollView>
    </View>
  );
}

/** Thẻ ví — đổi mặt theo trạng thái đăng nhập, y như web. */
function ViCard() {
  const { user } = useSession();

  if (!user) {
    return (
      <View style={styles.walletCard}>
        <Text style={styles.walletEyebrow}>Ví hoàn tiền</Text>
        <Text style={styles.walletTitle}>Đăng nhập để nhận</Text>
        <Text style={styles.walletCopy}>
          Dán link sản phẩm để xem trước tiền hoàn ngay. Đăng nhập để mua qua
          ShopTik và nhận tiền về ví.
        </Text>
        <View style={styles.walletActions}>
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [
              styles.primaryBtnSm,
              pressed && { backgroundColor: colors.brandStrong },
            ]}>
            <Text style={styles.primaryBtnText}>Đăng nhập</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.ghostBtnText}>Tạo tài khoản</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.walletCard}>
      <Text style={styles.walletEyebrow}>Ví hoàn tiền</Text>
      <Text style={styles.walletTitle}>Xin chào, {user.fullName || 'bạn'}</Text>
      <Pressable
        onPress={() => router.push('/(tabs)/wallet')}
        style={({ pressed }) => [
          styles.primaryBtnSm,
          { alignSelf: 'flex-start', marginTop: 12 },
          pressed && { backgroundColor: colors.brandStrong },
        ]}>
        <Text style={styles.primaryBtnText}>Mở ví</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingBottom: spacing.xl },

  card: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  cardHead: { flexDirection: 'row', gap: 12, marginBottom: spacing.md },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadCopy: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text, letterSpacing: -0.4 },
  cardSub: { fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 18 },

  label: { fontSize: 12.5, fontWeight: '800', color: colors.text, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 50,
  },
  input: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },

  primaryBtn: {
    marginTop: 12,
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnSm: {
    height: 42,
    paddingHorizontal: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 11.5, color: colors.muted, marginTop: 10 },
  err: { fontSize: 12.5, color: colors.danger, marginTop: 10, fontWeight: '600' },

  walletCard: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  walletEyebrow: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  walletTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.brand,
    letterSpacing: -0.6,
    marginTop: 2,
  },
  walletCopy: { fontSize: 13, color: colors.inkSoft, lineHeight: 20, marginTop: 8 },
  walletActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  ghostBtn: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: colors.text, fontWeight: '800', fontSize: 14 },
});
