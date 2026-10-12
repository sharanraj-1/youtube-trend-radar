import { log } from "./log";

export class HttpError extends Error {
  constructor(
    public service: string,
    public status: number,
    public body: string,
    public reason?: string,
  ) {
    super(`${service} HTTP ${status}${reason ? ` (${reason})` : ""}`);
    this.name = "HttpError";
  }
}

export interface RetryOptions {
  service: string;
  /** Total attempts, default 4. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying (e.g. 4xx other than 429). */
  shouldRetry?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with jitter: uniformly random in [cap/2, cap]. */
export function backoffDelay(attempt: number, base = 800, max = 20_000, rand = Math.random) {
  const cap = Math.min(max, base * 2 ** attempt);
  return Math.round(cap / 2 + rand() * (cap / 2));
}

export function defaultShouldRetry(err: unknown) {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true; // network errors / timeouts
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const should = opts.shouldRetry ?? defaultShouldRetry;
  const doSleep = opts.sleep ?? sleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const started = Date.now();
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const retryable = should(err);
      log.warn("external call failed", {
        service: opts.service,
        attempt: attempt + 1,
        ms: Date.now() - started,
        retryable,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!retryable || attempt === attempts - 1) break;
      await doSleep(backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs));
    }
  }
  throw lastErr;
}

/** fetch with a hard timeout; throws HttpError on non-2xx. */
export async function fetchJson<T>(service: string, url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    let reason: string | undefined;
    try {
      const j = JSON.parse(text);
      reason = j?.error?.errors?.[0]?.reason ?? j?.error?.status ?? j?.description ?? j?.message;
    } catch {
      // non-JSON error body
    }
    throw new HttpError(service, res.status, text.slice(0, 500), reason);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
