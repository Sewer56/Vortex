import { describe, test, expect, vi } from "vitest";

import { FileManifestHttpError, fetchFileManifest } from "./manifest";

describe("fetchFileManifest", () => {
  test("rejects empty link without hitting the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchFileManifest("")).rejects.toThrow(/empty/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test("flattens preview tree into file paths", async () => {
    const tree = {
      children: [
        {
          path: "Mod",
          type: "directory",
          children: [
            { path: "Mod/content.xml", type: "file" },
            {
              path: "Mod/sub",
              type: "directory",
              children: [{ path: "Mod/sub/data.bin", type: "file" }],
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(tree) }),
    );
    const out = await fetchFileManifest("https://example.test/preview.json");
    expect(out).toEqual(["Mod/content.xml", "Mod/sub/data.bin"]);
    vi.unstubAllGlobals();
  });

  test("throws FileManifestHttpError on 404 (non-retryable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    );
    await expect(fetchFileManifest("https://example.test/missing.json")).rejects.toBeInstanceOf(
      FileManifestHttpError,
    );
    vi.unstubAllGlobals();
  });

  test("retries on 503 then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ type: "file", path: "ok.txt" }),
        });
      }),
    );
    const out = await fetchFileManifest("https://example.test/preview.json", { maxAttempts: 3 });
    expect(out).toEqual(["ok.txt"]);
    expect(calls).toBe(2);
    vi.unstubAllGlobals();
  });
});
