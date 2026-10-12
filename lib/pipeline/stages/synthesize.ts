import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { generateJson } from "../../gemini/client";
import {
  buildSynthPrompt,
  SYNTH_PROMPT_VERSION,
  SYNTH_RESPONSE_SCHEMA,
  SYNTH_SYSTEM,
  SynthResponseLoose,
  type SynthClusterInput,
} from "../../prompts/synthesize";
import type { ScoredVideo } from "../../analysis/cluster";
import type { StagedStats } from "./stage";
import type { ScorePayload } from "./score";
import type { StageContext, StageResult } from "../types";
import type { Cluster } from "../../db/schema";

export interface SynthPayload {
  promptVersion: string;
  model: string;
  input: SynthClusterInput[];
  raw: { week_summary: string; clusters: Record<string, unknown>[] };
}

/** Qualitative bands only: the model never sees (and so can't parrot) raw statistics. */
export function signalsFor(st: StagedStats, lifecycle: string): Record<string, string> {
  const o = st.median_outlier_multiple ?? 1;
  return {
    lifecycle,
    creator_spread: st.distinct_channels >= 6 ? "many creators" : st.distinct_channels >= 4 ? "several creators" : "a handful of creators",
    performance_vs_channel_norm:
      o >= 3 ? "far above these channels' usual views" : o >= 1.5 ? "well above usual" : o >= 1 ? "slightly above usual" : "at or below usual",
    momentum: st.lifecycle_confidence === "low"
      ? st.recent_share >= 0.5 ? "most videos published in the last few days" : "spread across the week"
      : st.wow_channel_growth > 0.5 ? "more creators than last week" : st.wow_channel_growth < 0 ? "fewer creators than last week" : "similar to last week",
    winning_format: st.top_format ?? "mixed",
    shorts_presence: st.short_share >= 0.6 ? "mostly Shorts" : st.short_share >= 0.25 ? "mix of Shorts and long-form" : "mostly long-form",
    audience_engagement: (st.median_engagement_rate ?? 0) >= 0.05 ? "high" : (st.median_engagement_rate ?? 0) >= 0.02 ? "moderate" : "low",
    already_covered_by_creator: st.already_covered_by_ishaan ? "yes — suggest a fresh follow-up angle" : "no",
  };
}

export function buildSynthInput(clusters: Cluster[], videos: Map<string, ScoredVideo>): SynthClusterInput[] {
  return clusters.map((c) => {
    const st = c.stats as StagedStats;
    return {
      cluster_id: String(c.id),
      lifecycle: c.lifecycle ?? "unknown",
      entities: st.top_entities,
      signals: signalsFor(st, c.lifecycle ?? "unknown"),
      titles: c.videoIds
        .map((id) => videos.get(id))
        .filter((v): v is ScoredVideo => !!v)
        .slice(0, 8)
        .map((v) => ({ video_id: v.id, title: v.title, channel: v.channelTitle })),
      audience_questions: st.top_comment_questions.map((q) => q.text.slice(0, 200)),
    };
  });
}

export async function callSynth(input: SynthClusterInput[], countGemini: () => void, repairNote?: string) {
  return generateJson({
    label: repairNote ? "synthesize-repair" : "synthesize",
    system: SYNTH_SYSTEM,
    prompt: buildSynthPrompt(input, repairNote),
    responseSchema: SYNTH_RESPONSE_SCHEMA,
    validator: SynthResponseLoose,
    temperature: 0.5,
    timeoutMs: 120_000,
    onCall: countGemini,
  });
}

/** One Gemini Flash call for all top clusters. Strict validation happens in VALIDATE. */
export async function synthesize(ctx: StageContext): Promise<StageResult> {
  const scored = await ctx.output<ScorePayload>("SCORE");
  const top = await db()
    .select()
    .from(schema.clusters)
    .where(and(eq(schema.clusters.runId, ctx.run.id), eq(schema.clusters.selection, "top")));
  if (top.length === 0) {
    return { done: true, payload: { promptVersion: SYNTH_PROMPT_VERSION, model: "none", input: [], raw: { week_summary: "", clusters: [] } } };
  }
  const videos = new Map((scored?.videos ?? []).map((v) => [v.id, v]));
  const input = buildSynthInput(top.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), videos);
  const { data, model } = await callSynth(input, ctx.countGemini);
  return {
    done: true,
    payload: { promptVersion: SYNTH_PROMPT_VERSION, model, input, raw: data } satisfies SynthPayload,
  };
}
