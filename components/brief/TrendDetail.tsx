/* eslint-disable @next/next/no-img-element -- thumbnails load straight from i.ytimg.com (no image-optimizer quota). */
import type { BriefCluster } from "@/lib/render/types";
import { compactNumber, duration, istDate, multiple, percent } from "@/lib/render/format";
import { FORMAT_PLAIN } from "@/lib/render/guide";
import { LifecycleTrack } from "./LifecycleTrack";

function Fact({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="border-t border-rule pt-3">
      <dd className="font-serif text-2xl font-medium tabular-nums leading-none sm:text-[1.7rem]">{value}</dd>
      <dt className="mt-1.5 text-sm text-text">{label}</dt>
      {note && <p className="mt-0.5 text-xs leading-snug text-muted">{note}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{children}</h3>;
}

/** One trend, laid out top-to-bottom in the order a creator decides: what → why → numbers → ideas → proof. */
export function TrendDetail({ c, index, total, headingRef }: { c: BriefCluster; index: number; total: number; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const outlier = c.stats.median_outlier;
  const shortsShare = c.stats.shorts_share;
  return (
    <article className="space-y-10" aria-labelledby={`trend-${c.id}-title`}>
      <header className="space-y-5">
        <p className="text-sm text-muted">
          Trend {index + 1} of {total}
        </p>
        <h2 id={`trend-${c.id}-title`} ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-medium leading-[1.15] tracking-tight outline-none sm:text-4xl">
          {c.theme_name}
        </h2>
        {c.mode === "full" ? (
          <p className="text-lg leading-relaxed text-text/90">{c.why_now}</p>
        ) : (
          <p className="rounded-md bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
            We couldn&apos;t write a reliable summary for this one, so it shows the numbers and example videos only.
          </p>
        )}
        <LifecycleTrack lifecycle={c.lifecycle} lowConfidence={c.lifecycle_confidence === "low"} />
      </header>

      {c.covered && (
        <p className="border-l-2 border-warn pl-4 text-sm leading-relaxed">
          <span className="font-semibold">You covered this on {istDate(c.covered.date)}</span> in{" "}
          <a className="underline" href={c.covered.url} target="_blank" rel="noreferrer">
            {c.covered.title}
          </a>
          . If you return to it, go for a follow-up angle.
        </p>
      )}

      <section>
        <SectionTitle>The numbers</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <Fact value={String(c.stats.creators)} label="creators covered it" note={`${c.stats.videos} videos this week`} />
          {outlier !== null && (
            <Fact value={multiple(outlier)} label="their usual views" note="Typical video here vs. that channel's normal" />
          )}
          <Fact
            value={c.stats.winning_format ? (FORMAT_PLAIN[c.stats.winning_format] ?? c.stats.winning_format).split(" (")[0] : "Mixed"}
            label="format that's working"
          />
          <Fact
            value={c.stats.typical_length_s ? duration(c.stats.typical_length_s) : "Shorts"}
            label="typical length"
            note={shortsShare > 0 ? `${percent(shortsShare)} are Shorts` : "No Shorts"}
          />
        </dl>
      </section>

      {c.angles && c.angles.length > 0 && (
        <section>
          <SectionTitle>Ideas for your video</SectionTitle>
          <ol className="space-y-3">
            {c.angles.map((a, i) => (
              <li key={a} className="flex gap-4">
                <span className="font-serif text-lg leading-6 text-accent">{i + 1}</span>
                <span className="leading-6">{a}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {c.questions.length > 0 && (
        <section>
          <SectionTitle>What viewers are asking</SectionTitle>
          <ul className="space-y-3">
            {c.questions.slice(0, 4).map((q) => (
              <li key={q.text} className="font-serif text-[1.05rem] italic leading-relaxed text-text/85">
                &ldquo;{q.text}&rdquo;
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Top comments on these videos. Answering them is an easy hook.</p>
        </section>
      )}

      {c.evidence.length > 0 && (
        <section>
          <SectionTitle>See the proof</SectionTitle>
          <ul className="divide-y divide-border border-y border-border">
            {c.evidence.map((v) => (
              <li key={v.id}>
                <a href={v.url} target="_blank" rel="noreferrer" className="group flex gap-4 py-3">
                  <img src={v.thumb} alt="" loading="lazy" width={160} height={90} className="aspect-video w-28 shrink-0 rounded bg-surface-2 object-cover sm:w-36" />
                  <span className="min-w-0 space-y-1">
                    <span className="line-clamp-2 text-[0.95rem] font-medium leading-snug group-hover:underline">{v.title}</span>
                    <span className="block text-xs text-muted">
                      {v.channel} · {compactNumber(v.views)} views · {istDate(v.published_at)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
