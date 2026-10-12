import Link from "next/link";
import { minutesSince, PHASES, phaseIndex } from "@/lib/render/guide";
import { RunPinger } from "./RunPinger";

/** Plain-language progress for a brief being generated right now. */
export function RunProgress({ stage, startedAt, compact = false }: { stage: string; startedAt: Date; compact?: boolean }) {
  const current = phaseIndex(stage);
  const mins = minutesSince(startedAt);
  return (
    <section aria-label="New brief in progress" className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-sm">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
        <span className="font-medium">A new brief is being prepared</span>
        <span className="text-muted"> · started {mins} min ago · usually takes 10–15 min</span>
      </p>
      {!compact && (
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
          {PHASES.map((p, i) => (
            <li key={p.label} className="flex items-start gap-2 sm:flex-col sm:gap-1.5">
              <span className={`mt-1.5 h-1.5 w-6 shrink-0 rounded-full sm:mt-0 sm:w-full ${i < current ? "bg-text/50" : i === current ? "bg-accent" : "bg-rule"}`} />
              <span className={i === current ? "font-medium" : i < current ? "text-muted" : "text-faint"}>{p.label}</span>
            </li>
          ))}
        </ol>
      )}
      <RunPinger />
      <p className="mt-3 text-xs text-muted">
        This page updates by itself, and keeping it open helps the brief finish. Details are on the{" "}
        <Link href="/runs" className="underline">
          run log
        </Link>
        .
      </p>
    </section>
  );
}
