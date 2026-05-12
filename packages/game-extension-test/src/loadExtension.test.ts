import * as path from "node:path";

import { describe, test, expect } from "vitest";

import { loadExtension } from "./loadExtension";

const FIXTURE_DIR = path.join(__dirname, "__fixtures__/fake-extension");

describe("loadExtension", () => {
  test("captures installer registration", async () => {
    const ext = await loadExtension(FIXTURE_DIR);
    expect(ext.installers).toHaveLength(1);
    expect(ext.installers[0]?.id).toBe("fake");
    expect(ext.installers[0]?.priority).toBe(50);
    expect(ext.gameId).toBe("fake");
  });

  test("exposes test descriptor", async () => {
    const ext = await loadExtension(FIXTURE_DIR);
    expect(ext.testDescriptor.gameId).toBe("fake");
  });

  test("exposes diagnostic", async () => {
    const ext = await loadExtension(FIXTURE_DIR);
    expect(ext.healthChecks).toHaveLength(1);
    expect(ext.healthChecks[0]?.id).toBe("fake-check");
  });
});
