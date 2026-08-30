import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLang } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export type LegalSection = { h: string; p: string };
export type LegalContent = {
  title: string;
  updated?: string;
  intro?: string;
  sections: LegalSection[];
};

/**
 * Khung tài liệu pháp lý SONG NGỮ dùng chung (Quyền riêng tư, Miễn trừ, Xem lại
 * tài khoản…). Có nút chuyển Tiếng Việt / English; mọi cỡ chữ lấy từ
 * `typography` để đồng nhất toàn app. Không tự dịch — nội dung do màn truyền vào.
 */
export function LegalDoc({
  vi,
  en,
  children,
}: {
  vi: LegalContent;
  en: LegalContent;
  /** Nội dung tương tác thêm (vd nút Xóa tài khoản) đặt cuối tài liệu. */
  children?: (lang: 'vi' | 'en') => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { lang, setLang } = useLang();
  const doc = lang === 'vi' ? vi : en;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={styles.backText}>{lang === 'vi' ? 'Quay lại' : 'Back'}</Text>
          </Pressable>

          <View style={styles.langToggle}>
            <LangBtn label="VI" active={lang === 'vi'} onPress={() => setLang('vi')} />
            <LangBtn label="EN" active={lang === 'en'} onPress={() => setLang('en')} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={typography.screenTitle}>{doc.title}</Text>
          {doc.updated ? <Text style={[typography.small, styles.updated]}>{doc.updated}</Text> : null}
          {doc.intro ? <Text style={[typography.body, styles.intro]}>{doc.intro}</Text> : null}

          {doc.sections.map((s, i) => (
            <View key={i} style={styles.section}>
              <Text style={[typography.sectionTitle, styles.sectionH]}>{s.h}</Text>
              <Text style={[typography.body, styles.sectionP]}>{s.p}</Text>
            </View>
          ))}

          {children ? <View style={styles.extra}>{children(lang)}</View> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function LangBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.langBtn, active && styles.langBtnActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <Text style={[styles.langText, active && styles.langTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 },
  backText: { fontSize: 14, fontWeight: '700', color: colors.text },

  langToggle: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  langBtnActive: { backgroundColor: colors.brand },
  langText: { fontSize: 12.5, fontWeight: '800', color: colors.muted },
  langTextActive: { color: colors.onBrand },

  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadowCard(),
  },
  updated: { marginTop: 6 },
  intro: { marginTop: 12 },
  section: { marginTop: 20 },
  sectionH: { marginBottom: 6 },
  sectionP: {},
  extra: { marginTop: 24 },
});

// Bóng mềm nội tuyến (tránh phụ thuộc import vòng) — khớp shadow.card.
function shadowCard() {
  return {
    shadowColor: '#4d3122',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  };
}
