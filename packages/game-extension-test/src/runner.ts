import { describe, test, expect } from "vitest";

import { discoverExtensions } from "./discovery";
import { loadExtension } from "./loadExtension";
import { createNexusClient } from "./nexusClient";
import { resolveFixtures } from "./resolveFixtures";
import { runFixture } from "./runFixture";
import type { IFixture } from "./types";

export interface IRunnerOptions {
  repoRoot: string;
  games: "all" | string[];
  apiKey: string;
}

/**
 * Drive the harness. Vitest's describe/test are called at module load —
 * therefore this function is expected to be invoked from a top-level test
 * file that runs at vitest collection time, NOT inside a `test()`.
 */
export async function generateTests(opts: IRunnerOptions): Promise<void> {
  const allExtensions = discoverExtensions(opts.repoRoot);
  const gameList = opts.games === "all" ? null : opts.games;
  const selected =
    gameList == null
      ? allExtensions
      : allExtensions.filter(
          (e) =>
            gameList.includes(e.packageName) ||
            gameList.some((g) => e.packageDir.endsWith(`/${g}`)),
        );

  const client = createNexusClient(opts.apiKey);

  for (const found of selected) {
    const ext = await loadExtension(found.packageDir);
    const fixtures = await resolveFixtures(client, ext.testDescriptor);

    describe(ext.gameId, () => {
      for (const fx of fixtures) {
        const label = `${labelOrigin(fx.origin)} › modId=${fx.modId} fileId=${fx.fileId}`;
        test(label, async () => {
          let manifest: string[];
          try {
            manifest = await client.getFileManifest(
              ext.testDescriptor.nexusGameDomain,
              fx.modId,
              fx.fileId,
            );
          } catch (err: any) {
            // getFileManifest may not be supported by the underlying API yet.
            // Skip manifest-dependent assertions; testSupported still gets [].
            manifest = [];
          }
          const outcome = await runFixture(ext, fx, manifest);
          if (outcome.kind === "failed") {
            expect.fail(outcome.issues.join("; "));
          }
          // rejected & skipped are not failures.
        });
      }
    });
  }
}

function labelOrigin(o: IFixture["origin"]): string {
  return typeof o === "string" ? o : `collection-${o.collectionId}`;
}
