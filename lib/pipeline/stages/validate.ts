import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { log } from "../../log";
import {
  allowedNumbersFrom,
  finalizeNarrative,
  stripNumberSentences,
  validateSynthesis,
  type NarrativeResult,
  type ValidationCluster,
} from "../../analysis/validate";
import { callSynth, type SynthPayload } from "./synthesize";
import type { StagedStats } from "./stage";
import type { StageContext, StageResult } from "../types";

const SNAPSHOT_MAX_AGE_H = 30;

export interface ValidatePayload {
  weekSummary: string;
  firstPassErrors: string[];
  repairErrors: string[];
  repaired: boolean;
  statsOnly: { clusterId: number; reason: string }[];
  staleSnapshotVideos: number;
  notes: string[];
}

export async function validate(ctx: StageContext): Promise<StageResult> {
  const synth = await ctx.output<SynthPayload>("SYNTHESIZE");
  const top = await db()
    .select()
    .from(schema.clusters)
    .where(and(eq(schema.clusters.runId, ctx.run.id), eq(schema.clusters.selection, "top")));

  const vcs: ValidationCluster[] = top.map((c) => {
    const st = c.stats as StagedStats;
    return { id: String(c.id), label: c.label, videoIds: c.videoIds, allowedNumbers: allowedNumbersFrom(st, st.top_entities) };
  });

  const payload: ValidatePayload = {
    weekSummary: "",
    firstPassErrors: [],
    repairErrors: [],
    repaired: false,
    statsOnly: [],
    staleSnapshotVideos: 0,
    notes: [],
  };

  let perCluster = new Map<string, { parsed: import("../../prompts/synthesize").SynthCluster | null }>();
  let weekSummary = "";
  if (synth && synth.raw.clusters.length) {
    const first = validateSynthesis(synth.raw.clusters, vcs);
    payload.firstPassErrors = first.errors;
    perCluster = first.perCluster;
    weekSummary = synth.raw.week_summary;
    if (first.errors.length) {
      // Single regeneration with the validator's errors.
      try {
        const { data } = await callSynth(synth.input, ctx.countGemini, first.errors.slice(0, 30).join("\n"));
        const second = validateSynthesis(data.clusters, vcs);
        payload.repairErrors = second.errors;
        payload.repaired = true;
        // Per cluster: keep a clean first-pass entry, otherwise take the repaired one.
        for (const vc of vcs) {
          const a = first.perCluster.get(vc.id);
          const b = second.perCluster.get(vc.id);
          if (a?.parsed && a.errors.length === 0) continue;
          // A repair that broke the schema must not throw away a usable first answer (finalize salvages it).
          if (b && (b.parsed || !a?.parsed)) perCluster.set(vc.id, b);
        }
        if (data.week_summary) weekSummary = data.week_summary;
      } catch (err) {
        log.warn("synthesis repair failed; salvaging first pass", { error: String(err) });
        payload.notes.push("Synthesis repair call failed.");
      }
    }
  } else if (top.length) {
    payload.notes.push("No synthesis output; clusters rendered in stats-only mode.");
  }

  // Final lenient pass: salvage safe prose, otherwise stats-only.
  const used = new Set<string>();
  for (const c of top) {
    const vc = vcs.find((v) => v.id === String(c.id))!;
    const result: NarrativeResult = finalizeNarrative(perCluster.get(vc.id), vc, used);
    if (result.mode === "stats_only") payload.statsOnly.push({ clusterId: c.id, reason: result.reason });
    await db().update(schema.clusters).set({ narrative: result }).where(eq(schema.clusters.id, c.id));
  }

  // Week summary: no digits allowed at all (no per-cluster stats context).
  const summary = stripNumberSentences(weekSummary, new Set());
  payload.weekSummary = summary;

  // Freshness: every video we show must have a snapshot < 30h old.
  const shown = [...new Set(top.flatMap((c) => c.videoIds.slice(0, 8)))];
  if (shown.length) {
    const fresh = await db()
      .select({ id: schema.videoSnapshots.videoId })
      .from(schema.videoSnapshots)
      .where(
        and(
          inArray(schema.videoSnapshots.videoId, shown),
          sql`${schema.videoSnapshots.capturedAt} > now() - interval '${sql.raw(String(SNAPSHOT_MAX_AGE_H))} hours'`,
        ),
      )
      .groupBy(schema.videoSnapshots.videoId);
    payload.staleSnapshotVideos = shown.length - fresh.length;
    if (payload.staleSnapshotVideos > 0) {
      const msg = `${payload.staleSnapshotVideos} shown videos have stats older than ${SNAPSHOT_MAX_AGE_H}h.`;
      payload.notes.push(msg);
      ctx.note(msg);
    }
  }
  return { done: true, payload };
}
