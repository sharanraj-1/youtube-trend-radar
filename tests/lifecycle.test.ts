import { describe, expect, it } from "vitest";
import { assignLifecycle, matchPrior, rankingOutlier, scoreCluster, wowChannelGrowth, type PriorCluster } from "@/lib/analysis/lifecycle";

const base = { hasHistory: true, seenInPrior4Weeks: true, prev: null, recentShare: 0.5, wowGrowth: 0 };

describe("assignLifecycle (with history)", () => {
  it("emerging: unseen in prior 4 weeks, 2-5 channels, outlier > 1.5", () => {
    expect(assignLifecycle({ ...base, seenInPrior4Weeks: false, channels: 3, medianOutlier: 2.1 }).lifecycle).toBe("emerging");
  });
  it("not emerging with 6+ channels", () => {
    expect(assignLifecycle({ ...base, seenInPrior4Weeks: false, channels: 6, medianOutlier: 2.1, wowGrowth: 1 }).lifecycle).toBe("rising");
  });
  it("rising: growth > 0.5 and outlier > 1.2", () => {
    expect(assignLifecycle({ ...base, channels: 4, medianOutlier: 1.3, wowGrowth: 0.6 }).lifecycle).toBe("rising");
    expect(assignLifecycle({ ...base, channels: 4, medianOutlier: 1.3, wowGrowth: 0.5 }).lifecycle).not.toBe("rising");
  });
  it("peaking: 6+ channels and outlier flat/declining", () => {
    const r = assignLifecycle({ ...base, channels: 8, medianOutlier: 1.1, prev: { lifecycle: "rising", medianOutlier: 1.4 } });
    expect(r.lifecycle).toBe("peaking");
  });
  it("saturated: peaking two weeks running", () => {
    const r = assignLifecycle({ ...base, channels: 9, medianOutlier: 1.0, prev: { lifecycle: "peaking", medianOutlier: 1.2 } });
    expect(r.lifecycle).toBe("saturated");
  });
  it("saturated: median outlier < 0.8 regardless of anything else", () => {
    expect(assignLifecycle({ ...base, seenInPrior4Weeks: false, channels: 3, medianOutlier: 0.7, wowGrowth: 2 }).lifecycle).toBe("saturated");
  });
  it("normal confidence with history", () => {
    expect(assignLifecycle({ ...base, channels: 3, medianOutlier: 1 }).confidence).toBe("normal");
  });
});

describe("assignLifecycle (first-ever run)", () => {
  const first = { ...base, hasHistory: false, seenInPrior4Weeks: false };
  it("marks confidence low", () => {
    expect(assignLifecycle({ ...first, channels: 3, medianOutlier: 2 }).confidence).toBe("low");
  });
  it("uses within-week signals: few creators + strong outlier -> emerging", () => {
    expect(assignLifecycle({ ...first, channels: 3, medianOutlier: 2 }).lifecycle).toBe("emerging");
  });
  it("many creators with mostly older posts -> peaking", () => {
    expect(assignLifecycle({ ...first, channels: 8, medianOutlier: 1.3, recentShare: 0.2 }).lifecycle).toBe("peaking");
  });
  it("many creators, recent burst, outperforming -> rising", () => {
    expect(assignLifecycle({ ...first, channels: 8, medianOutlier: 1.6, recentShare: 0.7 }).lifecycle).toBe("rising");
  });
});

describe("wowChannelGrowth", () => {
  const prev = { distinctChannels: 4 } as PriorCluster;
  it("relative growth vs last week", () => expect(wowChannelGrowth(6, prev, true)).toBe(0.5));
  it("new cluster with history counts as growth 1", () => expect(wowChannelGrowth(3, null, true)).toBe(1));
  it("first-ever run has no growth signal", () => expect(wowChannelGrowth(3, null, false)).toBe(0));
  it("is clamped", () => expect(wowChannelGrowth(40, { distinctChannels: 2 } as PriorCluster, true)).toBe(3));
});

describe("scoreCluster", () => {
  it("implements 1.0*ln(1+ch) + 1.5*outlier + 1.0*growth - saturated - 0.8*covered (ranking outlier)", () => {
    const s = scoreCluster({ channels: 4, medianOutlier: 2, wowGrowth: 0.5, saturated: false, alreadyCovered: true });
    expect(s).toBeCloseTo(Math.log(5) + 1.5 * ((4 * 2 + 3) / 7) + 0.5 - 0.8, 3);
  });
  it("two freak videos no longer swamp broad consensus", () => {
    expect(rankingOutlier(192, 2)).toBe(5);
    expect(rankingOutlier(4.2, 12)).toBeCloseTo((12 * 4.2 + 3) / 15, 5);
    expect(rankingOutlier(null, 3)).toBe(1);
  });
  it("penalises saturation", () => {
    const a = scoreCluster({ channels: 4, medianOutlier: 1, wowGrowth: 0, saturated: false, alreadyCovered: false });
    const b = scoreCluster({ channels: 4, medianOutlier: 1, wowGrowth: 0, saturated: true, alreadyCovered: false });
    expect(a - b).toBeCloseTo(1, 5);
  });
});

describe("matchPrior", () => {
  const prior: PriorCluster[] = [
    { id: 1, runId: 1, runStartedAt: new Date(), topEntity: "Cursor", doc: "cursor ai code editor agent mode", distinctChannels: 3, medianOutlier: 1, lifecycle: "emerging" },
    { id: 2, runId: 1, runStartedAt: new Date(), topEntity: null, doc: "budget smartphone under 20000 camera battery review", distinctChannels: 5, medianOutlier: 1, lifecycle: "peaking" },
  ];
  it("matches by same top entity (case-insensitive)", () => {
    expect(matchPrior({ topEntity: "cursor", doc: "totally different words" }, prior)?.id).toBe(1);
  });
  it("matches by TF-IDF similarity >= 0.5", () => {
    expect(matchPrior({ topEntity: null, doc: "budget smartphone under 20000 camera battery review" }, prior)?.id).toBe(2);
  });
  it("returns null when nothing is similar", () => {
    expect(matchPrior({ topEntity: "Notion", doc: "notion ai templates for students" }, prior)).toBeNull();
  });
});
