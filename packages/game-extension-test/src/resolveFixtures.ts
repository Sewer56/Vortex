import type { INexusClient } from "./nexusClient";
import type { IFixture, IGameExtensionTestDescriptor } from "./types";

/**
 * Fetch fixture rows for one game from the live Nexus API based on its
 * descriptor. Selects the *latest* file per mod (or every file in a collection).
 */
export async function resolveFixtures(
  client: INexusClient,
  descriptor: IGameExtensionTestDescriptor,
): Promise<IFixture[]> {
  const seen = new Set<number>(); // dedup by fileId
  const out: IFixture[] = [];
  const tryAdd = (f: IFixture) => {
    if (seen.has(f.fileId)) return;
    seen.add(f.fileId);
    out.push(f);
  };

  const collect = async (
    origin: IFixture["origin"],
    mods: Awaited<ReturnType<INexusClient["listMostPopular"]>>,
    domain: string,
  ) => {
    for (const m of mods) {
      const files = await client.listModFiles(domain, m.modId);
      const latest = files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
      if (!latest) continue;
      tryAdd({ origin, modId: m.modId, fileId: latest.fileId, fileName: latest.name });
    }
  };

  const d = descriptor.nexusGameDomain;
  if (descriptor.fixtures.mostPopular > 0) {
    await collect(
      "mostPopular",
      await client.listMostPopular(d, descriptor.fixtures.mostPopular),
      d,
    );
  }
  if (descriptor.fixtures.mostRecent > 0) {
    await collect("mostRecent", await client.listMostRecent(d, descriptor.fixtures.mostRecent), d);
  }
  if (descriptor.fixtures.oldest > 0) {
    await collect("oldest", await client.listOldest(d, descriptor.fixtures.oldest), d);
  }
  if (descriptor.fixtures.allCollections) {
    const cols = await client.listCollections(d);
    for (const c of cols) {
      const mods = await client.listCollectionMods(d, c.slug);
      await collect({ type: "collection", collectionId: c.slug }, mods, d);
    }
  }
  return out;
}
