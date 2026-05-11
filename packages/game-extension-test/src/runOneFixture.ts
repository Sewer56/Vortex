import { loadExtension } from "./loadExtension";
import { runFixture } from "./runFixture";
import type { IFixture } from "./types";

/**
 * Run a single pre-resolved fixture: fetch the manifest, drive the installer,
 * run the diagnostic.
 *
 * Returns a skip reason string when something genuinely couldn't be tested
 * (manifest missing on the CDN). Throws on real failures, including the
 * installer rejecting the file — rejection means "no installer handler
 * registered for this file type" and is a signal we need to address, not hide.
 */
export async function runOneFixture(args: {
  extensionDir: string;
  fixture: IFixture;
}): Promise<string | undefined> {
  if (!args.fixture.contentPreviewLink) {
    return `no content_preview_link for fileId=${args.fixture.fileId}`;
  }

  let manifest: string[];
  try {
    manifest = await fetchManifest(args.fixture.contentPreviewLink);
  } catch (err: unknown) {
    if (err instanceof Error && /HTTP 404/.test(err.message)) {
      return `manifest not on CDN: ${err.message}`;
    }
    throw err;
  }

  const ext = await loadExtension(args.extensionDir);

  // Apply descriptor-level skip heuristics before driving the installer.
  const skipHeuristics = ext.testDescriptor.skipHeuristics ?? [];
  for (const h of skipHeuristics) {
    if (h.matches(manifest)) {
      return `skipped by heuristic: ${h.reason}`;
    }
  }

  const outcome = await runFixture(ext, args.fixture, manifest);
  if (outcome.kind === "failed") {
    throw new Error(outcome.issues.join("; "));
  }
  if (outcome.kind === "rejected") {
    throw new Error(
      `installer rejected file ${args.fixture.fileName} (modId=${args.fixture.modId}, fileId=${args.fixture.fileId}). ` +
        `If this is intentional, add a more specific installer that supports this file shape; ` +
        `otherwise the X Rebirth-specific installer's testSupported needs to accept it.`,
    );
  }
  return undefined;
}

async function fetchManifest(contentPreviewLink: string): Promise<string[]> {
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
