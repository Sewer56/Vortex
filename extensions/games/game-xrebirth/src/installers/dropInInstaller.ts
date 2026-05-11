import path from "path";

import type { types } from "vortex-api";

import { XREBIRTH_STOP_PATTERNS } from "../stopPatterns";

const compiledPatterns = XREBIRTH_STOP_PATTERNS.map((p) => new RegExp(p, "i"));

/**
 * `testSupported` for drop-in X Rebirth mods: archives that aren't shipped as
 * `<dir>/content.xml` but instead deliver files matching one of the game's
 * stopPatterns (translations under `t/`, `.cat`/`.dat` archives, `lang.dat`,
 * etc.). Lower priority than the content.xml installer so structured mods win
 * when both could apply.
 */
export function testDropIn(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const hit = files.find((f) => compiledPatterns.some((re) => re.test(f)));
  return Promise.resolve({
    supported: hit !== undefined,
    requiredFiles: hit !== undefined ? [hit] : [],
  });
}

/**
 * Copies all non-directory files preserving structure. If the archive wraps
 * everything in a single root directory, that prefix is stripped so the mod
 * stages at the game root rather than inside the wrapper.
 */
export function installDropIn(
  files: string[],
  _destinationPath: string,
): Promise<types.IInstallResult> {
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  const commonPrefix = findCommonRootDir(dataFiles);

  const copyInstructions: types.IInstruction[] = dataFiles.map((file) => {
    const destination = commonPrefix ? file.substring(commonPrefix.length + 1) : file;
    return { type: "copy", source: file, destination };
  });

  return Promise.resolve({ instructions: copyInstructions });
}

/**
 * Returns the single top-level directory that contains every file, or undefined
 * if files live at the root or under different top-level dirs.
 */
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
