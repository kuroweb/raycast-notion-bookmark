import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // support のモックはモジュール単位で状態を持つので、テストは並行実行しない。
    isolate: true,
  },
  resolve: {
    alias: {
      "@raycast/api": fileURLToPath(new URL("./tests/support/raycast-api.ts", import.meta.url)),
    },
  },
});
