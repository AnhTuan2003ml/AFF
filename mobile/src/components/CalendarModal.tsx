import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Lịch chọn ngày THUẦN React Native (không phụ thuộc module native → cập nhật
 * được qua OTA). Hiện lưới tháng, bấm một ngày để chọn. Dùng cho bộ lọc khoảng
 * ngày của biểu đồ thu nhập.
 */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(s?: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function CalendarModal({
  visible,
  value,
  minDate,
  maxDate,
  title,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** Giá trị hiện tại dạng YYYY-MM-DD. */
  value?: string | null;
  minDate?: string;
  maxDate?: string;
  title?: string;
  onSelect: (ymdValue: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const selected = parseYmd(value);
  const min = parseYmd(minDate);
  const max = parseYmd(maxDate);
  // Tháng đang xem — khởi tạo theo ngày đã chọn (hoặc hôm nay).
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const monthLabel = t(
    `Tháng ${month + 1} ${year}`,
    `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]} ${year}`,
  );
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Thứ Hai = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const dow = t('T2 T3 T4 T5 T6 T7 CN', 'Mo Tu We Th Fr Sa Su').split(' ');

  const disabled = (d: Date): boolean =>
    (min != null && d.getTime() < min.getTime()) ||
    (max != null && d.getTime() > max.getTime());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>{title ?? t('Chọn ngày', 'Pick a date')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.monthRow}>
            <Pressable onPress={() => setView(new Date(year, month - 1, 1))} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable onPress={() => setView(new Date(year, month + 1, 1))} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {dow.map((d) => (
              <View key={d} style={styles.cell}>
                <Text style={styles.dowText}>{d}</Text>
              </View>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={styles.cell} />;
              const isSel = selected != null && ymd(d) === ymd(selected);
              const off = disabled(d);
              return (
                <Pressable
                  key={ymd(d)}
                  disabled={off}
                  onPress={() => {
                    onSelect(ymd(d));
                    onClose();
                  }}
                  style={styles.cell}>
                  <View style={[styles.day, isSel && styles.daySel]}>
                    <Text style={[styles.dayText, isSel && styles.dayTextSel, off && styles.dayTextOff]}>
                      {d.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '900', color: colors.text },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dowText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: colors.brand },
  dayText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  dayTextSel: { color: colors.onBrand, fontWeight: '900' },
  dayTextOff: { color: colors.line },
});
