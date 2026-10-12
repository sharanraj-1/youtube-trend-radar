import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import { chunk } from "../../retry";
import { ageHours, engagementRate, outlierMultiple, round, velocity72h, viewsPerHour, type SnapshotPoint } from "../../analysis/metrics";
import type { ScoredVideo } from "../../analysis/cluster";
import type { VideoFormat } from "../../prompts/enrich";
import type { CollectPayload } from "./collect";
import type { EnrichPayload } from "./enrich";
import type { StageContext, StageResult } from "../types";

export interface ScorePayload {
  scoredAt: string;
  videos: ScoredVideo[];
  withBaseline: number;
  withVelocity: number;
}

/** Pure arithmetic over stored data (no LLM, no API calls). */
export async function score(ctx: StageContext): Promise<StageResult> {
  const collected = await ctx.output<CollectPayload>("COLLECT");
  const enriched = await ctx.output<EnrichPayload>("ENRICH");
  if (!collected || !enriched) throw new Error("COLLECT/ENRICH output missing");
  const now = new Date(collected.collectedAt ?? Date.now());
  const ids = enriched.selected;

  const out: ScoredVideo[] = [];
  for (const part of chunk(ids, 200)) {
    const rows = await db()
      .select({ v: schema.videos, e: schema.enrichments, c: schema.channels })
      .from(schema.videos)
      .innerJoin(schema.enrichments, eq(schema.enrichments.videoId, schema.videos.id))
      .innerJoin(schema.channels, eq(schema.channels.id, schema.videos.channelId))
      .where(inArray(schema.videos.id, part));
    const snaps = await db()
      .select()
      .from(schema.videoSnapshots)
      .where(and(inArray(schema.videoSnapshots.videoId, part), gte(schema.videoSnapshots.capturedAt, new Date(now.getTime() - 4 * 86400_000))));
    const byVideo = new Map<string, (SnapshotPoint & { likes: number | null; comments: number | null })[]>();
    for (const s of snaps) {
      const arr = byVideo.get(s.videoId) ?? [];
      arr.push({ capturedAt: s.capturedAt, views: s.views, likes: s.likes, comments: s.comments });
      byVideo.set(s.videoId, arr);
    }
    for (const { v, e, c } of rows) {
      const series = (byVideo.get(v.id) ?? []).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
      const latest = series[series.length - 1];
      if (!latest) continue;
      const age = ageHours(v.publishedAt, now);
      out.push({
        id: v.id,
        channelId: v.channelId,
        channelTitle: v.channelTitle ?? c.title,
        title: v.title,
        publishedAt: v.publishedAt.toISOString(),
        durationS: v.durationS,
        isShort: v.isShort,
        views: latest.views,
        likes: latest.likes,
        comments: latest.comments,
        ageHours: round(age, 1)!,
        viewsPerHour: round(viewsPerHour(latest.views, age), 1)!,
        outlierMultiple: round(outlierMultiple(latest.views, c.medianRecentViews), 2),
        engagementRate: round(engagementRate(latest.views, latest.likes, latest.comments), 4),
        velocity72h: round(velocity72h(series), 1),
        format: e.format as VideoFormat,
        entities: e.entities,
        topicKey: e.topicKey,
        topicSummary: e.topicSummary,
      });
    }
  }
  return {
    done: true,
    payload: {
      scoredAt: now.toISOString(),
      videos: out,
      withBaseline: out.filter((v) => v.outlierMultiple !== null).length,
      withVelocity: out.filter((v) => v.velocity72h !== null).length,
    } satisfies ScorePayload,
  };
}
