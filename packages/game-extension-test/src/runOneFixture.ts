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
  const resp = await fetchWithRetry(url);
  if (!resp.ok) {
    // Non-retryable HTTP errors (404 etc.) — surface the final status so
    // callers can decide whether to skip.
    throw new Error(`fetchManifest: ${url} returned HTTP ${resp.status}`);
  }
  const tree = (await resp.json()) as IPreviewNode;
  const out: string[] = [];
  collectFiles(tree, out);
  return out;
}

/**
 * `fetch` with retry on transient failures:
 *   - HTTP 429 (rate-limited)
 *   - HTTP 5xx (server errors)
 *   - HTTP 408 (request timeout)
 *   - Network errors (fetch itself rejects: ECONNRESET, ENOTFOUND, abort, etc.)
 *
 * Non-retryable HTTP responses (404, 403, other 4xx) are returned as-is so the
 * caller can decide how to handle them. Up to `maxAttempts` total attempts
 * (default 4), exponential backoff 500ms * 2^attempt with up to 50% jitter,
 * capped at 10s per sleep.
 */
async function fetchWithRetry(url: string, init?: RequestInit, maxAttempts = 4): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, init);
      if (resp.ok) return resp;
      if (!isRetryableStatus(resp.status)) return resp;
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (err: unknown) {
      lastErr = err;
    }
    if (attempt === maxAttempts - 1) break;
    const base = 500 * 2 ** attempt;
    const jitter = Math.random() * base * 0.5;
    await sleep(Math.min(base + jitter, 10_000));
  }
  // Exhausted retries — synthesize an error response so callers don't need
  // a second error path; throw if it was a network error.
  if (lastErr instanceof Error && !/HTTP \d/.test(lastErr.message)) {
    throw lastErr;
  }
  throw lastErr ?? new Error(`fetchWithRetry: ${url} failed after ${maxAttempts} attempts`);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
