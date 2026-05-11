import { describe, test, expect } from "vitest";

import { fs } from "../__mocks__/vortex-api";
import { buildMockApi } from "./mockApi";

describe("mockApi", () => {
  test("readFileAsync returns synthetic content keyed by basename", async () => {
    const descriptor = {
      gameId: "fake",
      nexusGameDomain: "fake",
      fixtures: { mostPopular: 0, mostRecent: 0, oldest: 0, allCollections: false },
      syntheticContent: {
        "content.xml": () => '<content id="foo"/>',
      },
    };
    buildMockApi(descriptor, ["content.xml"], { manifestId: "m-1", modId: 1, fileId: 1 });

    const buf = await fs.readFileAsync("/anywhere/content.xml", { encoding: "utf8" });
    expect(buf.toString("utf8")).toBe('<content id="foo"/>');
  });

  test("unknown filenames return empty buffer", async () => {
    const descriptor = {
      gameId: "fake",
      nexusGameDomain: "fake",
      fixtures: { mostPopular: 0, mostRecent: 0, oldest: 0, allCollections: false },
      syntheticContent: {},
    };
    buildMockApi(descriptor, [], { manifestId: "m-1", modId: 1, fileId: 1 });

    const buf = await fs.readFileAsync("/anywhere/unknown.bin");
    expect(buf.length).toBe(0);
  });

  test("backslash paths resolve via basename too", async () => {
    const descriptor = {
      gameId: "fake",
      nexusGameDomain: "fake",
      fixtures: { mostPopular: 0, mostRecent: 0, oldest: 0, allCollections: false },
      syntheticContent: {
        "content.xml": () => "<content/>",
      },
    };
    buildMockApi(descriptor, [], { manifestId: "m-1", modId: 1, fileId: 1 });

    const buf = await fs.readFileAsync("C:\\some\\nested\\content.xml");
    expect(buf.toString("utf8")).toBe("<content/>");
  });
});
