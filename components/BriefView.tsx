/* eslint-disable @next/next/no-img-element -- YouTube thumbnails are served directly from i.ytimg.com (no optimizer quota). */
import type { BriefCluster, BriefJson } from "@/lib/render/types";
import { compactNumber, duration, FORMAT_LABEL, istDate, istDateTime, multiple, percent } from "@/lib/render/format";

const LIFECYCLE: Record<string, { label: string; cls: string; hint: string }> = {
  emerging: { label: "Emerging", cls: "bg-[var(--emerging)]", hint: "New this month, few creators, overperforming" },
  rising: { label: "Rising", cls: "bg-[var(--rising)]", hint: "More creators joining week over week" },
  peaking: { label: "Peaking", cls: "bg-[var(--peaking)]", hint: "Crowded; performance flat" },
  saturated: { label: "Saturated", cls: "bg-[var(--saturated)]", hint: "Late to the party" },
};

export function BriefView({ brief, createdAt }: { brief: BriefJson; createdAt: Date }) {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sunday Content Strategy Brief · {istDate(createdAt)}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {brief.clusters.length ? `${brief.clusters.length} trends worth a look this week` : "No strong trends this week"}
        </h1>
        {brief.banner && (
          <p role="status" className={`rounded-lg px-4 py-3 text-sm ${brief.status === "fallback" ? "bg-accent-soft text-accent" : "bg-surface-2 text-warn"}`}>
            {brief.banner}
          </p>
        )}
        {brief.week_summary && <p className="max-w-2xl text-lg leading-relaxed text-muted">{brief.week_summary}</p>}
        {brief.lifecycle_note && <p className="text-sm text-muted">{brief.lifecycle_note}</p>}
      </header>

      <ol className="space-y-6">
        {brief.clusters.map((c, i) => (
          <li key={c.id}>
            <ClusterCard c={c} rank={i + 1} />
          </li>
        ))}
      </ol>

      {brief.skip.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Skip this week</h2>
          <p className="mb-3 text-sm text-muted">Saturated topics: lots of creators, underwhelming performance.</p>
          <ul className="divide-y divide-border text-sm">
            {brief.skip.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span>{s.label}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {s.creators} creators · {multiple(s.median_outlier)} median
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-1 border-t border-border pt-4 text-xs leading-relaxed text-muted">
        <p>
          Data collected {istDateTime(brief.collected_at)} · {brief.footer.sources.peer_channels.length} peer channels ({brief.footer.sources.peer_channels.join(", ") || "none"}), {brief.footer.sources.chart}, {brief.footer.sources.searches} keyword searches · {brief.footer.sources.videos_analysed} videos analysed
        </p>
        {brief.footer.sources.unresolved_handles.length > 0 && <p>Unresolved handles (dropped): {brief.footer.sources.unresolved_handles.join(", ")}</p>}
        <p>
          YouTube quota used: {brief.footer.quota_used} units · Gemini calls: {brief.footer.gemini_calls} · Run #{brief.run_id ?? "—"} · {brief.footer.prompt_versions.join(", ")}
        </p>
        {brief.footer.coverage_note && <p>Coverage: {brief.footer.coverage_note}</p>}
      </footer>
    </article>
  );
}

function ClusterCard({ c, rank }: { c: BriefCluster; rank: number }) {
  const lc = LIFECYCLE[c.lifecycle] ?? LIFECYCLE.peaking;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-muted">#{rank}</span>
          <span title={lc.hint} className={`rounded-full px-2.5 py-0.5 font-semibold text-white ${lc.cls}`}>
            {lc.label}
          </span>
          {c.lifecycle_confidence === "low" && <span className="text-muted">low confidence</span>}
          {c.confidence && <span className="text-muted">· model confidence: {c.confidence}</span>}
        </div>
        <div>
          <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{c.theme_name}</h2>
          {c.mode === "full" ? (
            <p className="mt-2 leading-relaxed text-muted">{c.why_now}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">Stats-only card: the narrative didn&apos;t pass validation ({c.stats_only_reason}).</p>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-center sm:grid-cols-6">
          <Stat label="Creators" value={String(c.stats.creators)} />
          <Stat label="Videos" value={String(c.stats.videos)} />
          <Stat label="Median outlier" value={multiple(c.stats.median_outlier)} />
          <Stat label="Winning format" value={c.stats.winning_format ? FORMAT_LABEL[c.stats.winning_format] ?? c.stats.winning_format : "—"} />
          <Stat label="Typical length" value={duration(c.stats.typical_length_s)} />
          <Stat label="Shorts share" value={percent(c.stats.shorts_share)} />
        </dl>

        {c.covered && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-medium text-warn">You covered this on {istDate(c.covered.date)}:</span>{" "}
            <a className="underline" href={c.covered.url} target="_blank" rel="noreferrer">
              {c.covered.title}
            </a>
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {c.angles && c.angles.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Suggested angles</h3>
              <ul className="space-y-1.5 text-sm leading-relaxed">
                {c.angles.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.questions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Audience is asking</h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-muted">
                {c.questions.map((q) => (
                  <li key={q.text} className="border-l-2 border-border pl-3">
                    “{q.text}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Evidence</h3>
          <ul className="grid gap-3 sm:grid-cols-3">
            {c.evidence.map((v) => (
              <li key={v.id}>
                <a href={v.url} target="_blank" rel="noreferrer" className="group block">
                  <img src={v.thumb} alt="" loading="lazy" width={320} height={180} className="aspect-video w-full rounded-lg bg-surface-2 object-cover" />
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug group-hover:underline">{v.title}</p>
                  <p className="text-xs text-muted">
                    {v.channel} · {compactNumber(v.views)} views · {istDate(v.published_at)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface-2 px-5 py-3 text-sm sm:px-6">
        <a href={c.feedback.up} className="rounded-md px-2.5 py-1 hover:bg-surface">👍 Useful</a>
        <a href={c.feedback.down} className="rounded-md px-2.5 py-1 hover:bg-surface">👎 Not for me</a>
        <a href={c.feedback.filmed} className="rounded-md px-2.5 py-1 hover:bg-surface">🎬 Filming this</a>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
