import * as path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Vitest config for the dynamically-generated fixture stubs under `.fixtures/`.
 * Each stub is one `test()` per Nexus file, so vitest's default pool runs them
 * in parallel across worker threads.
 */
export default defineConfig({
  resolve: {
    alias: {
      "vortex-api": path.resolve(__dirname, "__mocks__/vortex-api.ts"),
    },
  },
  test: {
    environment: "node",
    include: [".fixtures/**/*.test.ts"],
  },
});
