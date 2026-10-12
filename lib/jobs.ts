import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { log } from "./log";
import { chunk, mapLimit } from "./retry";
import { YouTubeClient } from "./youtube/client";
import { QuotaExceededError, QuotaManager } from "./youtube/quota";
import { createRun, driveRun, getActiveRun } from "./pipeline/runner";
import { alertTelegram } from "./notify";
import { renderBriefHtml } from "./render/email";
import type { BriefJson } from "./render/types";
import { baseUrl } from "./env";

const DAY = 86400_000;
const SNAPSHOT_BUDGET = 1500;

/** Start of the current week = most recent Sunday 00:00 IST, as a UTC Date. */
export function weekStartIST(now = new Date()): Date {
  const istOffset = 5.5 * 3600_000;
  const ist = new Date(now.getTime() + istOffset);
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(midnight - ist.getUTCDay() * DAY - istOffset);
}

/** Daily: refresh stats for videos < 14 days old (enables velocity) and apply 60-day retention. */
export async function snapshotJob() {
  const [run] = await db().insert(schema.runs).values({ kind: "snapshot", status: "running", currentStage: "SNAPSHOT" }).returning();
  const quota = new QuotaManager(SNAPSHOT_BUDGET);
  const yt = new YouTubeClient(env().YOUTUBE_API_KEY, quota);
  let refreshed = 0;
  let note: string | null = null;
  try {
    const recent = await db()
      .select({ id: schema.videos.id })
      .from(schema.videos)
      .where(gte(schema.videos.publishedAt, new Date(Date.now() - 14 * DAY)));
    await mapLimit(chunk(recent.map((r) => r.id), 50), 5, async (ids) => {
      try {
        const items = await yt.videoStatsByIds(ids);
        if (!items.length) return;
        await db()
          .insert(schema.videoSnapshots)
          .values(
            items.map((v) => ({
              videoId: v.id,
              views: Number(v.statistics?.viewCount ?? 0),
              likes: v.statistics?.likeCount !== undefined ? Number(v.statistics.likeCount) : null,
              comments: v.statistics?.commentCount !== undefined ? Number(v.statistics.commentCount) : null,
            })),
          );
        refreshed += items.length;
      } catch (err) {
        if (err instanceof QuotaExceededError || (err instanceof Error && err.name === "QuotaBudgetError")) note = "Quota limit reached during snapshot.";
        else throw err;
      }
    });

    // Retention: 60 days. Enrichments + snapshots cascade with their video.
    const cutoff = new Date(Date.now() - 60 * DAY);
    const delSnaps = await db().delete(schema.videoSnapshots).where(lt(schema.videoSnapshots.capturedAt, cutoff)).returning({ id: schema.videoSnapshots.id });
    const delVideos = await db().delete(schema.videos).where(lt(schema.videos.publishedAt, cutoff)).returning({ id: schema.videos.id });

    await db()
      .update(schema.runs)
      .set({ status: "done", currentStage: "DONE", finishedAt: new Date(), quotaUsed: quota.used, coverageNote: note })
      .where(eq(schema.runs.id, run.id));
    const result = { runId: run.id, refreshed, quota: quota.used, deletedSnapshots: delSnaps.length, deletedVideos: delVideos.length };
    log.info("snapshot job done", result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db().update(schema.runs).set({ status: "failed", error: msg, finishedAt: new Date(), quotaUsed: quota.used }).where(eq(schema.runs.id, run.id));
    await alertTelegram(`❌ Trend Radar snapshot job failed: ${msg.slice(0, 300)}`);
    throw err;
  }
}

/** Weekly trigger. Idempotent: a duplicate trigger (Vercel cron + GitHub Actions) never creates a second run. */
export async function weeklyJob(): Promise<{ runId: number; created: boolean; reason?: string }> {
  const since = new Date(Date.now() - 12 * 3600_000);
  const [recent] = await db()
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.kind, "weekly"), gte(schema.runs.startedAt, since), inArray(schema.runs.status, ["pending", "running", "done", "degraded"])))
    .orderBy(desc(schema.runs.id))
    .limit(1);
  if (recent) return { runId: recent.id, created: false, reason: "weekly run already exists in the last 12h" };
  const { run, created } = await createRun("weekly");
  return { runId: run.id, created, reason: created ? undefined : "another run is active" };
}

export class RateLimitedError extends Error {}

/** Admin "Generate brief now": globally limited to one run per 30 minutes to protect quota. */
export async function manualRun() {
  const [recent] = await db()
    .select()
    .from(schema.runs)
    .where(and(inArray(schema.runs.kind, ["manual", "weekly"]), gte(schema.runs.startedAt, new Date(Date.now() - 30 * 60_000))))
    .limit(1);
  if (recent) throw new RateLimitedError(`A run (#${recent.id}) started less than 30 minutes ago. Try again later.`);
  return createRun("manual");
}

/**
 * Sunday watchdog: if no complete/degraded brief exists for this week, publish a FALLBACK brief made of
 * last week's still-relevant clusters with a clear banner, and alert.
 */
export async function watchdogJob() {
  const weekStart = weekStartIST();
  const [thisWeek] = await db()
    .select({ id: schema.briefs.id, status: schema.briefs.status })
    .from(schema.briefs)
    .where(and(gte(schema.briefs.createdAt, weekStart), inArray(schema.briefs.status, ["complete", "degraded", "fallback"])))
    .limit(1);
  if (thisWeek) return { action: "none", briefId: thisWeek.id, status: thisWeek.status };

  let active = await getActiveRun();
  if (active) {
    // Last chance before the deadline: push the run forward in-process (no self-invocation hops).
    const outcome = await driveRun(active.id, 240_000);
    log.warn("watchdog drove active run", { runId: active.id, outcome: outcome.outcome });
    const [done] = await db()
      .select({ id: schema.briefs.id, status: schema.briefs.status })
      .from(schema.briefs)
      .where(and(eq(schema.briefs.runId, active.id), inArray(schema.briefs.status, ["complete", "degraded"])))
      .limit(1);
    if (done) return { action: "completed-by-watchdog", briefId: done.id, status: done.status };
    active = await getActiveRun();
  }
  if (active) {
    await db()
      .update(schema.runs)
      .set({ status: "failed", error: "Watchdog: run did not finish before the deadline", finishedAt: new Date() })
      .where(eq(schema.runs.id, active.id));
  }

  const [prev] = await db()
    .select()
    .from(schema.briefs)
    .where(and(lt(schema.briefs.createdAt, weekStart), inArray(schema.briefs.status, ["complete", "degraded"])))
    .orderBy(desc(schema.briefs.createdAt))
    .limit(1);

  const banner = "Fallback — this week's run failed. Showing last week's still-relevant trends; verify before filming.";
  const base: BriefJson = prev
    ? (prev.json as BriefJson)
    : {
        version: 1,
        run_id: null,
        status: "fallback",
        generated_at: new Date().toISOString(),
        collected_at: null,
        week_summary: "",
        banner,
        lifecycle_note: null,
        clusters: [],
        skip: [],
        footer: {
          sources: { peer_channels: [], unresolved_handles: [], chart: "n/a", searches: 0, videos_analysed: 0 },
          quota_used: 0,
          gemini_calls: 0,
          coverage_note: "No previous brief available.",
          prompt_versions: [],
        },
      };
  const json: BriefJson = {
    ...base,
    status: "fallback",
    banner,
    generated_at: new Date().toISOString(),
    clusters: base.clusters.filter((c) => c.lifecycle !== "saturated"),
    skip: [],
  };
  const [brief] = await db()
    .insert(schema.briefs)
    .values({ runId: active?.id ?? null, status: "fallback", html: renderBriefHtml(json, `${baseUrl()}/`), json })
    .returning({ id: schema.briefs.id });
  await alertTelegram(`⚠️ Trend Radar: no brief by the Sunday deadline. Published fallback brief #${brief.id}. ${baseUrl()}/runs`);
  log.warn("watchdog published fallback", { briefId: brief.id, fromBrief: prev?.id ?? null });
  return { action: "fallback", briefId: brief.id, fromBrief: prev?.id ?? null };
}

/** Re-kicks a pipeline whose chain broke (e.g. a self-trigger fetch failed). */
export async function findStalledRun() {
  const active = await getActiveRun();
  if (!active) return null;
  const [row] = await db()
    .select({ updatedAt: sql<Date>`max(${schema.stageOutputs.updatedAt})` })
    .from(schema.stageOutputs)
    .where(eq(schema.stageOutputs.runId, active.id));
  const last = row?.updatedAt ? new Date(row.updatedAt).getTime() : active.startedAt.getTime();
  return Date.now() - last > 7 * 60_000 ? active : null;
}
