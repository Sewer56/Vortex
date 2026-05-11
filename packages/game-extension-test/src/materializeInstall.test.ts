import { describe, test, expect } from "vitest";

import { materializeInstall } from "./materializeInstall";

describe("materializeInstall", () => {
  test("collects copy destinations as files", () => {
    const ctx = materializeInstall(
      "mod-x",
      [
        { type: "copy", source: "a", destination: "foo/bar.txt" } as any,
        { type: "copy", source: "b", destination: "foo/baz.txt" } as any,
      ],
      async () => Buffer.alloc(0),
    );
    expect(ctx.files).toEqual(["foo/bar.txt", "foo/baz.txt"]);
  });

  test("collects attribute instructions into attributes map", () => {
    const ctx = materializeInstall(
      "mod-x",
      [
        { type: "attribute", key: "author", value: "x" } as any,
        { type: "attribute", key: "version", value: "1.0" } as any,
      ],
      async () => Buffer.alloc(0),
    );
    expect(ctx.attributes).toEqual({ author: "x", version: "1.0" });
  });

  test("readFile delegates to provided resolver, keyed by basename", async () => {
    const ctx = materializeInstall("mod-x", [], async (basename) =>
      Buffer.from(basename + "-bytes", "utf8"),
    );
    const buf = await ctx.readFile("nested/path/file.xml");
    expect(buf.toString("utf8")).toBe("file.xml-bytes");
  });

  test("ignores non-copy / non-attribute instructions", () => {
    const ctx = materializeInstall(
      "mod-x",
      [
        { type: "mkdir", destination: "subdir" } as any,
        { type: "generatefile", destination: "z" } as any,
        { type: "copy", source: "a", destination: "kept.txt" } as any,
      ],
      async () => Buffer.alloc(0),
    );
    expect(ctx.files).toEqual(["kept.txt"]);
  });
});
