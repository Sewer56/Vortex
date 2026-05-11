import path from "path";

import type { types } from "vortex-api";

/**
 * Markers that an archive is a SweetFX / ReShade shader-injector bundle. We
 * accept the archive if ANY of these match anywhere in the file list.
 */
const SHADER_MARKERS = [
  /(^|\/)d3d9\.dll$/i,
  /(^|\/)dxgi\.dll$/i,
  /(^|\/)d3d9\.ini$/i,
  /(^|\/)SweetFX([\\/]|_)/i,
  /(^|\/)reshade-shaders\//i,
  /(^|\/)ReShade\//i,
];

/**
 * Installer for SweetFX / ReShade shader-injector archives. Files include
 * `d3d9.dll` / `dxgi.dll` proxies, a `SweetFX/` or `reshade-shaders/` tree, and
 * `SweetFX_*.txt` configs — all deployed to the game executable directory.
 *
 * Marks the resulting mod with `modType: "xrebirth-shader-injector"`.
 */
export function testSweetFx(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const hit = files.find((f) => SHADER_MARKERS.some((re) => re.test(f)));
  return Promise.resolve({
    supported: hit !== undefined,
    requiredFiles: hit !== undefined ? [hit] : [],
  });
}

export function installSweetFx(
  files: string[],
  _destinationPath: string,
): Promise<types.IInstallResult> {
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  const commonPrefix = findCommonRootDir(dataFiles);

  const copyInstructions: types.IInstruction[] = dataFiles.map((file) => {
    const destination = commonPrefix ? file.substring(commonPrefix.length + 1) : file;
    return { type: "copy", source: file, destination };
  });
  copyInstructions.push({ type: "setmodtype", value: "xrebirth-shader-injector" });
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
