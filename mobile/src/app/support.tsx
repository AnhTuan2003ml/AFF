import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  guiHoTro,
  guiYeuCauHoTro,
  layHoTro,
  laySupportForm,
  type SupportFormData,
  type SupportMessage,
  type SupportOrderOption,
  type SupportTopic,
} from '@/api/account';
import { CanDangNhap } from '@/components/CanDangNhap';
import { Mascot } from '@/components/Mascot';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { camio, camioAt } from '@/lib/camio-voice';
import { ngayGio } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Hỗ trợ — CHAT TRỰC TIẾP với tư vấn viên là mặc định (cùng thread Slack/DB
 * với web: GET/POST /api/v1/support). Trong chat có:
 *   - gợi ý CÂU HỎI THƯỜNG GẶP (chip bấm là điền sẵn vào ô nhập);
 *   - nút "Nhắn tư vấn viên" khi chưa có hội thoại;
 *   - nút 📦 chọn/đổi ĐƠN HÀNG cần hỏi — đơn được gắn vào đầu tin nhắn
 *     ("[Đơn Shopee · #123…] …") để tư vấn viên biết ngay ngữ cảnh.
 * "Gửi yêu cầu theo mẫu" (form như web) vẫn còn — nút "Theo mẫu" trên header.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CAU_HOI_THUONG_GAP: { vi: string; en: string }[] = [
  { vi: 'Đơn đã mua nhưng chưa thấy ghi nhận?', en: 'Ordered but not recorded yet?' },
  { vi: 'Bao lâu thì tiền hoàn về ví?', en: 'How long until cashback reaches my wallet?' },
  { vi: 'Cách rút tiền về ngân hàng?', en: 'How do I withdraw to my bank?' },
  { vi: 'Vì sao đơn của tôi bị hủy hoàn?', en: 'Why was my order cashback cancelled?' },
  { vi: 'Link sản phẩm không tra cứu được?', en: "Can't look up the product link?" },
  { vi: 'Tiền hoàn được tính như thế nào?', en: 'How is cashback calculated?' },
];

type FieldErrors = Partial<Record<'topic' | 'order' | 'code' | 'description' | 'email', string>>;

export default function SupportScreen() {
  const { user } = useSession();
  const t = useT();
  const [cheDo, setCheDo] = useState<'chat' | 'form'>('chat');

  if (!user) {
    return (
      <View style={styles.screen}>
        <Header />
        <CanDangNhap
          mo_ta={t(
            'Đăng nhập để chat với tư vấn viên và xem lại trao đổi.',
            'Sign in to chat with an advisor and review your conversations.',
          )}
        />
      </View>
    );
  }
  return cheDo === 'chat' ? (
    <ChatHoTro moForm={() => setCheDo('form')} />
  ) : (
    <SupportForm veChat={() => setCheDo('chat')} />
  );
}

/* ------------------------------------------------------------------ *
 * Chat trực tiếp với tư vấn viên
 * ------------------------------------------------------------------ */

function ChatHoTro({ moForm }: { moForm: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const qc = useQueryClient();
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const oDay = useRef(true); // người dùng đang ở gần đáy hội thoại?
  const soTinTruoc = useRef(0);
  const [noiDung, setNoiDung] = useState('');
  const [donDangHoi, setDonDangHoi] = useState<SupportOrderOption | null>(null);
  const [moChonDon, setMoChonDon] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['support'],
    queryFn: layHoTro,
    // Nhịp poll ngắn cho cảm giác realtime khi đang mở màn chat.
    refetchInterval: 8000,
  });
  // Danh sách đơn để gắn vào câu hỏi — dùng chung nguồn với form theo mẫu.
  const { data: form } = useQuery({
    queryKey: ['support-form'],
    queryFn: laySupportForm,
  });

  const gui = useMutation({
    mutationFn: guiHoTro,
    onSuccess: async () => {
      setNoiDung('');
      await qc.invalidateQueries({ queryKey: ['support'] });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    },
  });

  function guiTin() {
    const text = noiDung.trim();
    if (!text || gui.isPending) return;
    // Đơn đang hỏi được gắn vào đầu tin để tư vấn viên thấy ngay ngữ cảnh.
    gui.mutate(donDangHoi ? `[Đơn ${donDangHoi.label}] ${text}` : text);
  }

  const tin = data ?? [];
  const coDon = (form?.orderOptions.length ?? 0) > 0;
  const loiChao = camioAt('supportIntro', 0);

  // Có tin MỚI (poll hoặc vừa gửi) → tự cuộn xuống nếu đang ở gần đáy, để tin
  // mới hiện ngay mà KHÔNG cần thoát/mở lại màn hình. Không giật khi đọc lịch sử.
  useEffect(() => {
    if (tin.length > soTinTruoc.current && oDay.current) {
      const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      soTinTruoc.current = tin.length;
      return () => clearTimeout(id);
    }
    soTinTruoc.current = tin.length;
    return undefined;
  }, [tin.length]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <Header nutPhai={{ nhan: t('Theo mẫu', 'Use form'), onPress: moForm }} />

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={tin}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          scrollEventThrottle={100}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            oDay.current =
              contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
          }}
          onContentSizeChange={() => {
            if (oDay.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.intro2}>
              <Mascot mood="haohung" size={72} />
              <Text style={styles.introTitle}>{t('Tư vấn viên đang trực', 'An advisor is online')}</Text>
              <Text style={styles.introSub}>{loiChao}</Text>
              <Pressable
                onPress={() => inputRef.current?.focus()}
                style={({ pressed }) => [
                  styles.ctaChat,
                  pressed && { backgroundColor: colors.brandStrong },
                ]}>
                <Ionicons name="chatbubble-ellipses" size={16} color={colors.onBrand} />
                <Text style={styles.ctaChatText}>{t('Nhắn tư vấn viên', 'Message an advisor')}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => <TinNhan m={item} />}
        />
      )}

      {/* Gợi ý câu hỏi thường gặp — bấm là điền vào ô nhập, sửa rồi gửi. */}
      <View style={styles.faqWrap}>
        <Text style={styles.faqLabel}>{t('Câu hỏi thường gặp', 'Frequently asked')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faqRow}>
          {CAU_HOI_THUONG_GAP.map((q) => {
            const cauHoi = t(q.vi, q.en);
            return (
              <Pressable
                key={q.vi}
                onPress={() => {
                  setNoiDung(cauHoi);
                  inputRef.current?.focus();
                }}
                style={({ pressed }) => [styles.faqChip, pressed && { opacity: 0.8 }]}>
                <Text style={styles.faqChipText}>{cauHoi}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Đơn đang hỏi — bấm để CHỌN LẠI, ✕ để bỏ gắn. */}
      {donDangHoi ? (
        <View style={styles.attachBar}>
          <Pressable style={styles.attachChip} onPress={() => setMoChonDon(true)}>
            <Ionicons name="cube-outline" size={14} color={colors.brand} />
            <Text style={styles.attachText} numberOfLines={1}>
              {t('Đang hỏi về', 'Asking about')}: {donDangHoi.label}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.brand} />
          </Pressable>
          <Pressable onPress={() => setDonDangHoi(null)} hitSlop={8} style={styles.attachClear}>
            <Ionicons name="close" size={14} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        {/* Chọn đơn hàng cần hỏi */}
        <Pressable
          onPress={() => coDon && setMoChonDon(true)}
          hitSlop={6}
          accessibilityLabel={t('Chọn đơn hàng cần hỏi', 'Select the order to ask about')}
          style={[styles.attachBtn, !coDon && { opacity: 0.4 }]}>
          <Ionicons name="cube-outline" size={20} color={colors.brand} />
        </Pressable>
        <TextInput
          ref={inputRef}
          value={noiDung}
          onChangeText={setNoiDung}
          placeholder={t('Nhắn tư vấn viên…', 'Message an advisor…')}
          placeholderTextColor={colors.muted}
          style={styles.chatInput}
          multiline
        />
        <Pressable
          onPress={guiTin}
          disabled={!noiDung.trim() || gui.isPending}
          style={({ pressed }) => [
            styles.send,
            (!noiDung.trim() || gui.isPending) && { opacity: 0.5 },
            pressed && { backgroundColor: colors.brandStrong },
          ]}>
          {gui.isPending ? (
            <ActivityIndicator color={colors.onBrand} size="small" />
          ) : (
            <Ionicons name="send" size={18} color={colors.onBrand} />
          )}
        </Pressable>
      </View>

      {/* Chọn / chọn lại đơn hàng cần hỏi */}
      <Modal
        visible={moChonDon}
        transparent
        animationType="fade"
        onRequestClose={() => setMoChonDon(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoChonDon(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('Đơn hàng cần hỏi', 'Order to ask about')}</Text>
            <Text style={styles.sheetSub}>
              {t(
                'Đơn được gắn vào tin nhắn để tư vấn viên nắm ngay.',
                'The order is attached to your message so the advisor sees the context right away.',
              )}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {(form?.orderOptions ?? []).map((o) => (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    setDonDangHoi(o);
                    setMoChonDon(false);
                    inputRef.current?.focus();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    donDangHoi?.key === o.key && styles.optionOn,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={styles.optionText}>{o.label}</Text>
                  {donDangHoi?.key === o.key && (
                    <Ionicons name="checkmark" size={18} color={colors.brand} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {donDangHoi ? (
              <Pressable
                style={styles.ghost}
                onPress={() => {
                  setDonDangHoi(null);
                  setMoChonDon(false);
                }}>
                <Text style={styles.ghostText}>{t('Bỏ gắn đơn', 'Remove order')}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.ghost} onPress={() => setMoChonDon(false)}>
              <Text style={styles.ghostText}>{t('Đóng', 'Close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function TinNhan({ m }: { m: SupportMessage }) {
  const cua_toi = m.authorRole === 'USER';
  return (
    <View style={[styles.msgRow, cua_toi ? styles.msgRight : styles.msgLeft]}>
      {!cua_toi && (
        <View style={styles.agent}>
          <Mascot mood="haohung" size={30} />
        </View>
      )}
      <View style={[styles.bubble, cua_toi ? styles.bubbleMe : styles.bubbleAgent]}>
        <Text style={[styles.bubbleText, cua_toi && { color: colors.onBrand }]}>{m.body}</Text>
        <Text style={[styles.bubbleTime, cua_toi && { color: 'rgba(255,255,255,0.7)' }]}>
          {ngayGio(m.createdAt)}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Gửi yêu cầu theo mẫu (giữ nguyên, vào từ nút "Theo mẫu")
 * ------------------------------------------------------------------ */

function SupportForm({ veChat }: { veChat: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
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
  const [moChonVanDe, setMoChonVanDe] = useState(false);
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
  const loiChao = camioAt('supportIntro', 0);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!topic) next.topic = t('Vui lòng chọn vấn đề cần hỗ trợ.', 'Please choose an issue to get help with.');
    if (orderMode === 'list' && topic?.orderRequired && !order) {
      next.order = t('Vui lòng chọn đơn hàng cần hỗ trợ.', 'Please choose the order you need help with.');
    }
    if (orderMode === 'code' && orderCode.trim().length < 3) {
      next.code = t(
        'Vui lòng nhập mã đơn hàng trên sàn (tối thiểu 3 ký tự).',
        'Please enter the marketplace order code (at least 3 characters).',
      );
    }
    if (description.trim().length < 10)
      next.description = t('Mô tả cần tối thiểu 10 ký tự.', 'The description needs at least 10 characters.');
    const email = notifyEmail.trim();
    if (email && !EMAIL_PATTERN.test(email))
      next.email = t('Email nhận phản hồi chưa đúng định dạng.', 'The reply email is not in a valid format.');
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
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <Header nutPhai={{ nhan: t('💬 Chat', '💬 Chat'), onPress: veChat }} />

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Mascot mood="ngacnhien" size={64} />
          <Text style={styles.loadErr}>{camio('error')}</Text>
          <Pressable style={styles.retry} onPress={() => refetch()}>
            <Text style={styles.retryText}>{t('Thử lại', 'Try again')}</Text>
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
              <Text style={styles.introTitle}>{t('Gửi yêu cầu theo mẫu', 'Send a request form')}</Text>
              <Text style={styles.introSub}>{loiChao}</Text>
            </View>
          </View>

          {(data.latestRequest || data.latestReply) && (
            <Pressable onPress={() => setMoPhanHoi(true)} style={styles.replyLink}>
              <Text style={styles.replyBtnText}>{t('Xem phản hồi mới nhất', 'View latest reply')}</Text>
              {data.latestReply ? <View style={styles.replyDot} /> : null}
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          )}

          {/* Vấn đề cần hỗ trợ — combobox mở danh sách, như ô chọn đơn hàng. */}
          <Text style={styles.label}>{t('Vấn đề cần hỗ trợ', 'Issue you need help with')}</Text>
          <Pressable onPress={() => setMoChonVanDe(true)} style={styles.select}>
            <Text style={[styles.selectText, !topic && { color: colors.muted }]}>
              {topic ? topic.label : t('Chọn vấn đề…', 'Choose an issue…')}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
          {errors.topic ? <Text style={styles.fieldErr}>{errors.topic}</Text> : null}

          {/* Đơn hàng liên quan (chọn từ lịch sử) */}
          {orderMode === 'list' && (
            <>
              <Text style={styles.label}>
                {t('Đơn hàng liên quan', 'Related order')}
                {topic?.orderRequired ? '' : t(' (không bắt buộc)', ' (optional)')}
              </Text>
              <Pressable
                onPress={() => coDon && setMoChonDon(true)}
                style={[styles.select, !coDon && { opacity: 0.6 }]}>
                <Text style={[styles.selectText, !order && { color: colors.muted }]} numberOfLines={2}>
                  {order
                    ? order.label
                    : coDon
                      ? t('— Chọn đơn hàng —', '— Choose an order —')
                      : t('Tài khoản của bạn chưa có đơn nào.', 'Your account has no orders yet.')}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.muted} />
              </Pressable>
              {errors.order ? <Text style={styles.fieldErr}>{errors.order}</Text> : null}
            </>
          )}

          {/* Mã đơn trên sàn */}
          {orderMode === 'code' && (
            <>
              <Text style={styles.label}>{t('Mã đơn hàng trên sàn', 'Marketplace order code')}</Text>
              <TextInput
                value={orderCode}
                onChangeText={(v) => {
                  setOrderCode(v);
                  setErrors((e) => ({ ...e, code: undefined }));
                }}
                placeholder={t('Ví dụ: 2508ABCXYZ123', 'e.g. 2508ABCXYZ123')}
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={100}
                style={styles.input}
              />
              <Text style={styles.help}>
                {t(
                  'Xem trong mục đơn mua của Shopee / TikTok Shop / Lazada.',
                  'Find it in your Shopee / TikTok Shop / Lazada purchase orders.',
                )}
              </Text>
              {errors.code ? <Text style={styles.fieldErr}>{errors.code}</Text> : null}
            </>
          )}

          {/* Mô tả */}
          <Text style={styles.label}>{t('Mô tả chi tiết', 'Detailed description')}</Text>
          <TextInput
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              setErrors((e) => ({ ...e, description: undefined }));
            }}
            placeholder={t('Bạn gặp vấn đề gì? (tối thiểu 10 ký tự)', 'What went wrong? (at least 10 characters)')}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            style={[styles.input, styles.textarea]}
          />
          {errors.description ? <Text style={styles.fieldErr}>{errors.description}</Text> : null}

          {/* Email nhận phản hồi */}
          <Text style={styles.label}>{t('Email nhận phản hồi', 'Reply email')}</Text>
          <TextInput
            value={notifyEmail}
            onChangeText={(v) => {
              setEmailTouched(true);
              setNotifyEmail(v);
              setErrors((e) => ({ ...e, email: undefined }));
            }}
            placeholder={t('ban@email.com', 'you@email.com')}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            maxLength={254}
            style={styles.input}
          />
          <Text style={styles.help}>
            {t(
              'Phản hồi của đội hỗ trợ cũng được gửi về email này.',
              'Replies from the support team are also sent to this email.',
            )}
          </Text>
          {errors.email ? <Text style={styles.fieldErr}>{errors.email}</Text> : null}

          {sentAt ? (
            <View style={styles.success}>
              <Mascot mood="thichthu" size={36} />
              <Text style={styles.successText}>
                {t(
                  'Đã gửi! Đội CSKH sẽ xử lý và phản hồi qua email cùng thông báo trên app. Camio canh giúp bạn 👀',
                  'Sent! Our support team will handle it and reply via email and an in-app notification. Camio has your back 👀',
                )}
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
              <Text style={styles.primaryText}>{t('Gửi yêu cầu', 'Send request')}</Text>
            )}
          </Pressable>

          <View style={styles.foot}>
            <Ionicons name="time-outline" size={16} color={colors.muted} />
            <Text style={styles.footText}>
              {t(
                'Đội CSKH thường phản hồi trong vòng 24 giờ. Bạn sẽ nhận thông báo trên app và email khi có phản hồi mới.',
                'The support team usually replies within 24 hours. You will get an in-app and email notification when there is a new reply.',
              )}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Chọn vấn đề cần hỗ trợ */}
      <Modal
        visible={moChonVanDe}
        transparent
        animationType="fade"
        onRequestClose={() => setMoChonVanDe(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoChonVanDe(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('Chọn vấn đề cần hỗ trợ', 'Choose an issue')}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {(data?.topics ?? []).map((t) => (
                <Pressable
                  key={t.value}
                  onPress={() => {
                    setTopic(t);
                    setErrors({});
                    setSentAt(null);
                    if (t.orderMode !== 'list') setOrder(null);
                    if (t.orderMode !== 'code') setOrderCode('');
                    setMoChonVanDe(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    topic?.value === t.value && styles.optionOn,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={styles.optionText}>{t.label}</Text>
                  {topic?.value === t.value && (
                    <Ionicons name="checkmark" size={18} color={colors.brand} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.ghost} onPress={() => setMoChonVanDe(false)}>
              <Text style={styles.ghostText}>{t('Đóng', 'Close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Chọn đơn hàng */}
      <Modal
        visible={moChonDon}
        transparent
        animationType="fade"
        onRequestClose={() => setMoChonDon(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoChonDon(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('Chọn đơn hàng', 'Choose an order')}</Text>
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
              <Text style={styles.ghostText}>{t('Đóng', 'Close')}</Text>
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
            <Text style={styles.sheetTitle}>{t('Phản hồi', 'Reply')}</Text>
            <Text style={styles.sheetSub}>
              {t(
                'Yêu cầu hiện tại và phản hồi mới nhất từ đội CSKH.',
                'Your current request and the latest reply from the support team.',
              )}
            </Text>
            {data ? <PhanHoi data={data} /> : null}
            <Pressable style={styles.ghost} onPress={() => setMoPhanHoi(false)}>
              <Text style={styles.ghostText}>{t('Đóng', 'Close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function PhanHoi({ data }: { data: SupportFormData }) {
  const t = useT();
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      {data.latestRequest ? (
        <View style={[styles.msgRow, styles.msgRight]}>
          <View style={[styles.bubble, styles.bubbleMe]}>
            <Text style={styles.bubbleWho}>{t('Yêu cầu của bạn', 'Your request')}</Text>
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
            <Text style={[styles.bubbleWho, { color: colors.brand }]}>{t('Đội CSKH', 'Support team')}</Text>
            <Text style={styles.bubbleText}>{data.latestReply.body}</Text>
            <Text style={styles.bubbleTime}>{ngayGio(data.latestReply.createdAt)}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.waiting}>
          <Mascot mood="baocao" size={32} />
          <Text style={styles.waitingText}>
            {t(
              'Đội CSKH đang xử lý — phản hồi sẽ hiện ở đây và Camio báo bạn ngay 👀',
              'The support team is working on it — the reply will appear here and Camio will let you know 👀',
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

function Header({
  nutPhai,
}: {
  nutPhai?: { nhan: string; onPress: () => void; dot?: boolean };
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{t('Hỗ trợ', 'Support')}</Text>
      {nutPhai ? (
        <Pressable onPress={nutPhai.onPress} hitSlop={8} style={styles.replyBtn}>
          <Text style={styles.replyBtnText}>{nutPhai.nhan}</Text>
          {nutPhai.dot ? <View style={styles.replyDot} /> : null}
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
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  replyBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.brand },
  replyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  replyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    marginBottom: 4,
  },

  /* ---- Chat ---- */
  list: { padding: spacing.md, gap: 10, flexGrow: 1 },
  intro2: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  ctaChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  ctaChatText: { color: colors.onBrand, fontWeight: '800', fontSize: 13.5 },
  faqWrap: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  faqLabel: {
    paddingHorizontal: spacing.md,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  faqRow: { paddingHorizontal: spacing.md, paddingVertical: 8, gap: 8 },
  faqChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandLine,
    backgroundColor: colors.brandSoft,
  },
  faqChipText: { fontSize: 12, fontWeight: '700', color: colors.brand },
  attachBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  attachChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandLine,
    backgroundColor: colors.brandSoft,
  },
  attachText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.brand },
  attachClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  attachBtn: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
    backgroundColor: colors.surface,
  },
  chatInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.paper,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ---- Form ---- */
  content: { padding: spacing.md, gap: 6 },
  // Lời mở của Camio không thẻ nền — linh vật đứng trực tiếp trên trang.
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 8,
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
  agent: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md },
  bubbleAgent: {
    backgroundColor: colors.surface,
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
