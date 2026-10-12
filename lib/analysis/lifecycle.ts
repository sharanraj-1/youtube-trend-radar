import weights from "@/config/weights.json";
import { buildIdf, cosine, tokenize, vectorize } from "./tfidf";
import { canon } from "./cluster";

export type Lifecycle = "emerging" | "rising" | "peaking" | "saturated";

export interface PriorCluster {
  id: number;
  runId: number;
  runStartedAt: Date;
  topEntity: string | null;
  doc: string;
  distinctChannels: number;
  medianOutlier: number | null;
  lifecycle: Lifecycle | null;
}

export interface CurrentClusterLite {
  topEntity: string | null;
  doc: string;
}

/** Same top entity, or TF-IDF cosine >= threshold. Returns best match or null. */
export function matchPrior<T extends PriorCluster>(
  current: CurrentClusterLite,
  prior: T[],
  threshold = weights.cluster.matchPrevCosine,
): T | null {
  if (prior.length === 0) return null;
  if (current.topEntity) {
    const same = prior.find((p) => p.topEntity && canon(p.topEntity) === canon(current.topEntity!));
    if (same) return same;
  }
  const docs = [current.doc, ...prior.map((p) => p.doc)].map(tokenize);
  const idf = buildIdf(docs);
  const cv = vectorize(docs[0], idf);
  let best: { p: T; s: number } | null = null;
  prior.forEach((p, i) => {
    const s = cosine(cv, vectorize(docs[i + 1], idf));
    if (s >= threshold && (!best || s > best.s)) best = { p, s };
  });
  return (best as { p: T; s: number } | null)?.p ?? null;
}

/** Week-over-week growth in distinct channels. New-with-history = 1.0, first-ever run = 0. Clamped to [-1, 3]. */
export function wowChannelGrowth(channels: number, prev: PriorCluster | null, hasHistory: boolean): number {
  if (!hasHistory) return 0;
  if (!prev) return 1;
  const g = (channels - prev.distinctChannels) / Math.max(1, prev.distinctChannels);
  return Math.max(-1, Math.min(3, Math.round(g * 100) / 100));
}

export interface LifecycleInput {
  channels: number;
  medianOutlier: number | null;
  wowGrowth: number;
  hasHistory: boolean;
  seenInPrior4Weeks: boolean;
  prev: Pick<PriorCluster, "lifecycle" | "medianOutlier"> | null;
  recentShare: number;
}

export function assignLifecycle(i: LifecycleInput, cfg = weights.lifecycle): { lifecycle: Lifecycle; confidence: "low" | "normal" } {
  const outlier = i.medianOutlier ?? 1;
  const confidence = i.hasHistory ? "normal" : "low";
  const L = (lifecycle: Lifecycle) => ({ lifecycle, confidence }) as const;

  if (outlier < cfg.saturatedMaxOutlier) return L("saturated");

  if (!i.hasHistory) {
    // First week: within-week signals only (publish-date spread + outlier).
    if (i.channels >= cfg.peakingMinChannels && i.recentShare < 0.4) return L("peaking");
    if (i.channels <= cfg.emergingMaxChannels && outlier > cfg.emergingMinOutlier) return L("emerging");
    if (outlier > cfg.risingMinOutlier && i.recentShare >= 0.4) return L("rising");
    if (i.channels >= cfg.peakingMinChannels) return L("peaking");
    return L(i.recentShare >= 0.5 ? "emerging" : "peaking");
  }

  const flatOrDeclining = i.prev ? outlier <= (i.prev.medianOutlier ?? outlier) * 1.05 : false;
  const peakingNow = i.channels >= cfg.peakingMinChannels && flatOrDeclining;
  if (peakingNow && (i.prev?.lifecycle === "peaking" || i.prev?.lifecycle === "saturated")) return L("saturated");
  if (!i.seenInPrior4Weeks && i.channels >= 2 && i.channels <= cfg.emergingMaxChannels && outlier > cfg.emergingMinOutlier)
    return L("emerging");
  if (i.wowGrowth > cfg.risingMinGrowth && outlier > cfg.risingMinOutlier) return L("rising");
  if (peakingNow || i.channels >= cfg.peakingMinChannels) return L("peaking");
  return L(i.seenInPrior4Weeks ? "peaking" : "emerging");
}

/**
 * Evidence-weighted outlier used for *ranking*: shrinks the median toward 1x when few channels back it
 * (two viral videos shouldn't beat twelve creators at 4x), then caps it. The brief still displays the raw median.
 */
export function rankingOutlier(medianOutlier: number | null, channels: number, w = weights.score): number {
  const raw = Math.min(w.perVideoOutlierCap, medianOutlier ?? 1);
  const shrunk = (channels * raw + w.outlierShrinkK * 1) / (channels + w.outlierShrinkK);
  return Math.min(w.outlierCap, shrunk);
}

export function scoreCluster(
  p: { channels: number; medianOutlier: number | null; wowGrowth: number; saturated: boolean; alreadyCovered: boolean },
  w = weights.score,
): number {
  const outlier = rankingOutlier(p.medianOutlier, p.channels, w);
  const s =
    w.channels * Math.log(1 + p.channels) +
    w.medianOutlier * outlier +
    w.wowGrowth * p.wowGrowth -
    w.saturatedPenalty * (p.saturated ? 1 : 0) -
    w.alreadyCoveredPenalty * (p.alreadyCovered ? 1 : 0);
  return Math.round(s * 1000) / 1000;
}
