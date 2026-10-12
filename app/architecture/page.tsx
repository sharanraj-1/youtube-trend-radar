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
    <div className="space-y-20">
      <header className="rise max-w-3xl space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">How it works</p>
        <h1 className="font-serif text-5xl leading-[1] tracking-tight sm:text-6xl lg:text-7xl">
          Hours of scrolling, <em className="text-gradient">done for you</em> by 11 AM
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Every Sunday, Trend Radar reads the week on YouTube and turns it into a 10-minute review. It recommends; you decide what to film.
        </p>
      </header>

      <section aria-labelledby="sunday" className="space-y-6">
        <h2 id="sunday" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
          What happens every Sunday
        </h2>
        <ol className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {TIMELINE.map(([time, title, text], i) => (
            <li key={title} className="reveal relative">
              {/* connector to the next card: sits in the gap, centred on the step badge */}
              {i < TIMELINE.length - 1 && (
                <span aria-hidden className="absolute -right-4 top-[35px] z-10 hidden w-4 items-center lg:flex">
                  <span className="h-px flex-1 bg-gradient-to-r from-accent to-accent-2" />
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
                </span>
              )}
              <div className="glass h-full rounded-3xl p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="btn-primary grid h-9 w-9 place-items-center rounded-full text-sm font-semibold">{i + 1}</span>
                  <span className="font-mono text-xs text-muted">{time}</span>
                </div>
                <h3 className="font-serif text-2xl leading-tight tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <h2 id="trust" className="sr-only">
          Why you can trust it
        </h2>
        {[
          ["01", "Real numbers only", "Every figure comes straight from YouTube. The AI writes words, never statistics, and a fact-checker removes anything it invents."],
          ["02", "Fair to small channels", "Views are compared with each channel's own normal, so a 50K channel's hit counts as much as a 5M one's."],
          ["03", "Free to run", "Stays inside the free limits of YouTube, Gemini, Vercel and Neon, with budgets that stop before a limit is hit."],
        ].map(([n, t, d]) => (
          <div key={t} className="glass reveal rounded-3xl p-6">
            <span className="text-gradient font-serif text-4xl">{n}</span>
            <h3 className="mt-3 text-lg font-semibold">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="map" className="reveal space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Components map</p>
            <h2 id="map" className="mt-1 font-serif text-4xl tracking-tight">The whole system on one page</h2>
          </div>
          <div className="flex gap-2">
            <a className="glass rounded-full px-4 py-2 text-sm font-medium transition hover:border-border-strong" href="/components-map.pdf">
              Download PDF
            </a>
            <a className="glass rounded-full px-4 py-2 text-sm font-medium transition hover:border-border-strong" href="/components-map.png">
              PNG
            </a>
          </div>
        </div>
        <a href="/components-map.png" className="glass block overflow-hidden rounded-[2rem] p-2 sm:p-3">
          <span className="block overflow-hidden rounded-[1.5rem] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- static diagram, shown as-is */}
            <img src="/components-map.png" alt="Components Map: who and what is involved at each stage, from the Sunday trigger to the brief" width={1230} height={1192} className="h-auto w-full" />
          </span>
        </a>
        <p className="text-xs text-muted">Rows are the people and services involved; columns follow a run from trigger to output. Click to open full size.</p>
      </section>

      <section aria-labelledby="tech" className="space-y-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">For the technically curious</p>
          <h2 id="tech" className="font-serif text-4xl tracking-tight">Under the hood</h2>
          <p className="text-sm leading-relaxed text-muted">
            Vercel Hobby functions stop at 300 seconds, so the pipeline runs as checkpointed stages: each one saves its output in Postgres and
            hands off to the next with <code className="rounded bg-surface-sunk px-1 font-mono text-xs">after()</code>. A database claim stops two
            invocations running the same stage, a stage that fails three times still publishes a partial brief, and a watchdog posts a backup
            brief if nothing is ready.
          </p>
        </div>
        <div className="glass rounded-[2rem] p-3 sm:p-5">
          <Mermaid chart={COMPONENTS_MERMAID} />
        </div>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {STAGES.map(([name, text]) => (
            <li key={name} className="glass reveal rounded-2xl p-4">
              <span className="font-mono text-xs font-semibold text-accent">{name}</span>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
