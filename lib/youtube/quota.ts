export const UNIT_COST = {
  "search.list": 100,
  "videos.list": 1,
  "channels.list": 1,
  "playlistItems.list": 1,
  "commentThreads.list": 1,
} as const;

export type Endpoint = keyof typeof UNIT_COST;

export class QuotaBudgetError extends Error {
  constructor(public endpoint: Endpoint, public needed: number, public remaining: number) {
    super(`Quota budget exhausted: ${endpoint} needs ${needed}, ${remaining} left in run budget`);
    this.name = "QuotaBudgetError";
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super("YouTube daily quota exceeded (403 quotaExceeded)");
    this.name = "QuotaExceededError";
  }
}

/**
 * Tracks YouTube API units against a per-run budget. Units are charged *before* the call
 * (YouTube bills failed requests too) so the budget is never overshot.
 */
export class QuotaManager {
  used = 0;
  calls: Partial<Record<Endpoint, number>> = {};
  units: Partial<Record<Endpoint, number>> = {};
  /** Set when YouTube itself returned quotaExceeded: no further calls this run. */
  dailyExhausted = false;

  constructor(public budget: number, initialUsed = 0) {
    this.used = initialUsed;
  }

  remaining() {
    return Math.max(0, this.budget - this.used);
  }

  canAfford(endpoint: Endpoint, times = 1) {
    return !this.dailyExhausted && this.remaining() >= UNIT_COST[endpoint] * times;
  }

  charge(endpoint: Endpoint) {
    if (this.dailyExhausted) throw new QuotaExceededError();
    const cost = UNIT_COST[endpoint];
    if (this.remaining() < cost) throw new QuotaBudgetError(endpoint, cost, this.remaining());
    this.used += cost;
    this.calls[endpoint] = (this.calls[endpoint] ?? 0) + 1;
    this.units[endpoint] = (this.units[endpoint] ?? 0) + cost;
  }

  markDailyExhausted() {
    this.dailyExhausted = true;
  }

  summary() {
    return { budget: this.budget, used: this.used, calls: this.calls, units: this.units, dailyExhausted: this.dailyExhausted };
  }
}
