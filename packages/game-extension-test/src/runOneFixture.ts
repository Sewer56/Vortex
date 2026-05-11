import { loadExtension } from "./loadExtension";
import { runFixture } from "./runFixture";
import type { IFixture } from "./types";

/**
 * Lazy per-fixture pipeline: resolve the latest file for the mod, fetch its
 * manifest, then drive installer + diagnostic.
 *
 * Designed to run inside a generated per-fixture vitest stub. The CLI's prep
 * phase only enumerates mod IDs; the per-mod file lookup + manifest fetch
 * happens here so it parallelises across vitest workers.
 *
 * Uses raw fetch instead of the @nexusmods/nexus-api SDK to avoid the
 * Nexus.create() validate-key call that would otherwise fire once per test.
 */
export async function runOneFixture(args: {
  extensionDir: string;
  nexusGameDomain: string;
  modId: number;
  origin: IFixture["origin"];
}): Promise<void> {
  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) {
    throw new Error("NEXUS_API_KEY must be set in the test environment");
  }

  const filesResp = await fetch(
    `https://api.nexusmods.com/v1/games/${args.nexusGameDomain}/mods/${args.modId}/files.json`,
    { headers: { APIKEY: apiKey } },
  );
  if (filesResp.status === 403 || filesResp.status === 404) {
    // Hidden/deleted mods — treat as a skip rather than a failure.
    return;
  }
  if (!filesResp.ok) {
    throw new Error(
      `listModFiles(${args.nexusGameDomain}, ${args.modId}) returned HTTP ${filesResp.status}`,
    );
  }
  const filesData = (await filesResp.json()) as {
    files: Array<{
      file_id: number;
      name: string;
      uploaded_timestamp: number;
      content_preview_link?: string;
    }>;
  };
  if (filesData.files.length === 0) {
    throw new Error(`mod ${args.modId} has no files`);
  }
  const latest = [...filesData.files].sort(
    (a, b) => b.uploaded_timestamp - a.uploaded_timestamp,
  )[0]!;

  const fixture: IFixture = {
    origin: args.origin,
    modId: args.modId,
    fileId: latest.file_id,
    fileName: latest.name,
    contentPreviewLink: latest.content_preview_link ?? "",
  };

  const manifest = await fetchManifest(fixture.contentPreviewLink);
  const ext = await loadExtension(args.extensionDir);
  const outcome = await runFixture(ext, fixture, manifest);
  if (outcome.kind === "failed") {
    throw new Error(outcome.issues.join("; "));
  }
}

async function fetchManifest(contentPreviewLink: string): Promise<string[]> {
  if (!contentPreviewLink) {
    throw new Error("fetchManifest: empty content_preview_link");
  }
  const url = encodeURI(contentPreviewLink);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`fetchManifest: ${url} returned HTTP ${resp.status}`);
  }
  const tree = (await resp.json()) as IPreviewNode;
  const out: string[] = [];
  collectFiles(tree, out);
  return out;
}

interface IPreviewNode {
  path?: string;
  type?: "directory" | "file";
  children?: IPreviewNode[];
}

function collectFiles(node: IPreviewNode, out: string[]): void {
  if (node.type === "file" && typeof node.path === "string") {
    out.push(node.path);
    return;
  }
  if (node.children) {
    for (const child of node.children) collectFiles(child, out);
  }
}
