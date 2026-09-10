import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path, Text as SvgText } from 'react-native-svg';

import { layThuNhap, type IncomeUnit } from '@/api/features';
import { useT } from '@/i18n';
import { vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';
import { CalendarModal } from '@/components/CalendarModal';

function gonTien(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) {
    const n = v / 1_000_000;
    return `${Number.isInteger(n) ? n : n.toFixed(1)}tr`;
  }
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`;
  return `${Math.round(v)}`;
}

function nhamTronTruc(v: number): number {
  if (v <= 0) return 1_000_000;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

/** YYYY-MM-DD → dd/mm/yyyy để hiển thị. */
function hienNgay(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mặc định: 1 tháng gần nhất tính đến NGÀY HÔM TRƯỚC. */
function macDinh(): { from: string; to: string; max: string } {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const from = new Date(yesterday);
  from.setMonth(from.getMonth() - 1);
  return { from: ymd(from), to: ymd(yesterday), max: ymd(yesterday) };
}

/**
 * Biểu đồ ĐƯỜNG thu nhập giới thiệu với bộ lọc khoảng ngày (lịch popup) và đơn
 * vị (ngày/tuần/tháng). Song hành với web /app/referrals.
 */
export function IncomeChartCard() {
  const t = useT();
  const init = useMemo(macDinh, []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [unit, setUnit] = useState<IncomeUnit>('day');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [w, setW] = useState(0);

  const { data, isPending } = useQuery({
    queryKey: ['income', from, to, unit],
    queryFn: () => layThuNhap({ from, to, unit }),
  });

  const points = data?.points ?? [];
  const H = 176;
  const PADL = 42;
  const PADR = 10;
  const PADT = 12;
  const PADB = 26;
  const plotW = Math.max(1, w - PADL - PADR);
  const plotH = H - PADT - PADB;
  const maxV = nhamTronTruc(Math.max(0, ...points.map((p) => p.value)));
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const pts = points.map((p, i) => ({
    ...p,
    x: PADL + stepX * i,
    y: PADT + plotH - (p.value / maxV) * plotH,
  }));
  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const last = pts.at(-1);
  const first = pts[0];
  const areaPath =
    first && last
      ? `${linePath} L${last.x.toFixed(1)},${(PADT + plotH).toFixed(1)} L${first.x.toFixed(1)},${(PADT + plotH).toFixed(1)} Z`
      : '';
  const hasData = points.some((p) => p.value > 0);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const UNITS: { key: IncomeUnit; nhan: string }[] = [
    { key: 'day', nhan: t('Ngày', 'Day') },
    { key: 'week', nhan: t('Tuần', 'Week') },
    { key: 'month', nhan: t('Tháng', 'Month') },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Doanh thu theo thời gian', 'Revenue over time')}</Text>

      {/* Khoảng ngày — bấm mở lịch popup. */}
      <View style={styles.dateRow}>
        <Pressable style={styles.dateField} onPress={() => setPicker('from')}>
          <Text style={styles.dateLabel}>{t('Từ ngày', 'From')}</Text>
          <View style={styles.dateValue}>
            <Ionicons name="calendar-outline" size={15} color={colors.brand} />
            <Text style={styles.dateText}>{hienNgay(from)}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.dateField} onPress={() => setPicker('to')}>
          <Text style={styles.dateLabel}>{t('Đến ngày', 'To')}</Text>
          <View style={styles.dateValue}>
            <Ionicons name="calendar-outline" size={15} color={colors.brand} />
            <Text style={styles.dateText}>{hienNgay(to)}</Text>
          </View>
        </Pressable>
      </View>

      {/* Đơn vị */}
      <View style={styles.unitRow}>
        {UNITS.map((u) => (
          <Pressable
            key={u.key}
            onPress={() => setUnit(u.key)}
            style={[styles.unitBtn, unit === u.key && styles.unitBtnActive]}>
            <Text style={[styles.unitText, unit === u.key && styles.unitTextActive]}>{u.nhan}</Text>
          </Pressable>
        ))}
      </View>

      {/* Doanh thu 3 nguồn + tổng */}
      {data?.breakdown ? (
        <View style={styles.breakdown}>
          <View style={styles.srcBox}>
            <Text style={styles.srcLabel}>{t('Đơn của bạn', 'Your orders')}</Text>
            <Text style={styles.srcValue}>{vnd(data.breakdown.ownVnd)}</Text>
          </View>
          <View style={styles.srcBox}>
            <Text style={styles.srcLabel}>{t('Người giới thiệu', 'Referred')}</Text>
            <Text style={styles.srcValue}>{vnd(data.breakdown.referralVnd)}</Text>
          </View>
          <View style={styles.srcBox}>
            <Text style={styles.srcLabel}>{t('Link chia sẻ', 'Shared links')}</Text>
            <Text style={styles.srcValue}>{vnd(data.breakdown.shareLinkVnd)}</Text>
          </View>
          <View style={[styles.srcBox, styles.srcTotal]}>
            <Text style={styles.srcLabel}>{t('Tổng', 'Total')}</Text>
            <Text style={[styles.srcValue, styles.srcTotalValue]}>{vnd(data.breakdown.totalVnd)}</Text>
          </View>
        </View>
      ) : null}

      {/* Biểu đồ đường */}
      <View style={styles.chart} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {isPending ? (
          <Text style={styles.chartEmpty}>{t('Đang tải…', 'Loading…')}</Text>
        ) : w > 0 ? (
          <>
            <Svg width={w} height={H}>
              {[0, 0.5, 1].map((f, i) => {
                const y = PADT + plotH * f;
                return (
                  <SvgLine key={i} x1={PADL} y1={y} x2={w - PADR} y2={y} stroke={colors.line} strokeWidth={1} strokeDasharray="3 3" />
                );
              })}
              {[maxV, maxV / 2, 0].map((v, i) => (
                <SvgText key={i} x={PADL - 6} y={PADT + plotH * (i * 0.5) + 4} fontSize={9} fill={colors.muted} textAnchor="end">
                  {gonTien(v)}
                </SvgText>
              ))}
              {hasData ? (
                <>
                  <Path d={areaPath} fill={colors.brandSoft} />
                  <Path d={linePath} fill="none" stroke={colors.brand} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => (
                    <Circle key={i} cx={p.x} cy={p.y} r={2.6} fill={colors.brand} />
                  ))}
                </>
              ) : null}
              {pts.map((p, i) =>
                i % labelEvery === 0 || i === pts.length - 1 ? (
                  <SvgText key={`x${i}`} x={p.x} y={H - 6} fontSize={9} fill={colors.muted} textAnchor="middle">
                    {p.label}
                  </SvgText>
                ) : null,
              )}
            </Svg>
            {!hasData ? (
              <Text style={styles.chartEmpty}>{t('Chưa có thu nhập trong khoảng đã chọn.', 'No earnings in the selected range.')}</Text>
            ) : null}
          </>
        ) : null}
      </View>

      <CalendarModal
        visible={picker !== null}
        value={picker === 'from' ? from : to}
        maxDate={init.max}
        title={picker === 'from' ? t('Chọn ngày bắt đầu', 'Pick start date') : t('Chọn ngày kết thúc', 'Pick end date')}
        onSelect={(v) => (picker === 'from' ? setFrom(v) : setTo(v))}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  title: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 12 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateLabel: { fontSize: 10.5, fontWeight: '800', color: colors.muted, marginBottom: 3 },
  dateValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  unitRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  unitBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  unitBtnActive: { backgroundColor: colors.brand },
  unitText: { fontSize: 12.5, fontWeight: '800', color: colors.muted },
  unitTextActive: { color: colors.onBrand },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  srcBox: {
    flexGrow: 1,
    flexBasis: '47%',
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  srcLabel: { fontSize: 10.5, fontWeight: '700', color: colors.muted },
  srcValue: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 3 },
  srcTotal: { backgroundColor: colors.brandSoft, borderColor: colors.brandLine },
  srcTotalValue: { color: colors.brand },
  chart: { marginTop: 14, minHeight: 176, justifyContent: 'center' },
  chartEmpty: { fontSize: 12.5, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
});
