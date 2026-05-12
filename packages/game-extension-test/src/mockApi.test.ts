import { describe, test, expect } from "vitest";
import { fs } from "vortex-api/testing";

import { buildMockApi } from "./mockApi";
import type { IGameExtensionTestDescriptor } from "./types";

function makeDescriptor(
  overrides: Partial<IGameExtensionTestDescriptor> = {},
): IGameExtensionTestDescriptor {
  return {
    gameId: "fake",
    nexusGameDomain: "fake",
    fixtures: { mostPopular: 0, mostRecent: 0, oldest: 0, allCollections: false, all: false },
    syntheticContent: {},
    ...overrides,
  };
}

const fixtureCtx = { manifestId: "m-1", modId: 1, fileId: 1 };

describe("buildMockApi", () => {
  test("returned api.getState() exposes the descriptor's active gameId", () => {
    const { api } = buildMockApi(makeDescriptor({ gameId: "xrebirth" }), [], fixtureCtx);
    const state = (
      api as { getState: () => { session: { base: { activeGameId: string } } } }
    ).getState();
    expect(state.session.base.activeGameId).toBe("xrebirth");
  });

  test("primes fs.readFileAsync to return synthetic content keyed by basename", async () => {
    buildMockApi(
      makeDescriptor({ syntheticContent: { "content.xml": () => '<content id="foo"/>' } }),
      ["content.xml"],
      fixtureCtx,
    );

    const buf = await fs.readFileAsync("/anywhere/content.xml", { encoding: "utf8" });
    expect(buf.toString("utf8")).toBe('<content id="foo"/>');
  });

  test("unknown filenames resolve to an empty buffer", async () => {
    buildMockApi(makeDescriptor(), [], fixtureCtx);
    const buf = await fs.readFileAsync("/anywhere/unknown.bin");
    expect(buf.length).toBe(0);
  });

  test("backslash paths resolve via basename too", async () => {
    buildMockApi(
      makeDescriptor({ syntheticContent: { "content.xml": () => "<content/>" } }),
      [],
      fixtureCtx,
    );
    const buf = await fs.readFileAsync("C:\\some\\nested\\content.xml");
    expect(buf.toString("utf8")).toBe("<content/>");
  });

  test("readFileCalls captures every readFileAsync invocation", async () => {
    const { readFileCalls } = buildMockApi(makeDescriptor(), [], fixtureCtx);
    await fs.readFileAsync("/a/b.xml");
    await fs.readFileAsync("/c/d.txt");
    expect(readFileCalls.map((c) => c.path)).toEqual(["/a/b.xml", "/c/d.txt"]);
  });
});
