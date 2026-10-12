import Link from "next/link";
import { minutesSince, PHASES, phaseIndex } from "@/lib/render/guide";
import { RunPinger } from "./RunPinger";

/** Live card for a brief being generated right now (self-refreshing; also nudges stalled runs). */
export function RunProgress({ stage, startedAt, compact = false }: { stage: string; startedAt: Date; compact?: boolean }) {
  const current = phaseIndex(stage);
  const mins = minutesSince(startedAt);
  const pct = Math.round((Math.min(current + 0.5, PHASES.length) / PHASES.length) * 100);
  return (
    <section aria-label="New brief in progress" className="glass ring-gradient overflow-hidden rounded-3xl">
      <div className="h-1 bg-surface-sunk">
        <div className="h-1 bg-gradient-to-r from-accent to-accent-2 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="live-dot h-2 w-2 rounded-full bg-accent" />
          <span className="font-semibold">A new brief is being prepared</span>
          <span className="text-sm text-muted">started {mins} min ago · usually 10–15 min</span>
        </div>
        {!compact && (
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {PHASES.map((p, i) => (
              <li
                key={p.label}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs sm:flex-col sm:items-start ${
                  i === current ? "border-accent/40 bg-accent-soft text-text" : i < current ? "border-border bg-surface text-muted" : "border-border text-faint"
                }`}
              >
                <span className="font-mono">{i < current ? "✓" : String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium">{p.label}</span>
              </li>
            ))}
          </ol>
        )}
        <RunPinger />
        <p className="text-xs text-muted">
          This page updates by itself, and keeping it open helps the brief finish.{" "}
          <Link href="/runs" className="underline">
            See the run log
          </Link>
        </p>
      </div>
    </section>
  );
}
