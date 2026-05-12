/**
 * Shared retry primitive used by both the Nexus SDK wrapper and direct CDN
 * fetches. Wraps a thunk; retries on transient failures with exponential
 * backoff plus jitter, capped per sleep. Errors are treated as transient when:
 *   - no `statusCode`/`status` is set on the error (network-level failure), or
 *   - the status is 408, 429, or 5xx.
 *
 * Callers needing different shapes (e.g. `fetch` returning Response without
 * throwing) should throw a marker error themselves on retryable HTTP statuses.
 */
export interface IRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: IRetryOptions = {}): Promise<T> {
  const { maxAttempts = 4, baseDelayMs = 500, maxDelayMs = 10_000 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const status =
        typeof err === "object" && err !== null && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : typeof err === "object" && err !== null && "status" in err
            ? (err as { status: number }).status
            : undefined;

      const transient = status === undefined || isRetryableStatus(status);
      if (!transient || attempt === maxAttempts - 1) {
        throw err;
      }

      const base = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * base * 0.5;
      await sleep(Math.min(base + jitter, maxDelayMs));
    }
  }
  throw lastErr;
}
