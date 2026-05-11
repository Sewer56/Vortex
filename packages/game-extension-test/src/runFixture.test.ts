import * as path from "node:path";

import { describe, test, expect } from "vitest";

import { loadExtension } from "./loadExtension";
import { runFixture } from "./runFixture";

const FIXTURE_DIR = path.join(__dirname, "__fixtures__/fake-extension");

describe("runFixture", () => {
  test("happy-path fixture passes through to healthcheck", async () => {
    const ext = await loadExtension(FIXTURE_DIR);
    const result = await runFixture(
      ext,
      { origin: "mostPopular", modId: 1, fileId: 1, fileName: "file.zip", contentPreviewLink: "" },
      ["readme.txt", "data/textures.dat"],
    );
    expect(result.kind).toBe("passed");
  });

  test("rejected by testSupported returns kind=rejected", async () => {
    // Load a synthetic extension whose installer rejects.
    const ext = await loadExtension(FIXTURE_DIR);
    // Override the installer.testSupported to always return supported=false.
    ext.installer.testSupported = async () => ({ supported: false, requiredFiles: [] });
    const result = await runFixture(
      ext,
      { origin: "mostPopular", modId: 2, fileId: 2, fileName: "x.zip", contentPreviewLink: "" },
      ["whatever.txt"],
    );
    expect(result.kind).toBe("rejected");
  });

  test("install throw produces kind=failed", async () => {
    const ext = await loadExtension(FIXTURE_DIR);
    ext.installer.install = async () => {
      throw new Error("boom");
    };
    const result = await runFixture(
      ext,
      { origin: "mostPopular", modId: 3, fileId: 3, fileName: "y.zip", contentPreviewLink: "" },
      ["whatever.txt"],
    );
    expect(result.kind).toBe("failed");
    expect((result as any).issues[0]).toMatch(/boom/);
  });
});
