import { Mermaid } from "@/components/Mermaid";
import { COMPONENTS_MERMAID } from "@/lib/architecture";

export const metadata = { title: "How it works" };

const STAGES: [string, string][] = [
  ["COLLECT", "Peer channel uploads (1 unit each), the India Science & Tech trending chart, then up to 15 keyword searches (100 units each). Hydrates videos and channels in batches of 50, drops channels under 5K subscribers, computes each channel's median views over its last 15 uploads, and pulls top comments for the 60 biggest outliers. Snapshots every video's stats."],
  ["ENRICH", "Gemini Flash classifies ~40 videos per call: format, canonical entities (Hindi/Hinglish normalised), topic key and summary. Titles are wrapped as untrusted data. Invalid JSON gets one repair retry, then falls back to format “other”."],
  ["SCORE", "Pure arithmetic: age, views/hour, outlier multiple (views ÷ channel median), engagement rate and 72-hour velocity from snapshots."],
  ["CLUSTER", "No AI and no embeddings: group by dominant entity, then merge by TF-IDF cosine ≥ 0.35 or a shared top entity. A cluster needs 2+ channels; any one channel counts for at most 2 videos in the stats."],
  ["STAGE", "Match to last week's clusters (same entity or cosine ≥ 0.5), then label each cluster emerging, rising, peaking or saturated, and rank it with a transparent formula."],
  ["SYNTHESIZE", "One Gemini Flash call writes theme names, why-now and angles from qualitative signals. It is not allowed to write numbers."],
  ["VALIDATE", "Code checks the schema, that every evidence video belongs to its cluster, that no numbers were invented, that theme names are unique and that snapshots are fresh. One repair retry, otherwise the cluster renders stats-only."],
  ["RENDER → DELIVER", "Server-rendered brief (web + email HTML + JSON). The template injects every statistic. Email via Resend and alerts via Telegram are best-effort."],
];

export default function ArchitecturePage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="max-w-2xl text-muted">
          Trend Radar automates the research, not the creator&apos;s judgment. Every Sunday at 05:00 IST it collects live YouTube data and finds
          topics that several creators are covering and that are beating those channels&apos; normal view counts. It then writes a brief Ishaan can act
          on before 11:00.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Components map</h2>
        <Mermaid chart={COMPONENTS_MERMAID} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pipeline</h2>
        <p className="text-sm text-muted">
          Vercel Hobby functions stop at 300 seconds, so each invocation runs a single stage (or a checkpointed slice of one) for under ~170 seconds. It
          records the result in <code className="font-mono">stage_outputs</code> and then triggers the next step with <code className="font-mono">after()</code>.
          A conditional <code className="font-mono">UPDATE … WHERE status IN (…)</code> claims each stage, so duplicate triggers can&apos;t run it twice. A stage
          that fails 3 times sends the run down the degraded path straight to RENDER. A watchdog publishes a fallback brief if nothing is ready by Sunday
          morning.
        </p>
        <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {STAGES.map(([name, text]) => (
            <li key={name} className="grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
              <span className="font-mono text-sm font-semibold">{name}</span>
              <span className="text-sm leading-relaxed text-muted">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Free-tier YouTube", "Budget of 6,000 of the 10,000 daily units per run; cheap 1-unit calls first; stops searching immediately on quotaExceeded."],
          ["Free-tier Gemini", "About 12 enrichment calls and 1–2 synthesis calls per run, at most 3 in flight, exponential backoff with jitter on 429."],
          ["Free-tier Vercel + Neon", "Three daily-or-less crons, short functions, 60-day data retention."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
