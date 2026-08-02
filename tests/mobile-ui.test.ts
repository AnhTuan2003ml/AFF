import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

describe("mobile UI contracts", () => {
  it("giữ thanh điều hướng di động đúng bốn mục và chừa vùng an toàn", async () => {
    const css = await source("public/theme/responsive.css");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(css).toContain("calc(102px + env(safe-area-inset-bottom))");
    expect(css).toContain("bottom: calc(92px + env(safe-area-inset-bottom))");
  });

  it("không phụ thuộc inline style cho tiến độ nhiệm vụ dưới CSP", async () => {
    const script = await source("public/ux-integrity.js");
    const css = await source("public/theme/pages.css");
    expect(script).not.toContain("fill.style.width");
    expect(script).toContain("fill.removeAttribute(\"style\")");
    expect(script).toContain("mission-width-${widthStep}");
    expect(css).toContain(".mission-progress-bar .mission-width-0 { width: 0; }");
    expect(css).toContain(
      ".mission-progress-bar .mission-width-100 { width: 100%; }",
    );
  });

  it("giữ vùng chạm mobile tối thiểu 44px cho điều hướng và bộ lọc", async () => {
    const responsive = await source("public/theme/responsive.css");
    const discover = await source("public/discover.css");
    expect(responsive).toContain("min-height: 48px");
    expect(discover).toContain("min-height: 44px");
  });
});
