import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLang } from '@/i18n';
import { colors, radius } from '@/theme/tokens';

/** Nút chuyển ngôn ngữ toàn cục VI/EN — dùng ở tab Tài khoản và mọi nơi cần. */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <View style={styles.icon}>
          <Ionicons name="language-outline" size={18} color={colors.brand} />
        </View>
        <Text style={styles.label}>{lang === 'vi' ? 'Ngôn ngữ' : 'Language'}</Text>
      </View>
      <View style={styles.toggle}>
        <Btn label="Tiếng Việt" active={lang === 'vi'} onPress={() => setLang('vi')} />
        <Btn label="English" active={lang === 'en'} onPress={() => setLang('en')} />
      </View>
    </View>
  );
}

function Btn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, active && styles.btnActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <Text style={[styles.btnText, active && styles.btnTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  toggle: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  btnActive: { backgroundColor: colors.brand },
  btnText: { fontSize: 12, fontWeight: '800', color: colors.muted },
  btnTextActive: { color: colors.onBrand },
});
