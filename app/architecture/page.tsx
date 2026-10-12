import { Mermaid } from "@/components/Mermaid";
import { COMPONENTS_MERMAID } from "@/lib/architecture";

export const metadata = { title: "How it works" };

const STAGES: [string, string][] = [
  ["COLLECT", "Peer channel uploads (1 unit each), the India Science & Tech trending chart, then up to 15 keyword searches (100 units each). Hydrates videos and channels in batches of 50, drops channels under 5K subscribers, computes each channel's median views over its last 15 uploads, and pulls top comments for the 60 biggest outliers. Snapshots every video's stats."],
  ["ENRICH", "Gemini Flash classifies 50 videos per call: format, canonical entities (Hindi/Hinglish normalised), topic key and summary. Titles are wrapped as untrusted data. Invalid JSON gets one repair retry, then falls back to format “other”."],
  ["SCORE", "Pure arithmetic: age, views/hour, outlier multiple (views ÷ channel median), engagement rate and 72-hour velocity from snapshots."],
  ["CLUSTER", "No AI and no embeddings: group by dominant entity, then merge by TF-IDF cosine ≥ 0.35 or a shared top entity. A cluster needs 2+ channels; any one channel counts for at most 2 videos in the stats."],
  ["STAGE", "Match to last week's clusters (same entity or cosine ≥ 0.5), then label each cluster emerging, rising, peaking or saturated, and rank it with a transparent formula."],
  ["SYNTHESIZE", "One Gemini Flash call writes theme names, why-now and angles from qualitative signals. It is not allowed to write numbers."],
  ["VALIDATE", "Code checks the schema, that every evidence video belongs to its cluster, that no numbers were invented, that theme names are unique and that snapshots are fresh. One repair retry, otherwise the cluster renders stats-only."],
  ["RENDER → DELIVER", "Server-rendered brief (web + email HTML + JSON). The template injects every statistic. Email via Resend and alerts via Telegram are best-effort."],
];

const TIMELINE: [string, string, string][] = [
  ["5:00 AM", "We gather this week's videos", "Recent uploads from the channels you follow, YouTube's trending list, and searches for your topics (AI tools, apps, reviews…)."],
  ["5:05 AM", "AI reads every title", "Gemini Flash works out what each video is about and its format (tutorial, review, Short…). Off-topic and paid-ad videos are dropped."],
  ["5:10 AM", "We spot the trends", "Videos on the same topic from at least two creators are grouped. We check which groups are getting more views than those channels usually do."],
  ["5:12 AM", "We write it up and fact-check it", "AI writes the summary and video ideas. Code then checks that every number and example is real; anything that fails is removed."],
  ["By 11:00 AM", "Your brief is ready", "It appears on the home page (and in your inbox, if email is set up). If anything goes wrong, a backup brief is published instead."],
];

export default function ArchitecturePage() {
  return (
    <div className="space-y-14">
      <header className="space-y-3">
        <h1 className="font-serif text-4xl font-medium tracking-tight">How it works</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Trend Radar does the Sunday research for you: hours of scrolling YouTube become a 10-minute read. It recommends; you decide what to film.
        </p>
      </header>

      <section aria-labelledby="sunday">
        <h2 id="sunday" className="mb-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          What happens every Sunday
        </h2>
        <ol className="relative ml-3 space-y-8 border-l border-rule pl-7">
          {TIMELINE.map(([time, title, text], i) => (
            <li key={title} className="relative">
              <span className="absolute -left-[2.5rem] flex h-6 w-6 items-center justify-center rounded-full bg-text text-xs font-semibold text-bg ring-4 ring-bg">
                {i + 1}
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-accent">{time}</p>
              <h3 className="mt-1 font-serif text-xl">{title}</h3>
              <p className="mt-1 max-w-xl leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="map" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="map" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            The whole system on one page
          </h2>
          <p className="text-sm text-muted">
            Download:{" "}
            <a className="underline hover:text-text" href="/components-map.pdf">
              PDF
            </a>{" "}
            ·{" "}
            <a className="underline hover:text-text" href="/components-map.png">
              PNG
            </a>
          </p>
        </div>
        <a href="/components-map.png" className="block overflow-hidden rounded-lg border border-border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- static diagram, shown as-is */}
          <img src="/components-map.png" alt="Components Map: who and what is involved at each stage, from the Sunday trigger to the brief" width={1230} height={1192} className="h-auto w-full" />
        </a>
        <p className="text-xs text-muted">Rows are the people and services involved; columns follow a run from trigger to output. Click to open full size.</p>
      </section>

      <section aria-labelledby="trust" className="grid gap-6 sm:grid-cols-3">
        <h2 id="trust" className="sr-only">
          Why you can trust it
        </h2>
        {[
          ["Real numbers only", "Every figure comes straight from YouTube. The AI writes words, never statistics."],
          ["Fair to small channels", "Views are compared with each channel's own normal, so a 50K channel's hit counts as much as a 5M one's."],
          ["Free to run", "Stays inside the free limits of YouTube, Gemini, Vercel and Neon."],
        ].map(([t, d]) => (
          <div key={t} className="border-t border-rule pt-3">
            <h3 className="font-medium">{t}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="tech" className="space-y-6 border-t border-border pt-10">
        <div className="space-y-2">
          <h2 id="tech" className="font-serif text-2xl">For the technically curious</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Vercel Hobby functions stop at 300 seconds, so the pipeline runs as checkpointed stages: each invocation runs one stage (under
            ~170 s), saves its output in Postgres, and triggers the next with <code className="font-mono text-xs">after()</code>. A database
            claim stops two invocations running the same stage. A stage that fails three times sends the run down a degraded path to
            publishing, and a watchdog posts a backup brief if nothing is ready.
          </p>
        </div>
        <Mermaid chart={COMPONENTS_MERMAID} />
        <ol className="divide-y divide-border border-y border-border">
          {STAGES.map(([name, text]) => (
            <li key={name} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
              <span className="font-mono text-sm font-semibold">{name}</span>
              <span className="text-sm leading-relaxed text-muted">{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
