import { and, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import weights from "@/config/weights.json";
import { db, schema } from "../../db";
import type { ClusterStats } from "../../analysis/cluster";
import { assignLifecycle, matchPrior, scoreCluster, wowChannelGrowth, type Lifecycle, type PriorCluster } from "../../analysis/lifecycle";
import type { StageContext, StageResult } from "../types";

export type StagedStats = ClusterStats & {
  wow_channel_growth: number;
  lifecycle_confidence: "low" | "normal";
  prev_cluster: { id: number; run_id: number; distinct_channels: number; lifecycle: string | null } | null;
};

const DAY = 86400_000;

/** Lifecycle + score (pure code). "Last week" = most recent prior run that started >= 5 days earlier. */
export async function stage(ctx: StageContext): Promise<StageResult> {
  const current = await db().select().from(schema.clusters).where(eq(schema.clusters.runId, ctx.run.id));
  const runStart = ctx.run.startedAt.getTime();

  const priorRuns = await db()
    .select()
    .from(schema.runs)
    .where(
      and(
        ne(schema.runs.id, ctx.run.id),
        inArray(schema.runs.status, ["done", "degraded"]),
        inArray(schema.runs.kind, ["weekly", "manual"]),
        lt(schema.runs.startedAt, new Date(runStart - 5 * DAY)),
        gte(schema.runs.startedAt, new Date(runStart - 33 * DAY)),
      ),
    )
    .orderBy(desc(schema.runs.startedAt));
  const hasHistory = priorRuns.length > 0;
  const lastWeekRun = priorRuns[0] ?? null;

  const priorClusters: PriorCluster[] = hasHistory
    ? (
        await db()
          .select()
          .from(schema.clusters)
          .where(inArray(schema.clusters.runId, priorRuns.map((r) => r.id)))
      ).map((c) => {
        const st = c.stats as ClusterStats;
        return {
          id: c.id,
          runId: c.runId,
          runStartedAt: priorRuns.find((r) => r.id === c.runId)!.startedAt,
          topEntity: c.topEntity,
          doc: c.doc || c.label,
          distinctChannels: st.distinct_channels,
          medianOutlier: st.median_outlier_multiple,
          lifecycle: (c.lifecycle as Lifecycle) ?? null,
        };
      })
    : [];
  const lastWeek = priorClusters.filter((c) => c.runId === lastWeekRun?.id);

  const staged = current.map((c) => {
    const st = c.stats as ClusterStats;
    const prev = matchPrior({ topEntity: c.topEntity, doc: c.doc }, lastWeek);
    const seen = !!matchPrior({ topEntity: c.topEntity, doc: c.doc }, priorClusters);
    const growth = wowChannelGrowth(st.distinct_channels, prev, hasHistory);
    const { lifecycle, confidence } = assignLifecycle({
      channels: st.distinct_channels,
      medianOutlier: st.median_outlier_multiple,
      wowGrowth: growth,
      hasHistory,
      seenInPrior4Weeks: seen,
      prev,
      recentShare: st.recent_share,
    });
    const s = scoreCluster({
      channels: st.distinct_channels,
      medianOutlier: st.median_outlier_multiple,
      wowGrowth: growth,
      saturated: lifecycle === "saturated",
      alreadyCovered: !!st.already_covered_by_ishaan,
    });
    const stats: StagedStats = {
      ...st,
      wow_channel_growth: growth,
      lifecycle_confidence: confidence,
      prev_cluster: prev ? { id: prev.id, run_id: prev.runId, distinct_channels: prev.distinctChannels, lifecycle: prev.lifecycle } : null,
    };
    return { id: c.id, label: c.label, lifecycle, score: s, stats, matchedPrev: prev?.id ?? null };
  });

  const top = staged
    .filter((c) => c.lifecycle !== "saturated")
    .sort((a, b) => b.score - a.score)
    .slice(0, weights.brief.topClusters);
  const skip = staged
    .filter((c) => c.lifecycle === "saturated")
    .sort((a, b) => b.score - a.score)
    .slice(0, weights.brief.skipClusters);
  const topIds = new Set(top.map((c) => c.id));
  const skipIds = new Set(skip.map((c) => c.id));

  for (const c of staged) {
    await db()
      .update(schema.clusters)
      .set({
        lifecycle: c.lifecycle,
        score: c.score,
        stats: c.stats,
        matchedPrevClusterId: c.matchedPrev,
        selection: topIds.has(c.id) ? "top" : skipIds.has(c.id) ? "skip" : "none",
      })
      .where(eq(schema.clusters.id, c.id));
  }

  return {
    done: true,
    payload: {
      hasHistory,
      lastWeekRunId: lastWeekRun?.id ?? null,
      lifecycleConfidence: hasHistory ? "normal" : "low",
      top: top.map((c) => ({ id: c.id, label: c.label, lifecycle: c.lifecycle, score: c.score })),
      skip: skip.map((c) => ({ id: c.id, label: c.label, score: c.score })),
    },
  };
}
