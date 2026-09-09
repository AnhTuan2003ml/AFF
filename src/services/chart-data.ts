import { formatVnd } from "../lib/format.js";

const TREND_WIDTH = 700;
const TREND_HEIGHT = 180;
const TREND_PAD_LEFT = 46;
const TREND_PAD_RIGHT = 12;
const TREND_PAD_TOP = 16;
const TREND_PAD_BOTTOM = 26;
const TREND_DAYS = 14;
const TREND_GRID_STEPS = 4;

export interface TrendGridLine {
  y: number;
  label: string;
  /** true = đường mức 0 (trùng trục hoành) → vẽ nét LIỀN thay vì đứt. */
  isZero?: boolean;
}

export interface TrendDot {
  x: number;
  y: number;
  dateLabel: string;
  valueLabel: string;
}

export interface TrendAxisLabel {
  x: number;
  label: string;
}

export interface TrendChartData {
  viewBoxWidth: number;
  viewBoxHeight: number;
  baselineY: number;
  linePath: string;
  areaPath: string;
  gridLines: TrendGridLine[];
  dots: TrendDot[];
  axisLabels: TrendAxisLabel[];
  hasData: boolean;
}

export interface TrendChartRow {
  day: Date | string;
  value: string | number;
}

export interface TrendChartOptions {
  referenceDate?: Date;
  formatValue?: (value: number) => string;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatCompactValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const n = value / 1_000_000;
    return `${Number.isInteger(n) ? n : n.toFixed(1)}tr`;
  }
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}`;
}

/** Làm tròn LÊN số "đẹp" (1/2/5 × 10^k) để nhãn trục ra chẵn: 500k, 1tr… */
function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

export function buildTrendChart(
  rows: TrendChartRow[],
  options: TrendChartOptions = {},
): TrendChartData {
  const referenceDate = options.referenceDate ?? new Date();
  const valueFormatter = options.formatValue ?? formatVnd;
  const byDate = new Map<string, number>();

  for (const row of rows) {
    const date = row.day instanceof Date ? row.day : new Date(row.day);
    const value = Number(row.value);
    if (Number.isNaN(date.getTime()) || !Number.isFinite(value)) continue;
    byDate.set(toDateKey(date), value);
  }

  const days: { date: Date; value: number }[] = [];
  for (let index = TREND_DAYS - 1; index >= 0; index -= 1) {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() - index);
    days.push({ date, value: byDate.get(toDateKey(date)) ?? 0 });
  }

  const maxValue = Math.max(1, ...days.map((day) => day.value));
  const plotWidth = TREND_WIDTH - TREND_PAD_LEFT - TREND_PAD_RIGHT;
  const plotHeight = TREND_HEIGHT - TREND_PAD_TOP - TREND_PAD_BOTTOM;
  const stepX = days.length > 1 ? plotWidth / (days.length - 1) : 0;
  const baselineY = TREND_PAD_TOP + plotHeight;

  const points = days.map((day, index) => ({
    x: TREND_PAD_LEFT + stepX * index,
    y: baselineY - (day.value / maxValue) * plotHeight,
    day,
  }));

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");

  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const areaPath =
    firstPoint && lastPoint
      ? `${linePath} L${lastPoint.x.toFixed(1)},${baselineY.toFixed(1)} ` +
        `L${firstPoint.x.toFixed(1)},${baselineY.toFixed(1)} Z`
      : "";

  const gridLines: TrendGridLine[] = Array.from(
    { length: TREND_GRID_STEPS + 1 },
    (_, step) => {
      const y = TREND_PAD_TOP + (plotHeight / TREND_GRID_STEPS) * step;
      const value = maxValue * (1 - step / TREND_GRID_STEPS);
      return { y, label: formatCompactValue(value) };
    },
  );

  const dots: TrendDot[] = points.map((point) => ({
    x: point.x,
    y: point.y,
    dateLabel: formatDayLabel(point.day.date),
    valueLabel: valueFormatter(point.day.value),
  }));

  const axisLabels: TrendAxisLabel[] = points
    .filter((_, index) => index % 2 === 0 || index === points.length - 1)
    .map((point) => ({
      x: point.x,
      label: formatDayLabel(point.day.date),
    }));

  return {
    viewBoxWidth: TREND_WIDTH,
    viewBoxHeight: TREND_HEIGHT,
    baselineY,
    linePath,
    areaPath,
    gridLines,
    dots,
    axisLabels,
    hasData: days.some((day) => day.value > 0),
  };
}

export interface SeriesPoint {
  label: string;
  value: number;
  /** Chuỗi hiển thị trong tooltip; mặc định dùng label + value. */
  tooltip?: string;
}

/**
 * Biểu đồ đường tổng quát cho chuỗi mốc bất kỳ (tháng, tuần…) — cùng hình
 * dạng dữ liệu với buildTrendChart nên dùng chung template SVG.
 */
export function buildSeriesLineChart(
  points: SeriesPoint[],
  formatValue: (value: number) => string = (value) => `${value}`,
): TrendChartData {
  const plotWidth = TREND_WIDTH - TREND_PAD_LEFT - TREND_PAD_RIGHT;
  const plotHeight = TREND_HEIGHT - TREND_PAD_TOP - TREND_PAD_BOTTOM;
  const baselineY = TREND_PAD_TOP + plotHeight;
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const positioned = points.map((point, index) => ({
    ...point,
    x: TREND_PAD_LEFT + stepX * index,
    y: baselineY - (point.value / maxValue) * plotHeight,
  }));

  const linePath = positioned
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
  const first = positioned[0];
  const last = positioned.at(-1);
  const areaPath =
    first && last
      ? `${linePath} L${last.x.toFixed(1)},${baselineY.toFixed(1)} ` +
        `L${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`
      : "";

  const gridLines: TrendGridLine[] = Array.from(
    { length: TREND_GRID_STEPS + 1 },
    (_, step) => ({
      y: TREND_PAD_TOP + (plotHeight / TREND_GRID_STEPS) * step,
      label: formatCompactValue(maxValue * (1 - step / TREND_GRID_STEPS)),
    }),
  );

  const labelEvery = Math.max(1, Math.ceil(positioned.length / 8));
  return {
    viewBoxWidth: TREND_WIDTH,
    viewBoxHeight: TREND_HEIGHT,
    baselineY,
    linePath,
    areaPath,
    gridLines,
    dots: positioned.map((point) => ({
      x: point.x,
      y: point.y,
      dateLabel: point.label,
      valueLabel: point.tooltip ?? formatValue(point.value),
    })),
    axisLabels: positioned
      .filter((_, index) => {
        if (index % labelEvery === 0) return true;
        // Mốc cuối chỉ thêm khi đủ xa mốc có nhãn gần nhất để không chồng chữ.
        return (
          index === positioned.length - 1 && index % labelEvery > labelEvery / 2
        );
      })
      .map((point) => ({ x: point.x, label: point.label })),
    hasData: positioned.some((point) => point.value > 0),
  };
}

/**
 * Gom các dòng {ym: 'YYYY-MM', value} thành chuỗi liên tục N tháng gần nhất
 * (điền 0 cho tháng thiếu), nhãn dạng "Th9". Dùng cho biểu đồ cột theo tháng.
 */
export function buildMonthlySeries(
  rows: { ym: string; value: number }[],
  monthsBack = 8,
  referenceDate: Date = new Date(),
): SeriesPoint[] {
  const map = new Map(rows.map((row) => [row.ym, row.value]));
  const out: SeriesPoint[] = [];
  for (let index = monthsBack - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth() - index,
        1,
      ),
    );
    const month = date.getUTCMonth() + 1;
    const ym = `${date.getUTCFullYear()}-${String(month).padStart(2, "0")}`;
    out.push({ label: `Th${month}`, value: map.get(ym) ?? 0 });
  }
  return out;
}

export interface BarChartBar {
  x: number;
  y: number;
  width: number;
  height: number;
  negative: boolean;
  label: string;
  valueLabel: string;
}

export interface BarChartAxis {
  /** x của trục tung (đường Y trái, nét liền). */
  x: number;
  /** đỉnh trục tung (nơi đặt mũi tên hướng lên). */
  top: number;
  /** đáy trục tung = đường mức 0 = trục hoành. */
  bottom: number;
  /** mút phải trục hoành (nơi đặt mũi tên hướng phải). */
  right: number;
}

export interface BarChartData {
  viewBoxWidth: number;
  viewBoxHeight: number;
  baselineY: number;
  gridLines: TrendGridLine[];
  bars: BarChartBar[];
  axisLabels: TrendAxisLabel[];
  axis: BarChartAxis;
  hasData: boolean;
}

function formatCompactSigned(value: number): string {
  return value < 0
    ? `-${formatCompactValue(-value)}`
    : formatCompactValue(value);
}

/**
 * Biểu đồ CỘT dọc theo mốc (tháng): trục dọc là tiền, trục ngang là mốc.
 * Cột dương màu thương hiệu, cột âm (đảo khoản) màu đỏ — dùng cho thống kê
 * hoa hồng/giới thiệu theo tháng.
 */
export function buildMonthlyBarChart(
  points: SeriesPoint[],
  formatValue: (value: number) => string = (value) => `${value}`,
): BarChartData {
  // Khung riêng cho biểu đồ CỘT — tỉ lệ cao hơn biểu đồ đường (khoảng 1.7:1)
  // để trên MOBILE cột không bị dẹt, nhãn không chồng. Desktop giới hạn chiều
  // cao bằng CSS.
  const W = 520;
  const H = 300;
  const PAD_L = 58;
  const PAD_R = 20;
  const PAD_T = 22;
  const PAD_B = 42;
  const STEPS = TREND_GRID_STEPS;
  const plotWidth = W - PAD_L - PAD_R;
  const plotHeight = H - PAD_T - PAD_B;
  const values = points.map((point) => point.value);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  // Trục dương: làm tròn lên số đẹp. Không có dữ liệu dương và không âm → mặc
  // định 1tr để trục ra 0…1tr thay vì nhảy về âm.
  const top =
    rawMax > 0 ? niceCeil(rawMax) : rawMin < 0 ? 0 : 1_000_000;
  const bottom = rawMin < 0 ? -niceCeil(-rawMin) : 0;
  const range = Math.max(1, top - bottom);
  const maxPos = top;
  const baselineY = PAD_T + (top / range) * plotHeight;
  const slot = points.length > 0 ? plotWidth / points.length : plotWidth;
  const barWidth = Math.max(6, slot * 0.6);

  const bars: BarChartBar[] = points.map((point, index) => {
    const centerX = PAD_L + slot * (index + 0.5);
    const rawHeight = (Math.abs(point.value) / range) * plotHeight;
    const negative = point.value < 0;
    const height = point.value === 0 ? 0 : Math.max(rawHeight, 2);
    return {
      x: centerX - barWidth / 2,
      y: negative ? baselineY : baselineY - height,
      width: barWidth,
      height,
      negative,
      label: point.label,
      valueLabel: point.tooltip ?? formatValue(point.value),
    };
  });

  const gridLines: TrendGridLine[] = Array.from(
    { length: STEPS + 1 },
    (_, step) => {
      const value = maxPos - (range / STEPS) * step;
      return {
        y: PAD_T + (plotHeight / STEPS) * step,
        label: formatCompactSigned(value),
        isZero: Math.abs(value) < 0.5,
      };
    },
  );

  return {
    viewBoxWidth: W,
    viewBoxHeight: H,
    baselineY,
    gridLines,
    bars,
    axisLabels: bars.map((bar) => ({
      x: bar.x + bar.width / 2,
      label: bar.label,
    })),
    axis: {
      x: PAD_L,
      top: PAD_T - 4,
      bottom: baselineY,
      right: W - 8,
    },
    hasData: values.some((value) => value !== 0),
  };
}

/**
 * CSP không cho phép style nội tuyến, vì vậy độ rộng biểu đồ dùng các class
 * `.w-5` đến `.w-100` có sẵn trong stylesheet của dashboard.
 */
function widthBucketClass(percent: number, minPercent = 5): string {
  const bucket = Math.min(
    100,
    Math.max(minPercent, Math.round(percent / 5) * 5),
  );
  return `w-${bucket}`;
}

export interface StatusBarInput {
  key: string;
  label: string;
  value: string | number;
  [property: string]: unknown;
}

export type StatusBarSegment<T extends StatusBarInput = StatusBarInput> = T & {
  value: number;
  valueLabel: string;
  percent: number;
  widthClass: string;
};

export function buildStatusBar<T extends StatusBarInput>(
  rows: readonly T[],
  formatValue: (value: number) => string = (value) => `${value}`,
): StatusBarSegment<T>[] {
  const positiveRows = rows
    .map((row) => ({ row, numericValue: Number(row.value) }))
    .filter(
      (item) =>
        Number.isFinite(item.numericValue) && item.numericValue > 0,
    );
  const total = positiveRows.reduce(
    (sum, item) => sum + item.numericValue,
    0,
  );
  if (total <= 0) return [];

  return positiveRows.map(({ row, numericValue }) => {
    const percent = (numericValue / total) * 100;
    return {
      ...row,
      value: numericValue,
      valueLabel: formatValue(numericValue),
      percent,
      widthClass: widthBucketClass(percent),
    };
  });
}

export interface StackedBarSegment {
  key: "buyer" | "sharer" | "platform";
  label: string;
  vnd: number;
  vndLabel: string;
  percent: number;
  widthClass: string;
}

export function buildCommissionStackedBar(
  buyerVnd: number,
  sharerVnd: number,
  platformVnd: number,
): StackedBarSegment[] {
  const total = buyerVnd + sharerVnd + platformVnd;
  if (total <= 0) return [];

  const raw: Omit<StackedBarSegment, "percent" | "widthClass">[] = [
    {
      key: "buyer",
      label: "Hoàn tiền người mua",
      vnd: buyerVnd,
      vndLabel: formatVnd(buyerVnd),
    },
    {
      key: "sharer",
      label: "Thưởng chủ link",
      vnd: sharerVnd,
      vndLabel: formatVnd(sharerVnd),
    },
    {
      key: "platform",
      label: "Doanh thu nền tảng",
      vnd: platformVnd,
      vndLabel: formatVnd(platformVnd),
    },
  ];

  return raw
    .filter((segment) => segment.vnd > 0)
    .map((segment) => {
      const percent = (segment.vnd / total) * 100;
      return {
        ...segment,
        percent,
        widthClass: widthBucketClass(percent),
      };
    });
}

export interface BarListItem {
  label: string;
  value: number;
  valueLabel: string;
  percent: number;
  widthClass: string;
}

export function buildBarList(
  rows: { label: string; value: number }[],
  formatValue: (value: number) => string = (value) => `${value}`,
  limit = 8,
): BarListItem[] {
  const items = rows.slice(0, limit);
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  return items.map((item) => {
    const percent = (item.value / maxValue) * 100;
    return {
      label: item.label,
      value: item.value,
      valueLabel: formatValue(item.value),
      percent,
      widthClass: widthBucketClass(percent),
    };
  });
}
