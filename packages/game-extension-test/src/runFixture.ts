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

  let supported: { supported: boolean; requiredFiles: string[] };
  try {
    supported = await ext.installer.testSupported(manifest, ext.gameId);
  } catch (err: any) {
    return { kind: "failed", issues: [`testSupported threw: ${err.message}`] };
  }
  if (!supported.supported) {
    return { kind: "rejected", reason: "installer returned supported=false" };
  }

  let result: { instructions: any[] };
  try {
    result = await ext.installer.install(
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
    return { kind: "failed", issues: [`install threw: ${err.message}`] };
  }

  const modCtx = materializeInstall(ctx.manifestId, result.instructions, async (basename) => {
    const generator = descriptor.syntheticContent[basename];
    if (!generator) return Buffer.alloc(0);
    const out = generator(ctx);
    return typeof out === "string" ? Buffer.from(out, "utf8") : out;
  });

  if (!ext.healthCheck) {
    return { kind: "passed", modCheckMessage: "(no healthcheck registered)" };
  }
  const checkResult = await ext.healthCheck.checkMod(api, modCtx);
  if (checkResult.status === "failed" || checkResult.status === "error") {
    return {
      kind: "failed",
      issues: [`${checkResult.severity}: ${checkResult.message}`],
    };
  }
  return { kind: "passed", modCheckMessage: checkResult.message };
}
