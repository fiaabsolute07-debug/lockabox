export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type Sleep = (milliseconds: number) => Promise<void>;
export type Clock = () => number;

export interface RateLimiter {
  take(): Promise<void>;
}

export interface LimiterOptions {
  perMinute: number;
  now?: Clock;
  sleep?: Sleep;
}

export interface SourceHttpOptions {
  fetch?: FetchLike;
  sleep?: Sleep;
  timeoutMs?: number;
}

export interface JsonRequestOptions extends RequestInit {
  limiter?: RateLimiter;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * A token bucket with a burst of `perMinute` requests and a one-minute refill
 * window. Requests are serialized so concurrent callers cannot spend the same
 * token. The clock and sleeper are injectable to make spacing deterministic in
 * unit tests.
 */
export function createLimiter({
  perMinute,
  now = Date.now,
  sleep = defaultSleep,
}: LimiterOptions): RateLimiter {
  if (!Number.isFinite(perMinute) || perMinute <= 0) {
    throw new RangeError("perMinute must be a positive number");
  }

  const capacity = perMinute;
  const refillInterval = 60_000 / perMinute;
  let tokens = capacity;
  let lastRefill = now();
  let queue: Promise<void> = Promise.resolve();

  const take = (): Promise<void> => {
    const next = queue.then(async () => {
      for (;;) {
        const current = now();
        const elapsed = current - lastRefill;
        if (elapsed > 0) {
          tokens = Math.min(capacity, tokens + elapsed / refillInterval);
          lastRefill = current;
        }

        if (tokens >= 1) {
          tokens -= 1;
          return;
        }

        const waitFor = Math.max(1, (1 - tokens) * refillInterval);
        await sleep(waitFor);

        // Real sleeps advance Date.now(). A test sleeper is often deliberately
        // immediate, so account for that elapsed interval as well.
        const afterSleep = now();
        if (afterSleep <= current) {
          lastRefill = current + waitFor;
          tokens = Math.min(capacity, tokens + waitFor / refillInterval);
        }
      }
    });

    queue = next.catch(() => undefined);
    return next;
  };

  return { take };
}

export class SourceHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message = `Source request failed (${status})`) {
    super(message);
    this.name = "SourceHttpError";
    this.status = status;
    this.url = url;
  }
}

export class RateLimitedError extends SourceHttpError {
  constructor(url: string, message = "Source rate limit exceeded") {
    super(429, url, message);
    this.name = "RateLimitedError";
  }
}

export class CreditsExhaustedError extends SourceHttpError {
  constructor(url: string, message = "Source API credits exhausted") {
    super(402, url, message);
    this.name = "CreditsExhaustedError";
  }
}

function isSuccessful(response: Response): boolean {
  return response.ok || (response.status >= 200 && response.status < 300);
}

function timeoutSignal(timeoutMs: number, callerSignal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeout;
  return AbortSignal.any([callerSignal, timeout]);
}

export class SourceHttpClient {
  private readonly fetcher: FetchLike;
  private readonly sleep: Sleep;
  private readonly timeoutMs: number;

  constructor(options: SourceHttpOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getJson<T>(url: string | URL, options: JsonRequestOptions = {}): Promise<T> {
    return this.requestJson<T>(url, { ...options, method: "GET" });
  }

  async requestJson<T>(url: string | URL, options: JsonRequestOptions = {}): Promise<T> {
    const resolvedUrl = String(url);
    const { limiter, ...requestInit } = options;
    const headers = new Headers(requestInit.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");

    for (let attempt = 1; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt += 1) {
      await limiter?.take();

      let response: Response;
      try {
        response = await this.fetcher(resolvedUrl, {
          ...requestInit,
          headers,
          signal: timeoutSignal(this.timeoutMs, requestInit.signal),
        });
      } catch (error) {
        // Transport failures are not HTTP source errors. Keeping the original
        // error preserves AbortError/timeout details for the worker to inspect.
        throw error;
      }

      if (isSuccessful(response)) {
        try {
          return (await response.json()) as T;
        } catch (error) {
          throw new SourceHttpError(
            response.status,
            resolvedUrl,
            `Source returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (response.status === 402) {
        throw new CreditsExhaustedError(resolvedUrl);
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < DEFAULT_RETRY_ATTEMPTS) {
        await this.sleep(DEFAULT_RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }

      if (response.status === 429) {
        throw new RateLimitedError(resolvedUrl);
      }
      throw new SourceHttpError(response.status, resolvedUrl);
    }

    // The loop always returns or throws; this is only a guard for future edits.
    throw new SourceHttpError(500, resolvedUrl);
  }
}

export function createHttpClient(options: SourceHttpOptions = {}): SourceHttpClient {
  return new SourceHttpClient(options);
}

export const HTTP_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
