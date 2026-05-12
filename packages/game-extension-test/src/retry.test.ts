import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isRetryableStatus, withRetry } from "./retry";

describe("isRetryableStatus", () => {
  it.each([[408], [429], [500], [502], [503], [504], [599]])("returns true for %i", (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([[200], [301], [400], [401], [403], [404], [422], [600]])(
    "returns false for %i",
    (status) => {
      expect(isRetryableStatus(status)).toBe(false);
    },
  );
});

describe("withRetry", () => {
  /**
   * Each scheduled sleep is captured here. We stub `setTimeout` to fire the
   * callback on the next microtask (effectively zero real-time wait) while
   * recording the delay the production code asked for. This lets us assert
   * the exact backoff schedule without making tests slow.
   */
  let sleeps: number[];

  beforeEach(() => {
    sleeps = [];
    // Zero jitter by default — individual tests override when checking bounds.
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      cb: (...args: unknown[]) => void,
      ms: number,
    ) => {
      sleeps.push(ms);
      return Promise.resolve().then(cb) as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the resolved value on first success without sleeping", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("retries when the thrown error has no status (treated as transient)", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { baseDelayMs: 100 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([100]);
  });

  it("retries on retryable HTTP statuses (5xx, 429, 408)", async () => {
    const err = Object.assign(new Error("rate"), { status: 429 });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { baseDelayMs: 50 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects `statusCode` on the error (SDK shape) in addition to `status`", async () => {
    const err = Object.assign(new Error("sdk"), { statusCode: 503 });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { baseDelayMs: 10 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on non-retryable status (4xx other than 408/429)", async () => {
    const err = Object.assign(new Error("bad"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("rethrows the last error after exhausting maxAttempts", async () => {
    const err = Object.assign(new Error("flaky"), { status: 503 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff (base * 2^attempt) with zero jitter", async () => {
    const err = Object.assign(new Error("flaky"), { status: 503 });
    const fn = vi.fn().mockRejectedValue(err);
    await withRetry(fn, { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 10_000 }).catch(() => null);
    // Three sleeps between four attempts: 100, 200, 400.
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("caps each sleep at maxDelayMs", async () => {
    const err = Object.assign(new Error("flaky"), { status: 503 });
    const fn = vi.fn().mockRejectedValue(err);
    await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 2000 }).catch(() => null);
    // Without the cap: 1000, 2000, 4000, 8000. With the cap: 1000, 2000, 2000, 2000.
    expect(sleeps).toEqual([1000, 2000, 2000, 2000]);
  });

  it("jitter keeps each sleep in [base*2^n, base*2^n * 1.5)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const err = Object.assign(new Error("flaky"), { status: 503 });
    const fn = vi.fn().mockRejectedValue(err);
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10_000 }).catch(() => null);
    // Two sleeps: attempt 0 base=100, attempt 1 base=200. Max jitter = base/2.
    expect(sleeps[0]).toBeGreaterThanOrEqual(100);
    expect(sleeps[0]).toBeLessThan(150);
    expect(sleeps[1]).toBeGreaterThanOrEqual(200);
    expect(sleeps[1]).toBeLessThan(300);
  });
});
