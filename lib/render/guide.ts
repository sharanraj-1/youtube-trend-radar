// Plain-language copy shared by the web UI (client-safe: no server imports).

export const LIFECYCLE_ORDER = ["emerging", "rising", "peaking", "saturated"] as const;

export const LIFECYCLE_GUIDE: Record<string, { label: string; short: string; advice: string; tone: string; dot: string }> = {
  emerging: {
    label: "Emerging",
    short: "Early",
    advice: "Only a few creators have covered this and their videos are doing unusually well. A good chance to be early.",
    tone: "text-emerging",
    dot: "bg-emerging",
  },
  rising: {
    label: "Rising",
    short: "Picking up",
    advice: "More creators are joining in and views are strong. A good week to film.",
    tone: "text-rising",
    dot: "bg-rising",
  },
  peaking: {
    label: "Peaking",
    short: "Busy",
    advice: "Lots of creators have already covered this. Worth filming only if you have a fresh angle.",
    tone: "text-peaking",
    dot: "bg-peaking",
  },
  saturated: {
    label: "Saturated",
    short: "Crowded",
    advice: "Crowded and views are fading. Probably skip unless you have something genuinely new.",
    tone: "text-saturated",
    dot: "bg-saturated",
  },
};

export const FORMAT_PLAIN: Record<string, string> = {
  tutorial: "How-to tutorials",
  review: "Reviews",
  comparison: "Comparisons (X vs Y)",
  news_reaction: "News & reactions",
  listicle: "Lists (Top 5 / Best of)",
  short: "Shorts",
  other: "Mixed formats",
};

export type Decision = "filmed" | "up" | "down";

export const DECISIONS: { value: Decision; label: string; hint: string }[] = [
  { value: "filmed", label: "I'll film this", hint: "Add to this week's plan" },
  { value: "up", label: "Maybe later", hint: "Interesting, not this week" },
  { value: "down", label: "Not for me", hint: "Doesn't fit my channel" },
];

/** Friendly phases for the 9 pipeline stages. */
export const PHASES = [
  { label: "Gathering this week's videos", stages: ["COLLECT"] },
  { label: "Reading titles and topics", stages: ["ENRICH"] },
  { label: "Spotting trends", stages: ["SCORE", "CLUSTER", "STAGE"] },
  { label: "Writing and fact-checking", stages: ["SYNTHESIZE", "VALIDATE"] },
  { label: "Publishing the brief", stages: ["RENDER", "DELIVER"] },
] as const;

export function phaseIndex(stage: string): number {
  if (stage === "DONE") return PHASES.length;
  const i = PHASES.findIndex((p) => (p.stages as readonly string[]).includes(stage));
  return i < 0 ? 0 : i;
}

export const RUN_STATUS_PLAIN: Record<string, { label: string; tone: string }> = {
  done: { label: "Completed", tone: "text-ok" },
  degraded: { label: "Completed with gaps", tone: "text-warn" },
  failed: { label: "Didn't finish", tone: "text-accent" },
  running: { label: "In progress", tone: "text-rising" },
  pending: { label: "Starting", tone: "text-muted" },
};

export const BRIEF_STATUS_PLAIN: Record<string, { label: string; tone: string }> = {
  complete: { label: "Complete", tone: "text-ok" },
  degraded: { label: "Partial", tone: "text-warn" },
  fallback: { label: "Backup", tone: "text-accent" },
};

/** Brief links are absolute (for email); in the web UI use the path so they work on any host. */
export function localPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function minutes(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} sec`;
  return `${Math.round(ms / 60_000)} min`;
}

/** Whole minutes since a date (at least 1). */
export function minutesSince(d: Date, now: number = Date.now()): number {
  return Math.max(1, Math.round((now - d.getTime()) / 60_000));
}
