import { describe, test } from "vitest";

import { generateTests } from "./runner";

const repoRoot = process.env.GAME_EXT_TEST_REPO;
const games = process.env.GAME_EXT_TEST_GAMES ?? "all";
const apiKey = process.env.NEXUS_API_KEY ?? "";

if (!repoRoot || !apiKey) {
  describe("game-extension-test", () => {
    test("environment not configured (skipped)", () => {
      // No-op: the CLI sets these; ad-hoc invocations skip the live-API path.
    });
  });
} else {
  // generateTests emits describe/test blocks synchronously during collection.
  // Vitest 4 supports top-level await in test files via its transform.
  // ts-ignore: top-level await requires module:esnext in tsc, but vitest
  // transforms this file via Vite/esbuild which handles it correctly at runtime.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  // @ts-ignore TS1378
  await generateTests({
    repoRoot,
    games: games === "all" ? "all" : games.split(","),
    apiKey,
  });
}
