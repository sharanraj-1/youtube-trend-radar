import { LIFECYCLE_GUIDE, LIFECYCLE_ORDER } from "@/lib/render/guide";

/** Status chip: colored dot carries the state, the label stays in text ink (never color alone). */
export function LifecycleChip({ lifecycle, className = "" }: { lifecycle: string; className?: string }) {
  const g = LIFECYCLE_GUIDE[lifecycle] ?? LIFECYCLE_GUIDE.peaking;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      <span className={`h-2 w-2 rounded-full ${g.dot}`} aria-hidden />
      {g.label}
    </span>
  );
}

/** Four-step track (Early → Picking up → Busy → Crowded) with the current stage highlighted. */
export function LifecycleTrack({ lifecycle, lowConfidence }: { lifecycle: string; lowConfidence?: boolean }) {
  const current = Math.max(0, LIFECYCLE_ORDER.indexOf(lifecycle as (typeof LIFECYCLE_ORDER)[number]));
  const g = LIFECYCLE_GUIDE[lifecycle] ?? LIFECYCLE_GUIDE.peaking;
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-4 gap-1.5" aria-label={`Trend stage: ${g.label}`}>
        {LIFECYCLE_ORDER.map((s, i) => {
          const on = i === current;
          return (
            <li key={s} aria-current={on ? "step" : undefined} className="space-y-1.5">
              <div className={`h-1.5 rounded-full ${on ? LIFECYCLE_GUIDE[s].dot : i < current ? "bg-border-strong" : "bg-surface-sunk"}`} />
              <div className={`text-[11px] leading-tight ${on ? "font-semibold text-text" : "text-faint"}`}>{LIFECYCLE_GUIDE[s].short}</div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm leading-relaxed text-muted">
        <span className="font-semibold text-text">{g.label}.</span> {g.advice}
        {lowConfidence && <span className="text-faint"> Early estimate: a few weeks of history will sharpen this.</span>}
      </p>
    </div>
  );
}
