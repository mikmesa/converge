import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests run against a real Supabase stack (local by default):
// RLS, RPC authorization, atomic transitions and race conditions.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React Server environment; the server
      // modules are exercised directly here.
      "server-only": path.resolve(import.meta.dirname, "tests/integration/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    setupFiles: ["tests/integration/setup.ts"],
  },
});
