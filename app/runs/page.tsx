import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { listRuns } from "@/lib/queries";
import { istDateTime } from "@/lib/render/format";
import { STAGES } from "@/lib/pipeline/types";

export const metadata = { title: "Runs" };

export default function RunsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run log</h1>
        <p className="mt-1 text-sm text-muted">
          Every pipeline run, stage by stage: status, time spent, retries, YouTube quota and Gemini calls. Snapshot runs refresh video stats daily.
        </p>
      </div>
      <Suspense fallback={<LoadingBlock lines={3} />}>
        <Runs />
      </Suspense>
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  done: "bg-ok/15 text-ok",
  degraded: "bg-warn/15 text-warn",
  failed: "bg-accent/15 text-accent",
  skipped: "bg-accent/15 text-accent",
  running: "bg-[var(--rising)]/15 text-[var(--rising)]",
  pending: "bg-surface-2 text-muted",
};

const secs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`);

async function Runs() {
  await connection();
  let runs: Awaited<ReturnType<typeof listRuns>>;
  try {
    runs = await listRuns();
  } catch {
    return <ErrorState what="the run log" />;
  }
  if (runs.length === 0) return <EmptyState title="No runs yet" />;
  return (
    <ul className="space-y-4">
      {runs.map((r) => {
        const total = r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null;
        const stages = STAGES.map((s) => r.stages.find((x) => x.stage === s)).filter((s) => !!s);
        return (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-mono font-semibold">#{r.id}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted">{r.kind}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${STATUS_CLS[r.status] ?? ""}`}>{r.status}</span>
              {r.status === "running" && <span className="text-xs text-muted">at {r.currentStage}</span>}
              <span className="text-muted">{istDateTime(r.startedAt)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs sm:max-w-md">
              <div>
                <dt className="text-muted">Wall time</dt>
                <dd className="font-semibold tabular-nums">{total !== null ? secs(total) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">YouTube quota</dt>
                <dd className="font-semibold tabular-nums">{r.quotaUsed} units</dd>
              </div>
              <div>
                <dt className="text-muted">Gemini calls</dt>
                <dd className="font-semibold tabular-nums">{r.geminiCalls}</dd>
              </div>
            </dl>
            {stages.length > 0 && (
              <ol className="mt-3 flex flex-wrap gap-1.5">
                {stages.map((s) => (
                  <li
                    key={s.stage}
                    title={s.error ?? undefined}
                    className={`rounded-md px-2 py-1 text-xs ${STATUS_CLS[s.status] ?? "bg-surface-2"}`}
                  >
                    <span className="font-semibold">{s.stage}</span> <span className="tabular-nums opacity-80">{secs(s.durationMs)}</span>
                    {s.invocations > 1 && <span className="opacity-70"> · {s.invocations} calls</span>}
                    {s.attempts > 0 && <span className="opacity-70"> · {s.attempts} fail</span>}
                  </li>
                ))}
              </ol>
            )}
            {r.coverageNote && <p className="mt-3 text-xs text-muted">Coverage: {r.coverageNote}</p>}
            {r.error && <p className="mt-2 text-xs text-accent">Error: {r.error}</p>}
            {r.stages.some((s) => s.error) && (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">Stage errors</summary>
                <ul className="mt-1 space-y-1">
                  {r.stages
                    .filter((s) => s.error)
                    .map((s) => (
                      <li key={s.stage}>
                        <span className="font-semibold">{s.stage}:</span> {s.error}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
