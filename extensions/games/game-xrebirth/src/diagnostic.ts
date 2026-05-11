import * as path from "node:path";

// IModHealthCheck and friends live in the renderer source tree at
// src/renderer/src/types/IHealthCheck. The relative path from this extension
// is 5 dirs up. If that path doesn't resolve under the extension's tsconfig,
// declare a local mirror of the interface as a fallback (see note below).
import type { IModHealthCheck } from "../../../../src/renderer/src/types/IHealthCheck";
import {
  HealthCheckCategory,
  HealthCheckSeverity,
  HealthCheckTrigger,
} from "../../../../src/renderer/src/types/IHealthCheck";

export const healthCheck: IModHealthCheck = {
  id: "xrebirth-mod-install-valid",
  name: "X Rebirth — mod install valid",
  description: "Verifies that installed X Rebirth mods have the expected structure.",
  category: HealthCheckCategory.Mods,
  severity: HealthCheckSeverity.Warning,
  triggers: [HealthCheckTrigger.ModsChanged, HealthCheckTrigger.Manual],
  checkMod: async (_api, mod) => {
    const startedAt = Date.now();
    const issues: string[] = [];

    const hasContentXml = mod.files.some((f) => path.basename(f).toLowerCase() === "content.xml");
    if (!hasContentXml) {
      issues.push("missing content.xml after install");
    }

    if (mod.files.length === 0) {
      issues.push("installer produced no files");
    }

    if (mod.attributes.customFileName === undefined) {
      issues.push("customFileName attribute not set");
    }

    const severity = issues.length === 0 ? HealthCheckSeverity.Info : HealthCheckSeverity.Warning;
    const status: "passed" | "warning" = issues.length === 0 ? "passed" : "warning";

    return {
      checkId: "xrebirth-mod-install-valid",
      status,
      severity,
      message:
        issues.length === 0
          ? "X Rebirth mod is well-formed"
          : `X Rebirth mod has ${issues.length} issue(s)`,
      details: issues.join("\n"),
      executionTime: Date.now() - startedAt,
      timestamp: new Date(),
    };
  },
};
