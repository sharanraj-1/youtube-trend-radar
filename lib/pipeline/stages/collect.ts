import { and, eq, inArray, sql } from "drizzle-orm";
import weights from "@/config/weights.json";
import { db, schema } from "../../db";
import { env } from "../../env";
import { log } from "../../log";
import { chunk, mapLimit } from "../../retry";
import { YouTubeClient, type VideoItem } from "../../youtube/client";
import { isShort, parseIsoDuration } from "../../youtube/duration";
import { QuotaBudgetError, QuotaExceededError } from "../../youtube/quota";
import { channelRow, resolveHandles, upsertChannels } from "../../youtube/resolve";
import { median } from "../../analysis/metrics";
import { isQuestion } from "../../analysis/questions";
import type { StageContext, StageResult } from "../types";

type Source = "peer" | "chart" | "search";
const SOURCE_RANK: Record<Source, number> = { peer: 3, chart: 2, search: 1 };
const PHASES = ["resolve", "sources", "hydrate", "channels", "baselines", "comments", "done"] as const;
type Phase = (typeof PHASES)[number];

export interface CollectPayload {
  phase: Phase;
  since: string;
  peers: { handle: string; id: string; uploads: string | null }[];
  unresolvedHandles: string[];
  ownChannelId: string | null;
  ownVideos: { id: string; title: string; publishedAt: string }[];
  candidates: Record<string, Source>;
  searchesDone: number;
  searchesPlanned: number;
  chart: { ok: boolean; count: number; note?: string };
  hydrated: string[];
  /** Final candidate set after channel filters. */
  videoIds: string[];
  droppedSmallChannels: number;
  droppedLanguage?: number;
  comments: Record<string, { text: string; likes: number }[]>;
  commentsChecked: number;
  quotaExhausted: boolean;
  collectedAt: string | null;
  notes: string[];
}

/**
 * Language gate: relevanceLanguage only *biases* search, so filter explicitly. A video passes when its declared
 * language is one of the configured ones, or (undeclared) when its title is mostly Latin/Devanagari script.
 */
export function languageAllowed(v: VideoItem, languages: string[]): boolean {
  const allowed = new Set(languages.map((l) => l.slice(0, 2).toLowerCase()));
  const declared = (v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? "").slice(0, 2).toLowerCase();
  if (declared && declared !== "zx" && declared !== "un") return allowed.has(declared);
  const letters = v.snippet.title.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const ok = letters.filter((c) => /[A-Za-zऀ-ॿ]/.test(c)).length;
  return ok / letters.length >= 0.7;
}

export function guessLang(v: VideoItem): string {
  if (/[ऀ-ॿ]/.test(v.snippet.title)) return "hi";
  const l = (v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? "").toLowerCase();
  if (l.startsWith("hi")) return "hi";
  if (l) return l.slice(0, 2);
  return "en";
}

export async function collect(ctx: StageContext): Promise<StageResult> {
  const cfg = ctx.config;
  const yt = new YouTubeClient(env().YOUTUBE_API_KEY, ctx.quota);
  const p: CollectPayload =
    (ctx.checkpoint as CollectPayload | null) ?? {
      phase: "resolve",
      since: new Date(Date.now() - cfg.lookbackDays * 86400_000).toISOString(),
      peers: [],
      unresolvedHandles: [],
      ownChannelId: null,
      ownVideos: [],
      candidates: {},
      searchesDone: 0,
      searchesPlanned: Math.min(cfg.maxSearchQueriesPerRun, cfg.seedKeywords.length),
      chart: { ok: false, count: 0 },
      hydrated: [],
      videoIds: [],
      droppedSmallChannels: 0,
      comments: {},
      commentsChecked: 0,
      quotaExhausted: false,
      collectedAt: null,
      notes: [],
    };
  const since = new Date(p.since);
  const outOfTime = () => ctx.timeLeft() < 15_000;
  const addCandidate = (id: string, src: Source) => {
    const cur = p.candidates[id];
    if (!cur || SOURCE_RANK[src] > SOURCE_RANK[cur]) p.candidates[id] = src;
  };
  const onQuota = (err: unknown) => {
    if (err instanceof QuotaExceededError || err instanceof QuotaBudgetError) {
      p.quotaExhausted = true;
      const msg =
        err instanceof QuotaExceededError
          ? "YouTube daily quota exceeded; continued with data collected so far."
          : "Per-run YouTube quota budget reached; continued with data collected so far.";
      if (!p.notes.includes(msg)) p.notes.push(msg);
      ctx.note(msg);
      return true;
    }
    return false;
  };

  // ---- 1. resolve peer + own handles ----
  if (p.phase === "resolve") {
    const r = await resolveHandles(yt, cfg.peerChannelHandles, { isPeer: true });
    p.peers = r.resolved.map((x) => ({ handle: x.handle, id: x.id, uploads: x.uploadsPlaylistId }));
    p.unresolvedHandles = r.unresolved;
    if (r.unresolved.length) p.notes.push(`Dropped unresolved handles: ${r.unresolved.join(", ")}.`);
    if (cfg.ownChannelHandle) {
      const own = await resolveHandles(yt, [cfg.ownChannelHandle], { isOwn: true });
      const o = own.resolved[0];
      if (o?.uploadsPlaylistId) {
        p.ownChannelId = o.id;
        const sixty = Date.now() - 60 * 86400_000;
        const items = await yt.playlistVideoIds(o.uploadsPlaylistId, 50);
        p.ownVideos = items
          .filter((i) => i.publishedAt && new Date(i.publishedAt).getTime() >= sixty)
          .map((i) => ({ id: i.videoId, title: i.title ?? "", publishedAt: i.publishedAt! }));
      } else p.notes.push(`Own channel ${cfg.ownChannelHandle} did not resolve; "already covered" check skipped.`);
    }
    p.phase = "sources";
  }

  // ---- 2. cheap sources first: peer uploads, chart; then search (100 units each) ----
  if (p.phase === "sources") {
    if (p.searchesDone === 0) {
      await mapLimit(p.peers, 4, async (peer) => {
        if (!peer.uploads) return;
        try {
          const items = await yt.playlistVideoIds(peer.uploads, 50);
          for (const i of items) if (i.publishedAt && new Date(i.publishedAt) >= since) addCandidate(i.videoId, "peer");
        } catch (err) {
          if (!onQuota(err)) log.warn("peer uploads failed", { handle: peer.handle, error: String(err) });
        }
      });
      for (const cat of cfg.youtubeCategoryIds) {
        try {
          const items = await yt.mostPopular(cfg.regionCode, cat);
          const recent = items.filter((v) => new Date(v.snippet.publishedAt) >= since);
          recent.forEach((v) => addCandidate(v.id, "chart"));
          p.chart = { ok: true, count: p.chart.count + recent.length };
        } catch (err) {
          if (onQuota(err)) break;
          p.chart = { ok: false, count: p.chart.count, note: err instanceof Error ? err.message : String(err) };
          log.warn("mostPopular chart unavailable; continuing", { category: cat, error: p.chart.note });
        }
      }
    }
    const keywords = cfg.seedKeywords.slice(0, p.searchesPlanned);
    while (p.searchesDone < keywords.length && !p.quotaExhausted) {
      if (outOfTime()) return { done: false, payload: p };
      const i = p.searchesDone;
      const lang = cfg.relevanceLanguages[i % cfg.relevanceLanguages.length];
      try {
        const ids = await yt.search({ q: keywords[i], publishedAfter: p.since, regionCode: cfg.regionCode, relevanceLanguage: lang });
        ids.forEach((id) => addCandidate(id, "search"));
      } catch (err) {
        if (onQuota(err)) break;
        log.warn("search failed; skipping keyword", { q: keywords[i], error: String(err) });
        p.notes.push(`Search "${keywords[i]}" failed.`);
      }
      p.searchesDone++;
    }
    if (p.searchesDone < keywords.length) p.notes.push(`Ran ${p.searchesDone}/${keywords.length} keyword searches.`);
    p.phase = "hydrate";
  }

  // ---- 3. hydrate videos (videos.list, 50 per call) + snapshot every video ----
  if (p.phase === "hydrate") {
    const done = new Set(p.hydrated);
    const todo = Object.keys(p.candidates).filter((id) => !done.has(id));
    for (const batch of chunk(chunk(todo, 50), 6)) {
      if (outOfTime()) return { done: false, payload: p };
      const results = await mapLimit(batch, 6, async (ids) => {
        try {
          return await yt.videosByIds(ids);
        } catch (err) {
          if (onQuota(err)) return [];
          throw err;
        }
      });
      const fetched = results.flat().filter((v) => (v.snippet.liveBroadcastContent ?? "none") === "none" && new Date(v.snippet.publishedAt) >= since);
      const items = fetched.filter((v) => p.candidates[v.id] === "peer" || languageAllowed(v, cfg.relevanceLanguages));
      p.droppedLanguage = (p.droppedLanguage ?? 0) + (fetched.length - items.length);
      await storeVideos(items, p.candidates, ctx.run.id);
      batch.flat().forEach((id) => p.hydrated.push(id));
      if (p.quotaExhausted) break;
    }
    p.phase = "channels";
  }

  // ---- 4. hydrate channels, drop small/blocked ----
  if (p.phase === "channels") {
    const vids = p.hydrated.length
      ? await db()
          .select({ id: schema.videos.id, channelId: schema.videos.channelId })
          .from(schema.videos)
          .where(inArray(schema.videos.id, p.hydrated))
      : [];
    const channelIds = [...new Set(vids.map((v) => v.channelId))];
    const known = channelIds.length
      ? await db().select().from(schema.channels).where(inArray(schema.channels.id, channelIds))
      : [];
    const fresh = new Set(known.filter((c) => Date.now() - c.updatedAt.getTime() < 7 * 86400_000 && c.subscriberCount !== null).map((c) => c.id));
    const stale = channelIds.filter((id) => !fresh.has(id));
    for (const ids of chunk(stale, 50)) {
      if (p.quotaExhausted) break;
      try {
        const items = await yt.channelsByIds(ids);
        await upsertChannels(items.map((c) => channelRow(c)), { keepFlags: true });
      } catch (err) {
        if (!onQuota(err)) throw err;
      }
    }
    const channels = channelIds.length
      ? await db().select().from(schema.channels).where(inArray(schema.channels.id, channelIds))
      : [];
    const blocked = new Set(cfg.blockedChannelIds);
    const ok = new Set(
      channels
        .filter((c) => !c.blocked && !blocked.has(c.id) && !c.isOwn && (c.isPeer || (c.subscriberCount ?? 0) >= cfg.minChannelSubscribers))
        .map((c) => c.id),
    );
    p.videoIds = vids.filter((v) => ok.has(v.channelId)).map((v) => v.id);
    p.droppedSmallChannels = vids.length - p.videoIds.length;
    p.phase = "baselines";
  }

  // ---- 5. channel baselines: median views of last 15 uploads (cached 7 days) ----
  if (p.phase === "baselines") {
    const vids = p.videoIds.length
      ? await db().selectDistinct({ channelId: schema.videos.channelId }).from(schema.videos).where(inArray(schema.videos.id, p.videoIds))
      : [];
    const chans = vids.length
      ? await db().select().from(schema.channels).where(inArray(schema.channels.id, vids.map((v) => v.channelId)))
      : [];
    const need = chans.filter(
      (c) => c.uploadsPlaylistId && (!c.medianUpdatedAt || Date.now() - c.medianUpdatedAt.getTime() > 7 * 86400_000),
    );
    for (const group of chunk(need, 30)) {
      if (outOfTime()) return { done: false, payload: p };
      if (p.quotaExhausted) break;
      const lists = await mapLimit(group, 8, async (c) => {
        try {
          return { c, ids: (await yt.playlistVideoIds(c.uploadsPlaylistId!, 15)).map((i) => i.videoId) };
        } catch (err) {
          if (!onQuota(err)) log.warn("baseline uploads failed", { channel: c.id, error: String(err) });
          return { c, ids: [] as string[] };
        }
      });
      const allIds = lists.flatMap((l) => l.ids);
      const stats = new Map<string, number>();
      await mapLimit(chunk(allIds, 50), 6, async (ids) => {
        try {
          for (const v of await yt.videoStatsByIds(ids)) stats.set(v.id, Number(v.statistics?.viewCount ?? 0));
        } catch (err) {
          if (!onQuota(err)) log.warn("baseline stats failed", { error: String(err) });
        }
      });
      for (const { c, ids } of lists) {
        const m = median(ids.map((id) => stats.get(id)).filter((x): x is number => x !== undefined));
        if (m === null) continue;
        await db()
          .update(schema.channels)
          .set({ medianRecentViews: m, medianUpdatedAt: new Date() })
          .where(eq(schema.channels.id, c.id));
      }
    }
    p.phase = "comments";
  }

  // ---- 6. comments for the 60 highest-outlier videos ----
  if (p.phase === "comments") {
    if (p.commentsChecked === 0 && p.videoIds.length && !p.quotaExhausted) {
      const rows = await db()
        .select({
          id: schema.videos.id,
          views: sql<number>`(SELECT s.views FROM video_snapshots s WHERE s.video_id = "videos"."id" ORDER BY s.captured_at DESC LIMIT 1)`,
          median: schema.channels.medianRecentViews,
        })
        .from(schema.videos)
        .innerJoin(schema.channels, eq(schema.channels.id, schema.videos.channelId))
        .where(and(inArray(schema.videos.id, p.videoIds), eq(schema.videos.isShort, false)));
      const top = rows
        .map((r) => ({ id: r.id, outlier: r.median ? Number(r.views) / r.median : 0 }))
        .sort((a, b) => b.outlier - a.outlier)
        .slice(0, weights.budget.commentVideos);
      await mapLimit(top, 6, async ({ id }) => {
        if (p.quotaExhausted) return;
        try {
          const cs = await yt.topComments(id, 20);
          const qs = (cs ?? []).filter((c) => isQuestion(c.text));
          if (qs.length) p.comments[id] = qs;
        } catch (err) {
          if (!onQuota(err)) log.warn("comments failed", { id, error: String(err) });
        }
        p.commentsChecked++;
      });
    }
    p.phase = "done";
  }

  p.collectedAt = new Date().toISOString();
  log.info("collect summary", {
    candidates: Object.keys(p.candidates).length,
    kept: p.videoIds.length,
    quota: ctx.quota.summary(),
  });
  return { done: true, payload: { ...p, quota: ctx.quota.summary() } };
}

async function storeVideos(items: VideoItem[], sources: Record<string, Source>, runId: number) {
  if (items.length === 0) return;
  const rows = items.map((v) => {
    const d = parseIsoDuration(v.contentDetails?.duration);
    return {
      id: v.id,
      channelId: v.snippet.channelId,
      channelTitle: v.snippet.channelTitle ?? null,
      title: v.snippet.title,
      descriptionSnippet: (v.snippet.description ?? "").slice(0, 500),
      tags: (v.snippet.tags ?? []).slice(0, 30),
      publishedAt: new Date(v.snippet.publishedAt),
      durationS: d,
      isShort: isShort(d),
      langGuess: guessLang(v),
      source: sources[v.id] ?? "search",
      firstSeenRunId: runId,
    };
  });
  for (const part of chunk(rows, 100)) {
    await db()
      .insert(schema.videos)
      .values(part)
      .onConflictDoUpdate({
        target: schema.videos.id,
        set: {
          title: sql`excluded.title`,
          channelTitle: sql`excluded.channel_title`,
          descriptionSnippet: sql`excluded.description_snippet`,
          tags: sql`excluded.tags`,
          durationS: sql`excluded.duration_s`,
          isShort: sql`excluded.is_short`,
        },
      });
  }
  const snaps = items.map((v) => ({
    videoId: v.id,
    views: Number(v.statistics?.viewCount ?? 0),
    likes: v.statistics?.likeCount !== undefined ? Number(v.statistics.likeCount) : null,
    comments: v.statistics?.commentCount !== undefined ? Number(v.statistics.commentCount) : null,
  }));
  for (const part of chunk(snaps, 200)) await db().insert(schema.videoSnapshots).values(part);
}

