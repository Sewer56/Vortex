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
    include: ["src/test-entry.test.ts"],
    // Each fixture makes at least two HTTP calls (listModFiles + manifest);
    // a slow Nexus response can easily exceed the 5s default.
    testTimeout: 30_000,
    // One authenticated Nexus call per fixture; 24 concurrent stays under the
    // SDK's 25-req/s burst limit with headroom for the CDN manifest fetches
    // (which are unmetered).
    maxConcurrency: 24,
  },
});
