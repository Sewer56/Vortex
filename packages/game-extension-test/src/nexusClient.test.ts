import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub @nexusmods/nexus-api before importing the module under test.
// The implementation uses `Nexus.create(...)` (static factory), so we mock the
// default export as a class with a static `create` method that returns an
// instance of the fake.
// ---------------------------------------------------------------------------

const fakeNexus = {
  getTrending: vi.fn((_g: string) =>
    Promise.resolve([
      { mod_id: 1, name: "A" },
      { mod_id: 2, name: "B" },
      { mod_id: 3, name: "C" },
    ]),
  ),
  getLatestAdded: vi.fn((_g: string) =>
    Promise.resolve([
      { mod_id: 10, name: "R1" },
      { mod_id: 11, name: "R2" },
    ]),
  ),
  getLatestUpdated: vi.fn((_g: string) =>
    Promise.resolve([
      { mod_id: 100, name: "U1" },
      { mod_id: 101, name: "U2" },
    ]),
  ),
  getModFiles: vi.fn((_modId: number, _g: string) =>
    Promise.resolve({
      files: [
        {
          file_id: 5,
          name: "v1.zip",
          uploaded_timestamp: 0,
          content_preview_link: "https://example.test/file.json",
        },
      ],
    }),
  ),
};

vi.mock("@nexusmods/nexus-api", () => {
  return {
    default: class FakeNexus {
      static create(_key: string, ..._rest: unknown[]) {
        return Promise.resolve(fakeNexus);
      }
    },
  };
});

// Also stub `limiter` so the rate-limiter doesn't actually delay tests.
vi.mock("limiter", () => {
  return {
    RateLimiter: class {
      removeTokens(_n: number) {
        return Promise.resolve(1);
      }
    },
  };
});

import { createNexusClient } from "./nexusClient";

describe("nexusClient", () => {
  let client: ReturnType<typeof createNexusClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createNexusClient("test-key");
  });

  // -------------------------------------------------------------------------
  // listMostPopular
  // -------------------------------------------------------------------------

  test("listMostPopular calls getTrending and truncates to limit", async () => {
    const mods = await client.listMostPopular("xrebirth", 2);
    expect(fakeNexus.getTrending).toHaveBeenCalledWith("xrebirth");
    expect(mods).toHaveLength(2);
    expect(mods[0]).toEqual({ modId: 1, name: "A" });
    expect(mods[1]).toEqual({ modId: 2, name: "B" });
  });

  test("listMostPopular returns all results when limit exceeds length", async () => {
    const mods = await client.listMostPopular("xrebirth", 99);
    expect(mods).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // listMostRecent
  // -------------------------------------------------------------------------

  test("listMostRecent calls getLatestAdded and maps modId/name", async () => {
    const mods = await client.listMostRecent("xrebirth", 5);
    expect(fakeNexus.getLatestAdded).toHaveBeenCalledWith("xrebirth");
    expect(mods.map((m) => m.modId)).toEqual([10, 11]);
    expect(mods[0]?.name).toBe("R1");
  });

  test("listMostRecent truncates to limit", async () => {
    const mods = await client.listMostRecent("xrebirth", 1);
    expect(mods).toHaveLength(1);
    expect(mods[0]?.modId).toBe(10);
  });

  // -------------------------------------------------------------------------
  // listOldest
  // -------------------------------------------------------------------------

  test("listOldest calls getLatestUpdated and reverses the list", async () => {
    const mods = await client.listOldest("xrebirth", 5);
    expect(fakeNexus.getLatestUpdated).toHaveBeenCalledWith("xrebirth");
    // Implementation reverses getLatestUpdated, so U2 (mod_id 101) comes first.
    expect(mods[0]?.modId).toBe(101);
    expect(mods[1]?.modId).toBe(100);
  });

  test("listOldest truncates after reversing", async () => {
    const mods = await client.listOldest("xrebirth", 1);
    expect(mods).toHaveLength(1);
    expect(mods[0]?.modId).toBe(101);
  });

  // -------------------------------------------------------------------------
  // listModFiles
  // -------------------------------------------------------------------------

  test("listModFiles calls getModFiles with (modId, gameDomain)", async () => {
    await client.listModFiles("xrebirth", 42);
    expect(fakeNexus.getModFiles).toHaveBeenCalledWith(42, "xrebirth");
  });

  test("listModFiles maps file_id → fileId, name, uploaded_timestamp → uploadedAt Date", async () => {
    const files = await client.listModFiles("xrebirth", 1);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      fileId: 5,
      name: "v1.zip",
      contentPreviewLink: "https://example.test/file.json",
    });
    expect(files[0]?.uploadedAt).toEqual(new Date(0));
  });

  // -------------------------------------------------------------------------
  // listAllMods – paginated GraphQL fetch.
  // -------------------------------------------------------------------------

  test("listAllMods paginates until totalCount reached", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1;
      const body =
        call === 1
          ? {
              data: {
                mods: {
                  totalCount: 3,
                  nodes: [
                    { modId: 1, name: "A" },
                    { modId: 2, name: "B" },
                  ],
                },
              },
            }
          : { data: { mods: { totalCount: 3, nodes: [{ modId: 3, name: "C" }] } } };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const mods = await client.listAllMods("xrebirth");
    expect(mods).toEqual([
      { modId: 1, name: "A" },
      { modId: 2, name: "B" },
      { modId: 3, name: "C" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  test("listAllMods surfaces GraphQL errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ errors: [{ message: "boom" }] }),
      }),
    );
    await expect(client.listAllMods("xrebirth")).rejects.toThrow(/boom/);
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // getFileManifest – fetches preview JSON and flattens into file paths.
  // -------------------------------------------------------------------------

  test("getFileManifest flattens preview tree to file paths", async () => {
    const tree = {
      children: [
        {
          path: "Mod",
          name: "Mod",
          type: "directory",
          children: [
            { path: "Mod/content.xml", name: "content.xml", type: "file", size: "1 kB" },
            {
              path: "Mod/sub",
              name: "sub",
              type: "directory",
              children: [
                { path: "Mod/sub/data.bin", name: "data.bin", type: "file", size: "2 kB" },
              ],
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(tree),
    });
    vi.stubGlobal("fetch", fetchMock);

    const paths = await client.getFileManifest("https://example.test/file.json");
    expect(paths).toEqual(["Mod/content.xml", "Mod/sub/data.bin"]);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/file.json");
    vi.unstubAllGlobals();
  });

  test("getFileManifest throws on empty link", async () => {
    await expect(client.getFileManifest("")).rejects.toThrow(/empty/i);
  });

  test("getFileManifest throws on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    );
    await expect(client.getFileManifest("https://example.test/missing.json")).rejects.toThrow(
      /HTTP 404/,
    );
    vi.unstubAllGlobals();
  });
});
