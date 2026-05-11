#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as path from "node:path";

import minimist from "minimist";

// pnpm forwards a literal "--" separator into argv; minimist treats "--" as
// stop-parsing, so strip it before parsing flags.
const argv = minimist(process.argv.slice(2).filter((a) => a !== "--"));
const all = argv.all === true || argv.all === "true";
const single = typeof argv.game === "string" ? argv.game : undefined;
const list = typeof argv.games === "string" ? argv.games.split(",") : undefined;

if (!all && !single && !list) {
  console.error("Usage: --all | --game <id> | --games <a,b,c>");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "../../..");
const env = {
  ...process.env,
  GAME_EXT_TEST_REPO: repoRoot,
  GAME_EXT_TEST_GAMES: all ? "all" : (single ?? list?.join(",")),
};

const vitestConfig = path.join(__dirname, "..", "vitest.config.ts");
const entryFile = "src/test-entry.test.ts";

// `verbose` reporter prints each fixture as it completes — useful when one
// run can resolve hundreds of fixtures and execution takes minutes.
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", vitestConfig, "--reporter=verbose", entryFile],
  {
    stdio: "inherit",
    env,
    cwd: path.join(__dirname, ".."),
  },
);
process.exit(result.status ?? 1);
