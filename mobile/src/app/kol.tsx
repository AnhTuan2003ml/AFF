import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
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
import { Checkbox, ErrorBox, Field, PrimaryButton } from '@/components/form';
import { colors, radius, spacing } from '@/theme/tokens';

type KieuTep = 'cccdFront' | 'cccdBack' | 'faceVideo';

export default function KolScreen() {
  const insets = useSafeAreaInsets();
  const [dongY, setDongY] = useState(false);
  const [buoc, setBuoc] = useState<'dieu-khoan' | 'form'>('dieu-khoan');
  const [daDoc, setDaDoc] = useState(false);
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
      anh ? 'Ảnh CCCD' : 'Video khuôn mặt',
      undefined,
      [
        {
          text: anh ? 'Chụp ảnh' : 'Quay video',
          onPress: () => moPicker(kind, 'camera'),
        },
        {
          text: 'Chọn từ thư viện',
          onPress: () => moPicker(kind, 'thu-vien'),
        },
        { text: 'Hủy', style: 'cancel' },
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
          Alert.alert('Cần quyền máy ảnh', 'Vui lòng cấp quyền để chụp/quay.');
          return;
        }
      } else {
        const quyen = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!quyen.granted) {
          Alert.alert('Cần quyền thư viện', 'Vui lòng cấp quyền để chọn tệp.');
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
      Alert.alert('Không mở được', 'Có lỗi khi chọn tệp. Vui lòng thử lại.');
    }
  }

  async function gui() {
    setLoi(null);
    if (!info.fullName.trim() || !info.cccdNumber.trim() || !info.phone.trim()) {
      setLoi('Vui lòng điền Họ tên, Số CCCD và Số điện thoại.');
      return;
    }
    if (!tep.cccdFront || !tep.cccdBack || !tep.faceVideo) {
      setLoi('Vui lòng tải đủ ảnh CCCD 2 mặt và video khuôn mặt.');
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
        e instanceof ApiError ? e.message : 'Gửi hồ sơ chưa thành công. Thử lại.',
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
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.sm },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={64}
        onScroll={(e) => {
          // Cuộn cả màn hình để đọc; tới gần cuối thì mở khóa ô đồng ý.
          const { layoutMeasurement, contentOffset, contentSize } =
            e.nativeEvent;
          if (
            buoc === 'dieu-khoan' &&
            contentOffset.y + layoutMeasurement.height >=
              contentSize.height - 60
          ) {
            setDaDoc(true);
          }
        }}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Quay lại</Text>
        </Pressable>

        <Text style={styles.eyebrow}>
          {daDuyet ? 'ĐỐI TÁC KOL/KOC' : 'ĐĂNG KÝ ĐỐI TÁC'}
        </Text>
        <Text style={styles.h1}>
          {daDuyet ? 'Đối tác chính thức' : 'Đăng ký KOL/KOC'}
        </Text>

        {daDuyet ? (
          <>
            <View style={styles.card}>
              <Ionicons name="ribbon" size={40} color={colors.success} />
              <Text style={styles.doneTitle}>Bạn đã là đối tác chính thức</Text>
              <Text style={styles.doneSub}>
                Hồ sơ đã được duyệt. Hợp đồng đã gửi tới email của bạn. Bạn không
                cần đăng ký lại.
              </Text>
            </View>
            {app ? (
              <View style={[styles.card, { alignItems: 'stretch', marginTop: 12 }]}>
                <Text style={styles.section}>Thông tin đã đăng ký</Text>
                <InfoRow label="Họ và tên" value={app.fullName} />
                <InfoRow label="Số CCCD" value={app.cccdNumber} />
                <InfoRow label="Ngày cấp / Nơi cấp" value={app.cccdIssue ?? '—'} />
                <InfoRow label="Điện thoại" value={app.phone} />
                <InfoRow label="Email" value={app.email ?? '—'} />
                <InfoRow
                  label="Ngân hàng"
                  value={`${app.bankAccount ?? '—'} ${app.bankName ?? ''}`.trim()}
                />
                <InfoRow label="Địa chỉ" value={app.address ?? '—'} />
              </View>
            ) : null}
          </>
        ) : daNop ? (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <Text style={styles.doneTitle}>Đã gửi hồ sơ</Text>
            <Text style={styles.doneSub}>
              Đội ngũ đang xét duyệt hồ sơ của bạn. Bạn sẽ nhận thông báo và hợp
              đồng qua email khi được duyệt.
            </Text>
          </View>
        ) : buoc === 'dieu-khoan' ? (
          (() => {
            const sections = dieuKhoan?.sections ?? [];
            const paras = sections.flatMap((s) => s.paragraphs);
            return (
              <>
                <Text style={styles.lead}>
                  Đọc toàn bộ thỏa thuận. Cuộn tới cuối rồi tích xác nhận để tiếp
                  tục điền hồ sơ.
                </Text>

                {/* Điều khoản đọc bằng cách cuộn CẢ MÀN HÌNH (không hộp cuộn lồng). */}
                <View style={styles.termsBox}>
                  {(paras.length ? paras : ['Đang tải điều khoản…']).map(
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
                    ↓ Cuộn đọc hết thỏa thuận để tích xác nhận
                  </Text>
                ) : null}
                <View
                  style={{ marginTop: 14, marginBottom: 14, opacity: daDoc ? 1 : 0.5 }}>
                  <Checkbox
                    checked={dongY}
                    onToggle={() => {
                      if (daDoc) setDongY((v) => !v);
                    }}>
                    Tôi đã đọc và đồng ý toàn bộ Thỏa thuận hợp tác KOL/KOC và Cam
                    kết bảo mật thông tin.
                  </Checkbox>
                </View>
                <PrimaryButton
                  label="Tiếp tục điền hồ sơ"
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
              label="Họ và tên *"
              placeholder="Nguyễn Văn A"
              autoCapitalize="words"
              value={info.fullName}
              onChangeText={(v) => dat('fullName', v)}
            />
            <Field
              label="Số điện thoại *"
              placeholder="09xxxxxxxx"
              keyboardType="phone-pad"
              value={info.phone}
              onChangeText={(v) => dat('phone', v)}
            />
            <Field
              label="Số CCCD/Căn cước *"
              placeholder="0xxxxxxxxxxx"
              keyboardType="number-pad"
              value={info.cccdNumber}
              onChangeText={(v) => dat('cccdNumber', v)}
            />
            <Field
              label="Ngày cấp"
              placeholder="01/01/2021"
              value={info.cccdIssueDate ?? ''}
              onChangeText={(v) => dat('cccdIssueDate', v)}
            />
            <Field
              label="Nơi cấp"
              placeholder="Cục CSQLHC về TTXH"
              value={info.cccdIssuePlace ?? ''}
              onChangeText={(v) => dat('cccdIssuePlace', v)}
            />
            <Field
              label="Địa chỉ liên hệ"
              placeholder="Số nhà, đường, phường/xã, tỉnh/thành"
              value={info.address ?? ''}
              onChangeText={(v) => dat('address', v)}
            />
            <Field
              label="Email"
              placeholder="ban@email.com"
              keyboardType="email-address"
              value={info.email ?? ''}
              onChangeText={(v) => dat('email', v)}
            />
            <Field
              label="Số tài khoản ngân hàng"
              placeholder="Số tài khoản nhận hoa hồng"
              keyboardType="number-pad"
              value={info.bankAccount ?? ''}
              onChangeText={(v) => dat('bankAccount', v)}
            />
            <Field
              label="Tên chủ tài khoản"
              placeholder="NGUYEN VAN A"
              autoCapitalize="characters"
              value={info.bankHolder ?? ''}
              onChangeText={(v) => dat('bankHolder', v)}
            />
            <Field
              label="Ngân hàng"
              placeholder="Vietcombank / Techcombank / MB…"
              value={info.bankName ?? ''}
              onChangeText={(v) => dat('bankName', v)}
            />
            <Field
              label="Kênh mạng xã hội (link)"
              placeholder="TikTok / Facebook / Instagram…"
              value={info.socialLinks ?? ''}
              onChangeText={(v) => dat('socialLinks', v)}
            />

            <Text style={styles.section}>Xác minh danh tính</Text>
            <Text style={styles.note}>
              Ảnh CCCD rõ nét. Video quay chính diện khuôn mặt 3–5 giây để đối
              chiếu.
            </Text>
            <View style={styles.uploads}>
              <UploadTile
                label="CCCD mặt trước"
                icon="card-outline"
                asset={tep.cccdFront}
                onPress={() => chonTep('cccdFront')}
              />
              <UploadTile
                label="CCCD mặt sau"
                icon="card-outline"
                asset={tep.cccdBack}
                onPress={() => chonTep('cccdBack')}
              />
              <UploadTile
                label="Video khuôn mặt"
                icon="videocam-outline"
                asset={tep.faceVideo}
                isVideo
                onPress={() => chonTep('faceVideo')}
              />
            </View>

            <View style={{ height: 8 }} />
            <PrimaryButton
              label="Gửi hồ sơ"
              loading={dangGui}
              onPress={gui}
            />
            <Pressable
              onPress={() => setBuoc('dieu-khoan')}
              style={styles.backLink}>
              <Text style={styles.backLinkText}>← Xem lại điều khoản</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
            {asset ? 'Đã chọn' : 'Chạm để tải lên'}
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
