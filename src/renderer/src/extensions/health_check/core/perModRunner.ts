import * as fs from "fs";
import * as path from "path";

import type { IExtensionApi } from "../../../types/IExtensionContext";
import type {
  IHealthCheckResult,
  IModCheckContext,
  IModHealthCheck,
} from "../../../types/IHealthCheck";
import { HealthCheckSeverity } from "../../../types/IHealthCheck";
import { activeGameId } from "../../../util/selectors";
import { log } from "../../../util/log";
import { installPathForGame } from "../../mod_management/selectors";

/** Map an installed mod's redux state row to an IModCheckContext. */
export interface IInstalledModEntry {
  modId: string;
  stagingPath: string;
  attributes: Record<string, unknown>;
}

/**
 * Enumerate installed mods for the active game by reading Redux state.
 *
 * Returns the staging-path + attributes for each mod in persistent state.
 * Pure relative to the API: callers can mock `api.getState()` and the staging
 * dir lookup. Filesystem walks happen in `buildModCheckContext`, not here.
 */
export function enumerateInstalledMods(api: IExtensionApi): IInstalledModEntry[] {
  const state: any = api.getState();
  const gameId = activeGameId(state);
  if (!gameId) {
    return [];
  }
  const modsById = state.persistent?.mods?.[gameId] ?? {};
  const stagingRoot = installPathForGame(state as any, gameId);
  if (!stagingRoot) {
    return [];
  }
  return Object.entries(modsById).map(([modId, mod]: [string, any]) => ({
    modId,
    stagingPath: path.join(stagingRoot, mod.installationPath ?? modId),
    attributes: mod.attributes ?? {},
  }));
}

/**
 * Build an IModCheckContext for one installed mod by walking its staging dir.
 */
export async function buildModCheckContext(
  entry: IInstalledModEntry,
): Promise<IModCheckContext> {
  const files = await walkRelative(entry.stagingPath);
  return {
    modId: entry.modId,
    files,
    readFile: (rel) => fs.promises.readFile(path.join(entry.stagingPath, rel)),
    attributes: entry.attributes,
  };
}

async function walkRelative(root: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(dir: string, rel: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const childAbs = path.join(dir, e.name);
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        await rec(childAbs, childRel);
      } else {
        out.push(childRel);
      }
    }
  }
  // Only swallow "root doesn't exist" — mid-walk errors propagate.
  try {
    await fs.promises.access(root);
  } catch {
    log("warn", "mod staging dir not found", { root });
    return out;
  }
  await rec(root, "");
  return out;
}

/**
 * Run a per-mod healthcheck across all installed mods for the active game and
 * fold the per-mod results into a single IHealthCheckResult (worst severity
 * wins; per-mod messages are concatenated into `details`).
 */
export async function runPerModCheck(
  hc: IModHealthCheck,
  api: IExtensionApi,
): Promise<IHealthCheckResult> {
  const startedAt = Date.now();
  const mods = enumerateInstalledMods(api);
  if (mods.length === 0) {
    return {
      checkId: hc.id,
      status: "passed",
      severity: HealthCheckSeverity.Info,
      message: "No mods installed; nothing to check.",
      executionTime: Date.now() - startedAt,
      timestamp: new Date(),
    };
  }
  const perMod = await Promise.all(
    mods.map(async (entry): Promise<IHealthCheckResult> => {
      try {
        const ctx = await buildModCheckContext(entry);
        return await hc.checkMod(api, ctx);
      } catch (err: any) {
        return {
          checkId: hc.id,
          status: "error",
          severity: HealthCheckSeverity.Error,
          message: `Per-mod check failed for ${entry.modId}: ${err.message ?? "unknown error"}`,
          executionTime: 0,
          timestamp: new Date(),
        };
      }
    }),
  );
  return aggregateResults(hc.id, perMod, startedAt);
}

export function aggregateResults(
  checkId: string,
  results: IHealthCheckResult[],
  startedAt: number,
): IHealthCheckResult {
  const order: HealthCheckSeverity[] = [
    HealthCheckSeverity.Info,
    HealthCheckSeverity.Warning,
    HealthCheckSeverity.Error,
    HealthCheckSeverity.Critical,
  ];
  let worst = HealthCheckSeverity.Info;
  for (const r of results) {
    if (order.indexOf(r.severity) > order.indexOf(worst)) {
      worst = r.severity;
    }
  }
  const failed = results.filter(
    (r) => r.status === "failed" || r.status === "error",
  );
  const warning = results.filter((r) => r.status === "warning");
  let status: IHealthCheckResult["status"] = "passed";
  if (failed.length > 0) status = "failed";
  else if (warning.length > 0) status = "warning";

  return {
    checkId,
    status,
    severity: worst,
    message:
      status === "passed"
        ? `${results.length} mods checked, all clean`
        : `${failed.length} failed / ${warning.length} warned of ${results.length} mods`,
    details: results
      .filter((r) => r.status !== "passed")
      .map((r) => `[${r.severity}] ${r.message}`)
      .join("\n"),
    executionTime: Date.now() - startedAt,
    timestamp: new Date(),
  };
}
