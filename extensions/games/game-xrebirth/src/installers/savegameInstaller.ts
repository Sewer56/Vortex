import path from "path";

import type { types } from "vortex-api";

/** Matches `save_NNN.xml` and `quicksave.xml` filenames at any depth. */
const SAVE_FILE_RE = /(^|\/)(quicksave|save_\d+)\.xml$/i;

/**
 * Installer for X Rebirth save-game uploads. Archives may contain a single
 * `save_001.xml` at root, multiple numbered saves, a single `quicksave.xml`, or
 * a curated tree under `Campaign saves/<scenario>/save_NNN.xml`.
 *
 * Marks the resulting mod with `modType: "xrebirth-savegame"`. The X Rebirth
 * extension can register a matching modType (via `registerModType`) in a
 * follow-up so production deployment routes these to the save folder rather
 * than `extensions/`.
 */
export function testSavegame(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const hit = files.find((f) => SAVE_FILE_RE.test(f));
  return Promise.resolve({
    supported: hit !== undefined,
    requiredFiles: hit !== undefined ? [hit] : [],
  });
}

export function installSavegame(
  files: string[],
  _destinationPath: string,
): Promise<types.IInstallResult> {
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  const copyInstructions: types.IInstruction[] = dataFiles.map((file) => ({
    type: "copy",
    source: file,
    destination: file,
  }));
  copyInstructions.push({ type: "setmodtype", value: "xrebirth-savegame" });
  return Promise.resolve({ instructions: copyInstructions });
}
