import type { INexusClient } from "./nexusClient";
import type { IFixture, IGameExtensionTestDescriptor } from "./types";

/** Mod-level fixture row, before per-file resolution. */
export interface IModRef {
  origin: IFixture["origin"];
  modId: number;
}

/**
 * Fetch the *mod list* for one game from the live Nexus API based on its
 * descriptor. Each row identifies a mod; the per-mod file resolution + manifest
 * fetch happens lazily inside each test (so it parallelises across vitest
 * workers instead of blocking the CLI prep phase).
 */
export async function resolveModRefs(
  client: INexusClient,
  descriptor: IGameExtensionTestDescriptor,
): Promise<IModRef[]> {
  const seen = new Set<number>();
  const out: IModRef[] = [];
  const tryAdd = (r: IModRef) => {
    if (seen.has(r.modId)) return;
    seen.add(r.modId);
    out.push(r);
  };

  const collect = (origin: IModRef["origin"], mods: Array<{ modId: number }>) => {
    for (const m of mods) tryAdd({ origin, modId: m.modId });
  };

  const d = descriptor.nexusGameDomain;
  if (descriptor.fixtures.all) {
    collect("mostPopular", await client.listAllMods(d));
  }
  if (descriptor.fixtures.mostPopular > 0) {
    collect("mostPopular", await client.listMostPopular(d, descriptor.fixtures.mostPopular));
  }
  if (descriptor.fixtures.mostRecent > 0) {
    collect("mostRecent", await client.listMostRecent(d, descriptor.fixtures.mostRecent));
  }
  if (descriptor.fixtures.oldest > 0) {
    collect("oldest", await client.listOldest(d, descriptor.fixtures.oldest));
  }
  if (descriptor.fixtures.allCollections) {
    let cols: Awaited<ReturnType<INexusClient["listCollections"]>>;
    try {
      cols = await client.listCollections(d);
    } catch (err: unknown) {
      console.warn(
        `resolveModRefs: listCollections failed for ${d}; skipping collection fixtures. ` +
          (err instanceof Error ? err.message : String(err)),
      );
      cols = [];
    }
    for (const c of cols) {
      try {
        const mods = await client.listCollectionMods(d, c.slug);
        collect({ type: "collection", collectionId: c.slug }, mods);
      } catch (err: unknown) {
        console.warn(
          `resolveModRefs: collection ${c.slug} failed; skipping. ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }
  return out;
}
