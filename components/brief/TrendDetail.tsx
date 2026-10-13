/* eslint-disable @next/next/no-img-element -- thumbnails load straight from i.ytimg.com (no image-optimizer quota). */
import type { BriefCluster } from "@/lib/render/types";
import { compactNumber, duration, istDate, multiple, percent } from "@/lib/render/format";
import { FORMAT_PLAIN } from "@/lib/render/guide";
import { LifecycleChip, LifecycleTrack } from "./LifecycleTrack";

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <dd className="font-serif text-[2rem] leading-none tracking-tight tabular-nums">{value}</dd>
      <dt className="mt-2 text-sm font-medium text-text">{label}</dt>
      {note && <p className="mt-0.5 text-xs leading-snug text-muted">{note}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{children}</h3>;
}

/** One trend in full: what → why now → numbers → ideas → audience → proof. */
export function TrendDetail({
  c,
  index,
  total,
  headingRef,
  isPicked,
  onTogglePick,
}: {
  c: BriefCluster;
  index: number;
  total: number;
  headingRef?: React.Ref<HTMLHeadingElement>;
  isPicked?: (idea: string) => boolean;
  onTogglePick?: (idea: string) => void;
}) {
  const format = c.stats.winning_format ? (FORMAT_PLAIN[c.stats.winning_format] ?? c.stats.winning_format).split(" (")[0] : "Mixed";
  return (
    <article className="swap-in space-y-8" aria-labelledby={`trend-${c.id}-title`}>
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-mono text-xs text-faint">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <LifecycleChip lifecycle={c.lifecycle} className="border border-border bg-surface" />
          {c.confidence && <span className="text-xs text-faint">AI confidence: {c.confidence}</span>}
        </div>
        <h2
          id={`trend-${c.id}-title`}
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-4xl leading-[1.05] tracking-tight outline-none sm:text-5xl"
        >
          {c.theme_name}
        </h2>
        {c.mode === "full" ? (
          <p className="max-w-3xl text-lg leading-relaxed text-muted">{c.why_now}</p>
        ) : (
          <p className="max-w-3xl rounded-xl border border-border bg-surface-sunk px-4 py-3 text-sm text-muted">
            We couldn&apos;t write a reliable summary for this one, so here are the numbers and example videos.
          </p>
        )}
        {c.covered && (
          <p className="flex max-w-3xl items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden />
            <span>
              <span className="font-semibold">You covered this on {istDate(c.covered.date)}</span> in{" "}
              <a className="underline" href={c.covered.url} target="_blank" rel="noreferrer">
                {c.covered.title}
              </a>
              . If you return to it, go for a follow-up angle.
            </span>
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <aside className="space-y-6 lg:col-span-5 lg:self-start lg:sticky lg:top-28">
          <section>
            <Label>The numbers</Label>
            <dl className="grid grid-cols-2 gap-3">
              <Stat value={String(c.stats.creators)} label="creators covered it" note={`${c.stats.videos} videos this week`} />
              {c.stats.median_outlier !== null ? (
                <Stat value={multiple(c.stats.median_outlier)} label="their usual views" note="vs. each channel's normal" />
              ) : (
                <Stat value="—" label="their usual views" note="not enough channel history" />
              )}
              <Stat value={format} label="format that's working" />
              <Stat
                value={c.stats.typical_length_s ? duration(c.stats.typical_length_s) : "Shorts"}
                label="typical length"
                note={c.stats.shorts_share > 0 ? `${percent(c.stats.shorts_share)} are Shorts` : "no Shorts"}
              />
            </dl>
          </section>
          <section className="rounded-2xl border border-border bg-surface p-4">
            <Label>Where it is in its life</Label>
            <LifecycleTrack lifecycle={c.lifecycle} lowConfidence={c.lifecycle_confidence === "low"} />
          </section>
        </aside>

        <div className="space-y-8 lg:col-span-7">
          {c.angles && c.angles.length > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Label>Ideas for your video</Label>
                {onTogglePick && <span className="text-xs text-faint">Tap to pick · picks go to Your plan &amp; Idea Studio</span>}
              </div>
              <ol className="space-y-2.5">
                {c.angles.map((a, i) => {
                  const on = isPicked?.(a) ?? false;
                  const body = (
                    <>
                      <span className="text-gradient w-6 shrink-0 font-serif text-3xl leading-none">{i + 1}</span>
                      <span className="flex-1 pt-1 leading-relaxed">{a}</span>
                      {onTogglePick && (
                        <span
                          aria-hidden
                          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all ${
                            on ? "btn-primary border-transparent" : "border-border-strong text-transparent group-hover:text-faint"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={a}>
                      {onTogglePick ? (
                        <button
                          type="button"
                          onClick={() => onTogglePick(a)}
                          aria-pressed={on}
                          className={`group flex w-full gap-4 rounded-2xl border p-4 text-left transition-all duration-200 ${
                            on ? "ring-gradient border-transparent bg-accent-soft" : "border-border bg-surface hover:-translate-y-0.5 hover:border-border-strong"
                          }`}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex gap-4 rounded-2xl border border-border bg-surface p-4">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {c.questions.length > 0 && (
            <section>
              <Label>What viewers are asking</Label>
              <ul className="space-y-2.5">
                {c.questions.slice(0, 4).map((q) => (
                  <li key={q.text} className="relative rounded-2xl rounded-tl-md border border-border bg-surface-sunk px-4 py-3">
                    <p className="font-serif text-lg italic leading-snug">&ldquo;{q.text}&rdquo;</p>
                    {q.likes > 0 && <p className="mt-1 text-xs text-faint">{compactNumber(q.likes)} likes</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Top comments on these videos. Answering them makes an easy hook.</p>
            </section>
          )}

          {c.evidence.length > 0 && (
            <section>
              <Label>See the proof</Label>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {c.evidence.map((v) => (
                  <li key={v.id}>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group block overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:border-border-strong"
                    >
                      <div className="relative aspect-video overflow-hidden bg-surface-sunk">
                        <img
                          src={v.thumb}
                          alt=""
                          loading="lazy"
                          width={320}
                          height={180}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                          {compactNumber(v.views)} views
                        </span>
                      </div>
                      <div className="space-y-1 p-3">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</p>
                        <p className="text-xs text-muted">
                          {v.channel} · {istDate(v.published_at)}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
