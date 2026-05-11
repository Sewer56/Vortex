import path from "path";

import type { types } from "vortex-api";

/**
 * Installer for utility-style uploads: standalone tools shipped as `.exe`
 * (often with accompanying DLLs and config files). These get deployed at the
 * game's base folder rather than into `extensions/` so the user can launch
 * them alongside the game executable.
 *
 * Heuristic: any `.exe` file anywhere in the archive. We don't try to be
 * clever about which `.exe` is the entry-point — production code can use the
 * `xrebirth-utility` modType to route deployment.
 */
export function testUtility(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const exe = files.find((f) => /\.exe$/i.test(f));
  return Promise.resolve({
    supported: exe !== undefined,
    requiredFiles: exe !== undefined ? [exe] : [],
  });
}

export function installUtility(
  files: string[],
  _destinationPath: string,
): Promise<types.IInstallResult> {
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  const commonPrefix = findCommonRootDir(dataFiles);

  const copyInstructions: types.IInstruction[] = dataFiles.map((file) => {
    const destination = commonPrefix ? file.substring(commonPrefix.length + 1) : file;
    return { type: "copy", source: file, destination };
  });
  copyInstructions.push({ type: "setmodtype", value: "xrebirth-utility" });
  return Promise.resolve({ instructions: copyInstructions });
}

function findCommonRootDir(files: string[]): string | undefined {
  if (files.length === 0) return undefined;
  const firstSeg = (p: string) => p.split(/[\\/]/)[0];
  const root = firstSeg(files[0]!);
  if (!root || root === files[0]) return undefined;
  for (const f of files) {
    if (firstSeg(f) !== root) return undefined;
  }
  return root;
}
