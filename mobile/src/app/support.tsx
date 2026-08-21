import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guiHoTro, layHoTro, type SupportMessage } from '@/api/account';
import { CanDangNhap } from '@/components/CanDangNhap';
import { Mascot } from '@/components/Mascot';
import { useSession } from '@/hooks/useSession';
import { ngayGio } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Hỗ trợ — chat với đội CSKH, đồng bộ đúng thread Slack/DB như web
 * (/api/v1/support). Tin của mình bên phải, CSKH bên trái có avatar linh vật.
 */
export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const qc = useQueryClient();
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const [noiDung, setNoiDung] = useState('');

  const { data, isPending } = useQuery({
    queryKey: ['support'],
    queryFn: layHoTro,
    enabled: !!user,
    refetchInterval: 15000,
  });

  const gui = useMutation({
    mutationFn: guiHoTro,
    onSuccess: async () => {
      setNoiDung('');
      await qc.invalidateQueries({ queryKey: ['support'] });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    },
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <Header />
        <CanDangNhap mo_ta="Đăng nhập để nhắn với đội hỗ trợ và xem lại trao đổi." />
      </View>
    );
  }

  const tin = data ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <Header />
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
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.intro}>
              <Mascot mood="haohung" size={72} />
              <Text style={styles.introTitle}>Đội CSKH ShopTik</Text>
              <Text style={styles.introSub}>
                Nhắn câu hỏi của bạn — đội hỗ trợ sẽ trả lời ngay tại đây.
              </Text>
            </View>
          }
          renderItem={({ item }) => <TinNhan m={item} />}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          value={noiDung}
          onChangeText={setNoiDung}
          placeholder="Nhập nội dung cần hỗ trợ…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable
          onPress={() => noiDung.trim() && gui.mutate(noiDung.trim())}
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
    </KeyboardAvoidingView>
  );
}

function Header() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Hỗ trợ</Text>
      <View style={{ width: 22 }} />
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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

  list: { padding: spacing.md, gap: 10 },
  intro: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  introTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginTop: 4 },
  introSub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

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
    overflow: 'hidden',
  },
  bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  bubbleAgent: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
  bubbleTime: { fontSize: 10, color: colors.muted, marginTop: 3, alignSelf: 'flex-end' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
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
});
