/// <reference types="vitest" />

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/domain/**",
        "src/lib/auth/**",
        "src/lib/format/**",
        "src/lib/validation/**",
        "src/features/**/selectors.*",
        "src/features/**/schemas.*",
        "src/features/**/lifecycle.*",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
