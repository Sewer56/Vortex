import * as path from "node:path";

import { test } from "vitest";

import { discoverExtensions } from "./discovery";
import { createNexusClient } from "./nexusClient";
import { resolveModRefs } from "./resolveFixtures";
import { runOneFixture } from "./runOneFixture";

/**
 * Single test file that fans out to one `test.concurrent` per Nexus mod at
 * vitest collection time. The CLI sets GAME_EXT_TEST_REPO and
 * GAME_EXT_TEST_GAMES; without those (e.g. running `vitest run` ad-hoc), the
 * file degrades to a single no-op test.
 *
 * No on-disk stub files: the per-mod fan-out happens in-memory and tests run
 * concurrently in one process (vitest's `maxConcurrency` controls the parallel
 * window). For our I/O-bound workload (HTTP fetches), single-process event-
 * loop concurrency matches worker-pool wall time without the disk artefacts.
 */

const repoRoot = process.env.GAME_EXT_TEST_REPO;
const games = process.env.GAME_EXT_TEST_GAMES ?? "all";
const apiKey = process.env.NEXUS_API_KEY ?? "";

if (!repoRoot || !apiKey) {
  test("environment not configured (skipped)", () => {
    // The CLI sets these vars; an ad-hoc `vitest run` outside the CLI skips
    // the live-API path.
  });
} else {
  const requested = games === "all" ? null : games.split(",");
  const exts = discoverExtensions(repoRoot);
  const selected =
    requested === null
      ? exts
      : exts.filter(
          (e) =>
            requested.includes(e.packageName) ||
            requested.some((g) => e.packageDir.endsWith(`/${g}`)),
        );

  const client = createNexusClient(apiKey);
  for (const found of selected) {
    // tsc complains about top-level await under `module: commonjs`, but vitest's
    // Vite transform handles it natively at runtime.
    // @ts-ignore TS1378
    const descriptor = // @ts-ignore TS1378
      (await import(path.join(found.packageDir, "src", "test-descriptor.ts"))).testDescriptor;
    // @ts-ignore TS1378
    const refs = await resolveModRefs(client, descriptor);
    for (const ref of refs) {
      test.concurrent(`${descriptor.gameId} > modId=${ref.modId}`, async (ctx) => {
        const skipReason = await runOneFixture({
          extensionDir: found.packageDir,
          nexusGameDomain: descriptor.nexusGameDomain,
          modId: ref.modId,
          origin: ref.origin,
        });
        if (skipReason) ctx.skip(skipReason);
      });
    }
  }
}
