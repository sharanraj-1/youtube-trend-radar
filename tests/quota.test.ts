import { describe, expect, it } from "vitest";
import { QuotaBudgetError, QuotaExceededError, QuotaManager, UNIT_COST } from "@/lib/youtube/quota";

describe("QuotaManager", () => {
  it("knows the documented unit costs", () => {
    expect(UNIT_COST["search.list"]).toBe(100);
    expect(UNIT_COST["videos.list"]).toBe(1);
    expect(UNIT_COST["channels.list"]).toBe(1);
    expect(UNIT_COST["playlistItems.list"]).toBe(1);
    expect(UNIT_COST["commentThreads.list"]).toBe(1);
  });

  it("charges units and tracks per-endpoint usage", () => {
    const q = new QuotaManager(1000);
    q.charge("search.list");
    q.charge("videos.list");
    q.charge("videos.list");
    expect(q.used).toBe(102);
    expect(q.summary().calls).toEqual({ "search.list": 1, "videos.list": 2 });
    expect(q.remaining()).toBe(898);
  });

  it("refuses calls that would exceed the run budget (never overshoots)", () => {
    const q = new QuotaManager(150);
    q.charge("search.list");
    expect(q.canAfford("search.list")).toBe(false);
    expect(() => q.charge("search.list")).toThrow(QuotaBudgetError);
    expect(q.used).toBe(100);
    expect(q.canAfford("videos.list", 50)).toBe(true);
  });

  it("resumes from units already used by earlier stage invocations", () => {
    const q = new QuotaManager(500, 450);
    expect(q.remaining()).toBe(50);
    expect(q.canAfford("search.list")).toBe(false);
  });

  it("stops everything once YouTube reports quotaExceeded", () => {
    const q = new QuotaManager(10_000);
    q.markDailyExhausted();
    expect(q.canAfford("videos.list")).toBe(false);
    expect(() => q.charge("videos.list")).toThrow(QuotaExceededError);
  });
});
