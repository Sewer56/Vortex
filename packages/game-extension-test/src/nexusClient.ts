import Nexus from "@nexusmods/nexus-api";
import { RateLimiter } from "limiter";

import { fetchFileManifest } from "./manifest";
import { withRetry } from "./retry";

export interface INexusClient {
  listMostPopular(gameDomain: string, limit: number): Promise<INexusModSummary[]>;
  listMostRecent(gameDomain: string, limit: number): Promise<INexusModSummary[]>;
  listOldest(gameDomain: string, limit: number): Promise<INexusModSummary[]>;
  /**
   * Enumerate every mod for the game via paginated GraphQL.
   * Returns one row per mod. Caller is responsible for the per-mod `listModFiles`
   * follow-up.
   */
  listAllMods(gameDomain: string): Promise<INexusModSummary[]>;
  listCollections(gameDomain: string): Promise<INexusCollectionSummary[]>;
  listCollectionMods(gameDomain: string, collectionSlug: string): Promise<INexusModSummary[]>;
  listModFiles(gameDomain: string, modId: number): Promise<INexusFileSummary[]>;
  /**
   * Fetch the content-preview JSON for a file and flatten it into the list of
   * file paths inside the archive. The URL comes from
   * `IFileInfo.content_preview_link` (exposed on `INexusFileSummary`).
   * Throws if the URL is empty or the fetch fails.
   */
  getFileManifest(contentPreviewLink: string): Promise<string[]>;
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
  /** Display name (human-readable, no extension). */
  name: string;
  /** Actual filename with extension. */
  fileName: string;
  /** Nexus category: "MAIN", "PATCH", "OPTIONAL", "OLD_VERSION", "MISCELLANEOUS", "DELETED", "ARCHIVED". */
  categoryName: string;
  uploadedAt: Date;
  /** URL of the archive content-preview JSON; empty string if not provided. */
  contentPreviewLink: string;
}

// SDK calls go through api.nexusmods.com, which is rate-limited; use longer
// backoff than the unmetered CDN fetches (see `manifest.ts`).
const SDK_RETRY = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 30_000 } as const;

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
    return withRetry(() => fn(nexus), SDK_RETRY);
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
    // listAllMods – paginated GraphQL `mods(filter: gameDomainName)` query.
    // Returns every mod for the game.
    // ------------------------------------------------------------------
    async listAllMods(gameDomain: string): Promise<INexusModSummary[]> {
      const pageSize = 100;
      const out: INexusModSummary[] = [];
      let offset = 0;
      // The SDK doesn't expose a raw GraphQL request method on the typed
      // surface, so we hit /v2/graphql directly. Wrapped in withRetry to
      // match the protection the SDK-routed calls get via `call()`.
      while (true) {
        const data = await withRetry(async () => {
          await limiter.removeTokens(1);
          const resp = await fetch("https://api.nexusmods.com/v2/graphql", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              APIKEY: apiKey,
            },
            body: JSON.stringify({
              query:
                "query($domain: String!, $count: Int!, $offset: Int!) {" +
                " mods(filter: { filter: [{ gameDomainName: { value: $domain, op: EQUALS } }] }, count: $count, offset: $offset) {" +
                "   totalCount nodes { modId name }" +
                " } }",
              variables: { domain: gameDomain, count: pageSize, offset },
            }),
          });
          if (!resp.ok) {
            // Tag with `status` so withRetry only retries 408/429/5xx.
            const err = Object.assign(new Error(`listAllMods: HTTP ${resp.status}`), {
              status: resp.status,
            });
            throw err;
          }
          const json = (await resp.json()) as {
            data?: {
              mods?: { totalCount?: number; nodes?: Array<{ modId: number; name: string }> };
            };
            errors?: Array<{ message: string }>;
          };
          if (json.errors?.length) {
            // GraphQL semantic errors arrive over a 200 response; tag with
            // a non-retryable status so withRetry fails fast.
            const err = Object.assign(
              new Error(`listAllMods GraphQL: ${json.errors.map((e) => e.message).join("; ")}`),
              { status: 400 },
            );
            throw err;
          }
          return json;
        }, SDK_RETRY);

        const page = data.data?.mods?.nodes ?? [];
        for (const m of page) out.push({ modId: m.modId, name: m.name ?? "" });
        const total = data.data?.mods?.totalCount ?? 0;
        offset += page.length;
        if (offset >= total || page.length === 0) break;
      }
      return out;
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
        fileName: (f as any).file_name ?? "",
        categoryName: (f as any).category_name ?? "",
        uploadedAt: new Date(f.uploaded_timestamp * 1000),
        contentPreviewLink: f.content_preview_link ?? "",
      }));
    },

    getFileManifest: (contentPreviewLink: string) => fetchFileManifest(contentPreviewLink),
  };
}
