import { describe, test, expect } from "vitest";

import { HealthCheckSeverity } from "../../../types/IHealthCheck";
import { aggregateResults } from "./perModRunner";

const baseResult = (
  status: "passed" | "failed" | "warning" | "error",
  severity: HealthCheckSeverity,
  message = "",
) => ({
  checkId: "x",
  status,
  severity,
  message,
  executionTime: 0,
  timestamp: new Date(0),
});

describe("aggregateResults", () => {
  test("all-clean → passed/info", () => {
    const r = aggregateResults(
      "agg",
      [
        baseResult("passed", HealthCheckSeverity.Info),
        baseResult("passed", HealthCheckSeverity.Info),
      ],
      0,
    );
    expect(r.status).toBe("passed");
    expect(r.severity).toBe(HealthCheckSeverity.Info);
    expect(r.message).toContain("2 mods checked");
  });

  test("any failure escalates status and severity", () => {
    const r = aggregateResults(
      "agg",
      [
        baseResult("passed", HealthCheckSeverity.Info),
        baseResult("failed", HealthCheckSeverity.Error, "broken"),
      ],
      0,
    );
    expect(r.status).toBe("failed");
    expect(r.severity).toBe(HealthCheckSeverity.Error);
    expect(r.details).toContain("broken");
  });

  test("worst severity wins even if status is the same", () => {
    const r = aggregateResults(
      "agg",
      [
        baseResult("warning", HealthCheckSeverity.Warning),
        baseResult("warning", HealthCheckSeverity.Critical),
      ],
      0,
    );
    expect(r.severity).toBe(HealthCheckSeverity.Critical);
  });

  test("warnings without failures → status warning", () => {
    const r = aggregateResults(
      "agg",
      [
        baseResult("passed", HealthCheckSeverity.Info),
        baseResult("warning", HealthCheckSeverity.Warning, "outdated"),
      ],
      0,
    );
    expect(r.status).toBe("warning");
    expect(r.severity).toBe(HealthCheckSeverity.Warning);
    expect(r.details).toMatch(/\[warning\].*outdated/);
  });

  test("empty results → passed", () => {
    const r = aggregateResults("agg", [], 0);
    expect(r.status).toBe("passed");
  });
});
