import { and, desc, eq, inArray, sql } from "drizzle-orm";
import weights from "@/config/weights.json";
import { db, schema } from "../db";
import type { Run } from "../db/schema";
import { baseUrl, env } from "../env";
import { log } from "../log";
import { getConfig } from "../settings";
import { QuotaManager } from "../youtube/quota";
import { MAX_STAGE_FAILURES, MAX_STAGE_INVOCATIONS, STAGES, nextStage, type RunStage, type Stage, type StageContext } from "./types";
import { STAGE_FNS } from "./stages";
import { alertTelegram } from "../notify";

export type StepOutcome =
  | { outcome: "idle" }
  | { outcome: "finished"; runId: number; status: string }
  | { outcome: "busy"; runId: number; stage: string }
  | { outcome: "advanced" | "continue" | "failed" | "degraded"; runId: number; stage: Stage; next: RunStage; error?: string };

const ACTIVE = ["pending", "running"];
/** A 'running' stage whose heartbeat is older than this is assumed dead (function killed) and may be re-claimed. */
const STALE_MS = 6 * 60_000;

export async function getActiveRun(): Promise<Run | null> {
  const rows = await db()
    .select()
    .from(schema.runs)
    .where(and(inArray(schema.runs.status, ACTIVE), inArray(schema.runs.kind, ["weekly", "manual"])))
    .orderBy(desc(schema.runs.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Creates a pipeline run unless one is already active (duplicate triggers are harmless). */
export async function createRun(kind: "weekly" | "manual"): Promise<{ run: Run; created: boolean }> {
  const active = await getActiveRun();
  if (active) return { run: active, created: false };
  const [run] = await db().insert(schema.runs).values({ kind, status: "pending", currentStage: "COLLECT" }).returning();
  log.info("run created", { runId: run.id, kind });
  return { run, created: true };
}

async function loadRun(runId: number) {
  const rows = await db().select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Executes exactly one stage (or one checkpointed slice of a stage) of the given / active run.
 * Concurrency: the stage row is claimed with a conditional UPDATE, so two invocations can never run the same stage.
 */
export async function runNextStage(runId?: number, opts: { budgetMs?: number } = {}): Promise<StepOutcome> {
  const run = runId ? await loadRun(runId) : await getActiveRun();
  if (!run) return { outcome: "idle" };
  if (!ACTIVE.includes(run.status) || run.currentStage === "DONE")
    return { outcome: "finished", runId: run.id, status: run.status };
  const stage = run.currentStage as Stage;
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage ${run.currentStage}`);

  await db().insert(schema.stageOutputs).values({ runId: run.id, stage, status: "pending" }).onConflictDoNothing();

  const staleBefore = new Date(Date.now() - STALE_MS);
  const claimed = await db()
    .update(schema.stageOutputs)
    .set({
      status: "running",
      invocations: sql`${schema.stageOutputs.invocations} + 1`,
      // a stale 'running' row means the previous invocation died: count it as a failed attempt
      attempts: sql`CASE WHEN ${schema.stageOutputs.status} = 'running' THEN ${schema.stageOutputs.attempts} + 1 ELSE ${schema.stageOutputs.attempts} END`,
      startedAt: sql`COALESCE(${schema.stageOutputs.startedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.stageOutputs.runId, run.id),
        eq(schema.stageOutputs.stage, stage),
        sql`${schema.stageOutputs.attempts} < ${MAX_STAGE_FAILURES}`,
        sql`(${schema.stageOutputs.status} IN ('pending','failed') OR (${schema.stageOutputs.status} = 'running' AND ${schema.stageOutputs.updatedAt} < ${staleBefore.toISOString()}::timestamptz))`,
      ),
    )
    .returning();

  if (claimed.length === 0) {
    const [row] = await db()
      .select()
      .from(schema.stageOutputs)
      .where(and(eq(schema.stageOutputs.runId, run.id), eq(schema.stageOutputs.stage, stage)));
    if (row && row.attempts >= MAX_STAGE_FAILURES && row.status !== "done") {
      return degrade(run, stage, row.error ?? "stage failed repeatedly");
    }
    return { outcome: "busy", runId: run.id, stage };
  }
  const row = claimed[0];
  await db().update(schema.runs).set({ status: "running" }).where(and(eq(schema.runs.id, run.id), eq(schema.runs.status, "pending")));

  if (row.invocations > MAX_STAGE_INVOCATIONS) {
    await markFailed(run, stage, `exceeded ${MAX_STAGE_INVOCATIONS} invocations`, MAX_STAGE_FAILURES);
    return degrade(run, stage, "stage did not converge");
  }

  const config = await getConfig();
  const quota = new QuotaManager(weights.budget.youtubeUnitsPerRun, run.quotaUsed);
  let geminiCalls = 0;
  const notes: string[] = [];
  const started = Date.now();
  const budget = opts.budgetMs ?? weights.budget.stageTimeBudgetMs;
  const ctx: StageContext = {
    run,
    config,
    quota,
    checkpoint: row.payload ?? null,
    deadline: started + budget,
    timeLeft: () => started + budget - Date.now(),
    output: async <T,>(s: Stage) => {
      const [o] = await db()
        .select()
        .from(schema.stageOutputs)
        .where(and(eq(schema.stageOutputs.runId, run.id), eq(schema.stageOutputs.stage, s)));
      return o && o.status === "done" ? (o.payload as T) : null;
    },
    countGemini: () => void geminiCalls++,
    note: (m) => void notes.push(m),
  };

  const finishBookkeeping = async () => {
    const coverage = [run.coverageNote, ...notes].filter(Boolean).join(" ").trim() || null;
    await db()
      .update(schema.runs)
      .set({
        quotaUsed: quota.used,
        geminiCalls: sql`${schema.runs.geminiCalls} + ${geminiCalls}`,
        coverageNote: coverage,
      })
      .where(eq(schema.runs.id, run.id));
  };

  log.info("stage start", { runId: run.id, stage, invocation: row.invocations, attempts: row.attempts });
  try {
    const result = await STAGE_FNS[stage](ctx);
    const ms = Date.now() - started;
    await finishBookkeeping();
    if (!result.done) {
      await db()
        .update(schema.stageOutputs)
        .set({ status: "pending", payload: result.payload as object, durationMs: sql`${schema.stageOutputs.durationMs} + ${ms}`, updatedAt: new Date() })
        .where(eq(schema.stageOutputs.id, row.id));
      log.info("stage checkpoint", { runId: run.id, stage, ms });
      return { outcome: "continue", runId: run.id, stage, next: stage };
    }
    const next = nextStage(stage);
    await db()
      .update(schema.stageOutputs)
      .set({
        status: "done",
        payload: result.payload as object,
        error: null,
        finishedAt: new Date(),
        durationMs: sql`${schema.stageOutputs.durationMs} + ${ms}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.stageOutputs.id, row.id));
    await advance(run.id, stage, next);
    log.info("stage done", { runId: run.id, stage, ms, next });
    return { outcome: "advanced", runId: run.id, stage, next };
  } catch (err) {
    // Drizzle errors embed the full SQL + params; keep logs/DB readable.
    // The cause (the actual Postgres reason) goes first so the 1200-char cap never cuts it off.
    const message = (
      err instanceof Error
        ? `${err.cause instanceof Error ? `${err.cause.message} | ` : ""}${err.name}: ${err.message}`
        : String(err)
    ).slice(0, 1200);
    log.error("stage failed", { runId: run.id, stage, error: message });
    await finishBookkeeping().catch(() => {});
    const attempts = row.attempts + 1;
    await markFailed(run, stage, message, attempts, Date.now() - started);
    if (attempts >= MAX_STAGE_FAILURES) return degrade(run, stage, message);
    return { outcome: "failed", runId: run.id, stage, next: stage, error: message };
  }
}

async function markFailed(run: Run, stage: Stage, message: string, attempts: number, ms = 0) {
  await db()
    .update(schema.stageOutputs)
    .set({ status: "failed", error: message.slice(0, 2000), attempts, durationMs: sql`${schema.stageOutputs.durationMs} + ${ms}`, updatedAt: new Date() })
    .where(and(eq(schema.stageOutputs.runId, run.id), eq(schema.stageOutputs.stage, stage)));
}

/** Compare-and-set on the run's current stage so concurrent invocations can't double-advance. */
async function advance(runId: number, from: Stage, to: RunStage, extra: Partial<Run> = {}) {
  const finished = to === "DONE";
  let status: string | undefined;
  if (finished) {
    const failed = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.stageOutputs)
      .where(and(eq(schema.stageOutputs.runId, runId), inArray(schema.stageOutputs.status, ["failed", "skipped"])));
    const [b] = await db().select({ status: schema.briefs.status }).from(schema.briefs).where(eq(schema.briefs.runId, runId)).limit(1);
    status = failed[0].n > 0 || b?.status === "degraded" ? "degraded" : "done";
  }
  await db()
    .update(schema.runs)
    .set({ currentStage: to, ...(finished ? { status, finishedAt: new Date() } : {}), ...extra })
    .where(and(eq(schema.runs.id, runId), eq(schema.runs.currentStage, from)));
}

/** DEGRADED path: a stage failed 3 times -> skip straight to RENDER with whatever exists. */
async function degrade(run: Run, stage: Stage, error: string): Promise<StepOutcome> {
  await db()
    .update(schema.stageOutputs)
    .set({ status: "skipped" })
    .where(and(eq(schema.stageOutputs.runId, run.id), eq(schema.stageOutputs.stage, stage), eq(schema.stageOutputs.status, "failed")));
  const renderIdx = STAGES.indexOf("RENDER");
  const idx = STAGES.indexOf(stage);
  if (idx < renderIdx) {
    await advance(run.id, stage, "RENDER", {
      coverageNote: [run.coverageNote, `Stage ${stage} failed ${MAX_STAGE_FAILURES}x; brief rendered from partial data.`].filter(Boolean).join(" "),
    });
    log.warn("run degraded", { runId: run.id, stage });
    return { outcome: "degraded", runId: run.id, stage, next: "RENDER", error };
  }
  if (stage === "DELIVER") {
    // Brief already saved by RENDER; delivery problems must not fail the run.
    await advance(run.id, stage, "DONE");
    return { outcome: "degraded", runId: run.id, stage, next: "DONE", error };
  }
  await db()
    .update(schema.runs)
    .set({ status: "failed", error: `${stage}: ${error}`.slice(0, 2000), finishedAt: new Date() })
    .where(eq(schema.runs.id, run.id));
  await alertTelegram(`❌ Trend Radar run #${run.id} failed at ${stage}: ${error.slice(0, 300)}`);
  return { outcome: "failed", runId: run.id, stage, next: stage, error };
}

/** Fire-and-forget the next step via HTTP. The callee responds 202 immediately and works in after(). */
export async function triggerStep(runId: number, delayMs = 0) {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const url = `${baseUrl()}/api/pipeline/step`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${env().CRON_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ runId }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (res.status === 508) {
      // Vercel's loop protection stops long self-invocation chains. Not an error: an external caller
      // (GitHub Actions pump, an open browser tab via /api/runs/resume, or the daily cron) continues the run.
      log.warn("self-trigger blocked by Vercel loop protection; waiting for an external resume", { runId });
    } else log.info("triggered next step", { runId, status: res.status });
  } catch (err) {
    log.error("failed to trigger next step (watchdog/cron will resume)", { runId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Whether another invocation should be scheduled. 'failed' retries the stage (a terminal failure simply
 * resolves to 'finished' on the next call); 'busy' means another invocation owns the chain.
 */
export function shouldContinue(o: StepOutcome): o is Extract<StepOutcome, { stage: Stage }> {
  return o.outcome === "advanced" || o.outcome === "continue" || o.outcome === "failed" || o.outcome === "degraded";
}

/** Run one step, then chain the next via HTTP (used inside after()). */
/** Keep running stages in this invocation while it is still young; quick stages (SCORE..DELIVER) then
 *  finish without extra HTTP hops, which keeps self-invocation chains short. */
const IN_PROCESS_WINDOW_MS = 60_000;

/** Run one or more steps, then chain the next via HTTP (used inside after()). */
export async function stepAndChain(runId?: number) {
  const started = Date.now();
  let outcome = await runNextStage(runId);
  while (outcome.outcome === "advanced" && Date.now() - started < IN_PROCESS_WINDOW_MS) {
    outcome = await runNextStage(outcome.runId);
  }
  if (shouldContinue(outcome)) await triggerStep(outcome.runId, outcome.outcome === "failed" ? 10_000 : 0);
  return outcome;
}

/** Drive a run in-process (no HTTP hops) until it finishes or the time budget runs out. Used by the watchdog. */
export async function driveRun(runId: number, budgetMs: number): Promise<StepOutcome> {
  const started = Date.now();
  let outcome: StepOutcome = await runNextStage(runId, { budgetMs: Math.min(170_000, budgetMs) });
  while (shouldContinue(outcome) && Date.now() - started < budgetMs - 20_000) {
    if (outcome.outcome === "failed") await new Promise((r) => setTimeout(r, 5_000));
    const left = budgetMs - (Date.now() - started);
    outcome = await runNextStage(runId, { budgetMs: Math.min(170_000, Math.max(30_000, left - 30_000)) });
  }
  return outcome;
}

/** A run whose current stage has had no progress for this long (and is not mid-execution) may be resumed. */
export const RESUME_AFTER_MS = 40_000;

/**
 * Safe, idempotent resume for external callers: only continues an existing active run that is stalled.
 * It can never start a run, so it is fine to expose publicly (the stage claim makes duplicates harmless).
 */
export async function resumeIfStalled(): Promise<{ resumed: boolean; runId?: number; stage?: string; reason: string }> {
  const run = await getActiveRun();
  if (!run) return { resumed: false, reason: "no active run" };
  const [row] = await db()
    .select()
    .from(schema.stageOutputs)
    .where(and(eq(schema.stageOutputs.runId, run.id), eq(schema.stageOutputs.stage, run.currentStage)));
  const last = row?.updatedAt?.getTime() ?? run.startedAt.getTime();
  const idle = Date.now() - last;
  if (row?.status === "running" && idle < STALE_MS) return { resumed: false, runId: run.id, stage: run.currentStage, reason: "stage is running" };
  if (idle < RESUME_AFTER_MS) return { resumed: false, runId: run.id, stage: run.currentStage, reason: "recently active" };
  return { resumed: true, runId: run.id, stage: run.currentStage, reason: `idle ${Math.round(idle / 1000)}s` };
}
