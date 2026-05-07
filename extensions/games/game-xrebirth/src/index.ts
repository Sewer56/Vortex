import path from "path";

import { fs, util } from "vortex-api";
import type { types } from "vortex-api";
import { parseStringPromise } from "xml2js";

function testSupported(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }

  const contentPath = files.find((file) => path.basename(file) === "content.xml");
  return Promise.resolve({
    supported: contentPath !== undefined,
    requiredFiles: [contentPath],
  });
}

async function install(files: string[], destinationPath: string): Promise<types.IInstallResult> {
  const contentPath = files.find((file) => path.basename(file) === "content.xml");
  const basePath = path.dirname(contentPath);

  const data = await fs.readFileAsync(path.join(destinationPath, contentPath), {
    encoding: "utf8",
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = await parseStringPromise(data);
  } catch (err) {
    throw new util.DataInvalid("content.xml invalid: " + err.message);
  }

  const attrs = (parsed?.content as Record<string, unknown>)?.$ as
    | Record<string, string>
    | undefined;

  const outputPath = attrs?.id;
  if (outputPath === undefined) {
    throw new util.DataInvalid("invalid or unsupported content.xml");
  }

  const attrInstructions: types.IInstruction[] = Object.entries({
    customFileName: attrs?.name?.trim(),
    description: attrs?.description,
    sticky: attrs?.save === "true",
    author: attrs?.author,
    version: attrs?.version,
  }).map(([key, value]) => ({ type: "attribute" as const, key, value }));

  const copyInstructions: types.IInstruction[] = files
    .filter((file) => file.startsWith(basePath + path.sep) && !file.endsWith(path.sep))
    .map((file) => ({
      type: "copy" as const,
      source: file,
      destination: path.join(outputPath, file.substring(basePath.length + 1)),
    }));

  return { instructions: attrInstructions.concat(copyInstructions) };
}

function main(context: types.IExtensionContext): boolean {
  context.registerGame({
    id: "xrebirth",
    name: "X Rebirth",
    queryArgs: { steam: "2870" },
    queryModPath: () => "extensions",
    logo: "gameart.webp",
    executable: () => "XRebirth.exe",
    requiredFiles: ["XRebirth.exe"],
  });

  context.registerInstaller("xrebirth", 50, testSupported, install);

  return true;
}

export default main;
