import * as path from "node:path";

/**
 * Result of loading an extension: the installer functions registered via
 * context.registerInstaller, plus the diagnostic and test descriptor.
 */
export interface ILoadedExtension {
  installer: {
    id: string;
    priority: number;
    testSupported: (...args: any[]) => Promise<any>;
    install: (...args: any[]) => Promise<any>;
  };
  testDescriptor: any; // narrowed to IGameExtensionTestDescriptor at call sites
  healthCheck?: any; // optional IModHealthCheck
  gameId: string;
}

export async function loadExtension(extensionDir: string): Promise<ILoadedExtension> {
  const stubContext: any = makeStubContext();
  const indexPath = path.join(extensionDir, "src", "index.ts");
  const mod = await import(indexPath);
  const init = mod.default ?? mod.init;
  if (typeof init !== "function") {
    throw new Error(`Extension ${extensionDir} has no default export`);
  }
  init(stubContext);

  if (!stubContext._installer) {
    throw new Error(`Extension ${extensionDir} did not call registerInstaller`);
  }
  if (!stubContext._game) {
    throw new Error(`Extension ${extensionDir} did not call registerGame`);
  }

  const descriptorMod = await import(path.join(extensionDir, "src", "test-descriptor.ts"));
  const diagnosticMod = await import(path.join(extensionDir, "src", "diagnostic.ts")).catch(
    () => ({}),
  );

  if (descriptorMod.testDescriptor && !(diagnosticMod as any).healthCheck) {
    throw new Error(
      `Extension ${extensionDir} exports testDescriptor but has no healthCheck ` +
        `(expected at src/diagnostic.ts: export const healthCheck = ...). ` +
        `Without a healthcheck the harness would silently pass every fixture.`,
    );
  }

  return {
    installer: stubContext._installer,
    testDescriptor: descriptorMod.testDescriptor,
    healthCheck: diagnosticMod.healthCheck,
    gameId: stubContext._game.id,
  };
}

function makeStubContext(): any {
  const ctx: any = {
    _installer: undefined,
    _game: undefined,
    registerGame(game: any) {
      ctx._game = game;
    },
    registerInstaller(id: string, priority: number, testSupported: any, install: any) {
      ctx._installer = { id, priority, testSupported, install };
    },
    registerTest() {
      /* legacy noop */
    },
    registerHealthCheck() {
      /* runtime registration is a noop in tests */
    },
    registerReducer() {
      /* noop */
    },
    registerSettings() {
      /* noop */
    },
    registerMainPage() {
      /* noop */
    },
    registerAction() {
      /* noop */
    },
    once(_cb: () => void) {
      /* deferred init not exercised in tests */
    },
    api: {
      /* per-fixture mockApi is supplied separately */
    } as any,
  };
  return ctx;
}
