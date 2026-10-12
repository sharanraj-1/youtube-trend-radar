import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import { baseUrl, env } from "../../env";
import { feedbackUrl } from "../../feedback";
import { renderBriefHtml } from "../../render/email";
import type { BriefCluster, BriefJson, BriefVideo } from "../../render/types";
import { ENRICH_PROMPT_VERSION } from "../../prompts/enrich";
import { SYNTH_PROMPT_VERSION } from "../../prompts/synthesize";
import type { NarrativeResult } from "../../analysis/validate";
import type { ScoredVideo } from "../../analysis/cluster";
import type { Cluster, Run } from "../../db/schema";
import type { CollectPayload } from "./collect";
import type { ScorePayload } from "./score";
import type { StagedStats } from "./stage";
import type { ValidatePayload } from "./validate";
import type { StageContext, StageResult } from "../types";

export const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** Builds the brief JSON from whatever exists (works on the DEGRADED path too). Every number comes from ClusterStats. */
export async function buildBriefJson(run: Run, status: BriefJson["status"], opts: { banner?: string | null } = {}): Promise<BriefJson> {
  const outputs = await db().select().from(schema.stageOutputs).where(eq(schema.stageOutputs.runId, run.id));
  const out = <T,>(s: string) => (outputs.find((o) => o.stage === s && o.status === "done")?.payload as T) ?? null;
  const collected = out<CollectPayload>("COLLECT") ?? (outputs.find((o) => o.stage === "COLLECT")?.payload as CollectPayload | null);
  const scored = out<ScorePayload>("SCORE");
  const validated = out<ValidatePayload>("VALIDATE");
  const stageOut = out<{ hasHistory: boolean }>("STAGE");

  const clusters = await db()
    .select()
    .from(schema.clusters)
    .where(and(eq(schema.clusters.runId, run.id), inArray(schema.clusters.selection, ["top", "skip"])));
  const top = clusters.filter((c) => c.selection === "top").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const skip = clusters.filter((c) => c.selection === "skip").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const videoMap = new Map<string, ScoredVideo>((scored?.videos ?? []).map((v) => [v.id, v]));
  const missing = [...new Set(top.flatMap((c) => c.videoIds.slice(0, 6)))].filter((id) => !videoMap.has(id));
  if (missing.length) {
    const rows = await db().select().from(schema.videos).where(inArray(schema.videos.id, missing));
    for (const r of rows)
      videoMap.set(r.id, { id: r.id, title: r.title, channelTitle: r.channelTitle ?? "", publishedAt: r.publishedAt.toISOString(), views: 0 } as ScoredVideo);
  }
  const toVideo = (id: string): BriefVideo | null => {
    const v = videoMap.get(id);
    if (!v) return null;
    return { id, title: v.title, channel: v.channelTitle, views: v.views, published_at: v.publishedAt, url: ytUrl(id), thumb: ytThumb(id) };
  };

  const secret = env().FEEDBACK_SECRET;
  const base = baseUrl();
  const cards: BriefCluster[] = top.map((c: Cluster) => {
    const st = c.stats as StagedStats;
    const n = (c.narrative as NarrativeResult | null) ?? { mode: "stats_only" as const, reason: "no narrative (synthesis skipped)" };
    const evidenceIds = n.mode === "full" ? [...n.narrative.evidence_video_ids] : [];
    for (const id of c.videoIds) {
      if (evidenceIds.length >= 3) break;
      if (!evidenceIds.includes(id)) evidenceIds.push(id);
    }
    return {
      id: c.id,
      label: c.label,
      theme_name: n.mode === "full" ? n.narrative.theme_name : c.label,
      mode: n.mode,
      stats_only_reason: n.mode === "stats_only" ? n.reason : undefined,
      why_now: n.mode === "full" ? n.narrative.why_now : undefined,
      angles: n.mode === "full" ? n.narrative.suggested_angles : undefined,
      confidence: n.mode === "full" ? n.narrative.confidence : undefined,
      lifecycle: c.lifecycle ?? "peaking",
      lifecycle_confidence: st.lifecycle_confidence ?? "low",
      score: c.score ?? 0,
      stats: {
        creators: st.distinct_channels,
        videos: st.video_count,
        median_outlier: st.median_outlier_multiple,
        winning_format: st.top_format,
        typical_length_s: st.median_duration_s,
        shorts_share: st.short_share,
        median_views_per_hour: st.median_views_per_hour,
        wow_channel_growth: stageOut?.hasHistory ? st.wow_channel_growth : null,
      },
      questions: st.top_comment_questions ?? [],
      evidence: evidenceIds
        .slice(0, 3)
        .map(toVideo)
        .filter((v): v is BriefVideo => !!v),
      covered: st.already_covered_by_ishaan
        ? { date: st.already_covered_by_ishaan.published_at, title: st.already_covered_by_ishaan.title, url: ytUrl(st.already_covered_by_ishaan.video_id) }
        : null,
      feedback: {
        up: feedbackUrl(base, c.id, "up", secret),
        down: feedbackUrl(base, c.id, "down", secret),
        filmed: feedbackUrl(base, c.id, "filmed", secret),
      },
    };
  });

  const [fresh] = await db().select().from(schema.runs).where(eq(schema.runs.id, run.id));
  return {
    version: 1,
    run_id: run.id,
    status,
    generated_at: new Date().toISOString(),
    collected_at: collected?.collectedAt ?? null,
    week_summary: validated?.weekSummary ?? "",
    banner: opts.banner ?? (status === "degraded" ? "Partial brief — some pipeline steps failed or data was limited this week. See the coverage note below." : null),
    lifecycle_note: stageOut && !stageOut.hasHistory ? "Lifecycle confidence: low — first week of data." : null,
    clusters: cards,
    skip: skip.map((c) => {
      const st = c.stats as StagedStats;
      return { id: c.id, label: c.label, creators: st.distinct_channels, median_outlier: st.median_outlier_multiple, videos: st.video_count };
    }),
    footer: {
      sources: {
        peer_channels: collected?.peers?.map((p) => p.handle) ?? [],
        unresolved_handles: collected?.unresolvedHandles ?? [],
        chart: collected?.chart?.ok ? `trending chart (${collected.chart.count} recent)` : "trending chart unavailable",
        searches: collected?.searchesDone ?? 0,
        videos_analysed: scored?.videos.length ?? 0,
      },
      quota_used: fresh?.quotaUsed ?? run.quotaUsed,
      gemini_calls: fresh?.geminiCalls ?? run.geminiCalls,
      coverage_note: fresh?.coverageNote ?? null,
      prompt_versions: [ENRICH_PROMPT_VERSION, SYNTH_PROMPT_VERSION],
    },
  };
}

export async function render(ctx: StageContext): Promise<StageResult> {
  const outputs = await db().select().from(schema.stageOutputs).where(eq(schema.stageOutputs.runId, ctx.run.id));
  const validated = outputs.find((o) => o.stage === "VALIDATE" && o.status === "done")?.payload as ValidatePayload | undefined;
  const collected = outputs.find((o) => o.stage === "COLLECT")?.payload as CollectPayload | undefined;
  const anyFailed = outputs.some((o) => o.status === "skipped" || (o.status === "failed" && o.stage !== "RENDER"));
  const degraded =
    anyFailed || !validated || (validated.statsOnly?.length ?? 0) > 0 || (validated.staleSnapshotVideos ?? 0) > 0 || !!collected?.quotaExhausted;

  const json = await buildBriefJson(ctx.run, degraded ? "degraded" : "complete");
  if (json.clusters.length === 0 && json.status === "complete") json.status = "degraded";
  const html = renderBriefHtml(json, `${baseUrl()}/`);

  await db().delete(schema.briefs).where(eq(schema.briefs.runId, ctx.run.id));
  const [brief] = await db()
    .insert(schema.briefs)
    .values({ runId: ctx.run.id, status: json.status, html, json, promptVersion: `${ENRICH_PROMPT_VERSION}+${SYNTH_PROMPT_VERSION}` })
    .returning({ id: schema.briefs.id });
  return { done: true, payload: { briefId: brief.id, status: json.status, clusters: json.clusters.length, skip: json.skip.length } };
}
