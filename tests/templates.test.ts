import { readdir } from "node:fs/promises";
import path from "node:path";
import nunjucks from "nunjucks";
import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatVnd,
} from "../src/lib/format.js";

async function allTemplates(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? allTemplates(full) : [full];
    }),
  );
  return nested.flat().filter((file) => file.endsWith(".njk"));
}

describe("Nunjucks templates", () => {
  it("biên dịch được toàn bộ giao diện", async () => {
    const root = path.join(process.cwd(), "views");
    const environment = nunjucks.configure(root, {
      autoescape: true,
      noCache: true,
    });
    environment.addFilter("vnd", formatVnd);
    environment.addFilter("datetime", formatDateTime);
    environment.addFilter("date", formatDate);

    const files = await allTemplates(root);
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const relative = path.relative(root, file);
      expect(() => environment.getTemplate(relative, true)).not.toThrow();
    }
  });
});
