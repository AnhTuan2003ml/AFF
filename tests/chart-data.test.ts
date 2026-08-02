import { describe, expect, it } from "vitest";
import {
  buildBarList,
  buildCommissionStackedBar,
  buildStatusBar,
  buildTrendChart,
} from "../src/services/chart-data.js";

describe("buildTrendChart", () => {
  it("điền đủ 14 ngày liên tục kể cả ngày không có đơn nào", () => {
    const reference = new Date("2026-07-26T00:00:00Z");
    const chart = buildTrendChart(
      [{ day: new Date("2026-07-26T00:00:00Z"), value: "50000" }],
      { referenceDate: reference },
    );
    expect(chart.dots).toHaveLength(14);
    expect(chart.hasData).toBe(true);
    expect(chart.dots.at(13)?.valueLabel).toContain("50.000");
  });

  it("không có dữ liệu nào trong 14 ngày => hasData=false, không lỗi chia cho 0", () => {
    const chart = buildTrendChart([], { referenceDate: new Date("2026-07-26T00:00:00Z") });
    expect(chart.hasData).toBe(false);
    expect(chart.dots).toHaveLength(14);
    expect(chart.linePath).toContain("M");
  });

  it("khớp bản ghi theo ngày bất kể thứ tự đầu vào", () => {
    const reference = new Date("2026-07-26T00:00:00Z");
    const chart = buildTrendChart(
      [
        { day: new Date("2026-07-20T00:00:00Z"), value: "10000" },
        { day: new Date("2026-07-26T00:00:00Z"), value: "90000" },
      ],
      { referenceDate: reference },
    );
    const maxDot = chart.dots.reduce((a, b) => (a.valueLabel > b.valueLabel ? a : b));
    expect(maxDot.valueLabel).toContain("90.000");
  });

  it("dùng formatValue tùy chỉnh cho biểu đồ không phải tiền tệ (ví dụ số người dùng)", () => {
    const reference = new Date("2026-07-26T00:00:00Z");
    const chart = buildTrendChart(
      [{ day: new Date("2026-07-26T00:00:00Z"), value: 3 }],
      { referenceDate: reference, formatValue: (v) => `${v} người dùng mới` },
    );
    expect(chart.dots.at(13)?.valueLabel).toBe("3 người dùng mới");
  });
});

describe("buildStatusBar", () => {
  it("tính % theo tổng và gán widthClass hợp lệ", () => {
    const segments = buildStatusBar([
      { key: "active", label: "Đang hoạt động", value: 80, colorClass: "seg-active" },
      { key: "pending", label: "Chờ xác minh", value: 15, colorClass: "seg-pending" },
      { key: "locked", label: "Đã khóa", value: 5, colorClass: "seg-locked" },
    ]);
    const totalPercent = segments.reduce((sum, s) => sum + s.percent, 0);
    expect(totalPercent).toBeCloseTo(100, 5);
    expect(segments.map((s) => s.key)).toEqual(["active", "pending", "locked"]);
  });

  it("bỏ qua phần có giá trị 0", () => {
    const segments = buildStatusBar([
      { key: "active", label: "Đang hoạt động", value: 100, colorClass: "seg-active" },
      { key: "locked", label: "Đã khóa", value: 0, colorClass: "seg-locked" },
    ]);
    expect(segments.map((s) => s.key)).toEqual(["active"]);
  });

  it("tổng bằng 0 => trả về mảng rỗng, không chia cho 0", () => {
    expect(
      buildStatusBar([{ key: "active", label: "Đang hoạt động", value: 0, colorClass: "seg-active" }]),
    ).toEqual([]);
  });
});

describe("buildCommissionStackedBar", () => {
  it("tổng % 3 phần luôn bằng 100 khi có đủ buyer/sharer/platform", () => {
    const segments = buildCommissionStackedBar(80_000, 4_000, 16_000);
    const totalPercent = segments.reduce((sum, s) => sum + s.percent, 0);
    expect(totalPercent).toBeCloseTo(100, 5);
    expect(segments.map((s) => s.key)).toEqual(["buyer", "sharer", "platform"]);
  });

  it("bỏ qua phần có giá trị 0 (ví dụ mua trực tiếp không có sharer)", () => {
    const segments = buildCommissionStackedBar(80_000, 0, 20_000);
    expect(segments.map((s) => s.key)).toEqual(["buyer", "platform"]);
  });

  it("tổng bằng 0 => trả về mảng rỗng, không chia cho 0", () => {
    expect(buildCommissionStackedBar(0, 0, 0)).toEqual([]);
  });

  it("sinh widthClass dạng w-N (CSP chặn style nội tuyến, phải dùng class)", () => {
    const segments = buildCommissionStackedBar(80_000, 4_000, 16_000);
    for (const segment of segments) {
      expect(segment.widthClass).toMatch(/^w-(5|10|15|20|25|30|35|40|45|50|55|60|65|70|75|80|85|90|95|100)$/);
    }
    const sharer = segments.find((s) => s.key === "sharer");
    expect(sharer?.widthClass).toBe("w-5");
  });
});

describe("buildBarList", () => {
  it("tính % chiều dài thanh tương đối theo giá trị lớn nhất", () => {
    const items = buildBarList([
      { label: "A", value: 100 },
      { label: "B", value: 50 },
      { label: "C", value: 0 },
    ]);
    expect(items.at(0)?.percent).toBe(100);
    expect(items.at(1)?.percent).toBe(50);
    expect(items.at(2)?.percent).toBe(0);
    expect(items.at(0)?.widthClass).toBe("w-100");
    expect(items.at(1)?.widthClass).toBe("w-50");
    expect(items.at(2)?.widthClass).toBe("w-5");
  });

  it("widthClass luôn thuộc tập class .w-5 .. .w-100 định nghĩa trong styles.css", () => {
    const items = buildBarList([
      { label: "A", value: 100 },
      { label: "B", value: 1 },
    ]);
    for (const item of items) {
      expect(item.widthClass).toMatch(/^w-(5|10|15|20|25|30|35|40|45|50|55|60|65|70|75|80|85|90|95|100)$/);
    }
  });

  it("giới hạn số dòng theo limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ label: `#${i}`, value: i }));
    expect(buildBarList(rows, undefined, 8)).toHaveLength(8);
  });

  it("danh sách rỗng không lỗi chia cho 0", () => {
    expect(buildBarList([])).toEqual([]);
  });
});
