import { LIFECYCLE_GUIDE, LIFECYCLE_ORDER } from "@/lib/render/guide";

/** Four-step track (Early → Picking up → Busy → Crowded) with the current stage highlighted. */
export function LifecycleTrack({ lifecycle, lowConfidence }: { lifecycle: string; lowConfidence?: boolean }) {
  const current = Math.max(0, LIFECYCLE_ORDER.indexOf(lifecycle as (typeof LIFECYCLE_ORDER)[number]));
  const g = LIFECYCLE_GUIDE[lifecycle] ?? LIFECYCLE_GUIDE.peaking;
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-4 gap-1" aria-label={`Trend stage: ${g.label}`}>
        {LIFECYCLE_ORDER.map((s, i) => {
          const on = i === current;
          return (
            <li key={s} aria-current={on ? "step" : undefined} className="space-y-1.5">
              <div className={`h-1.5 rounded-full ${on ? "bg-current " + LIFECYCLE_GUIDE[s].tone : i < current ? "bg-rule" : "bg-surface-2"}`} />
              <div className={`text-[11px] leading-tight ${on ? `font-semibold ${LIFECYCLE_GUIDE[s].tone}` : "text-faint"}`}>
                {LIFECYCLE_GUIDE[s].short}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm leading-relaxed text-muted">
        <span className={`font-semibold ${g.tone}`}>{g.label}.</span> {g.advice}
        {lowConfidence && <span className="text-faint"> (Early estimate: we need a few weeks of history to be sure.)</span>}
      </p>
    </div>
  );
}
