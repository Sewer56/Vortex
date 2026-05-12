import { vi } from "vitest";
import { setReadFileResolver } from "vortex-api/testing";

import type { IGameExtensionTestDescriptor, ISyntheticContext } from "./types";

export interface IMockApi {
  api: any; // IExtensionApi shape
  readFileCalls: { path: string }[];
}

/**
 * Build the mocked IExtensionApi handed to the per-mod healthcheck. Also
 * primes the shared vortex-api mock's readFile resolver so that
 * `fs.readFileAsync` inside the installer reads from synthetic content.
 */
export function buildMockApi(
  descriptor: IGameExtensionTestDescriptor,
  manifest: string[],
  ctx: ISyntheticContext,
): IMockApi {
  const calls: { path: string }[] = [];

  setReadFileResolver(async (absPath: string) => {
    calls.push({ path: absPath });
    const baseName = lastSegment(absPath);
    const generator = descriptor.syntheticContent[baseName];
    if (!generator) return Buffer.alloc(0);
    const out = generator(ctx);
    return typeof out === "string" ? Buffer.from(out, "utf8") : out;
  });

  const api: any = {
    getState: () => ({
      persistent: { mods: {} },
      settings: { mods: { installPath: {} } },
      session: { base: { activeGameId: descriptor.gameId } },
    }),
    store: { getState: () => ({}), dispatch: vi.fn() },
    onStateChange: vi.fn(),
    showErrorNotification: vi.fn(),
    log: vi.fn(),
    ext: {},
  };

  return { api, readFileCalls: calls };
}

function lastSegment(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1 ? p : p.slice(idx + 1);
}
