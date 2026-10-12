import weights from "@/config/weights.json";
import { buildIdf, cosine, tokenize, vectorize, type Vector } from "./tfidf";
import { median, round } from "./metrics";
import { topQuestions, type QuestionCandidate } from "./questions";
import type { VideoFormat } from "../prompts/enrich";

export interface ScoredVideo {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string; // ISO
  durationS: number | null;
  isShort: boolean;
  views: number;
  likes: number | null;
  comments: number | null;
  ageHours: number;
  viewsPerHour: number;
  outlierMultiple: number | null;
  engagementRate: number | null;
  velocity72h: number | null;
  format: VideoFormat;
  entities: string[];
  topicKey: string;
  topicSummary: string;
}

export interface OwnVideo {
  id: string;
  title: string;
  publishedAt: string;
}

export interface ClusterStats {
  distinct_channels: number;
  video_count: number;
  median_outlier_multiple: number | null;
  median_views_per_hour: number | null;
  median_duration_s: number | null;
  short_share: number;
  format_mix: Partial<Record<VideoFormat, number>>;
  top_format: VideoFormat | null;
  top_comment_questions: QuestionCandidate[];
  already_covered_by_ishaan: { video_id: string; title: string; published_at: string } | null;
  top_entities: string[];
  total_views: number;
  recent_share: number; // share of videos published in the 72h before collection
  first_published: string;
  last_published: string;
  median_engagement_rate: number | null;
  median_velocity_72h: number | null;
}

export interface ClusterDraft {
  topicKey: string;
  topEntity: string | null;
  label: string;
  videoIds: string[]; // sorted: strongest first
  doc: string; // titles + summaries, used for similarity with past weeks
  stats: ClusterStats;
}

const GENERIC = new Set(weights.genericEntities.map((e) => e.toLowerCase()));

export const canon = (e: string) => e.trim().toLowerCase().replace(/\s+/g, " ");
export const isGeneric = (e: string) => GENERIC.has(canon(e));

function dominantEntity(videos: ScoredVideo[]): string | null {
  const counts = new Map<string, { n: number; display: Map<string, number> }>();
  for (const v of videos)
    for (const e of v.entities) {
      if (isGeneric(e)) continue;
      const k = canon(e);
      const c = counts.get(k) ?? { n: 0, display: new Map() };
      c.n++;
      c.display.set(e.trim(), (c.display.get(e.trim()) ?? 0) + 1);
      counts.set(k, c);
    }
  let best: { k: string; n: number; display: Map<string, number> } | null = null;
  for (const [k, c] of counts) if (!best || c.n > best.n) best = { k, ...c };
  if (!best) return null;
  return [...best.display.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const docOf = (videos: ScoredVideo[]) => videos.map((v) => `${v.title}. ${v.topicSummary}`).join(" ");

interface Group {
  videos: ScoredVideo[];
  topEntity: string | null;
  tokens: string[];
  vec: Vector;
  alive: boolean;
}

/**
 * 1. group by dominant canonical entity (fallback topic_key)
 * 2. agglomeratively merge groups sharing a top entity or with TF-IDF cosine >= threshold
 * 3. keep clusters with >= N distinct channels; compute stats with a per-channel cap
 */
export function clusterVideos(
  videos: ScoredVideo[],
  opts: {
    questions?: Map<string, { text: string; likes: number }[]>;
    ownVideos?: OwnVideo[];
    now?: Date;
    mergeCosine?: number;
    minChannels?: number;
    perChannelCap?: number;
  } = {},
): ClusterDraft[] {
  const mergeCosine = opts.mergeCosine ?? weights.cluster.mergeCosine;
  const minChannels = opts.minChannels ?? weights.cluster.minDistinctChannels;

  // 1. initial grouping
  const initial = new Map<string, ScoredVideo[]>();
  for (const v of videos) {
    const first = v.entities.find((e) => !isGeneric(e));
    const key = first ? `e:${canon(first)}` : `t:${v.topicKey || v.id}`;
    const arr = initial.get(key) ?? [];
    arr.push(v);
    initial.set(key, arr);
  }

  const groupTokens = [...initial.values()].map((vs) => tokenize(docOf(vs)));
  const idf = buildIdf(groupTokens);
  const groups: Group[] = [...initial.values()].map((vs, i) => ({
    videos: vs,
    topEntity: dominantEntity(vs),
    tokens: groupTokens[i],
    vec: vectorize(groupTokens[i], idf),
    alive: true,
  }));

  // 2a. merge groups sharing their top entity
  const byEntity = new Map<string, Group>();
  for (const g of groups) {
    if (!g.topEntity) continue;
    const k = canon(g.topEntity);
    const host = byEntity.get(k);
    if (host) mergeInto(host, g, idf);
    else byEntity.set(k, g);
  }

  // 2b. agglomerative cosine merging (best pair first, vectors recomputed after each merge)
  for (;;) {
    const live = groups.filter((g) => g.alive);
    let best: { a: Group; b: Group; s: number } | null = null;
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const s = cosine(a.vec, b.vec);
        if (s >= mergeCosine && (!best || s > best.s)) best = { a, b, s };
      }
    if (!best) break;
    const [host, other] = best.a.videos.length >= best.b.videos.length ? [best.a, best.b] : [best.b, best.a];
    mergeInto(host, other, idf);
  }

  // 3. filter + stats
  const out: ClusterDraft[] = [];
  for (const g of groups) {
    if (!g.alive) continue;
    const channels = new Set(g.videos.map((v) => v.channelId));
    if (channels.size < minChannels) continue;
    const stats = computeStats(g.videos, opts);
    const sorted = [...g.videos].sort((a, b) => strength(b) - strength(a));
    const topicKey = mostCommon(g.videos.map((v) => v.topicKey)) ?? sorted[0].topicKey;
    out.push({
      topicKey,
      topEntity: g.topEntity,
      label: g.topEntity ?? humanize(topicKey),
      videoIds: sorted.map((v) => v.id),
      doc: docOf(sorted.slice(0, 25)),
      stats,
    });
  }
  return out;
}

function mergeInto(host: Group, other: Group, idf: Map<string, number>) {
  if (host === other || !other.alive) return;
  host.videos = host.videos.concat(other.videos);
  host.tokens = host.tokens.concat(other.tokens);
  host.vec = vectorize(host.tokens, idf);
  host.topEntity = dominantEntity(host.videos) ?? host.topEntity ?? other.topEntity;
  other.alive = false;
  other.videos = [];
}

const strength = (v: ScoredVideo) => (v.outlierMultiple ?? 0) * 1000 + Math.log1p(v.viewsPerHour);

function mostCommon(xs: string[]): string | null {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function humanize(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Keep at most `cap` videos per channel (strongest first) so one prolific channel can't skew stats. */
export function capPerChannel(videos: ScoredVideo[], cap: number): ScoredVideo[] {
  const byChannel = new Map<string, ScoredVideo[]>();
  for (const v of [...videos].sort((a, b) => strength(b) - strength(a))) {
    const arr = byChannel.get(v.channelId) ?? [];
    if (arr.length < cap) arr.push(v);
    byChannel.set(v.channelId, arr);
  }
  return [...byChannel.values()].flat();
}

export function computeStats(
  all: ScoredVideo[],
  opts: { questions?: Map<string, { text: string; likes: number }[]>; ownVideos?: OwnVideo[]; now?: Date; perChannelCap?: number } = {},
): ClusterStats {
  const capped = capPerChannel(all, opts.perChannelCap ?? weights.cluster.maxVideosPerChannelInStats);
  const now = opts.now ?? new Date();
  const formatMix: Partial<Record<VideoFormat, number>> = {};
  for (const v of capped) formatMix[v.format] = (formatMix[v.format] ?? 0) + 1;
  const longForm = capped.filter((v) => !v.isShort && v.durationS);
  const topFormat = (Object.entries(formatMix).sort((a, b) => b[1] - a[1])[0]?.[0] as VideoFormat) ?? null;

  const qCands: QuestionCandidate[] = [];
  for (const v of all) for (const c of opts.questions?.get(v.id) ?? []) qCands.push({ ...c, video_id: v.id });

  const published = all.map((v) => new Date(v.publishedAt).getTime()).sort((a, b) => a - b);
  const recent = all.filter((v) => now.getTime() - new Date(v.publishedAt).getTime() <= 72 * 3_600_000).length;
  const topEntities = topEntitiesOf(all);

  return {
    distinct_channels: new Set(all.map((v) => v.channelId)).size,
    video_count: all.length,
    median_outlier_multiple: round(median(capped.map((v) => v.outlierMultiple ?? NaN))),
    median_views_per_hour: round(median(capped.map((v) => v.viewsPerHour)), 0),
    median_duration_s: round(median(longForm.map((v) => v.durationS!)), 0),
    short_share: round(capped.filter((v) => v.isShort).length / Math.max(1, capped.length)) ?? 0,
    format_mix: formatMix,
    top_format: topFormat,
    top_comment_questions: topQuestions(qCands, 5),
    already_covered_by_ishaan: coveredBy(all, topEntities, opts.ownVideos ?? []),
    top_entities: topEntities,
    total_views: all.reduce((s, v) => s + v.views, 0),
    recent_share: round(recent / Math.max(1, all.length)) ?? 0,
    first_published: new Date(published[0]).toISOString(),
    last_published: new Date(published[published.length - 1]).toISOString(),
    median_engagement_rate: round(median(capped.map((v) => v.engagementRate ?? NaN)), 4),
    median_velocity_72h: round(median(capped.map((v) => v.velocity72h ?? NaN)), 0),
  };
}

function topEntitiesOf(videos: ScoredVideo[]): string[] {
  const m = new Map<string, { n: number; display: string }>();
  for (const v of videos)
    for (const e of v.entities) {
      if (isGeneric(e)) continue;
      const k = canon(e);
      const c = m.get(k) ?? { n: 0, display: e.trim() };
      c.n++;
      m.set(k, c);
    }
  return [...m.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((c) => c.display);
}

function coveredBy(videos: ScoredVideo[], topEntities: string[], own: OwnVideo[]) {
  if (own.length === 0) return null;
  const docTokens = tokenize(docOf(videos.slice(0, 25)));
  const corpus = [docTokens, ...own.map((o) => tokenize(o.title))];
  const idf = buildIdf(corpus);
  const clusterVec = vectorize(docTokens, idf);
  const lead = topEntities[0] ? canon(topEntities[0]) : null;
  const matches = own.filter((o) => {
    const title = canon(o.title);
    if (lead && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(lead)}([^\\p{L}\\p{N}]|$)`, "u").test(title)) return true;
    return cosine(clusterVec, vectorize(tokenize(o.title), idf)) >= weights.cluster.mergeCosine;
  });
  if (matches.length === 0) return null;
  const latest = matches.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  return { video_id: latest.id, title: latest.title, published_at: latest.publishedAt };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
