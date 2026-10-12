import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { clusterVideos } from "../../analysis/cluster";
import type { CollectPayload } from "./collect";
import type { ScorePayload } from "./score";
import type { StageContext, StageResult } from "../types";

/** Pure-code clustering (entity grouping + TF-IDF merge). Idempotent: replaces this run's clusters. */
export async function cluster(ctx: StageContext): Promise<StageResult> {
  const collected = await ctx.output<CollectPayload>("COLLECT");
  const scored = await ctx.output<ScorePayload>("SCORE");
  if (!collected || !scored) throw new Error("COLLECT/SCORE output missing");

  const drafts = clusterVideos(scored.videos, {
    questions: new Map(Object.entries(collected.comments ?? {})),
    ownVideos: collected.ownVideos ?? [],
    now: new Date(scored.scoredAt),
  });

  await db().delete(schema.clusters).where(eq(schema.clusters.runId, ctx.run.id));
  const inserted = drafts.length
    ? await db()
        .insert(schema.clusters)
        .values(
          drafts.map((d) => ({
            runId: ctx.run.id,
            topicKey: d.topicKey,
            topEntity: d.topEntity,
            label: d.label,
            doc: d.doc,
            videoIds: d.videoIds,
            stats: d.stats,
          })),
        )
        .returning({ id: schema.clusters.id, label: schema.clusters.label })
    : [];

  return {
    done: true,
    payload: {
      clusters: inserted.length,
      videosClustered: drafts.reduce((s, d) => s + d.videoIds.length, 0),
      videosIn: scored.videos.length,
      labels: inserted.map((c) => `${c.id}:${c.label}`),
    },
  };
}
