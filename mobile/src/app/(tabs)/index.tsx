import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
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
import { camio, camioAt, camioSeed } from '@/lib/camio-voice';
import { vnd } from '@/lib/format';
import { taoLinkMua, traCuu, type ProductPreview } from '@/api/products';
import { BrandHeader } from '@/components/BrandHeader';
import { HomeHero } from '@/components/HomeHero';
import { Mascot, type CamioMood } from '@/components/Mascot';
import {
  BankAlert,
  CheckinEntry,
  PlatformShowcase,
  ProductStrip,
  WalletPanel,
} from '@/components/home-blocks';
import { InterestCarousel } from '@/components/InterestCarousel';
import { Leaderboard } from '@/components/Leaderboard';
import { PreviewCard } from '@/components/PreviewCard';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Trang chủ — dựng lại `views/app/dashboard.njk` ở khổ điện thoại, giữ đúng
 * trình tự khối của web: hero → thẻ dán link → kết quả → thẻ ví.
 */
export default function HomeScreen() {
  const t = useT();
  const { user } = useSession();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: layMe, enabled: !!user });
  const [link, setLink] = useState('');
  const [dangTra, setDangTra] = useState(false);
  const [dangMua, setDangMua] = useState(false);
  const [ketQua, setKetQua] = useState<{ product: ProductPreview; previewId: string } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  // Câu thoại Camio đổi theo trạng thái; seed cố định để không đổi câu mỗi lần render.
  const seed = useRef(camioSeed()).current;
  const camioMood: CamioMood = loi
    ? 'ngacnhien'
    : dangTra
      ? 'baocao'
      : ketQua
        ? ketQua.product.dataVerified && (ketQua.product.buyerCashbackVnd ?? 0) > 0
          ? 'haohung'
          : 'ngacnhien'
        : 'vuive';
  const dongCamio = loi
    ? loi
    : dangTra
      ? camioAt('checking', seed)
      : ketQua
        ? !ketQua.product.dataVerified || ketQua.product.buyerCashbackVnd === null
          ? camioAt('pendingAmount', seed)
          : ketQua.product.buyerCashbackVnd > 0
            ? camioAt('foundAmount', seed, { amount: vnd(ketQua.product.buyerCashbackVnd) })
            : camioAt('noCashback', seed)
        : camioAt('noLink', seed);

  async function tra(nguon?: string) {
    const url = (nguon ?? link).trim();
    if (url.length < 10 || dangTra) return;
    setLoi(null);
    setKetQua(null);
    setDangTra(true);
    try {
      setKetQua(await traCuu(url));
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : camio('badLink'));
    } finally {
      setDangTra(false);
    }
  }

  // Dán từ bộ nhớ tạm KHÔNG focus ô nhập nên không bật bàn phím; dán xong tự tra
  // cứu luôn (giống web: dán link là tự động tra cứu).
  async function dan() {
    const t = (await Clipboard.getStringAsync()).trim();
    if (!t) return;
    setLink(t);
    void tra(t);
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
      const target = buyUrl.startsWith('http') ? buyUrl : `${apiBaseUrl}${buyUrl}`;
      /*
       * BẮT BUỘC mở bằng trình duyệt hệ thống (Chrome Custom Tabs / Safari View
       * Controller), TUYỆT ĐỐI không WebView nhúng. Chỉ trình duyệt hệ thống mới
       * bàn giao đúng sang app Shopee và giữ nguyên Sub ID trong đường dẫn.
       * WebView nhúng làm mất lượt chuyển đổi — người dùng mua thật mà không ai
       * được hoàn tiền.
       *
       * Dùng openBrowserAsync chứ không phải openAuthSessionAsync: quy kết ở
       * đây đi bằng Sub ID trong URL, không phụ thuộc cookie. Tài liệu expo-web-browser
       * ghi rõ trên iOS openBrowserAsync KHÔNG dùng chung cookie với Safari hệ
       * thống — với luồng này thì không sao, nhưng nếu sau này sàn nào đó đổi
       * sang quy kết bằng cookie thì phải xem lại chỗ này.
       */
      await WebBrowser.openBrowserAsync(target);
    } catch (e) {
      Alert.alert(
        camio('error'),
        e instanceof Error && e.message ? e.message : t('Thử lại giúp Camio nhé!', 'Please try again in a moment.'),
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
              <Text style={styles.cardTitle}>{t('Khoan mua! Để Camio kiểm tra đã.', 'Wait! Let Camio check first.')}</Text>
              <Text style={styles.cardSub}>
                {t(
                  'Dán link Shopee, TikTok Shop, Lazada — Camio tính tiền hoàn dự kiến cho bạn',
                  'Paste a Shopee, TikTok Shop or Lazada link — Camio estimates your cashback',
                )}
              </Text>
            </View>
          </View>

          <Text style={styles.label}>{t('Link sản phẩm', 'Product link')}</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder={t('Dán link sản phẩm vào đây...', 'Paste the product link here...')}
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              onSubmitEditing={() => tra()}
              returnKeyType="search"
            />
            {link.length > 0 && (
              <Pressable onPress={() => setLink('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
            {/* Nút Dán: đọc bộ nhớ tạm mà KHÔNG focus ô → không bật bàn phím. */}
            <Pressable onPress={dan} hitSlop={8} style={styles.pasteBtn}>
              <Ionicons name="clipboard-outline" size={16} color={colors.brand} />
              <Text style={styles.pasteText}>{t('Dán', 'Paste')}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => tra()}
            disabled={dangTra}
            style={({ pressed }) => [
              styles.primaryBtn,
              dangTra && { opacity: 0.6 },
              pressed && !dangTra && { backgroundColor: colors.brandStrong },
            ]}>
            {dangTra ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>{t('Tra cứu', 'Check cashback')}</Text>
            )}
          </Pressable>

          {/* Camio nói theo trạng thái: chưa dán → đang soi → có/không hoàn → lỗi. */}
          <View style={styles.camioRow}>
            <Mascot mood={camioMood} size={30} />
            <Text style={[styles.camioText, loi ? styles.err : styles.hint]}>{dongCamio}</Text>
          </View>
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
            <InterestCarousel />
            <BankAlert />
          </>
        )}

        <Leaderboard />

        <ProductStrip tieuDe={t('Đề xuất', 'Recommended')} list="recommend" />
        <ProductStrip tieuDe={t('Bán chạy', 'Best sellers')} list="best" />
        <ProductStrip tieuDe={t('Ưu đãi độc quyền', 'Exclusive deals')} list="exclusive" />

      </ScrollView>
    </View>
  );
}

/** Thẻ ví — đổi mặt theo trạng thái đăng nhập, y như web. */
function ViCard() {
  const t = useT();
  const { user } = useSession();

  if (!user) {
    return (
      <View style={styles.walletCard}>
        <Text style={styles.walletEyebrow}>{t('Ví hoàn tiền', 'Cashback wallet')}</Text>
        <Text style={styles.walletTitle}>{t('Đăng nhập để nhận', 'Sign in to earn')}</Text>
        <Text style={styles.walletCopy}>
          {t(
            'Dán link sản phẩm để xem trước tiền hoàn ngay. Đăng nhập để mua qua ShopTik và nhận tiền về ví.',
            'Paste a product link to preview your cashback instantly. Sign in to buy through ShopTik and get money back to your wallet.',
          )}
        </Text>
        <View style={styles.walletActions}>
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [
              styles.primaryBtnSm,
              pressed && { backgroundColor: colors.brandStrong },
            ]}>
            <Text style={styles.primaryBtnText}>{t('Đăng nhập', 'Sign in')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.ghostBtnText}>{t('Tạo tài khoản', 'Create account')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.walletCard}>
      <Text style={styles.walletEyebrow}>{t('Ví hoàn tiền', 'Cashback wallet')}</Text>
      <Text style={styles.walletTitle}>
        {t('Xin chào,', 'Hi,')} {user.fullName || t('bạn', 'there')}
      </Text>
      <Pressable
        onPress={() => router.push('/(tabs)/wallet')}
        style={({ pressed }) => [
          styles.primaryBtnSm,
          { alignSelf: 'flex-start', marginTop: 12 },
          pressed && { backgroundColor: colors.brandStrong },
        ]}>
        <Text style={styles.primaryBtnText}>{t('Mở ví', 'Open wallet')}</Text>
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
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  pasteText: { fontSize: 12.5, fontWeight: '800', color: colors.brand },

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
  camioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  camioText: { flex: 1, marginTop: 0 },
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
