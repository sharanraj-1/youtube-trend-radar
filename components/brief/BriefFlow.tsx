"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { BriefJson } from "@/lib/render/types";
import { istDate, istDateTime, multiple } from "@/lib/render/format";
import { DECISIONS, LIFECYCLE_GUIDE, localPath, type Decision } from "@/lib/render/guide";
import { TrendDetail } from "./TrendDetail";

type Mode = "guided" | "all";

// Decisions live in localStorage (per brief), read through useSyncExternalStore so the server render
// and first client render agree (no hydration mismatch) and other tabs stay in sync.
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

/**
 * The brief as a guided review: overview → one trend at a time (with a decision) → your plan.
 * "Read everything on one page" shows the same content as a single scroll.
 */
export function BriefFlow({ brief, briefId, createdAt }: { brief: BriefJson; briefId: number; createdAt: string }) {
  const trends = brief.clusters;
  const total = trends.length;
  const lastStep = total + 1; // 0 = overview, 1..total = trends, total+1 = plan
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("guided");
  const raw = useSyncExternalStore(subscribe, () => readRaw(briefId), () => "{}");
  const decisions = useMemo(() => parse(raw), [raw]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const go = useCallback(
    (s: number) => setStep(Math.max(0, Math.min(lastStep, s))),
    [lastStep],
  );

  // Move focus + scroll to the new step's heading (keyboard and screen-reader friendly).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, mode]);

  useEffect(() => {
    if (mode !== "guided") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step, mode]);

  function decide(clusterId: number, d: Decision, url: string, advance: boolean) {
    writeDecisions(briefId, { ...decisions, [clusterId]: d });
    // Signed feedback link (same one used in the email); fire-and-forget.
    fetch(localPath(url), { cache: "no-store" }).catch(() => {});
    if (advance) go(step + 1);
  }

  const banner = brief.banner && (
    <p role="status" className={`border-l-2 pl-4 text-sm leading-relaxed ${brief.status === "fallback" ? "border-accent text-accent" : "border-warn text-text"}`}>
      {brief.status === "fallback"
        ? "This is last week's brief. This week's run didn't finish in time, so double-check before filming."
        : "Some data was limited this week, so a few parts may be thinner than usual. Details are at the end."}
    </p>
  );

  if (total === 0) {
    return (
      <div className="space-y-6">
        <Masthead createdAt={createdAt} issue={briefId} title="Nothing stood out this week" />
        {banner}
        <p className="text-lg leading-relaxed text-muted">
          No topic had enough creators and strong enough views to make the cut. That&apos;s useful to know too: it&apos;s a good week for
          evergreen ideas.
        </p>
        <MadeHow brief={brief} />
      </div>
    );
  }

  return (
    <div ref={topRef} className="space-y-8">
      {mode === "guided" && <Stepper step={step} total={total} decisions={decisions} trends={trends} onGo={go} />}

      {mode === "all" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Masthead createdAt={createdAt} issue={briefId} title={`${total} trends this week`} headingRef={headingRef} />
          </div>
          <button onClick={() => { setMode("guided"); setStep(0); }} className="text-sm text-accent underline">
            ← Back to the step-by-step view
          </button>
          {banner}
          {brief.week_summary && <p className="font-serif text-lg leading-relaxed text-text/90 sm:text-xl">{brief.week_summary}</p>}
          {trends.map((c, i) => (
            <div key={c.id} className="border-t border-rule pt-10">
              <TrendDetail c={c} index={i} total={total} />
              <DecisionBar c={c} current={decisions[c.id]} onDecide={(d) => decide(c.id, d, c.feedback[d], false)} />
            </div>
          ))}
          <div className="border-t border-rule pt-10">
            <Plan brief={brief} decisions={decisions} onGo={(s) => { setMode("guided"); go(s); }} />
          </div>
        </div>
      ) : step === 0 ? (
        <Overview
          brief={brief}
          briefId={briefId}
          createdAt={createdAt}
          decisions={decisions}
          headingRef={headingRef}
          banner={banner}
          onStart={() => go(1)}
          onPick={(i) => go(i + 1)}
          onAll={() => setMode("all")}
        />
      ) : step <= total ? (
        <div className="space-y-10">
          <TrendDetail c={trends[step - 1]} index={step - 1} total={total} headingRef={headingRef} />
          <DecisionBar
            c={trends[step - 1]}
            current={decisions[trends[step - 1].id]}
            onDecide={(d) => decide(trends[step - 1].id, d, trends[step - 1].feedback[d], true)}
          />
          <StepNav
            onBack={() => go(step - 1)}
            backLabel={step === 1 ? "Overview" : `Trend ${step - 1}`}
            onNext={() => go(step + 1)}
            nextLabel={step === total ? "See your plan" : `Next: trend ${step + 1}`}
          />
        </div>
      ) : (
        <div className="space-y-10">
          <Plan brief={brief} decisions={decisions} onGo={go} headingRef={headingRef} />
          <StepNav onBack={() => go(total)} backLabel={`Trend ${total}`} />
        </div>
      )}
    </div>
  );
}

function Masthead({ createdAt, issue, title, headingRef }: { createdAt: string; issue: number; title: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <header className="space-y-3">
      <p className="text-sm text-muted">
        Sunday brief · {istDate(createdAt)} · No. {issue}
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="font-serif text-4xl font-medium leading-[1.1] tracking-tight outline-none sm:text-5xl">
        {title}
      </h1>
    </header>
  );
}

/** Thin progress bar with clickable segments: Overview · trends · Plan. */
function Stepper({ step, total, decisions, trends, onGo }: { step: number; total: number; decisions: Record<number, Decision>; trends: BriefJson["clusters"]; onGo: (s: number) => void }) {
  const labels = ["Overview", ...trends.map((_, i) => `Trend ${i + 1}`), "Your plan"];
  return (
    <nav aria-label="Brief steps" className="sticky top-0 z-10 -mx-5 border-b border-border bg-bg/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-medium text-text">{labels[step]}</span>
        <span className="text-muted">
          Step {step + 1} of {total + 2}
        </span>
      </div>
      <ol className="flex gap-1">
        {labels.map((l, i) => {
          const decided = i >= 1 && i <= total && decisions[trends[i - 1].id];
          return (
            <li key={l} className="flex-1">
              <button
                onClick={() => onGo(i)}
                aria-label={l}
                aria-current={i === step ? "step" : undefined}
                className="block w-full py-1.5"
              >
                <span
                  className={`block h-1 rounded-full transition-colors ${
                    i === step ? "bg-accent" : i < step || decided ? "bg-text/40" : "bg-rule"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Overview({
  brief,
  briefId,
  createdAt,
  decisions,
  headingRef,
  banner,
  onStart,
  onPick,
  onAll,
}: {
  brief: BriefJson;
  briefId: number;
  createdAt: string;
  decisions: Record<number, Decision>;
  headingRef: React.Ref<HTMLHeadingElement>;
  banner: React.ReactNode;
  onStart: () => void;
  onPick: (i: number) => void;
  onAll: () => void;
}) {
  const total = brief.clusters.length;
  const decidedCount = brief.clusters.filter((c) => decisions[c.id]).length;
  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <Masthead createdAt={createdAt} issue={briefId} title={`${total} trend${total === 1 ? "" : "s"} worth your attention this week`} headingRef={headingRef} />
        {banner}
        {brief.week_summary && <p className="font-serif text-lg leading-relaxed text-text/90 sm:text-xl">{brief.week_summary}</p>}
      </div>

      <section aria-labelledby="how-title" className="rounded-lg bg-surface-2 px-5 py-5 sm:px-6">
        <h2 id="how-title" className="mb-3 text-sm font-semibold">
          How to use this brief (about 10 minutes)
        </h2>
        <ol className="grid gap-3 text-sm leading-relaxed sm:grid-cols-3">
          {[
            ["Read each trend", "One at a time: why it matters, the numbers and video ideas."],
            ["Make a call", "Choose “I’ll film this”, “Maybe later” or “Not for me”."],
            ["Check your plan", "Your picks are collected at the end, ready to schedule."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-text text-xs font-semibold text-bg">{i + 1}</span>
              <span>
                <span className="font-medium">{t}.</span> <span className="text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="list-title">
        <h2 id="list-title" className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          This week&apos;s trends
        </h2>
        <ol className="divide-y divide-border border-y border-border">
          {brief.clusters.map((c, i) => {
            const g = LIFECYCLE_GUIDE[c.lifecycle] ?? LIFECYCLE_GUIDE.peaking;
            const d = decisions[c.id];
            return (
              <li key={c.id}>
                <button onClick={() => onPick(i)} className="group flex w-full items-start gap-4 py-4 text-left">
                  <span className="w-6 shrink-0 font-serif text-xl leading-7 text-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-xl leading-snug group-hover:underline">{c.theme_name}</span>
                    <span className="mt-1 block text-sm text-muted">
                      <span className={`font-medium ${g.tone}`}>{g.label}</span> · {c.stats.creators} creators
                      {c.stats.median_outlier !== null && <> · {multiple(c.stats.median_outlier)} usual views</>}
                    </span>
                  </span>
                  {d && <span className="mt-1 shrink-0 text-xs text-muted">{DECISIONS.find((x) => x.value === d)?.label}</span>}
                  <span aria-hidden className="mt-1 text-faint group-hover:text-text">→</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button onClick={onStart} className="rounded-md bg-accent px-6 py-3 text-base font-medium text-white shadow-sm hover:opacity-90">
          {decidedCount > 0 && decidedCount < total ? "Continue reviewing →" : "Start with trend 1 →"}
        </button>
        <button onClick={onAll} className="text-sm text-muted underline hover:text-text">
          Or read everything on one page
        </button>
      </div>
    </div>
  );
}

function DecisionBar({ c, current, onDecide }: { c: BriefJson["clusters"][number]; current?: Decision; onDecide: (d: Decision) => void }) {
  return (
    <section aria-label="Your decision" className="rounded-lg border border-border bg-surface p-5">
      <p className="mb-3 font-medium">Will you make a video on this?</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {DECISIONS.map((d) => {
          const on = current === d.value;
          const primary = d.value === "filmed";
          return (
            <button
              key={d.value}
              onClick={() => onDecide(d.value)}
              aria-pressed={on}
              className={`rounded-md border px-4 py-3 text-left transition-colors ${
                on
                  ? "border-text bg-text text-bg"
                  : primary
                    ? "border-accent/50 hover:border-accent hover:bg-accent-soft"
                    : "border-border hover:border-text/40 hover:bg-surface-2"
              }`}
            >
              <span className="block text-sm font-semibold">{on ? `✓ ${d.label}` : d.label}</span>
              <span className={`block text-xs ${on ? "text-bg/75" : "text-muted"}`}>{d.hint}</span>
            </button>
          );
        })}
      </div>
      {current && <p className="mt-3 text-xs text-muted">Saved. You can change your mind any time.</p>}
      <span className="sr-only">{c.theme_name}</span>
    </section>
  );
}

function StepNav({ onBack, backLabel, onNext, nextLabel }: { onBack: () => void; backLabel: string; onNext?: () => void; nextLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
      <button onClick={onBack} className="text-sm text-muted hover:text-text">
        ← {backLabel}
      </button>
      {onNext && (
        <button onClick={onNext} className="rounded-md border border-text px-4 py-2 text-sm font-medium hover:bg-text hover:text-bg">
          {nextLabel} →
        </button>
      )}
    </div>
  );
}

function Plan({ brief, decisions, onGo, headingRef }: { brief: BriefJson; decisions: Record<number, Decision>; onGo: (s: number) => void; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const groups: { title: string; empty: string; items: { c: BriefJson["clusters"][number]; i: number }[] }[] = [
    { title: "To film this week", empty: "Nothing picked yet.", items: [] },
    { title: "Maybe later", empty: "", items: [] },
    { title: "Not for me", empty: "", items: [] },
    { title: "Not decided yet", empty: "", items: [] },
  ];
  brief.clusters.forEach((c, i) => {
    const d = decisions[c.id];
    groups[d === "filmed" ? 0 : d === "up" ? 1 : d === "down" ? 2 : 3].items.push({ c, i });
  });
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm text-muted">Final step</p>
        <h2 ref={headingRef} tabIndex={-1} className="font-serif text-4xl font-medium tracking-tight outline-none">
          Your plan for the week
        </h2>
        <p className="text-muted">Your choices are saved in this browser. Click any trend to revisit it.</p>
      </header>

      <div className="space-y-8">
        {groups.map((g, gi) =>
          g.items.length === 0 && !g.empty ? null : (
            <section key={g.title}>
              <h3 className={`mb-2 text-xs font-semibold uppercase tracking-[0.12em] ${gi === 0 ? "text-accent" : "text-muted"}`}>{g.title}</h3>
              {g.items.length === 0 ? (
                <p className="text-sm text-muted">{g.empty}</p>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {g.items.map(({ c, i }) => (
                    <li key={c.id}>
                      <button onClick={() => onGo(i + 1)} className="group flex w-full items-baseline gap-4 py-3 text-left">
                        <span className="w-5 shrink-0 font-serif text-faint">{i + 1}</span>
                        <span className={`flex-1 font-serif text-lg group-hover:underline ${gi === 2 ? "text-muted" : ""}`}>{c.theme_name}</span>
                        <span aria-hidden className="text-faint">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ),
        )}
      </div>

      {brief.skip.length > 0 && (
        <section className="rounded-lg bg-surface-2 px-5 py-5">
          <h3 className="font-medium">Topics to skip this week</h3>
          <p className="mb-3 mt-1 text-sm text-muted">Lots of creators are already on these and views are below normal.</p>
          <ul className="space-y-1 text-sm">
            {brief.skip.map((s) => (
              <li key={s.id} className="flex justify-between gap-4">
                <span>{s.label}</span>
                <span className="shrink-0 text-muted tabular-nums">{s.creators} creators</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MadeHow brief={brief} />

      <p className="text-sm text-muted">
        Looking for an older week? <Link href="/briefs" className="underline hover:text-text">Browse past briefs</Link>.
      </p>
    </div>
  );
}

function MadeHow({ brief }: { brief: BriefJson }) {
  const f = brief.footer;
  return (
    <details className="group border-t border-border pt-4 text-sm">
      <summary className="cursor-pointer list-none text-muted hover:text-text">
        <span className="group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span> How this brief was made
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed text-muted">
        <p>
          We looked at {f.sources.videos_analysed} recent videos from {f.sources.peer_channels.length} channels you follow (
          {f.sources.peer_channels.join(", ") || "none"}), YouTube&apos;s trending list, and {f.sources.searches} topic searches. Data
          collected {istDateTime(brief.collected_at)}.
        </p>
        <p>
          Trends are groups of videos on the same topic from at least two different creators. &ldquo;Usual views&rdquo; compares each
          video with that channel&apos;s own recent videos, so small and big channels are judged fairly. Every number is calculated
          directly from YouTube data. The AI only writes the descriptions and ideas, and is not allowed to make up figures.
        </p>
        {f.sources.unresolved_handles.length > 0 && <p>Channels we couldn&apos;t find: {f.sources.unresolved_handles.join(", ")}.</p>}
        {f.coverage_note && <p>Notes: {f.coverage_note}</p>}
        <p className="text-xs text-faint">
          Run #{brief.run_id ?? "—"} · YouTube quota {f.quota_used} units · {f.gemini_calls} AI calls · {f.prompt_versions.join(", ")} ·{" "}
          <Link href="/runs" className="underline">
            run log
          </Link>
        </p>
      </div>
    </details>
  );
}
