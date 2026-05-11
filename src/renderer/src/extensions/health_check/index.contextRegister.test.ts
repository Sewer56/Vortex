import { describe, test, expect, vi } from "vitest";

// Mock util/api to avoid import-time side-effects: Steam constructor calls
// ApplicationData.instance which is not initialised in a test environment.
vi.mock("../../util/api", () => ({
  getGame: vi.fn(),
  toPromise: vi.fn(),
  activeGameId: vi.fn(),
  nexusGameId: vi.fn(),
}));

// Also mock the modRequirementsCheck module for the same reason.
vi.mock("./checks/modRequirementsCheck", () => ({
  MOD_REQUIREMENTS_CHECK_ID: "nexus-mod-requirements",
  checkModRequirements: vi.fn().mockResolvedValue({
    checkId: "nexus-mod-requirements",
    status: "passed",
    severity: "info",
    message: "mocked",
    executionTime: 0,
    timestamp: new Date(0),
  }),
}));

import {
  HealthCheckCategory,
  HealthCheckSeverity,
  HealthCheckTrigger,
} from "../../types/IHealthCheck";

describe("context.registerHealthCheck", () => {
  test("buffers a registration before once() and assigns the function", async () => {
    // Minimal stub context that captures registerHealthCheck + once callback.
    let onceCallback: (() => void) | undefined;
    const stub: any = {
      registerReducer: vi.fn(),
      registerSettings: vi.fn(),
      registerMainPage: vi.fn(),
      once: (cb: () => void) => {
        onceCallback = cb;
      },
      onStateChange: vi.fn(),
      api: {
        store: { getState: () => ({}), dispatch: vi.fn() },
        onStateChange: vi.fn(),
      },
    };

    // Import the health_check extension. May have static imports of UI views; we
    // accept that the import side-effects load but should not throw.
    const mod = await import("./index");
    const init = mod.default ?? (mod as any).init;
    if (typeof init !== "function") {
      throw new Error("health_check/index did not export init() as default");
    }
    init(stub);

    expect(typeof stub.registerHealthCheck).toBe("function");

    // Register an IHealthCheck before once() fires — should buffer without throwing.
    stub.registerHealthCheck({
      id: "external",
      name: "external",
      description: "",
      category: HealthCheckCategory.Mods,
      severity: HealthCheckSeverity.Info,
      triggers: [HealthCheckTrigger.Manual],
      check: async () => ({
        checkId: "external",
        status: "passed",
        severity: HealthCheckSeverity.Info,
        message: "ok",
        executionTime: 0,
        timestamp: new Date(0),
      }),
    });

    // Fire once() — buffer should drain into the (real) registry without error.
    expect(onceCallback).toBeDefined();
    expect(() => onceCallback!()).not.toThrow();
  });
});
