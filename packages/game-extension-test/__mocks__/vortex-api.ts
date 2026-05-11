/**
 * Default `vortex-api` mock used when the harness loads an extension's source.
 *
 * Per-fixture overrides (synthetic file content, etc.) are applied by the
 * harness at runtime via setReadFileResolver before driving the installer.
 * Tests for individual harness modules can override the mock fns directly
 * via vi.mocked().
 */
import { vi } from "vitest";

export class DataInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataInvalid";
  }
}

export class ProcessCanceled extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessCanceled";
  }
}

/**
 * Module-level mutable resolver. The harness's runner is sequential per game,
 * so the resolver is safe to mutate between fixtures. If the runner ever
 * parallelises fixtures, replace this with a context-keyed lookup — concurrent
 * fixtures would otherwise read each other's synthetic content.
 */
let readFileResolver: (absPath: string) => Promise<Buffer> = async () => Buffer.alloc(0);

export function setReadFileResolver(resolver: (absPath: string) => Promise<Buffer>) {
  readFileResolver = resolver;
}

export const fs = {
  readFileAsync: vi.fn(async (absPath: string, _opts?: any) => {
    return readFileResolver(absPath);
  }),
};

export const util = {
  DataInvalid,
  ProcessCanceled,
  SevenZip: class {},
  walk: vi.fn(),
};

export const log = vi.fn();

// `types` namespace is re-exported as an empty object at runtime; extensions
// using `vortex-api.types` import them as compile-time only.
export const types = {};
