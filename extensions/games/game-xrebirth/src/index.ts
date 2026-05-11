import path from "path";

import { fs, util } from "vortex-api";
import type { types } from "vortex-api";
import { parseStringPromise } from "xml2js";

import { healthCheck } from "./diagnostic";
import { installDropIn, testDropIn } from "./installers/dropInInstaller";
import { installSavegame, testSavegame } from "./installers/savegameInstaller";
import { installSweetFx, testSweetFx } from "./installers/sweetFxInstaller";
import { XREBIRTH_STOP_PATTERNS } from "./stopPatterns";

function testSupported(files: string[], gameId: string): Promise<types.ISupportedResult> {
  if (gameId !== "xrebirth") {
    return Promise.resolve({ supported: false, requiredFiles: [] });
  }

  const contentPath = files.find((file) => path.basename(file) === "content.xml");
  return Promise.resolve({
    supported: contentPath !== undefined,
    requiredFiles: contentPath !== undefined ? [contentPath] : [],
  });
}

async function install(files: string[], destinationPath: string): Promise<types.IInstallResult> {
  const contentPath = files.find((file) => path.basename(file) === "content.xml")!;
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
    details: { stopPatterns: XREBIRTH_STOP_PATTERNS },
  });

  context.registerInstaller("xrebirth", 50, testSupported, install);
  // Distinct-shape installers ahead of the generic drop-in: each tags a
  // modType so a future registerModType call can route deployment.
  context.registerInstaller("xrebirth-savegame", 60, testSavegame, installSavegame);
  context.registerInstaller("xrebirth-shader-injector", 65, testSweetFx, installSweetFx);
  context.registerInstaller("xrebirth-dropin", 75, testDropIn, installDropIn);

  (context as any).registerHealthCheck?.(healthCheck);

  return true;
}

export default main;
