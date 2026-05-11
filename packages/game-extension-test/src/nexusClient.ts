import Nexus from "@nexusmods/nexus-api";
import { RateLimiter } from "limiter";

export interface INexusClient {
  listMostPopular(gameDomain: string, limit: number): Promise<INexusModSummary[]>;
  listMostRecent(gameDomain: string, limit: number): Promise<INexusModSummary[]>;
  listOldest(gameDomain: string, limit: number): Promise<INexusModSummary[]>;
  listCollections(gameDomain: string): Promise<INexusCollectionSummary[]>;
  listCollectionMods(gameDomain: string, collectionSlug: string): Promise<INexusModSummary[]>;
  listModFiles(gameDomain: string, modId: number): Promise<INexusFileSummary[]>;
  /**
   * Returns the list of file paths inside an archive (content preview / manifest).
   *
   * NOTE: @nexusmods/nexus-api v1.6.0 does not expose an archive content-preview
   * endpoint directly (the REST endpoint exists at https://api.nexusmods.com but is
   * not wrapped in this SDK). The `modFileContents` GraphQL method searches indexed
   * file records but requires a pre-built query object and cannot enumerate arbitrary
   * archive contents on demand.
   *
   * This method therefore always throws. The harness must either:
   *   1. Make a direct HTTPS call to the content-preview URL stored in
   *      `IFileInfo.content_preview_link` (returned by `getFileInfo`/`getModFiles`), or
   *   2. Skip manifest-dependent fixtures gracefully.
   */
  getFileManifest(gameDomain: string, modId: number, fileId: number): Promise<string[]>;
}

export interface INexusModSummary {
  modId: number;
  name: string;
}

export interface INexusCollectionSummary {
  slug: string;
  name: string;
}

export interface INexusFileSummary {
  fileId: number;
  name: string;
  uploadedAt: Date;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pause for `ms` milliseconds. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a call with exponential back-off + jitter on HTTP 429 responses.
 * Up to `maxRetries` retries, base delay 1 s, cap 30 s.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === "object" && err !== null && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : typeof err === "object" && err !== null && "status" in err
            ? (err as { status: number }).status
            : undefined;

      if (status !== 429 || attempt === maxRetries) {
        throw err;
      }

      // Exponential back-off: 1 s, 2 s, 4 s … with up-to-50 % jitter.
      const base = 1000 * Math.pow(2, attempt);
      const jitter = Math.random() * base * 0.5;
      await sleep(Math.min(base + jitter, 30_000));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNexusClient(apiKey: string): INexusClient {
  // ~25 requests per second
  const limiter = new RateLimiter({ tokensPerInterval: 25, interval: "second" });

  // We create the Nexus instance lazily via `Nexus.create` so the API key is
  // validated once before the first real call.
  let nexusPromise: Promise<Nexus> | undefined;

  function getNexus(): Promise<Nexus> {
    if (!nexusPromise) {
      nexusPromise = Nexus.create(apiKey, "vortex-game-extension-test", "1.0.0", "site");
    }
    return nexusPromise;
  }

  async function call<T>(fn: (nexus: Nexus) => Promise<T>): Promise<T> {
    await limiter.removeTokens(1);
    const nexus = await getNexus();
    return withRetry(() => fn(nexus));
  }

  return {
    // ------------------------------------------------------------------
    // listMostPopular – uses getTrending (sorted by endorsements/popularity)
    // ------------------------------------------------------------------
    async listMostPopular(gameDomain: string, limit: number): Promise<INexusModSummary[]> {
      const results = await call((nexus) => nexus.getTrending(gameDomain));
      return results.slice(0, limit).map((m) => ({ modId: m.mod_id, name: m.name ?? "" }));
    },

    // ------------------------------------------------------------------
    // listMostRecent – uses getLatestAdded
    // ------------------------------------------------------------------
    async listMostRecent(gameDomain: string, limit: number): Promise<INexusModSummary[]> {
      const results = await call((nexus) => nexus.getLatestAdded(gameDomain));
      return results.slice(0, limit).map((m) => ({ modId: m.mod_id, name: m.name ?? "" }));
    },

    // ------------------------------------------------------------------
    // listOldest – the REST API has no "oldest" sort; we approximate with
    // getLatestUpdated (sorted ascending by update time) and then reverse
    // so the least-recently-updated (i.e. oldest untouched) mods come first.
    // This is the closest approximation available in @nexusmods/nexus-api v1.6.0.
    // ------------------------------------------------------------------
    async listOldest(gameDomain: string, limit: number): Promise<INexusModSummary[]> {
      const results = await call((nexus) => nexus.getLatestUpdated(gameDomain));
      return results
        .slice()
        .reverse()
        .slice(0, limit)
        .map((m) => ({ modId: m.mod_id, name: m.name ?? "" }));
    },

    // ------------------------------------------------------------------
    // listCollections – uses getCollectionListGraph with a minimal query
    // ------------------------------------------------------------------
    async listCollections(gameDomain: string): Promise<INexusCollectionSummary[]> {
      // The GraphQL method requires a query-shape object describing which
      // fields to return. We request only `slug` and `name`.
      const query = { slug: true, name: true };
      const results = await call((nexus) =>
        (nexus as any).getCollectionListGraph(query, gameDomain, 100, 0),
      );
      return (results as Array<{ slug?: string; name?: string }>).map((c) => ({
        slug: c.slug ?? "",
        name: c.name ?? "",
      }));
    },

    // ------------------------------------------------------------------
    // listCollectionMods – fetches a single collection's current revision
    // and extracts its mod list.
    // ------------------------------------------------------------------
    async listCollectionMods(
      gameDomain: string,
      collectionSlug: string,
    ): Promise<INexusModSummary[]> {
      // Fetch the collection; request the modFiles sub-tree.
      const query = {
        slug: true,
        name: true,
        currentRevision: {
          modFiles: {
            file: {
              modId: true,
              name: true,
            },
          },
        },
      };
      const collection = await call((nexus) =>
        (nexus as any).getCollectionGraph(query, collectionSlug, false),
      );

      type RevisionMod = { file?: { modId?: number; name?: string } };
      const modFiles: RevisionMod[] = (collection as any)?.currentRevision?.modFiles ?? [];

      return modFiles
        .filter((mf) => mf.file?.modId != null)
        .map((mf) => ({
          modId: mf.file!.modId as number,
          name: mf.file!.name ?? "",
        }));
    },

    // ------------------------------------------------------------------
    // listModFiles – uses getModFiles
    // ------------------------------------------------------------------
    async listModFiles(gameDomain: string, modId: number): Promise<INexusFileSummary[]> {
      const result = await call((nexus) => nexus.getModFiles(modId, gameDomain));
      return result.files.map((f) => ({
        fileId: f.file_id,
        name: f.name,
        uploadedAt: new Date(f.uploaded_timestamp * 1000),
      }));
    },

    // ------------------------------------------------------------------
    // getFileManifest – NOT available in @nexusmods/nexus-api v1.6.0
    // ------------------------------------------------------------------
    getFileManifest: (_gameDomain: string, _modId: number, _fileId: number): Promise<string[]> => {
      throw new Error(
        "getFileManifest is not implemented: @nexusmods/nexus-api does not expose " +
          "an archive content-preview endpoint. The harness must either fall back " +
          "to a direct HTTPS call (see content-preview API at https://api.nexusmods.com) " +
          "or skip manifest-dependent fixtures.",
      );
    },
  };
}
