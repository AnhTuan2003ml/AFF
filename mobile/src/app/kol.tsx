import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  guiHoSoKol,
  layDieuKhoanKol,
  layHoSoKol,
  type HoSoKolInput,
  type TepKyc,
} from '@/api/kol';
import { ApiError } from '@/api/client';
import { Checkbox, ErrorBox, Field, PrimaryButton, SocialLinksInput } from '@/components/form';
import { useT } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

type KieuTep = 'cccdFront' | 'cccdBack' | 'faceVideo';

export default function KolScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [dongY, setDongY] = useState(false);
  const [buoc, setBuoc] = useState<'dieu-khoan' | 'form'>('dieu-khoan');
  const [daDoc, setDaDoc] = useState(false);
  const [ganCuoi, setGanCuoi] = useState(false);
  const [checkboxY, setCheckboxY] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Mở màn luôn bắt đầu từ đầu điều khoản (tránh khôi phục sai vị trí khiến
  // mũi tên hiện nhầm khi đang ở đáy).
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const [info, setInfo] = useState<HoSoKolInput>({
    fullName: '',
    cccdNumber: '',
    phone: '',
  });
  const [tep, setTep] = useState<Partial<Record<KieuTep, TepKyc>>>({});
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState(false);

  const { data: dieuKhoan } = useQuery({
    queryKey: ['kol-terms'],
    queryFn: layDieuKhoanKol,
  });
  const { data: hoSo } = useQuery({
    queryKey: ['kol-me'],
    queryFn: layHoSoKol,
  });

  function dat(k: keyof HoSoKolInput, v: string) {
    setInfo((cu) => ({ ...cu, [k]: v }));
  }

  async function chonTep(kind: KieuTep) {
    const anh = kind !== 'faceVideo';
    Alert.alert(
      anh ? t('Ảnh CCCD', 'ID card photo') : t('Video khuôn mặt', 'Face video'),
      undefined,
      [
        {
          text: anh ? t('Chụp ảnh', 'Take photo') : t('Quay video', 'Record video'),
          onPress: () => moPicker(kind, 'camera'),
        },
        {
          text: t('Chọn từ thư viện', 'Choose from library'),
          onPress: () => moPicker(kind, 'thu-vien'),
        },
        { text: t('Hủy', 'Cancel'), style: 'cancel' },
      ],
    );
  }

  async function moPicker(kind: KieuTep, nguon: 'camera' | 'thu-vien') {
    const anh = kind !== 'faceVideo';
    const mediaTypes: ImagePicker.MediaType[] = anh ? ['images'] : ['videos'];
    try {
      if (nguon === 'camera') {
        const quyen = await ImagePicker.requestCameraPermissionsAsync();
        if (!quyen.granted) {
          Alert.alert(t('Cần quyền máy ảnh', 'Camera permission needed'), t('Vui lòng cấp quyền để chụp/quay.', 'Please grant permission to take photos/videos.'));
          return;
        }
      } else {
        const quyen = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!quyen.granted) {
          Alert.alert(t('Cần quyền thư viện', 'Library permission needed'), t('Vui lòng cấp quyền để chọn tệp.', 'Please grant permission to select files.'));
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes,
        quality: anh ? 0.85 : undefined,
        videoMaxDuration: anh ? undefined : 15,
      };
      const kq =
        nguon === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (kq.canceled || !kq.assets?.[0]) return;
      const a = kq.assets[0];
      const type = a.mimeType ?? (anh ? 'image/jpeg' : 'video/mp4');
      const name =
        a.fileName ?? (anh ? `${kind}.jpg` : 'face.mp4');
      setTep((cu) => ({ ...cu, [kind]: { uri: a.uri, name, type } }));
    } catch {
      Alert.alert(t('Không mở được', "Couldn't open"), t('Có lỗi khi chọn tệp. Vui lòng thử lại.', 'An error occurred selecting the file. Please try again.'));
    }
  }

  async function gui() {
    setLoi(null);
    if (!info.fullName.trim() || !info.cccdNumber.trim() || !info.phone.trim()) {
      setLoi(t('Vui lòng điền Họ tên, Số CCCD và Số điện thoại.', 'Please fill in your name, ID number and phone number.'));
      return;
    }
    if (!tep.cccdFront || !tep.cccdBack || !tep.faceVideo) {
      setLoi(t('Vui lòng tải đủ ảnh CCCD 2 mặt và video khuôn mặt.', 'Please upload both sides of your ID and a face video.'));
      return;
    }
    setDangGui(true);
    try {
      await guiHoSoKol(info, {
        cccdFront: tep.cccdFront,
        cccdBack: tep.cccdBack,
        faceVideo: tep.faceVideo,
      });
      setXong(true);
    } catch (e) {
      setLoi(
        e instanceof ApiError ? e.message : t('Gửi hồ sơ chưa thành công. Thử lại.', 'Submission failed. Please try again.'),
      );
    } finally {
      setDangGui(false);
    }
  }

  const daDuyet = hoSo?.status === 'APPROVED';
  const app = hoSo?.application;
  const daNop = hoSo?.status === 'PENDING' || xong;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.sm },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => {
          if (buoc !== 'dieu-khoan') return;
          const { layoutMeasurement, contentOffset, contentSize } =
            e.nativeEvent;
          const dayView = contentOffset.y + layoutMeasurement.height;
          // "Đọc hết" = đã thấy ô xác nhận trong màn hình (hoặc chạm đáy thật).
          const toiCheckbox = checkboxY != null && dayView >= checkboxY + 24;
          const toiCuoi = dayView >= contentSize.height - 24;
          const xong = toiCheckbox || toiCuoi;
          if (xong) setDaDoc(true);
          // Mũi tên + nhãn: ẩn khi ô xác nhận đã hiện; cuộn lên lại thì hiện lại.
          setGanCuoi(xong);
        }}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
          <Text style={styles.backText}>{t('Quay lại', 'Back')}</Text>
        </Pressable>

        <Text style={styles.eyebrow}>
          {daDuyet ? t('ĐỐI TÁC CỦA CHÚNG TÔI', 'OUR PARTNER') : t('ĐĂNG KÝ ĐỐI TÁC', 'PARTNER REGISTRATION')}
        </Text>
        <Text style={styles.h1}>
          {daDuyet ? t('Đối tác chính thức', 'Official partner') : t('Đăng ký đối tác với chúng tôi', 'Become our partner')}
        </Text>

        {daDuyet ? (
          <>
            <View style={styles.card}>
              <Ionicons name="ribbon" size={40} color={colors.success} />
              <Text style={styles.doneTitle}>{t('Bạn đã là đối tác chính thức', 'You are an official partner')}</Text>
              <Text style={styles.doneSub}>
                {t(
                  'Hồ sơ đã được duyệt. Hợp đồng đã gửi tới email của bạn. Bạn không cần đăng ký lại.',
                  'Your application was approved. The contract has been sent to your email. You do not need to register again.',
                )}
              </Text>
            </View>
            {app ? (
              <View style={[styles.card, { alignItems: 'stretch', marginTop: 12 }]}>
                <Text style={styles.section}>{t('Thông tin đã đăng ký', 'Registered information')}</Text>
                <InfoRow label={t('Họ và tên', 'Full name')} value={app.fullName} />
                <InfoRow label={t('Số CCCD', 'ID number')} value={app.cccdNumber} />
                <InfoRow label={t('Ngày cấp / Nơi cấp', 'Issue date / Issued by')} value={app.cccdIssue ?? '—'} />
                <InfoRow label={t('Điện thoại', 'Phone')} value={app.phone} />
                <InfoRow label={t('Email', 'Email')} value={app.email ?? '—'} />
                <InfoRow
                  label={t('Ngân hàng', 'Bank')}
                  value={`${app.bankAccount ?? '—'} ${app.bankName ?? ''}`.trim()}
                />
                <InfoRow label={t('Địa chỉ', 'Address')} value={app.address ?? '—'} />
              </View>
            ) : null}
          </>
        ) : daNop ? (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <Text style={styles.doneTitle}>{t('Đã gửi hồ sơ', 'Application submitted')}</Text>
            <Text style={styles.doneSub}>
              {t(
                'Đội ngũ đang xét duyệt hồ sơ của bạn. Bạn sẽ nhận thông báo và hợp đồng qua email khi được duyệt.',
                'Our team is reviewing your application. You will receive a notification and contract by email once approved.',
              )}
            </Text>
          </View>
        ) : buoc === 'dieu-khoan' ? (
          (() => {
            const sections = dieuKhoan?.sections ?? [];
            const paras = sections.flatMap((s) => s.paragraphs);
            return (
              <>
                <Text style={styles.lead}>
                  {t(
                    'Đọc toàn bộ thỏa thuận. Cuộn tới cuối rồi tích xác nhận để tiếp tục điền hồ sơ.',
                    'Read the entire agreement. Scroll to the end, then check the box to continue filling in your application.',
                  )}
                </Text>

                {/* Điều khoản đọc bằng cách cuộn CẢ MÀN HÌNH (không hộp cuộn lồng). */}
                <View style={styles.termsBox}>
                  {(paras.length ? paras : [t('Đang tải điều khoản…', 'Loading terms…')]).map(
                    (p, i) => {
                      const upper = p.toUpperCase();
                      const isDieu = p.toLowerCase().startsWith('điều ');
                      const isTitle = p === upper && p.length < 90;
                      if (isDieu) {
                        return (
                          <Text key={i} style={styles.termDieu}>
                            {p}
                          </Text>
                        );
                      }
                      return (
                        <Text
                          key={i}
                          style={[styles.termP, isTitle && styles.termTitle]}>
                          {p}
                        </Text>
                      );
                    },
                  )}
                </View>

                {!daDoc ? (
                  <Text style={styles.scrollHint}>
                    {t('↓ Cuộn đọc hết thỏa thuận để tích xác nhận', '↓ Scroll through the whole agreement to check the box')}
                  </Text>
                ) : null}
                <View
                  onLayout={(e) => setCheckboxY(e.nativeEvent.layout.y)}
                  style={{ marginTop: 14, marginBottom: 14, opacity: daDoc ? 1 : 0.5 }}>
                  <Checkbox
                    checked={dongY}
                    onToggle={() => {
                      if (daDoc) setDongY((v) => !v);
                    }}>
                    {t(
                      'Tôi đã đọc và đồng ý toàn bộ Thỏa thuận hợp tác KOL/KOC và Cam kết bảo mật thông tin.',
                      'I have read and agree to the entire KOL/KOC Cooperation Agreement and Information Confidentiality Commitment.',
                    )}
                  </Checkbox>
                </View>
                <PrimaryButton
                  label={t('Tiếp tục điền hồ sơ', 'Continue to application')}
                  disabled={!dongY}
                  onPress={() => setBuoc('form')}
                />
              </>
            );
          })()
        ) : (
          <>
            <ErrorBox message={loi} />
            <Field
              label={t('Họ và tên *', 'Full name *')}
              placeholder={t('Nguyễn Văn A', 'John Doe')}
              autoCapitalize="words"
              value={info.fullName}
              onChangeText={(v) => dat('fullName', v)}
            />
            <Field
              label={t('Số điện thoại *', 'Phone number *')}
              placeholder="09xxxxxxxx"
              keyboardType="phone-pad"
              value={info.phone}
              onChangeText={(v) => dat('phone', v)}
            />
            <Field
              label={t('Số CCCD/Căn cước *', 'ID/Citizen number *')}
              placeholder="0xxxxxxxxxxx"
              keyboardType="number-pad"
              value={info.cccdNumber}
              onChangeText={(v) => dat('cccdNumber', v)}
            />
            <Field
              label={t('Ngày cấp', 'Issue date')}
              placeholder="01/01/2021"
              value={info.cccdIssueDate ?? ''}
              onChangeText={(v) => dat('cccdIssueDate', v)}
            />
            <Field
              label={t('Nơi cấp', 'Issued by')}
              placeholder="Cục CSQLHC về TTXH"
              value={info.cccdIssuePlace ?? ''}
              onChangeText={(v) => dat('cccdIssuePlace', v)}
            />
            <Field
              label={t('Địa chỉ liên hệ', 'Contact address')}
              placeholder={t('Số nhà, đường, phường/xã, tỉnh/thành', 'House no., street, ward, province/city')}
              value={info.address ?? ''}
              onChangeText={(v) => dat('address', v)}
            />
            <Field
              label={t('Email', 'Email')}
              placeholder="ban@email.com"
              keyboardType="email-address"
              value={info.email ?? ''}
              onChangeText={(v) => dat('email', v)}
            />
            <Field
              label={t('Số tài khoản ngân hàng', 'Bank account number')}
              placeholder={t('Số tài khoản nhận hoa hồng', 'Account to receive commission')}
              keyboardType="number-pad"
              value={info.bankAccount ?? ''}
              onChangeText={(v) => dat('bankAccount', v)}
            />
            <Field
              label={t('Tên chủ tài khoản', 'Account holder name')}
              placeholder="NGUYEN VAN A"
              autoCapitalize="characters"
              value={info.bankHolder ?? ''}
              onChangeText={(v) => dat('bankHolder', v)}
            />
            <Field
              label={t('Ngân hàng', 'Bank')}
              placeholder="Vietcombank / Techcombank / MB…"
              value={info.bankName ?? ''}
              onChangeText={(v) => dat('bankName', v)}
            />
            <SocialLinksInput
              label={t('Kênh mạng xã hội (link)', 'Social media channels (links)')}
              placeholder="TikTok / Facebook / Instagram…"
              value={info.socialLinks ?? ''}
              onChange={(v) => dat('socialLinks', v)}
              addLabel={t('Thêm kênh', 'Add channel')}
            />

            <Text style={styles.section}>{t('Xác minh danh tính', 'Identity verification')}</Text>
            <Text style={styles.note}>
              {t(
                'Ảnh CCCD rõ nét. Video quay chính diện khuôn mặt 3–5 giây để đối chiếu.',
                'Clear ID photos. Record a 3–5 second front-facing face video for verification.',
              )}
            </Text>
            <View style={styles.uploads}>
              <UploadTile
                label={t('CCCD mặt trước', 'ID front')}
                icon="card-outline"
                asset={tep.cccdFront}
                onPress={() => chonTep('cccdFront')}
              />
              <UploadTile
                label={t('CCCD mặt sau', 'ID back')}
                icon="card-outline"
                asset={tep.cccdBack}
                onPress={() => chonTep('cccdBack')}
              />
              <UploadTile
                label={t('Video khuôn mặt', 'Face video')}
                icon="videocam-outline"
                asset={tep.faceVideo}
                isVideo
                onPress={() => chonTep('faceVideo')}
              />
            </View>

            <View style={{ height: 8 }} />
            <PrimaryButton
              label={t('Gửi hồ sơ', 'Submit application')}
              loading={dangGui}
              onPress={gui}
            />
            <Pressable
              onPress={() => setBuoc('dieu-khoan')}
              style={styles.backLink}>
              <Text style={styles.backLinkText}>{t('← Xem lại điều khoản', '← Review terms')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Mũi tên xuống + nhãn "Kéo xuống": bấm là cuộn tới cuối điều khoản (chỗ
          checkbox). Hiện khi chưa tới cuối; cuộn tới cuối thì ẩn, cuộn lên lại hiện. */}
      {buoc === 'dieu-khoan' && !daDuyet && !daNop && !ganCuoi ? (
        <View style={styles.jumpWrap} pointerEvents="box-none">
          <View style={styles.jumpLabel}>
            <Text style={styles.jumpLabelText}>{t('Kéo xuống', 'Scroll down')}</Text>
          </View>
          <Pressable
            onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
            style={styles.jump}
            hitSlop={8}
            accessibilityLabel={t('Xuống cuối điều khoản để xác nhận', 'Go to the end of the terms to confirm')}>
            <Ionicons name="chevron-down" size={24} color={colors.onBrand} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

function UploadTile({
  label,
  icon,
  asset,
  isVideo,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  asset?: TepKyc;
  isVideo?: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
      {asset && !isVideo ? (
        <Image source={{ uri: asset.uri }} style={styles.tileImg} contentFit="cover" />
      ) : (
        <View style={[styles.tileFace, asset && styles.tileFaceOn]}>
          <Ionicons
            name={asset ? 'checkmark-circle' : icon}
            size={26}
            color={asset ? colors.success : colors.muted}
          />
          <Text style={styles.tileLabel}>{label}</Text>
          <Text style={styles.tileHint}>
            {asset ? t('Đã chọn', 'Selected') : t('Chạm để tải lên', 'Tap to upload')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8, padding: 4 },
  backText: { fontSize: 14, fontWeight: '700', color: colors.text },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.brand, letterSpacing: 1 },
  h1: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1, marginTop: 4 },
  lead: { fontSize: 13.5, color: colors.muted, lineHeight: 20, marginTop: 8, marginBottom: 14 },

  scrollHint: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.brand,
    textAlign: 'center',
    marginTop: 10,
  },
  jumpWrap: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 7,
  },
  jumpLabel: {
    backgroundColor: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  jumpLabelText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  jump: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  infoLabel: { fontSize: 12.5, color: colors.muted, flexShrink: 0 },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },

  termsBox: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 16,
  },
  termP: { fontSize: 14, lineHeight: 22, color: colors.text, marginBottom: 10 },
  // Tiêu đề ĐIỀU: banner cam nhạt, gạch trái — tách hẳn với nội dung.
  termDieu: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.brand,
    backgroundColor: colors.brandSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  termTitle: { fontWeight: '900', textAlign: 'center', fontSize: 14 },

  card: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginTop: 16,
    gap: 6,
  },
  doneTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 6 },
  doneSub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  section: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 10, marginBottom: 4 },
  note: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 12 },
  uploads: { gap: 10 },
  tile: { borderRadius: radius.lg, overflow: 'hidden' },
  tileImg: { width: '100%', height: 150, borderRadius: radius.lg },
  tileFace: {
    height: 92,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tileFaceOn: { borderColor: colors.success, backgroundColor: colors.successSoft },
  tileLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  tileHint: { fontSize: 11, color: colors.muted },

  backLink: { alignItems: 'center', paddingVertical: 14 },
  backLinkText: { fontSize: 13, fontWeight: '700', color: colors.muted },
});
