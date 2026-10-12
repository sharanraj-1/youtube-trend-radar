import { describe, expect, it } from "vitest";
import {
  allowedNumbersFrom,
  disallowedNumbers,
  finalizeNarrative,
  stripNumberSentences,
  validateSynthesis,
  type ValidationCluster,
} from "@/lib/analysis/validate";

const stats = { distinct_channels: 4, video_count: 9, median_outlier_multiple: 2.35, short_share: 0.25, top_entities: ["iPhone 17", "Apple"] };
const cluster: ValidationCluster = {
  id: "11",
  label: "iPhone 17",
  videoIds: ["aaa", "bbb", "ccc"],
  allowedNumbers: allowedNumbersFrom(stats, stats.top_entities),
};
const other: ValidationCluster = { id: "12", label: "Cursor", videoIds: ["ddd", "eee"], allowedNumbers: allowedNumbersFrom({ distinct_channels: 3 }, ["Cursor"]) };

const good = {
  cluster_id: "11",
  theme_name: "iPhone 17 real-world camera tests",
  why_now: "Creators are racing to post camera comparisons and the audience keeps asking about value for money.",
  suggested_angles: ["A creator-focused low-light vlog test", "Should you upgrade from an older iPhone?"],
  evidence_video_ids: ["aaa", "bbb"],
  confidence: "high",
};

describe("validateSynthesis", () => {
  it("accepts a clean entry (product-name digits are allowed)", () => {
    const r = validateSynthesis([good], [cluster]);
    expect(r.errors).toEqual([]);
  });

  it("rejects evidence video IDs that belong to another cluster", () => {
    const r = validateSynthesis([{ ...good, evidence_video_ids: ["aaa", "ddd"] }], [cluster]);
    expect(r.errors.join(" ")).toMatch(/evidence_video_ids not in this cluster: ddd/);
  });

  it("rejects invented numbers in why_now and theme_name", () => {
    const r = validateSynthesis(
      [{ ...good, theme_name: "iPhone 17 hits 5M views", why_now: "Videos are getting 3.5x normal views across 12 channels." }],
      [cluster],
    );
    const errs = r.errors.join(" ");
    expect(errs).toMatch(/theme_name contains numbers \(5\)/);
    expect(errs).toMatch(/why_now contains numbers \(3\.5, 12\)/);
  });

  it("allows numbers that come from the cluster stats", () => {
    expect(disallowedNumbers("Four creators, median 2.35 outlier", cluster.allowedNumbers)).toEqual([]);
    expect(disallowedNumbers("roughly 25% are Shorts", cluster.allowedNumbers)).toEqual([]);
  });

  it("flags duplicate theme names and missing clusters", () => {
    const r = validateSynthesis([good, { ...good, cluster_id: "12", evidence_video_ids: ["ddd", "eee"] }], [cluster, other]);
    expect(r.errors.join(" ")).toMatch(/duplicates cluster 11/);
    const r2 = validateSynthesis([good], [cluster, other]);
    expect(r2.errors.join(" ")).toMatch(/cluster 12: missing/);
  });

  it("rejects unknown cluster ids and schema violations", () => {
    const r = validateSynthesis([{ ...good, cluster_id: "999" }, { cluster_id: "11", theme_name: "x" }], [cluster]);
    expect(r.errors.join(" ")).toMatch(/Unknown cluster_id "999"/);
    expect(r.errors.join(" ")).toMatch(/cluster 11: schema/);
  });
});

describe("finalizeNarrative (after the single repair attempt)", () => {
  it("drops foreign evidence and renders stats-only if fewer than 2 remain", () => {
    const res = finalizeNarrative({ parsed: { ...good, evidence_video_ids: ["aaa", "ddd"], confidence: "high" } }, cluster, new Set());
    expect(res.mode).toBe("stats_only");
  });

  it("strips sentences with invented numbers and keeps the rest", () => {
    const res = finalizeNarrative(
      { parsed: { ...good, why_now: "Views are up 340% this week. The audience keeps asking about value.", confidence: "medium" } },
      cluster,
      new Set(),
    );
    expect(res.mode).toBe("full");
    if (res.mode === "full") {
      expect(res.narrative.why_now).toBe("The audience keeps asking about value.");
      expect(res.notes).toContain("removed sentence(s) with invented numbers");
    }
  });

  it("falls back to stats-only when nothing safe is left", () => {
    const res = finalizeNarrative({ parsed: { ...good, why_now: "Up 340% in 7 days.", confidence: "low" } }, cluster, new Set());
    expect(res.mode).toBe("stats_only");
  });

  it("stripNumberSentences keeps allowed numbers", () => {
    expect(stripNumberSentences("The iPhone 17 is everywhere. It grew 80%.", cluster.allowedNumbers)).toBe("The iPhone 17 is everywhere.");
  });
});
