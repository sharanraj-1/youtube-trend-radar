import { describe, expect, it } from "vitest";
import { ageHours, engagementRate, median, outlierMultiple, velocity72h, viewsPerHour } from "@/lib/analysis/metrics";

const h = (n: number) => new Date(Date.UTC(2026, 9, 10) + n * 3_600_000);

describe("outlier and rate math", () => {
  it("outlier multiple = views / channel median", () => {
    expect(outlierMultiple(300_000, 100_000)).toBe(3);
    expect(outlierMultiple(50_000, 100_000)).toBe(0.5);
  });
  it("outlier is null without a usable baseline", () => {
    expect(outlierMultiple(1000, null)).toBeNull();
    expect(outlierMultiple(1000, 0)).toBeNull();
    expect(outlierMultiple(1000, undefined)).toBeNull();
  });
  it("age is floored at 1 hour so brand-new videos don't explode views/hour", () => {
    expect(ageHours(h(0), h(0))).toBe(1);
    expect(ageHours(h(0), h(10))).toBe(10);
    expect(viewsPerHour(1000, 10)).toBe(100);
    expect(viewsPerHour(1000, 0)).toBe(1000);
  });
  it("engagement rate = (likes + comments) / views", () => {
    expect(engagementRate(1000, 40, 10)).toBe(0.05);
    expect(engagementRate(1000, null, null)).toBe(0);
    expect(engagementRate(0, 5, 5)).toBeNull();
  });
  it("median handles odd/even/NaN", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([NaN, 5])).toBe(5);
    expect(median([])).toBeNull();
  });
});

describe("velocity72h", () => {
  it("needs two snapshots at least an hour apart", () => {
    expect(velocity72h([{ capturedAt: h(0), views: 100 }])).toBeNull();
    expect(velocity72h([{ capturedAt: h(0), views: 100 }, { capturedAt: h(0.5), views: 200 }])).toBeNull();
  });
  it("computes views gained per hour within the last 72h window", () => {
    const v = velocity72h([
      { capturedAt: h(0), views: 0 }, // outside 72h window of latest -> ignored
      { capturedAt: h(30), views: 1000 },
      { capturedAt: h(54), views: 3400 },
      { capturedAt: h(78), views: 5800 },
    ]);
    // window start = 78-72 = 6h -> earliest in window is h(30)
    expect(v).toBe((5800 - 1000) / 48);
  });
  it("never reports negative velocity (YouTube view recounts)", () => {
    expect(velocity72h([{ capturedAt: h(0), views: 500 }, { capturedAt: h(24), views: 400 }])).toBe(0);
  });
});
