import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { RunPinger } from "@/components/RunPinger";
import { listRuns } from "@/lib/queries";
import { istDateTime } from "@/lib/render/format";
import { minutes, PHASES, phaseIndex, RUN_STATUS_PLAIN } from "@/lib/render/guide";
import { STAGES } from "@/lib/pipeline/types";

export const metadata = { title: "Run log" };

export default function RunsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-serif text-4xl font-medium tracking-tight">Run log</h1>
        <p className="max-w-2xl text-muted">
          Each time a brief is made, it&apos;s recorded here: when it ran, how long it took, and whether every step worked. Daily stat
          refreshes appear too.
        </p>
      </header>
      <Suspense fallback={<LoadingBlock lines={3} />}>
        <Runs />
      </Suspense>
    </div>
  );
}

const STAGE_TONE: Record<string, string> = {
  done: "text-ok",
  failed: "text-accent",
  skipped: "text-accent",
  running: "text-rising",
  pending: "text-muted",
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

  const firstBriefRun = runs.find((r) => r.kind !== "snapshot")?.id;
  const anyActive = runs.some((r) => r.kind !== "snapshot" && (r.status === "running" || r.status === "pending"));
  return (
    <ol className="divide-y divide-border border-y border-border">
      {anyActive && <RunPinger />}
      {runs.map((r) => {
        const s = RUN_STATUS_PLAIN[r.status] ?? { label: r.status, tone: "text-muted" };
        const took = r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null;
        const isSnapshot = r.kind === "snapshot";
        const reached = phaseIndex(r.currentStage);
        const stages = STAGES.map((st) => r.stages.find((x) => x.stage === st)).filter((x) => !!x);
        const title = isSnapshot ? "Daily stats refresh" : r.kind === "weekly" ? "Weekly brief (scheduled)" : "Brief (started manually)";
        return (
          <li key={r.id} className="py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className={isSnapshot ? "text-sm text-muted" : "font-serif text-xl"}>{title}</h2>
              <span className={`text-sm font-medium ${s.tone}`}>{s.label}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {istDateTime(r.startedAt)}
              {took !== null && <> · took {minutes(took)}</>}
              {!isSnapshot && <> · {r.quotaUsed.toLocaleString("en-IN")} of 10,000 daily YouTube units · {r.geminiCalls} AI calls</>}
            </p>

            {!isSnapshot && (
              <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Steps">
                {PHASES.map((p, i) => {
                  const done = r.status === "done" || r.status === "degraded" ? true : i < reached;
                  const current = r.status === "running" && i === reached;
                  return (
                    <li key={p.label} className={current ? "font-medium text-rising" : done ? "text-text" : "text-faint"}>
                      {done ? "✓" : current ? "●" : "○"} {p.label}
                    </li>
                  );
                })}
              </ol>
            )}
            {r.coverageNote && <p className="mt-2 text-sm text-warn">Note: {r.coverageNote}</p>}
            {r.error && <p className="mt-2 text-sm text-accent">Problem: {r.error}</p>}

            {stages.length > 0 && (
              <details className="mt-3 text-sm" open={r.id === firstBriefRun}>
                <summary className="cursor-pointer text-muted hover:text-text">Technical details</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-left text-xs">
                    <thead className="text-muted">
                      <tr className="border-b border-border">
                        <th className="py-1.5 pr-3 font-medium">Stage</th>
                        <th className="py-1.5 pr-3 font-medium">Status</th>
                        <th className="py-1.5 pr-3 font-medium">Time</th>
                        <th className="py-1.5 pr-3 font-medium">Invocations</th>
                        <th className="py-1.5 font-medium">Failures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((st) => (
                        <tr key={st.stage} className="border-b border-border/60 align-top">
                          <td className="py-1.5 pr-3 font-mono">{st.stage}</td>
                          <td className={`py-1.5 pr-3 ${STAGE_TONE[st.status] ?? ""}`}>{st.status}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{secs(st.durationMs)}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{st.invocations}</td>
                          <td className="py-1.5 tabular-nums">
                            {st.attempts}
                            {st.error && <span className="block max-w-[22rem] break-words text-accent">{st.error.slice(0, 220)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-faint">Run #{r.id}</p>
                </div>
              </details>
            )}
          </li>
        );
      })}
      <li className="py-4 text-xs text-muted">
        Want the raw status? See <Link className="underline" href="/api/health">system health</Link>.
      </li>
    </ol>
  );
}
