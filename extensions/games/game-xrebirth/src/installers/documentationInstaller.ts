import path from "path";

import type { types } from "vortex-api";

const DOC_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".xlsx",
  ".xls",
  ".docx",
  ".doc",
  ".odt",
  ".ods",
  ".md",
  ".rtf",
];

/**
 * Installer for documentation-only uploads (maps, modder handbooks, station
 * calculators, etc.). Files are reference material rather than installable
 * mod content.
 *
 * Heuristic: every file in the archive has a documentation-type extension.
 * If a single non-documentation file is present, we let a more specific
 * installer handle it.
 */
export function testDocumentation(
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  if (dataFiles.length === 0) {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }
  const allDocs = dataFiles.every((f) => {
    const lower = f.toLowerCase();
    return DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
  });
  return Promise.resolve({
    supported: allDocs,
    requiredFiles: allDocs ? [dataFiles[0]!] : [],
  });
}

export function installDocumentation(
  files: string[],
  _destinationPath: string,
): Promise<types.IInstallResult> {
  const dataFiles = files.filter((f) => !f.endsWith(path.sep));
  const commonPrefix = findCommonRootDir(dataFiles);

  const copyInstructions: types.IInstruction[] = dataFiles.map((file) => {
    const destination = commonPrefix ? file.substring(commonPrefix.length + 1) : file;
    return { type: "copy", source: file, destination };
  });
  copyInstructions.push({ type: "setmodtype", value: "xrebirth-documentation" });
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
