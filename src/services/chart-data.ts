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
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}tr`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return `${Math.round(value)}`;
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
