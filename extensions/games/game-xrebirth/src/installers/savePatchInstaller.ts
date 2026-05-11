import path from "path";

import type { types } from "vortex-api";

/**
 * Installer for X Rebirth save-edit / Mission Director patch uploads.
 *
 * These archives contain only `.xml` files (one or many) without a wrapping
 * extensions/ structure or `content.xml`. They're applied as save patches or
 * MD diff scripts at runtime.
 *
 * Heuristic: every file in the archive is `.xml` or `.txt` (a README is
 * commonly bundled alongside patches), and at least one file is `.xml`.
 * Registered after the generic drop-in installer and after content.xml /
 * savegame / shader / utility specifics, so structured mods always win when
 * applicable.
 *
 * Marks the resulting mod with `modType: "xrebirth-save-patch"`. A follow-up
 * `registerModType` can route deployment to the X Rebirth patch directory.
 */
export function testSavePatch(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  if (dataFiles.length === 0) {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const allXmlOrTxt = dataFiles.every((f) => /\.(xml|txt)$/i.test(f));
  const firstXml = dataFiles.find((f) => /\.xml$/i.test(f));
  const supported = allXmlOrTxt && firstXml !== undefined;
  return Promise.resolve({
    supported,
    requiredFiles: supported ? [firstXml!] : [],
  });
}

export function installSavePatch(
  files: string[],
  _destinationPath: string,
): Promise<types.IInstallResult> {
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  const copyInstructions: types.IInstruction[] = dataFiles.map((file) => ({
    type: "copy",
    source: file,
    destination: file,
  }));
  copyInstructions.push({ type: "setmodtype", value: "xrebirth-save-patch" });
  return Promise.resolve({ instructions: copyInstructions });
}
