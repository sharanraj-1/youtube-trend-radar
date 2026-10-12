import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { RunPinger } from "@/components/RunPinger";
import { listRuns } from "@/lib/queries";
import { istDateTime } from "@/lib/render/format";
import { minutes, PHASES, phaseIndex } from "@/lib/render/guide";
import { STAGES } from "@/lib/pipeline/types";

export const metadata = { title: "Run log" };

export default function RunsPage() {
  return (
    <div className="space-y-10">
      <header className="rise max-w-2xl space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Run log</p>
        <h1 className="font-serif text-5xl tracking-tight sm:text-6xl">
          Every run, <em className="text-gradient">in the open</em>
        </h1>
        <p className="text-lg text-muted">When each brief was made, how long it took, and whether every step worked.</p>
      </header>
      <Suspense fallback={<LoadingBlock lines={3} />}>
        <Runs />
      </Suspense>
    </div>
  );
}

const STATUS: Record<string, { label: string; dot: string }> = {
  done: { label: "Completed", dot: "bg-ok" },
  degraded: { label: "Completed with gaps", dot: "bg-warn" },
  failed: { label: "Didn't finish", dot: "bg-danger" },
  running: { label: "In progress", dot: "bg-rising live-dot" },
  pending: { label: "Starting", dot: "bg-faint" },
};

const STAGE_DOT: Record<string, string> = {
  done: "bg-ok",
  failed: "bg-danger",
  skipped: "bg-danger",
  running: "bg-rising",
  pending: "bg-faint",
};

const secs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);

async function Runs() {
  await connection();
  let runs: Awaited<ReturnType<typeof listRuns>>;
  try {
    runs = await listRuns();
  } catch {
    return <ErrorState what="the run log" />;
  }
  if (runs.length === 0) return <EmptyState title="Nothing has run yet">The first run is scheduled for Sunday 5:00 AM IST.</EmptyState>;

  const briefRuns = runs.filter((r) => r.kind !== "snapshot");
  const finished = briefRuns.filter((r) => r.finishedAt);
  const avg = finished.length ? finished.reduce((s, r) => s + (r.finishedAt!.getTime() - r.startedAt.getTime()), 0) / finished.length : 0;
  const ok = briefRuns.filter((r) => r.status === "done").length;
  const last = briefRuns[0];
  const anyActive = briefRuns.some((r) => r.status === "running" || r.status === "pending");
  const firstBriefRun = last?.id;

  return (
    <div className="space-y-8">
      {anyActive && <RunPinger />}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Last brief" value={last ? (STATUS[last.status]?.label ?? last.status) : "—"} note={last ? istDateTime(last.startedAt) : ""} small />
        <Kpi label="Briefs made" value={String(briefRuns.length)} note={`${ok} completed cleanly`} />
        <Kpi label="Typical run time" value={finished.length ? minutes(avg) : "—"} note="from start to published" />
        <Kpi label="YouTube units (last run)" value={last ? last.quotaUsed.toLocaleString("en-IN") : "—"} note="of 10,000 free per day" />
      </dl>

      <ol className="space-y-3">
        {runs.map((r) => {
          const s = STATUS[r.status] ?? { label: r.status, dot: "bg-faint" };
          const took = r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null;
          if (r.kind === "snapshot") {
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
                  Daily stats refresh
                </span>
                <span className="text-xs text-faint">
                  {istDateTime(r.startedAt)}
                  {took !== null && <> · {minutes(took)}</>} · {r.quotaUsed} units
                </span>
              </li>
            );
          }
          const reached = r.status === "done" || r.status === "degraded" ? PHASES.length : phaseIndex(r.currentStage);
          const stages = STAGES.map((st) => r.stages.find((x) => x.stage === st)).filter((x) => !!x);
          return (
            <li key={r.id} className={`glass reveal rounded-3xl p-5 sm:p-6 ${r.id === firstBriefRun ? "ring-gradient" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl tracking-tight">{r.kind === "weekly" ? "Weekly brief" : "Brief on demand"}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {istDateTime(r.startedAt)}
                    {took !== null && <> · took {minutes(took)}</>}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
                  {s.label}
                </span>
              </div>

              <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Steps">
                {PHASES.map((p, i) => {
                  const done = i < reached;
                  const now = r.status === "running" && i === reached;
                  return (
                    <li key={p.label} className="space-y-1.5">
                      <div className={`h-1.5 rounded-full ${done ? "bg-gradient-to-r from-accent to-accent-2" : now ? "live-dot bg-rising" : "bg-surface-sunk"}`} />
                      <p className={`hidden text-[11px] leading-tight sm:block ${done || now ? "text-text" : "text-faint"}`}>{p.label}</p>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                <span>
                  <span className="font-semibold text-text">{r.quotaUsed.toLocaleString("en-IN")}</span> YouTube units
                </span>
                <span>
                  <span className="font-semibold text-text">{r.geminiCalls}</span> AI calls
                </span>
                <span className="font-mono text-faint">run #{r.id}</span>
              </div>
              {r.coverageNote && <p className="mt-3 rounded-xl bg-surface-sunk px-3 py-2 text-sm text-muted">Note: {r.coverageNote}</p>}
              {r.error && <p className="mt-3 rounded-xl bg-surface-sunk px-3 py-2 text-sm text-danger">Problem: {r.error}</p>}

              {stages.length > 0 && (
                <details className="group mt-4 text-sm" open={r.id === firstBriefRun}>
                  <summary className="cursor-pointer list-none text-xs font-medium text-muted hover:text-text">
                    <span className="inline-block transition-transform group-open:rotate-90">›</span> Technical details
                  </summary>
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[32rem] text-left text-xs">
                      <thead className="bg-surface-sunk text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Stage</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Invocations</th>
                          <th className="px-3 py-2 font-medium">Failures</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stages.map((st) => (
                          <tr key={st.stage} className="border-t border-border align-top">
                            <td className="px-3 py-2 font-mono">{st.stage}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[st.status] ?? "bg-faint"}`} aria-hidden />
                                {st.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{secs(st.durationMs)}</td>
                            <td className="px-3 py-2 tabular-nums">{st.invocations}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {st.attempts}
                              {st.error && <span className="block max-w-[22rem] break-words text-danger">{st.error.slice(0, 220)}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">
        Want the raw status?{" "}
        <Link className="underline" href="/api/health">
          System health
        </Link>
      </p>
    </div>
  );
}

function Kpi({ label, value, note, small }: { label: string; value: string; note: string; small?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-2 font-serif leading-none tracking-tight tabular-nums ${small ? "text-2xl sm:text-3xl" : "text-4xl"}`}>{value}</dd>
      <p className="mt-2 line-clamp-1 text-xs text-faint">{note}</p>
    </div>
  );
}
