/**
 * Drift guard for the harness's hand-mirrored `util.declareInstallers` in
 * `__mocks__/vortex-api.ts`. Tests parallel the canonical coverage in
 * `src/renderer/src/util/installerHelpers.test.ts`. If the renderer-side spec
 * model evolves and the mock isn't updated, these assertions should break
 * loudly rather than letting fixture tests pass on stale logic.
 */
import { describe, expect, it } from "vitest";
import { util } from "vortex-api/testing";

interface RegisteredInstaller {
  id: string;
  priority: number;
  testSupported: (
    files: string[],
    gameId: string,
  ) => Promise<{
    supported: boolean;
    requiredFiles: string[];
  }>;
  install: (files: string[]) => Promise<{
    instructions: Array<{ type: string; source?: string; destination?: string; value?: string }>;
  }>;
}

interface FakeContext {
  _installers: RegisteredInstaller[];
  _game?: { id: string; details?: { stopPatterns?: readonly string[] } };
  registerInstaller: (
    id: string,
    priority: number,
    testSupported: RegisteredInstaller["testSupported"],
    install: RegisteredInstaller["install"],
  ) => void;
}

function makeContext(stopPatterns?: readonly string[]): FakeContext {
  const ctx: FakeContext = {
    _installers: [],
    _game: stopPatterns ? { id: "g", details: { stopPatterns } } : undefined,
    registerInstaller: (id, priority, testSupported, install) => {
      ctx._installers.push({ id, priority, testSupported, install });
    },
  };
  return ctx;
}

describe("util.declareInstallers — registration", () => {
  it("calls registerInstaller once per spec, preserving ids and priorities", () => {
    const ctx = makeContext();
    util.declareInstallers(ctx as never, "myGame", [
      {
        id: "specA",
        priority: 50,
        match: { kind: "extensions", list: [".dll"], mode: "any" },
        install: { stripCommonRoot: false },
      },
      {
        id: "specB",
        priority: 60,
        modType: "myGame-bee",
        match: { kind: "extensions", list: [".exe"], mode: "any" },
        install: { stripCommonRoot: true },
      },
    ]);
    expect(ctx._installers.map((i) => ({ id: i.id, priority: i.priority }))).toEqual([
      { id: "myGame-specA", priority: 50 },
      { id: "myGame-bee", priority: 60 },
    ]);
  });
});

describe("util.declareInstallers — match: extensions", () => {
  const ctx = makeContext();
  util.declareInstallers(ctx as never, "g", [
    {
      id: "exts-any",
      priority: 1,
      match: { kind: "extensions", list: [".dll"], mode: "any" },
      install: { stripCommonRoot: false },
    },
    {
      id: "exts-all",
      priority: 2,
      match: { kind: "extensions", list: [".pdf", ".md"], mode: "all" },
      install: { stripCommonRoot: false },
    },
  ]);
  const any = ctx._installers[0]!;
  const all = ctx._installers[1]!;

  it("any: accepts when at least one file matches", async () => {
    await expect(any.testSupported(["a.dll", "b.txt"], "g")).resolves.toMatchObject({
      supported: true,
    });
  });
  it("any: rejects when no file matches", async () => {
    await expect(any.testSupported(["a.txt"], "g")).resolves.toMatchObject({ supported: false });
  });
  it("all: rejects when any file is off-list", async () => {
    await expect(all.testSupported(["a.md", "b.exe"], "g")).resolves.toMatchObject({
      supported: false,
    });
  });
  it("all: accepts when every file matches", async () => {
    await expect(all.testSupported(["a.md", "b.pdf"], "g")).resolves.toMatchObject({
      supported: true,
    });
  });
  it("rejects on gameId mismatch", async () => {
    await expect(any.testSupported(["a.dll"], "other")).resolves.toEqual({
      supported: false,
      requiredFiles: [],
    });
  });
});

describe("util.declareInstallers — match: regex", () => {
  const ctx = makeContext();
  util.declareInstallers(ctx as never, "g", [
    {
      id: "rx",
      priority: 1,
      match: { kind: "regex", patterns: [/\.(zip|7z)$/i], mode: "any" },
      install: { stripCommonRoot: false },
    },
  ]);
  const inst = ctx._installers[0]!;

  it("matches files via regex", async () => {
    await expect(inst.testSupported(["pack.zip", "a.txt"], "g")).resolves.toMatchObject({
      supported: true,
    });
  });
  it("returns the matched file as requiredFiles", async () => {
    await expect(inst.testSupported(["pack.zip", "x.txt"], "g")).resolves.toEqual({
      supported: true,
      requiredFiles: ["pack.zip"],
    });
  });
});

describe("util.declareInstallers — match: filename", () => {
  const ctx = makeContext();
  util.declareInstallers(ctx as never, "g", [
    {
      id: "fn",
      priority: 1,
      match: { kind: "filename", names: ["content.xml"], mode: "any" },
      install: { stripCommonRoot: true },
    },
  ]);
  const inst = ctx._installers[0]!;

  it("matches by basename (case-insensitive)", async () => {
    await expect(inst.testSupported(["wrap/CONTENT.xml"], "g")).resolves.toMatchObject({
      supported: true,
    });
  });
  it("rejects unrelated archives", async () => {
    await expect(inst.testSupported(["a.dll"], "g")).resolves.toMatchObject({ supported: false });
  });
});

describe("util.declareInstallers — match: stopPatterns", () => {
  it("delegates to the registered game's stopPatterns", async () => {
    const ctx = makeContext(["^t/", "\\.cat$"]);
    util.declareInstallers(ctx as never, "g", [
      {
        id: "drop",
        priority: 1,
        match: { kind: "stopPatterns" },
        install: { stripCommonRoot: true },
      },
    ]);
    const inst = ctx._installers[0]!;
    await expect(inst.testSupported(["t/lang.xml"], "g")).resolves.toMatchObject({
      supported: true,
    });
    await expect(inst.testSupported(["data.cat"], "g")).resolves.toMatchObject({ supported: true });
    await expect(inst.testSupported(["readme.txt"], "g")).resolves.toMatchObject({
      supported: false,
    });
  });

  it("returns false when no stopPatterns are registered", async () => {
    const ctx = makeContext();
    util.declareInstallers(ctx as never, "g", [
      {
        id: "drop",
        priority: 1,
        match: { kind: "stopPatterns" },
        install: { stripCommonRoot: true },
      },
    ]);
    const inst = ctx._installers[0]!;
    await expect(inst.testSupported(["data.cat"], "g")).resolves.toMatchObject({
      supported: false,
    });
  });
});

describe("util.declareInstallers — match: custom", () => {
  it("invokes the user predicate with the raw file list", async () => {
    let observed: string[] = [];
    const ctx = makeContext();
    util.declareInstallers(ctx as never, "g", [
      {
        id: "cus",
        priority: 1,
        match: {
          kind: "custom",
          predicate: (files: string[]) => {
            observed = files;
            return files.some((f) => f.endsWith("special.bin"));
          },
        },
        install: { stripCommonRoot: false },
      },
    ]);
    const inst = ctx._installers[0]!;
    await inst.testSupported(["dir/", "special.bin"], "g");
    // The mock mirrors production: custom predicates see directory entries.
    expect(observed).toEqual(["dir/", "special.bin"]);
  });
});

describe("util.declareInstallers — install instructions", () => {
  it("emits copy + setmodtype with stripCommonRoot=false", async () => {
    const ctx = makeContext();
    util.declareInstallers(ctx as never, "g", [
      {
        id: "spec",
        priority: 1,
        modType: "g-keep",
        match: { kind: "extensions", list: [".xml"], mode: "any" },
        install: { stripCommonRoot: false },
      },
    ]);
    const result = await ctx._installers[0]!.install(["wrap/a.xml", "wrap/b.xml"]);
    expect(result.instructions).toEqual([
      { type: "copy", source: "wrap/a.xml", destination: "wrap/a.xml" },
      { type: "copy", source: "wrap/b.xml", destination: "wrap/b.xml" },
      { type: "setmodtype", value: "g-keep" },
    ]);
  });

  it("strips a shared wrapper directory when stripCommonRoot=true", async () => {
    const ctx = makeContext();
    util.declareInstallers(ctx as never, "g", [
      {
        id: "spec",
        priority: 1,
        modType: "g-strip",
        match: { kind: "extensions", list: [".xml"], mode: "any" },
        install: { stripCommonRoot: true },
      },
    ]);
    const result = await ctx._installers[0]!.install(["wrap/a.xml", "wrap/sub/b.xml"]);
    expect(result.instructions).toContainEqual({
      type: "copy",
      source: "wrap/a.xml",
      destination: "a.xml",
    });
    expect(result.instructions).toContainEqual({
      type: "copy",
      source: "wrap/sub/b.xml",
      destination: "sub/b.xml",
    });
  });

  it("omits setmodtype when no modType is configured", async () => {
    const ctx = makeContext();
    util.declareInstallers(ctx as never, "g", [
      {
        id: "no-mt",
        priority: 1,
        match: { kind: "extensions", list: [".xml"], mode: "any" },
        install: { stripCommonRoot: false },
      },
    ]);
    const result = await ctx._installers[0]!.install(["a.xml"]);
    expect(result.instructions.some((i) => i.type === "setmodtype")).toBe(false);
  });
});
