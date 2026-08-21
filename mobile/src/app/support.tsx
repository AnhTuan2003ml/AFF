import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  guiYeuCauHoTro,
  laySupportForm,
  type SupportFormData,
  type SupportOrderOption,
  type SupportTopic,
} from '@/api/account';
import { CanDangNhap } from '@/components/CanDangNhap';
import { Mascot } from '@/components/Mascot';
import { useSession } from '@/hooks/useSession';
import { CAMIO_VOICE, camio } from '@/lib/camio-voice';
import { ngayGio } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Hỗ trợ — FORM THEO MẪU y như trang /app/support của web (không phải chat):
 * chọn vấn đề → (đơn liên quan | mã đơn trên sàn) → mô tả → email nhận phản
 * hồi → Gửi. Đi cùng pipeline với web: POST /api/v1/support/requests →
 * submitSupportRequest → lưu hội thoại + đổ vào thread Slack CSKH (kèm
 * reply_broadcast để hiện ra ngoài kênh). Ô "Phản hồi" hiện yêu cầu mới nhất
 * của bạn và câu trả lời mới nhất của đội CSKH, có linh vật CamiO.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<Record<'topic' | 'order' | 'code' | 'description' | 'email', string>>;

export default function SupportScreen() {
  const { user } = useSession();

  if (!user) {
    return (
      <View style={styles.screen}>
        <Header />
        <CanDangNhap mo_ta="Đăng nhập để gửi yêu cầu hỗ trợ và xem phản hồi." />
      </View>
    );
  }
  return <SupportForm />;
}

function SupportForm() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['support-form'],
    queryFn: laySupportForm,
    // Phản hồi CSKH về là hiện ngay (cùng nhịp poll như web).
    refetchInterval: 15000,
  });

  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [order, setOrder] = useState<SupportOrderOption | null>(null);
  const [orderCode, setOrderCode] = useState('');
  const [description, setDescription] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [moChonDon, setMoChonDon] = useState(false);
  const [moPhanHoi, setMoPhanHoi] = useState(false);

  // Điền sẵn email nhận phản hồi từ server (email đã lưu hoặc email đăng ký).
  useEffect(() => {
    if (data && !emailTouched) setNotifyEmail(data.notifyEmail);
  }, [data, emailTouched]);

  const gui = useMutation({
    mutationFn: guiYeuCauHoTro,
    onSuccess: async () => {
      setTopic(null);
      setOrder(null);
      setOrderCode('');
      setDescription('');
      setErrors({});
      setFormError(null);
      setSentAt(Date.now());
      await qc.invalidateQueries({ queryKey: ['support-form'] });
      await qc.invalidateQueries({ queryKey: ['support'] });
    },
    onError: (e) => {
      setFormError(e instanceof Error && e.message ? e.message : camio('error'));
    },
  });

  const orderMode = topic?.orderMode ?? null;
  const coDon = (data?.orderOptions.length ?? 0) > 0;
  const loiChao = useMemo(() => CAMIO_VOICE.supportIntro[0], []);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!topic) next.topic = 'Vui lòng chọn vấn đề cần hỗ trợ.';
    if (orderMode === 'list' && topic?.orderRequired && !order) {
      next.order = 'Vui lòng chọn đơn hàng cần hỗ trợ.';
    }
    if (orderMode === 'code' && orderCode.trim().length < 3) {
      next.code = 'Vui lòng nhập mã đơn hàng trên sàn (tối thiểu 3 ký tự).';
    }
    if (description.trim().length < 10) next.description = 'Mô tả cần tối thiểu 10 ký tự.';
    const email = notifyEmail.trim();
    if (email && !EMAIL_PATTERN.test(email)) next.email = 'Email nhận phản hồi chưa đúng định dạng.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit() {
    setFormError(null);
    setSentAt(null);
    if (!validate() || !topic || gui.isPending) return;
    gui.mutate({
      topic: topic.value,
      ...(orderMode === 'list' && order ? { orderKey: order.key } : {}),
      ...(orderMode === 'code' ? { orderCode: orderCode.trim() } : {}),
      description: description.trim(),
      notifyEmail: notifyEmail.trim(),
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <Header
        coPhanHoi={!!data?.latestReply}
        onMoPhanHoi={data?.latestRequest || data?.latestReply ? () => setMoPhanHoi(true) : undefined}
      />

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Mascot mood="ngacnhien" size={64} />
          <Text style={styles.loadErr}>{camio('error')}</Text>
          <Pressable style={styles.retry} onPress={() => refetch()}>
            <Text style={styles.retryText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled">
          {/* Lời mở của Camio */}
          <View style={styles.intro}>
            <Mascot mood="haohung" size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitle}>Gửi yêu cầu theo mẫu</Text>
              <Text style={styles.introSub}>{loiChao}</Text>
            </View>
          </View>

          {/* Vấn đề cần hỗ trợ */}
          <Text style={styles.label}>Vấn đề cần hỗ trợ</Text>
          <View style={styles.topicList}>
            {data.topics.map((t) => {
              const chon = topic?.value === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => {
                    setTopic(t);
                    setErrors({});
                    setSentAt(null);
                    if (t.orderMode !== 'list') setOrder(null);
                    if (t.orderMode !== 'code') setOrderCode('');
                  }}
                  style={({ pressed }) => [
                    styles.topic,
                    chon && styles.topicOn,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <View style={[styles.radio, chon && styles.radioOn]}>
                    {chon && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.topicText, chon && styles.topicTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {errors.topic ? <Text style={styles.fieldErr}>{errors.topic}</Text> : null}

          {/* Đơn hàng liên quan (chọn từ lịch sử) */}
          {orderMode === 'list' && (
            <>
              <Text style={styles.label}>
                Đơn hàng liên quan{topic?.orderRequired ? '' : ' (không bắt buộc)'}
              </Text>
              <Pressable
                onPress={() => coDon && setMoChonDon(true)}
                style={[styles.select, !coDon && { opacity: 0.6 }]}>
                <Text style={[styles.selectText, !order && { color: colors.muted }]} numberOfLines={2}>
                  {order ? order.label : coDon ? '— Chọn đơn hàng —' : 'Tài khoản của bạn chưa có đơn nào.'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.muted} />
              </Pressable>
              {errors.order ? <Text style={styles.fieldErr}>{errors.order}</Text> : null}
            </>
          )}

          {/* Mã đơn trên sàn */}
          {orderMode === 'code' && (
            <>
              <Text style={styles.label}>Mã đơn hàng trên sàn</Text>
              <TextInput
                value={orderCode}
                onChangeText={(v) => {
                  setOrderCode(v);
                  setErrors((e) => ({ ...e, code: undefined }));
                }}
                placeholder="Ví dụ: 2508ABCXYZ123"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={100}
                style={styles.input}
              />
              <Text style={styles.help}>Xem trong mục đơn mua của Shopee / TikTok Shop / Lazada.</Text>
              {errors.code ? <Text style={styles.fieldErr}>{errors.code}</Text> : null}
            </>
          )}

          {/* Mô tả */}
          <Text style={styles.label}>Mô tả chi tiết</Text>
          <TextInput
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              setErrors((e) => ({ ...e, description: undefined }));
            }}
            placeholder="Bạn gặp vấn đề gì? (tối thiểu 10 ký tự)"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            style={[styles.input, styles.textarea]}
          />
          {errors.description ? <Text style={styles.fieldErr}>{errors.description}</Text> : null}

          {/* Email nhận phản hồi */}
          <Text style={styles.label}>Email nhận phản hồi</Text>
          <TextInput
            value={notifyEmail}
            onChangeText={(v) => {
              setEmailTouched(true);
              setNotifyEmail(v);
              setErrors((e) => ({ ...e, email: undefined }));
            }}
            placeholder="ban@email.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            maxLength={254}
            style={styles.input}
          />
          <Text style={styles.help}>Phản hồi của đội hỗ trợ cũng được gửi về email này.</Text>
          {errors.email ? <Text style={styles.fieldErr}>{errors.email}</Text> : null}

          {sentAt ? (
            <View style={styles.success}>
              <Mascot mood="thichthu" size={36} />
              <Text style={styles.successText}>
                Đã gửi! Đội CSKH sẽ xử lý và phản hồi qua email cùng thông báo trên app. Camio
                canh giúp bạn 👀
              </Text>
            </View>
          ) : null}
          {formError ? <Text style={styles.formErr}>{formError}</Text> : null}

          <Pressable
            onPress={submit}
            disabled={gui.isPending}
            style={({ pressed }) => [
              styles.primary,
              gui.isPending && { opacity: 0.6 },
              pressed && !gui.isPending && { backgroundColor: colors.brandStrong },
            ]}>
            {gui.isPending ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryText}>Gửi yêu cầu</Text>
            )}
          </Pressable>

          <View style={styles.foot}>
            <Ionicons name="time-outline" size={16} color={colors.muted} />
            <Text style={styles.footText}>
              Đội CSKH thường phản hồi trong vòng 24 giờ. Bạn sẽ nhận thông báo trên app và
              email khi có phản hồi mới.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Chọn đơn hàng */}
      <Modal
        visible={moChonDon}
        transparent
        animationType="fade"
        onRequestClose={() => setMoChonDon(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoChonDon(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Chọn đơn hàng</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {(data?.orderOptions ?? []).map((o) => (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    setOrder(o);
                    setErrors((e) => ({ ...e, order: undefined }));
                    setMoChonDon(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    order?.key === o.key && styles.optionOn,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={styles.optionText}>{o.label}</Text>
                  {order?.key === o.key && (
                    <Ionicons name="checkmark" size={18} color={colors.brand} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.ghost} onPress={() => setMoChonDon(false)}>
              <Text style={styles.ghostText}>Đóng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Phản hồi: yêu cầu mới nhất + trả lời mới nhất của CSKH */}
      <Modal
        visible={moPhanHoi}
        transparent
        animationType="fade"
        onRequestClose={() => setMoPhanHoi(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoPhanHoi(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Phản hồi</Text>
            <Text style={styles.sheetSub}>Yêu cầu hiện tại và phản hồi mới nhất từ đội CSKH.</Text>
            {data ? <PhanHoi data={data} /> : null}
            <Pressable style={styles.ghost} onPress={() => setMoPhanHoi(false)}>
              <Text style={styles.ghostText}>Đóng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function PhanHoi({ data }: { data: SupportFormData }) {
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      {data.latestRequest ? (
        <View style={[styles.msgRow, styles.msgRight]}>
          <View style={[styles.bubble, styles.bubbleMe]}>
            <Text style={styles.bubbleWho}>Yêu cầu của bạn</Text>
            <Text style={[styles.bubbleText, { color: colors.onBrand }]}>{data.latestRequest.body}</Text>
            <Text style={[styles.bubbleTime, { color: 'rgba(255,255,255,0.75)' }]}>
              {ngayGio(data.latestRequest.createdAt)}
            </Text>
          </View>
        </View>
      ) : null}
      {data.latestReply ? (
        <View style={[styles.msgRow, styles.msgLeft]}>
          <View style={styles.agent}>
            <Mascot mood="haohung" size={30} />
          </View>
          <View style={[styles.bubble, styles.bubbleAgent]}>
            <Text style={[styles.bubbleWho, { color: colors.brand }]}>Đội CSKH</Text>
            <Text style={styles.bubbleText}>{data.latestReply.body}</Text>
            <Text style={styles.bubbleTime}>{ngayGio(data.latestReply.createdAt)}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.waiting}>
          <Mascot mood="baocao" size={32} />
          <Text style={styles.waitingText}>
            Đội CSKH đang xử lý — phản hồi sẽ hiện ở đây và Camio báo bạn ngay 👀
          </Text>
        </View>
      )}
    </View>
  );
}

function Header({ coPhanHoi, onMoPhanHoi }: { coPhanHoi?: boolean; onMoPhanHoi?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Hỗ trợ</Text>
      {onMoPhanHoi ? (
        <Pressable onPress={onMoPhanHoi} hitSlop={8} style={styles.replyBtn}>
          <Text style={styles.replyBtnText}>Phản hồi</Text>
          {coPhanHoi ? <View style={styles.replyDot} /> : null}
        </Pressable>
      ) : (
        <View style={{ width: 64 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  back: { width: 22 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  replyBtn: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  replyBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.brand },
  replyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },

  content: { padding: spacing.md, gap: 6 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  introTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  introSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },

  label: { fontSize: 12.5, fontWeight: '800', color: colors.inkSoft, marginTop: 12, marginBottom: 6 },
  help: { fontSize: 11.5, color: colors.muted, marginTop: 5 },
  fieldErr: { fontSize: 12, color: colors.danger, marginTop: 5, fontWeight: '700' },
  formErr: {
    marginTop: 10,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 12.5,
    fontWeight: '700',
  },

  topicList: { gap: 8 },
  topic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  topicOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  topicText: { fontSize: 13.5, color: colors.text, flex: 1 },
  topicTextOn: { fontWeight: '800' },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },

  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selectText: { flex: 1, fontSize: 13.5, color: colors.text },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 110 },

  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
  },
  successText: { flex: 1, fontSize: 12.5, color: colors.success, fontWeight: '700', lineHeight: 18 },

  primary: {
    height: 50,
    marginTop: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },
  foot: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  footText: { flex: 1, fontSize: 11.5, color: colors.muted, lineHeight: 17 },

  loadErr: { fontSize: 13.5, color: colors.muted, textAlign: 'center' },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  retryText: { color: colors.brand, fontWeight: '800', fontSize: 13 },

  scrim: { flex: 1, backgroundColor: 'rgba(40,22,14,0.4)', justifyContent: 'flex-end' },
  sheet: {
    padding: 20,
    paddingBottom: 34,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  sheetSub: { fontSize: 12.5, color: colors.muted, marginTop: -4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  optionOn: { backgroundColor: colors.brandSoft },
  optionText: { flex: 1, fontSize: 13.5, color: colors.text },
  ghost: { alignItems: 'center', paddingVertical: 8 },
  ghostText: { color: colors.muted, fontWeight: '700', fontSize: 13.5 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  agent: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md },
  bubbleAgent: {
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleWho: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.85)', marginBottom: 2 },
  bubbleText: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
  bubbleTime: { fontSize: 10, color: colors.muted, marginTop: 3, alignSelf: 'flex-end' },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
  },
  waitingText: { flex: 1, fontSize: 12.5, color: colors.muted, lineHeight: 18 },
});
