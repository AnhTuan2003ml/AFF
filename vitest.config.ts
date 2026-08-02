import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    testTimeout: 10000,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
