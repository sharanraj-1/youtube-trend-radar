import { and, inArray, not, sql } from "drizzle-orm";
import weights from "@/config/weights.json";
import { db, schema } from "../../db";
import { chunk, mapLimit } from "../../retry";
import { enrichBatch } from "../../gemini/enrich";
import { ENRICH_PROMPT_VERSION } from "../../prompts/enrich";
import type { CollectPayload } from "./collect";
import type { StageContext, StageResult } from "../types";

export interface EnrichPayload {
  selected: string[]; // videos admitted to analysis (capped)
  reused: number;
  enrichedNow: number;
  fallback: number;
  batches: number;
}

export async function enrich(ctx: StageContext): Promise<StageResult> {
  const collected = await ctx.output<CollectPayload>("COLLECT");
  if (!collected) throw new Error("COLLECT output missing");
  const prev = (ctx.checkpoint as EnrichPayload | null) ?? null;

  let selected = prev?.selected;
  if (!selected) {
    // Cap the analysis set to protect Gemini's free-tier quota: strongest views/hour first.
    const rows = collected.videoIds.length
      ? await db()
          .select({
            id: schema.videos.id,
            publishedAt: schema.videos.publishedAt,
            views: sql<number>`(SELECT s.views FROM video_snapshots s WHERE s.video_id = ${schema.videos.id} ORDER BY s.captured_at DESC LIMIT 1)`,
          })
          .from(schema.videos)
          .where(inArray(schema.videos.id, collected.videoIds))
      : [];
    selected = rows
      .map((r) => ({ id: r.id, vph: Number(r.views ?? 0) / Math.max(1, (Date.now() - r.publishedAt.getTime()) / 3_600_000) }))
      .sort((a, b) => b.vph - a.vph)
      .slice(0, weights.budget.maxVideosToEnrich)
      .map((r) => r.id);
  }
  const p: EnrichPayload = prev ?? { selected, reused: 0, enrichedNow: 0, fallback: 0, batches: 0 };

  const existing = selected.length
    ? await db()
        .select({ id: schema.enrichments.videoId })
        .from(schema.enrichments)
        .where(
          and(
            inArray(schema.enrichments.videoId, selected),
            // fallback rows from earlier runs get another chance with the model
            not(and(sql`${schema.enrichments.model} = 'fallback'`, sql`${schema.enrichments.createdAt} < ${ctx.run.startedAt.toISOString()}::timestamptz`)!),
          ),
        )
    : [];
  const have = new Set(existing.map((e) => e.id));
  if (!prev) p.reused = have.size;
  const todo = selected.filter((id) => !have.has(id));
  if (todo.length === 0) return { done: true, payload: p };

  const vids = await db().select().from(schema.videos).where(inArray(schema.videos.id, todo));
  const batches = chunk(vids, weights.budget.enrichBatchSize);
  // Process in waves of 3 concurrent calls; checkpoint between waves if we're near the time budget.
  for (const wave of chunk(batches, 3)) {
    if (ctx.timeLeft() < 75_000) return { done: false, payload: p };
    await mapLimit(wave, 3, async (batch) => {
      const out = await enrichBatch(
        batch.map((v) => ({
          video_id: v.id,
          title: v.title,
          description: v.descriptionSnippet ?? "",
          tags: v.tags ?? [],
          is_short: v.isShort,
          duration_s: v.durationS,
        })),
        ctx.countGemini,
      );
      const fb = new Set(out.fallbackIds);
      await db()
        .insert(schema.enrichments)
        .values(
          out.results.map((r) => ({
            videoId: r.video_id,
            format: r.format,
            entities: r.entities,
            topicKey: r.topic_key,
            topicSummary: r.topic_summary,
            model: fb.has(r.video_id) ? "fallback" : out.model,
            promptVersion: ENRICH_PROMPT_VERSION,
            createdAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: schema.enrichments.videoId,
          set: {
            format: sql`excluded.format`,
            entities: sql`excluded.entities`,
            topicKey: sql`excluded.topic_key`,
            topicSummary: sql`excluded.topic_summary`,
            model: sql`excluded.model`,
            promptVersion: sql`excluded.prompt_version`,
            createdAt: sql`excluded.created_at`,
          },
        });
      p.enrichedNow += out.results.length;
      p.fallback += out.fallbackIds.length;
      p.batches++;
    });
  }
  return { done: true, payload: p };
}
