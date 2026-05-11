import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, test, expect, beforeEach } from "vitest";

import { discoverExtensions } from "./discovery";

function makeTempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gext-discovery-"));
}

function writePkg(dir: string, content: any) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(content));
}

describe("discoverExtensions", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempRepo();
  });

  test("returns empty when extensions/games is missing", () => {
    expect(discoverExtensions(repo)).toEqual([]);
  });

  test("includes only games with gameExtensionTest === true", () => {
    writePkg(path.join(repo, "extensions/games/opted-in"), {
      name: "opted-in",
      vortex: { gameExtensionTest: true },
    });
    writePkg(path.join(repo, "extensions/games/opted-out"), {
      name: "opted-out",
    });
    writePkg(path.join(repo, "extensions/games/explicit-false"), {
      name: "explicit-false",
      vortex: { gameExtensionTest: false },
    });

    const found = discoverExtensions(repo);
    expect(found.map((f) => f.packageName)).toEqual(["opted-in"]);
  });

  test("ignores entries with malformed package.json", () => {
    fs.mkdirSync(path.join(repo, "extensions/games/broken"), { recursive: true });
    fs.writeFileSync(path.join(repo, "extensions/games/broken/package.json"), "{not json");
    expect(discoverExtensions(repo)).toEqual([]);
  });
});
