import { loadExtension } from "./loadExtension";
import { runFixture } from "./runFixture";
import type { IFixture } from "./types";

/**
 * Run a single pre-resolved fixture. Designed to be called from generated
 * per-fixture .test.ts stubs in `.fixtures/`.
 *
 * The fixture row already carries `contentPreviewLink`, so this function makes
 * one HTTPS call to Nexus's CDN (no auth required) and then drives the
 * installer + diagnostic chain.
 */
export async function runOneFixture(args: {
  extensionDir: string;
  fixture: IFixture;
}): Promise<void> {
  const ext = await loadExtension(args.extensionDir);
  const manifest = await fetchManifest(args.fixture.contentPreviewLink);
  const outcome = await runFixture(ext, args.fixture, manifest);
  if (outcome.kind === "failed") {
    throw new Error(outcome.issues.join("; "));
  }
}

async function fetchManifest(contentPreviewLink: string): Promise<string[]> {
  if (!contentPreviewLink) {
    throw new Error("runOneFixture: empty content_preview_link");
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
