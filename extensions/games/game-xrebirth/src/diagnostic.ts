import * as path from "node:path";

import { XREBIRTH_STOP_PATTERNS } from "./stopPatterns";

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

    if (mod.files.length === 0) {
      issues.push("installer produced no files");
    }

    const hasContentXml = mod.files.some((f) => path.basename(f).toLowerCase() === "content.xml");
    const stopPatternRegexes = XREBIRTH_STOP_PATTERNS.map((p) => new RegExp(p, "i"));
    const matchesStopPattern = mod.files.some((f) => stopPatternRegexes.some((re) => re.test(f)));
    const modType = mod.attributes.modType as string | undefined;
    const TAGGED_NON_CONTENT_XML = new Set([
      "xrebirth-savegame",
      "xrebirth-shader-injector",
      "xrebirth-utility",
      "xrebirth-documentation",
    ]);
    const taggedNonContentXml = modType !== undefined && TAGGED_NON_CONTENT_XML.has(modType);

    if (hasContentXml) {
      // content.xml mod: also require the customFileName attribute, since that's
      // what the content.xml installer always sets.
      if (mod.attributes.customFileName === undefined) {
        issues.push("content.xml mod missing customFileName attribute");
      }
    } else if (!matchesStopPattern && !taggedNonContentXml) {
      // Not a content.xml mod, not matching any stop pattern, and not tagged
      // as a known non-content-xml shape (savegame/shader). Reject.
      issues.push(
        "install output has no content.xml, no stop-pattern matches, " +
          "and no recognised modType (not a recognisable X Rebirth mod shape)",
      );
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
