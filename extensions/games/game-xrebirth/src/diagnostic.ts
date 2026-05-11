import * as path from "node:path";

/**
 * Minimal mirror of the framework's IModHealthCheck shape, kept local to avoid
 * dragging the renderer source tree into this extension's typecheck. The
 * harness consumes this object structurally; if/when the framework types are
 * re-exported via `vortex-api`, the imports can be restored.
 */
type Severity = "info" | "warning" | "error" | "critical";
type Status = "passed" | "failed" | "warning" | "error";

interface IModCheckContext {
  modId: string;
  files: string[];
  readFile: (p: string) => Promise<Buffer>;
  attributes: Record<string, unknown>;
}

interface IModHealthCheck {
  id: string;
  name: string;
  description: string;
  category: "mods";
  severity: Severity;
  triggers: string[];
  checkMod: (
    api: unknown,
    mod: IModCheckContext,
  ) => Promise<{
    checkId: string;
    status: Status;
    severity: Severity;
    message: string;
    details?: string;
    executionTime: number;
    timestamp: Date;
  }>;
}

export const healthCheck: IModHealthCheck = {
  id: "xrebirth-mod-install-valid",
  name: "X Rebirth — mod install valid",
  description: "Verifies that installed X Rebirth mods have the expected structure.",
  category: "mods",
  severity: "warning",
  triggers: ["mods-changed", "manual"],
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

    const severity: Severity = issues.length === 0 ? "info" : "warning";
    const status: Status = issues.length === 0 ? "passed" : "warning";

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
