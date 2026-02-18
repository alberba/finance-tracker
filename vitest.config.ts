import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      enabled: true,
      include: ["src/lib/**/*.ts"],
      exclude: ["**/*.d.ts", "tests/**"],
      reporter: ["text", "html"],
      all: true,
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
});
