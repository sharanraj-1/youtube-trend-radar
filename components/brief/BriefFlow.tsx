"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails load straight from i.ytimg.com (no image-optimizer quota). */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { BriefCluster, BriefJson } from "@/lib/render/types";
import { compactNumber, istDate, istDateTime, multiple } from "@/lib/render/format";
import { DECISIONS, FORMAT_PLAIN, LIFECYCLE_GUIDE, localPath, type Decision } from "@/lib/render/guide";
import { LifecycleChip } from "./LifecycleTrack";
import { TrendDetail } from "./TrendDetail";

// ───────── slider geometry: centred on phones, left-aligned with the page from 640px ─────────
const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
function targetLeft(track: HTMLElement, card: HTMLElement) {
  if (isWide()) return card.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft || "0");
  return card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
}

// ───────── decisions: localStorage per brief, read via useSyncExternalStore (no hydration mismatch) ─────────
const storageKey = (id: number) => `tr-decisions-${id}`;
const CHANGE = "tr-decisions-change";
function readRaw(id: number): string {
  try {
    return localStorage.getItem(storageKey(id)) ?? "{}";
  } catch {
    return "{}";
  }
}
function writeDecisions(id: number, d: Record<number, Decision>) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(d));
  } catch {
    // private mode / storage blocked: the vote is still sent to the server
  }
  window.dispatchEvent(new Event(CHANGE));
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE, cb);
  };
}
function parse(raw: string): Record<number, Decision> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const DECISION_ICON: Record<Decision, React.ReactNode> = {
  filmed: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  up: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  down: <path d="M7 7l10 10M17 7L7 17" />,
};
function Icon({ d, className = "h-4 w-4" }: { d: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {d}
    </svg>
  );
}
const Chevron = ({ dir }: { dir: "left" | "right" }) => <Icon d={<path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />} className="h-5 w-5" />;

/**
 * The brief: hero + momentum board → swipeable trend slider → the selected trend in full with a decision → your plan.
 */
export function BriefFlow({ brief, briefId, createdAt }: { brief: BriefJson; briefId: number; createdAt: string }) {
  const trends = brief.clusters;
  const total = trends.length;
  const [active, setActive] = useState(0);
  const raw = useSyncExternalStore(subscribe, () => readRaw(briefId), () => "{}");
  const decisions = useMemo(() => parse(raw), [raw]);
  const trackRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLElement>(null);
  /** While the slider is animating to a card we chose, ignore its scroll events until it arrives. */
  const target = useRef<number | null>(null);

  const decidedCount = trends.filter((c) => decisions[c.id]).length;

  /** Scroll the track so card i is centred, and select it. */
  const goTo = useCallback(
    (i: number, opts: { scrollPage?: boolean } = {}) => {
      const idx = Math.max(0, Math.min(total - 1, i));
      setActive(idx);
      const track = trackRef.current;
      const card = track?.children[idx] as HTMLElement | undefined;
      if (track && card) {
        const max = track.scrollWidth - track.clientWidth;
        const left = Math.max(0, Math.min(max, targetLeft(track, card)));
        target.current = left;
        track.scrollTo({ left, behavior: "smooth" });
        window.setTimeout(() => {
          if (target.current === left) target.current = null; // safety net if the animation never lands
        }, 1500);
      }
      if (opts.scrollPage) sliderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [total],
  );

  // Swiping / trackpad: select whichever card is nearest the centre.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const release = () => (target.current = null); // a real swipe/wheel takes over from programmatic scrolling
    const onScroll = () => {
      if (target.current !== null) {
        if (Math.abs(track.scrollLeft - target.current) <= 2) target.current = null;
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let best = 0;
        let bestDist = Infinity;
        Array.from(track.children).forEach((el, i) => {
          const e = el as HTMLElement;
          const d = Math.abs(targetLeft(track, e) - track.scrollLeft);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        setActive(best);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("pointerdown", release, { passive: true });
    track.addEventListener("wheel", release, { passive: true });
    track.addEventListener("touchstart", release, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("pointerdown", release);
      track.removeEventListener("wheel", release);
      track.removeEventListener("touchstart", release);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Keyboard: ← / → move between trends (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") goTo(active + 1);
      if (e.key === "ArrowLeft") goTo(active - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo]);

  function decide(c: BriefCluster, d: Decision) {
    writeDecisions(briefId, { ...decisions, [c.id]: d });
    fetch(localPath(c.feedback[d]), { cache: "no-store" }).catch(() => {}); // signed feedback link, fire-and-forget
    const idx = trends.findIndex((t) => t.id === c.id);
    if (idx < total - 1) window.setTimeout(() => goTo(idx + 1, { scrollPage: true }), 350);
    else window.setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" }), 350);
  }

  if (total === 0) {
    return (
      <div className="space-y-10">
        <Hero brief={brief} briefId={briefId} createdAt={createdAt} title={<>Nothing stood out <em className="text-gradient">this week</em></>} />
        <p className="max-w-2xl text-lg text-muted">
          No topic had enough creators and strong enough views to make the cut, which makes it a good week for evergreen ideas.
        </p>
        <MadeHow brief={brief} />
      </div>
    );
  }

  const current = trends[active];
  return (
    <div className="space-y-16 sm:space-y-20">
      <Hero
        brief={brief}
        briefId={briefId}
        createdAt={createdAt}
        title={
          <>
            {total} trend{total === 1 ? "" : "s"} worth <em className="text-gradient pr-1">filming</em> this week
          </>
        }
        onStart={() => goTo(0, { scrollPage: true })}
        decided={decidedCount}
        total={total}
        momentum={<Momentum trends={trends} active={active} onPick={(i) => goTo(i, { scrollPage: true })} />}
      />

      {/* ───────── Slider ───────── */}
      <section ref={sliderRef} id="trends" aria-roledescription="carousel" aria-label="This week's trends" className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Swipe through this week&apos;s trends</p>
            <h2 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">Pick what you&apos;ll film</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-sm tabular-nums text-muted sm:inline">
              <span className="text-text">{String(active + 1).padStart(2, "0")}</span> / {String(total).padStart(2, "0")}
            </span>
            <button
              onClick={() => goTo(active - 1)}
              disabled={active === 0}
              aria-label="Previous trend"
              className="glass grid h-11 w-11 place-items-center rounded-full transition hover:border-border-strong disabled:opacity-35"
            >
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => goTo(active + 1)}
              disabled={active === total - 1}
              aria-label="Next trend"
              className="glass grid h-11 w-11 place-items-center rounded-full transition hover:border-border-strong disabled:opacity-35"
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>

        <div className="-mx-4 sm:-mx-6">
          <div ref={trackRef} className="snap-track fade-edges flex gap-4 overflow-x-auto px-[7vw] py-4 sm:gap-5 sm:pl-6 sm:pr-[calc(100%-420px-1.5rem)]">
            {trends.map((c, i) => (
              <SlideCard key={c.id} c={c} i={i} total={total} active={i === active} decision={decisions[c.id]} onSelect={() => goTo(i)} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Choose a trend">
          {trends.map((c, i) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={i === active}
              aria-label={`Trend ${i + 1}: ${c.theme_name}`}
              onClick={() => goTo(i)}
              className="group grid h-6 place-items-center px-0.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? "w-8 bg-accent" : decisions[c.id] ? "w-3 bg-text/50" : "w-3 bg-border-strong group-hover:bg-text/40"
                }`}
              />
            </button>
          ))}
        </div>
      </section>

      {/* ───────── Selected trend ───────── */}
      <section aria-live="polite" className="glass rounded-[2rem] p-5 sm:p-8 lg:p-10">
        <TrendDetail key={current.id} c={current} index={active} total={total} />
        <DecisionBar c={current} current={decisions[current.id]} onDecide={(d) => decide(current, d)} />
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5 text-sm">
          <button onClick={() => goTo(active - 1, { scrollPage: true })} disabled={active === 0} className="flex items-center gap-1 text-muted transition hover:text-text disabled:opacity-0">
            <Chevron dir="left" /> Previous
          </button>
          {active < total - 1 ? (
            <button onClick={() => goTo(active + 1, { scrollPage: true })} className="flex items-center gap-1 font-medium transition hover:text-accent">
              Next trend <Chevron dir="right" />
            </button>
          ) : (
            <a href="#plan" className="flex items-center gap-1 font-medium transition hover:text-accent">
              See your plan <Chevron dir="right" />
            </a>
          )}
        </div>
      </section>

      <Plan brief={brief} decisions={decisions} onPick={(i) => goTo(i, { scrollPage: true })} />
    </div>
  );
}

// ───────────────────────── Hero ─────────────────────────
function Hero({
  brief,
  briefId,
  createdAt,
  title,
  onStart,
  decided = 0,
  total = 0,
  momentum,
}: {
  brief: BriefJson;
  briefId: number;
  createdAt: string;
  title: React.ReactNode;
  onStart?: () => void;
  decided?: number;
  total?: number;
  momentum?: React.ReactNode;
}) {
  const emerging = brief.clusters.filter((c) => c.lifecycle === "emerging").length;
  const top = [...brief.clusters].sort((a, b) => (b.stats.median_outlier ?? 0) - (a.stats.median_outlier ?? 0))[0];
  return (
    <section className="space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
        <div className="space-y-6 lg:col-span-7">
          <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
            Sunday brief · {istDate(createdAt)} · No. {briefId}
          </p>
          <h1 className="rise rise-1 font-serif text-5xl leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">{title}</h1>
          {brief.banner && (
            <p role="status" className="rise rise-2 flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${brief.status === "fallback" ? "bg-danger" : "bg-warn"}`} aria-hidden />
              {brief.status === "fallback"
                ? "This is last week's brief. This week's run didn't finish in time, so double-check before filming."
                : "Some data was limited this week, so a few parts may be thinner than usual. Details are at the bottom."}
            </p>
          )}
          {brief.week_summary && <p className="rise rise-2 max-w-2xl text-lg leading-relaxed text-muted">{brief.week_summary}</p>}
          {onStart && (
            <div className="rise rise-3 flex flex-wrap items-center gap-4">
              <button onClick={onStart} className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold">
                {decided > 0 && decided < total ? "Continue reviewing" : "Start reviewing"}
                <Chevron dir="right" />
              </button>
              <span className="text-sm text-muted">
                {decided > 0 ? `${decided} of ${total} decided` : "About 10 minutes · one trend at a time"}
              </span>
            </div>
          )}
        </div>
        {momentum && <div className="rise rise-3 lg:col-span-5">{momentum}</div>}
      </div>

      <dl className="rise rise-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Videos analysed" value={String(brief.footer.sources.videos_analysed)} note={`from ${brief.footer.sources.searches} searches + ${brief.footer.sources.peer_channels.length} peers`} />
        <Kpi label="Trends found" value={String(brief.clusters.length)} note={brief.skip.length ? `+ ${brief.skip.length} to skip` : "none to skip"} />
        <Kpi label="Emerging now" value={String(emerging)} note={emerging ? "early chances to move first" : "nothing brand-new"} />
        <Kpi label="Strongest momentum" value={top?.stats.median_outlier != null ? multiple(top.stats.median_outlier) : "—"} note={top ? top.theme_name : ""} />
      </dl>
    </section>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-2 font-serif text-4xl leading-none tracking-tight tabular-nums sm:text-[2.6rem]">{value}</dd>
      <p className="mt-2 line-clamp-1 text-xs text-faint">{note}</p>
    </div>
  );
}

/** Single-series bar list: views vs. each channel's normal, per trend. One hue, thin marks, values in text ink. */
function Momentum({ trends, active, onPick }: { trends: BriefCluster[]; active: number; onPick: (i: number) => void }) {
  const max = Math.max(1, ...trends.map((t) => t.stats.median_outlier ?? 0));
  return (
    <div className="glass ring-gradient rounded-3xl p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Momentum board</h2>
        <span className="text-xs text-faint">views vs. channel&apos;s normal</span>
      </div>
      <ol className="space-y-3.5">
        {trends.map((t, i) => {
          const v = t.stats.median_outlier;
          const pct = v != null ? Math.max(4, (v / max) * 100) : 0;
          const tip = `${v != null ? multiple(v) : "—"} their usual views · ${t.stats.creators} creators · ${LIFECYCLE_GUIDE[t.lifecycle]?.label ?? ""}`;
          return (
            <li key={t.id}>
              <button onClick={() => onPick(i)} className="group relative block w-full text-left" aria-label={`${t.theme_name}: ${tip}`}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className={`flex min-w-0 items-center gap-2 ${i === active ? "text-text" : "text-muted group-hover:text-text"}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LIFECYCLE_GUIDE[t.lifecycle]?.dot ?? "bg-faint"}`} aria-hidden />
                    <span className="truncate">{t.theme_name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text">{v != null ? multiple(v) : "—"}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-sunk">
                  <div className="h-2 rounded-[4px] bg-accent transition-all duration-500" style={{ width: `${pct}%`, opacity: i === active ? 1 : 0.55 }} />
                </div>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-9 right-0 z-10 whitespace-nowrap rounded-lg border border-border bg-surface-strong px-2.5 py-1.5 text-xs opacity-0 shadow-lg backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  {tip}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────── Slider card ─────────────────────────
function SlideCard({
  c,
  i,
  total,
  active,
  decision,
  onSelect,
}: {
  c: BriefCluster;
  i: number;
  total: number;
  active: boolean;
  decision?: Decision;
  onSelect: () => void;
}) {
  const thumbs = c.evidence.slice(0, 3);
  const d = DECISIONS.find((x) => x.value === decision);
  return (
    <article
      aria-roledescription="slide"
      aria-label={`${i + 1} of ${total}: ${c.theme_name}`}
      className={`snap-card w-[86vw] shrink-0 sm:w-[420px] ${active ? "" : "opacity-60 hover:opacity-90"} transition-all duration-500`}
    >
      <button
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`glass group block w-full overflow-hidden rounded-[1.75rem] text-left transition-all duration-500 ${
          active ? "ring-gradient scale-100" : "scale-[0.96]"
        }`}
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunk">
          {thumbs.length >= 3 ? (
            <div className="grid h-full grid-cols-3 grid-rows-2 gap-0.5">
              <img src={thumbs[0].thumb} alt="" className="col-span-2 row-span-2 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
              <img src={thumbs[1].thumb} alt="" className="h-full w-full object-cover" />
              <img src={thumbs[2].thumb} alt="" className="h-full w-full object-cover" />
            </div>
          ) : thumbs[0] ? (
            <img src={thumbs[0].thumb} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
          <span className="absolute left-4 top-3 font-serif text-5xl leading-none text-white drop-shadow">{String(i + 1).padStart(2, "0")}</span>
          <LifecycleChip lifecycle={c.lifecycle} className="absolute right-3 top-3 bg-black/55 text-white backdrop-blur" />
          {d && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-black">
              <Icon d={DECISION_ICON[d.value]} className="h-3.5 w-3.5" /> {d.label}
            </span>
          )}
        </div>
        <div className="space-y-3 p-5">
          <h3 className="line-clamp-2 min-h-[3.5rem] font-serif text-[1.65rem] leading-[1.1] tracking-tight">{c.theme_name}</h3>
          <p className="line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-muted">
            {c.why_now ?? "Numbers and example videos only this week."}
          </p>
          <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <Mini label="creators" value={String(c.stats.creators)} />
            <Mini label="usual views" value={c.stats.median_outlier != null ? multiple(c.stats.median_outlier) : "—"} />
            <Mini label="format" value={c.stats.winning_format ? (FORMAT_PLAIN[c.stats.winning_format] ?? "").split(" ")[0] : "Mixed"} />
          </dl>
        </div>
      </button>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="truncate text-base font-semibold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-faint">{label}</dt>
    </div>
  );
}

// ───────────────────────── Decision ─────────────────────────
function DecisionBar({ c, current, onDecide }: { c: BriefCluster; current?: Decision; onDecide: (d: Decision) => void }) {
  return (
    <section aria-label={`Your decision on ${c.theme_name}`} className="mt-10 rounded-3xl border border-border bg-surface-sunk p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Will you make a video on this?</p>
        <p className="text-xs text-muted">{current ? "Saved. You can change it any time." : "Your call moves you to the next trend."}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DECISIONS.map((d) => {
          const on = current === d.value;
          const primary = d.value === "filmed";
          return (
            <button
              key={d.value}
              onClick={() => onDecide(d.value)}
              aria-pressed={on}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 ${
                on
                  ? primary
                    ? "btn-primary"
                    : "bg-text text-bg"
                  : primary
                    ? "border border-accent/40 bg-accent-soft hover:-translate-y-0.5 hover:border-accent"
                    : "border border-border bg-surface hover:-translate-y-0.5 hover:border-border-strong"
              }`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${on ? "bg-white/20" : primary ? "bg-accent text-accent-ink" : "bg-surface-strong"}`}>
                <Icon d={DECISION_ICON[d.value]} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{d.label}</span>
                <span className={`block text-xs ${on ? "opacity-80" : "text-muted"}`}>{d.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────── Plan ─────────────────────────
function Plan({ brief, decisions, onPick }: { brief: BriefJson; decisions: Record<number, Decision>; onPick: (i: number) => void }) {
  const cols: { key: Decision; title: string; empty: string }[] = [
    { key: "filmed", title: "To film this week", empty: "Nothing yet. Pick a trend above." },
    { key: "up", title: "Maybe later", empty: "—" },
    { key: "down", title: "Not for me", empty: "—" },
  ];
  const undecided = brief.clusters.map((c, i) => ({ c, i })).filter(({ c }) => !decisions[c.id]);
  return (
    <section id="plan" className="reveal space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Final step</p>
          <h2 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Your plan for the week</h2>
        </div>
        <p className="text-sm text-muted">Saved in this browser · tap a trend to revisit it</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cols.map((col) => {
          const items = brief.clusters.map((c, i) => ({ c, i })).filter(({ c }) => decisions[c.id] === col.key);
          const filmed = col.key === "filmed";
          return (
            <div key={col.key} className={`glass rounded-3xl p-5 ${filmed ? "ring-gradient" : ""}`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`grid h-7 w-7 place-items-center rounded-full ${filmed ? "bg-accent text-accent-ink" : "bg-surface-strong"}`}>
                    <Icon d={DECISION_ICON[col.key]} className="h-3.5 w-3.5" />
                  </span>
                  {col.title}
                </h3>
                <span className="font-mono text-xs text-faint">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-faint">{col.empty}</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map(({ c, i }) => (
                    <li key={c.id}>
                      <button onClick={() => onPick(i)} className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm transition hover:border-border-strong">
                        <span className="font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span> <span className="font-medium">{c.theme_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {undecided.length > 0 && (
        <p className="text-sm text-muted">
          Still to decide:{" "}
          {undecided.map(({ c, i }, n) => (
            <span key={c.id}>
              <button onClick={() => onPick(i)} className="underline decoration-border-strong underline-offset-4 hover:text-text">
                {c.theme_name}
              </button>
              {n < undecided.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      )}

      {brief.skip.length > 0 && (
        <div className="glass rounded-3xl p-5">
          <h3 className="text-sm font-semibold">Topics to skip this week</h3>
          <p className="mb-3 mt-1 text-sm text-muted">Lots of creators are already on these and views are below normal.</p>
          <ul className="flex flex-wrap gap-2">
            {brief.skip.map((s) => (
              <li key={s.id} className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
                {s.label} <span className="text-faint">· {s.creators} creators</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MadeHow brief={brief} />
    </section>
  );
}

function MadeHow({ brief }: { brief: BriefJson }) {
  const f = brief.footer;
  return (
    <details className="group glass rounded-3xl p-5 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
        How this brief was made
        <span className="text-faint transition-transform group-open:rotate-90">
          <Chevron dir="right" />
        </span>
      </summary>
      <div className="mt-4 space-y-3 leading-relaxed text-muted">
        <p>
          We looked at {f.sources.videos_analysed} recent videos from {f.sources.peer_channels.length} channels you follow (
          {f.sources.peer_channels.join(", ") || "none"}), YouTube&apos;s trending list, and {f.sources.searches} topic searches.
          Data collected {istDateTime(brief.collected_at)}.
        </p>
        <p>
          A trend is a group of videos on the same topic from at least two creators. &ldquo;Usual views&rdquo; compares each video
          with that channel&apos;s own recent videos, so small and big channels are judged fairly. Every number comes straight
          from YouTube. The AI only writes the descriptions and ideas, and isn&apos;t allowed to make up figures.
        </p>
        {f.sources.unresolved_handles.length > 0 && <p>Channels we couldn&apos;t find: {f.sources.unresolved_handles.join(", ")}.</p>}
        {f.coverage_note && <p>Notes: {f.coverage_note}</p>}
        <p className="text-xs text-faint">
          Run #{brief.run_id ?? "—"} · YouTube quota {compactNumber(f.quota_used)} units · {f.gemini_calls} AI calls · {f.prompt_versions.join(", ")} ·{" "}
          <Link href="/runs" className="underline">
            run log
          </Link>
        </p>
      </div>
    </details>
  );
}
