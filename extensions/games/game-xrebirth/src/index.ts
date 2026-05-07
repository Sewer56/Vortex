import path from "path";

import { fs, log, util } from "vortex-api";
import type { types } from "vortex-api";
import { parseStringPromise } from "xml2js";

const STEAM_ID = "2870";

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

  let parsed: any;
  try {
    parsed = await parseStringPromise(data);
  } catch (err) {
    throw new util.DataInvalid("content.xml invalid: " + err.message);
  }

  const getAttr = (key: string): string | undefined => {
    try {
      return parsed?.content?.$?.[key];
    } catch (err) {
      log("info", "attribute missing in content.xml", { key });
    }
  };

  const outputPath = getAttr("id");
  if (outputPath === undefined) {
    throw new util.DataInvalid("invalid or unsupported content.xml");
  }

  const attrInstructions: types.IInstruction[] = [
    {
      type: "attribute",
      key: "customFileName",
      value: getAttr("name").trim(),
    },
    {
      type: "attribute",
      key: "description",
      value: getAttr("description"),
    },
    {
      type: "attribute",
      key: "sticky",
      value: getAttr("save") === "true",
    },
    // NOTE: original code has "trype" (typo), so this instruction has no recognized
    // type and is silently ignored by the framework. Preserved for 1:1 behavior.
    {
      trype: "attribute",
      key: "author",
      value: getAttr("author"),
    } as any,
    {
      type: "attribute",
      key: "version",
      value: getAttr("version"),
    },
  ];

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
    mergeMods: true,
    queryArgs: {
      steam: [{ id: STEAM_ID }],
    },
    queryModPath: () => "extensions",
    logo: "gameart.webp",
    executable: () => "XRebirth.exe",
    requiredFiles: ["XRebirth.exe"],
    environment: {
      SteamAPPId: STEAM_ID,
    },
    details: {
      steamAppId: +STEAM_ID,
    },
  });

  context.registerInstaller("xrebirth", 50, testSupported, install);

  return true;
}

export default main;
