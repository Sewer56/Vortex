import type { ILoadedExtension } from "./loadExtension";
import { materializeInstall } from "./materializeInstall";
import { buildMockApi } from "./mockApi";
import type { FixtureOutcome, IFixture, IGameExtensionTestDescriptor } from "./types";

const VIRTUAL_DEST = "/virtual-dest";

export async function runFixture(
  ext: ILoadedExtension,
  fixture: IFixture,
  manifest: string[],
): Promise<FixtureOutcome> {
  const descriptor: IGameExtensionTestDescriptor = ext.testDescriptor;
  const ctx = {
    manifestId: `${fixture.modId}-${fixture.fileId}`,
    modId: fixture.modId,
    fileId: fixture.fileId,
  };
  const { api } = buildMockApi(descriptor, manifest, ctx);

  // Walk installers in ascending priority order (mirrors Vortex's
  // InstallManager.getInstaller dispatch). First one returning supported=true wins.
  let chosen: (typeof ext.installers)[number] | undefined;
  for (const inst of ext.installers) {
    let supported: { supported: boolean; requiredFiles: string[] };
    try {
      supported = await inst.testSupported(manifest, ext.gameId);
    } catch (err: any) {
      return { kind: "failed", issues: [`testSupported (${inst.id}) threw: ${err.message}`] };
    }
    if (supported.supported) {
      chosen = inst;
      break;
    }
  }
  if (!chosen) {
    return { kind: "rejected", reason: "no installer accepted the file" };
  }

  let result: { instructions: any[] };
  try {
    result = await chosen.install(
      manifest,
      VIRTUAL_DEST,
      ext.gameId,
      () => {
        /* noop progress */
      },
      undefined,
      true,
      undefined,
      {},
    );
  } catch (err: any) {
    return { kind: "failed", issues: [`install (${chosen.id}) threw: ${err.message}`] };
  }

  const modCtx = materializeInstall(ctx.manifestId, result.instructions, async (basename) => {
    const generator = descriptor.syntheticContent[basename];
    if (!generator) return Buffer.alloc(0);
    const out = generator(ctx);
    return typeof out === "string" ? Buffer.from(out, "utf8") : out;
  });

  const checkResult = await ext.healthCheck.checkMod(api, modCtx);
  if (checkResult.status === "failed" || checkResult.status === "error") {
    return {
      kind: "failed",
      issues: [`${checkResult.severity}: ${checkResult.message}`],
    };
  }
  return { kind: "passed", modCheckMessage: checkResult.message };
}
