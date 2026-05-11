import * as path from "node:path";

export interface IInstallerEntry {
  id: string;
  priority: number;
  testSupported: (...args: any[]) => Promise<any>;
  install: (...args: any[]) => Promise<any>;
}

/**
 * Result of loading an extension. `installers` is sorted by ascending priority
 * to mirror Vortex's `InstallManager.getInstaller` dispatch order (lower
 * priority number wins).
 */
export interface ILoadedExtension {
  installers: IInstallerEntry[];
  testDescriptor: any; // narrowed to IGameExtensionTestDescriptor at call sites
  healthCheck?: any; // optional IModHealthCheck
  gameId: string;
  game: any; // the IGame-shaped object passed to context.registerGame
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

  if (stubContext._installers.length === 0) {
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

  const installers: IInstallerEntry[] = [...stubContext._installers].sort(
    (a, b) => a.priority - b.priority,
  );

  return {
    installers,
    testDescriptor: descriptorMod.testDescriptor,
    healthCheck: diagnosticMod.healthCheck,
    gameId: stubContext._game.id,
    game: stubContext._game,
  };
}

function makeStubContext(): any {
  const ctx: any = {
    _installers: [] as IInstallerEntry[],
    _game: undefined,
    registerGame(game: any) {
      ctx._game = game;
    },
    registerInstaller(id: string, priority: number, testSupported: any, install: any) {
      ctx._installers.push({ id, priority, testSupported, install });
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
