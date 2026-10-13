import { SynthCluster } from "../prompts/synthesize";

export interface ValidationCluster {
  id: string;
  label: string;
  videoIds: string[];
  /** Numbers the prose may mention: stats values plus digits inside entity names (e.g. "iPhone 17"). */
  allowedNumbers: Set<string>;
}

export interface Narrative {
  theme_name: string;
  why_now: string;
  suggested_angles: string[];
  evidence_video_ids: string[];
  confidence: "low" | "medium" | "high";
}

export type NarrativeResult = { mode: "full"; narrative: Narrative; notes: string[] } | { mode: "stats_only"; reason: string };

const NUM = /\d+(?:[.,]\d+)*/g;

export function numbersIn(text: string): string[] {
  return (text.match(NUM) ?? []).map(normNum);
}
const normNum = (n: string) => n.replace(/,/g, "").replace(/\.0+$/, "");

/** Every number the template could legitimately show for this cluster, in several display formats. */
export function allowedNumbersFrom(stats: object, entities: string[]): Set<string> {
  const out = new Set<string>();
  const add = (v: number) => {
    if (!Number.isFinite(v)) return;
    for (const s of [String(v), v.toFixed(1), v.toFixed(0), String(Math.round(v * 100)), (v * 100).toFixed(0)]) out.add(normNum(s));
  };
  const walk = (x: unknown) => {
    if (typeof x === "number") add(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.entries(x).forEach(([k, v]) => k !== "top_comment_questions" && k !== "already_covered_by_ishaan" && walk(v));
  };
  walk(stats);
  for (const e of entities) for (const n of numbersIn(e)) out.add(n);
  return out;
}

export function disallowedNumbers(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((n) => !allowed.has(n));
}

/** True when a and b differ by at most one inserted, deleted or substituted character. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Maps the model's evidence IDs onto this cluster's real video IDs. Gemini sometimes drops or swaps one
 * character of an 11-char YouTube ID; such a typo is corrected only when it is one edit away from exactly
 * one video in THIS cluster, so a foreign or invented ID can never get through. Unmatched IDs are returned
 * as `foreign`; duplicates are removed.
 */
export function resolveEvidenceIds(ids: string[], clusterVideoIds: string[]): { ids: string[]; foreign: string[]; corrected: number } {
  const out: string[] = [];
  const foreign: string[] = [];
  let corrected = 0;
  for (const id of ids) {
    let real: string | undefined = clusterVideoIds.includes(id) ? id : undefined;
    if (!real) {
      const near = clusterVideoIds.filter((v) => withinOneEdit(id, v));
      if (near.length === 1) {
        real = near[0];
        corrected++;
      }
    }
    if (!real) foreign.push(id);
    else if (!out.includes(real)) out.push(real);
  }
  return { ids: out, foreign, corrected };
}

export interface ValidationReport {
  errors: string[]; // fed back to the model on the single repair attempt
  perCluster: Map<string, { parsed: SynthCluster | null; errors: string[] }>;
}

/** Strict checks: schema, evidence IDs belong to the cluster, no invented numbers, unique theme names, coverage. */
export function validateSynthesis(rawClusters: Record<string, unknown>[], clusters: ValidationCluster[]): ValidationReport {
  const errors: string[] = [];
  const perCluster = new Map<string, { parsed: SynthCluster | null; errors: string[] }>();
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const themes = new Map<string, string>();

  for (const raw of rawClusters) {
    const id = String(raw.cluster_id ?? "");
    const c = byId.get(id);
    if (!c) {
      errors.push(`Unknown cluster_id "${id}" — only use the given cluster_ids.`);
      continue;
    }
    const errs: string[] = [];
    const parsed = SynthCluster.safeParse(raw);
    if (!parsed.success) {
      errs.push(`schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      perCluster.set(id, { parsed: null, errors: errs });
      errors.push(...errs.map((e) => `cluster ${id}: ${e}`));
      continue;
    }
    const resolved = resolveEvidenceIds(parsed.data.evidence_video_ids, c.videoIds);
    const n = { ...parsed.data, evidence_video_ids: resolved.ids.concat(resolved.foreign) };
    if (resolved.foreign.length) errs.push(`evidence_video_ids not in this cluster: ${resolved.foreign.join(", ")}`);
    else if (resolved.ids.length < 2) errs.push("evidence_video_ids needs at least 2 different video_ids from this cluster");
    for (const [field, text] of [
      ["theme_name", n.theme_name],
      ["why_now", n.why_now],
      ...n.suggested_angles.map((a, i) => [`suggested_angles[${i}]`, a] as const),
    ] as const) {
      const bad = disallowedNumbers(text, c.allowedNumbers);
      if (bad.length) errs.push(`${field} contains numbers (${bad.join(", ")}); write no numbers`);
    }
    const key = n.theme_name.trim().toLowerCase();
    if (themes.has(key)) errs.push(`theme_name "${n.theme_name}" duplicates cluster ${themes.get(key)}`);
    else themes.set(key, id);
    perCluster.set(id, { parsed: n, errors: errs });
    errors.push(...errs.map((e) => `cluster ${id}: ${e}`));
  }
  for (const c of clusters) if (!perCluster.has(c.id)) errors.push(`cluster ${c.id}: missing from output`);
  return { errors, perCluster };
}

/** Removes sentences that contain disallowed numbers. */
export function stripNumberSentences(text: string, allowed: Set<string>): string {
  // Split only at sentence punctuation followed by whitespace, so "Claude Haiku 5.5" stays one token.
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  return sentences
    .filter((s) => disallowedNumbers(s, allowed).length === 0)
    .join(" ")
    .trim();
}

/**
 * Final, lenient pass after the one repair attempt: salvage what is safe, otherwise stats-only.
 * Never lets an invented number or foreign video ID through.
 */
export function finalizeNarrative(entry: { parsed: SynthCluster | null } | undefined, c: ValidationCluster, usedThemes: Set<string>): NarrativeResult {
  if (!entry?.parsed) return { mode: "stats_only", reason: "model output missing or failed schema" };
  const n = entry.parsed;
  const notes: string[] = [];
  const { ids: evidence, foreign, corrected } = resolveEvidenceIds(n.evidence_video_ids, c.videoIds);
  if (foreign.length) notes.push("dropped evidence IDs outside cluster");
  if (corrected) notes.push("corrected mistyped evidence IDs");
  if (evidence.length < 2) return { mode: "stats_only", reason: "fewer than 2 valid evidence videos" };

  let theme = n.theme_name;
  if (disallowedNumbers(theme, c.allowedNumbers).length) {
    theme = c.label.slice(0, 60);
    notes.push("theme name replaced (contained numbers)");
  }
  if (usedThemes.has(theme.toLowerCase())) theme = `${theme.slice(0, 50)} (${c.label})`.slice(0, 60);
  if (usedThemes.has(theme.toLowerCase())) return { mode: "stats_only", reason: "duplicate theme name" };

  const whyNow = stripNumberSentences(n.why_now, c.allowedNumbers);
  if (whyNow !== n.why_now) notes.push("removed sentence(s) with invented numbers");
  const angles = n.suggested_angles.filter((a) => disallowedNumbers(a, c.allowedNumbers).length === 0);
  if (!whyNow || angles.length === 0) return { mode: "stats_only", reason: "prose empty after removing invented numbers" };

  usedThemes.add(theme.toLowerCase());
  return {
    mode: "full",
    narrative: { theme_name: theme, why_now: whyNow, suggested_angles: angles, evidence_video_ids: evidence, confidence: n.confidence },
    notes,
  };
}
