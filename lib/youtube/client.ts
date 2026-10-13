import { z } from "zod";
import { fetchJson, HttpError, withRetry } from "../retry";
import { log } from "../log";
import { QuotaExceededError, QuotaManager, type Endpoint } from "./quota";
import { clip, pgSafe } from "../text";

const API = "https://www.googleapis.com/youtube/v3";

// ---------- response schemas (only the fields we use; everything else passes through) ----------

// Free text from creators is cleaned of characters Postgres rejects (see lib/text.ts).
const Txt = z.string().transform(pgSafe);

const Thumbs = z.record(z.string(), z.object({ url: z.string() }).passthrough()).optional();

export const ChannelItem = z.object({
  id: z.string(),
  snippet: z.object({ title: Txt, customUrl: z.string().optional(), thumbnails: Thumbs }).passthrough(),
  contentDetails: z
    .object({ relatedPlaylists: z.object({ uploads: z.string().optional() }).passthrough() })
    .passthrough()
    .optional(),
  statistics: z
    .object({ subscriberCount: z.string().optional(), hiddenSubscriberCount: z.boolean().optional(), videoCount: z.string().optional() })
    .passthrough()
    .optional(),
});
export type ChannelItem = z.infer<typeof ChannelItem>;

export const VideoItem = z.object({
  id: z.string(),
  snippet: z
    .object({
      publishedAt: z.string(),
      channelId: z.string(),
      channelTitle: Txt.optional(),
      title: Txt,
      description: Txt.optional().default(""),
      tags: z.array(Txt).optional(),
      categoryId: z.string().optional(),
      defaultLanguage: z.string().optional(),
      defaultAudioLanguage: z.string().optional(),
      liveBroadcastContent: z.string().optional(),
    })
    .passthrough(),
  contentDetails: z.object({ duration: z.string().optional() }).passthrough().optional(),
  statistics: z
    .object({ viewCount: z.string().optional(), likeCount: z.string().optional(), commentCount: z.string().optional() })
    .passthrough()
    .optional(),
});
export type VideoItem = z.infer<typeof VideoItem>;

const PlaylistItem = z.object({
  contentDetails: z.object({ videoId: z.string(), videoPublishedAt: z.string().optional() }).passthrough(),
  snippet: z.object({ publishedAt: z.string().optional(), title: Txt.optional() }).passthrough().optional(),
});

const SearchItem = z.object({
  id: z.object({ kind: z.string(), videoId: z.string().optional() }).passthrough(),
  snippet: z.object({ publishedAt: z.string().optional(), channelId: z.string().optional() }).passthrough().optional(),
});

const CommentThread = z.object({
  snippet: z
    .object({
      topLevelComment: z.object({
        snippet: z
          .object({ textOriginal: z.string().optional(), textDisplay: z.string().optional(), likeCount: z.number().optional() })
          .passthrough(),
      }),
    })
    .passthrough(),
});

const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item).default([]), nextPageToken: z.string().optional() }).passthrough();

export type Comment = { text: string; likes: number };

// ---------- client ----------

export class YouTubeClient {
  constructor(private apiKey: string, public quota: QuotaManager) {}

  private async call<T extends z.ZodTypeAny>(
    endpoint: Endpoint,
    path: string,
    params: Record<string, string | number | undefined>,
    schema: T,
  ): Promise<z.infer<T>> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    qs.set("key", this.apiKey);
    const url = `${API}/${path}?${qs.toString()}`;

    const json = await withRetry(
      async () => {
        this.quota.charge(endpoint); // throws when budget gone; retries are charged too
        try {
          return await fetchJson<unknown>("youtube", url);
        } catch (err) {
          if (err instanceof HttpError && err.status === 403 && /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(err.reason ?? err.body)) {
            if (!/rateLimitExceeded/.test(err.reason ?? "")) {
              this.quota.markDailyExhausted();
              throw new QuotaExceededError();
            }
          }
          throw err;
        }
      },
      {
        service: `youtube:${endpoint}`,
        shouldRetry: (err) => {
          if (err instanceof QuotaExceededError) return false;
          if (err instanceof HttpError) return err.status === 429 || err.status >= 500 || /rateLimitExceeded/.test(err.reason ?? "");
          return !(err instanceof Error && err.name === "QuotaBudgetError");
        },
      },
    );
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      log.error("youtube payload failed validation", { endpoint, issues: parsed.error.issues.slice(0, 3) });
      throw new Error(`Unexpected YouTube ${endpoint} payload`);
    }
    return parsed.data;
  }

  async channelByHandle(handle: string): Promise<ChannelItem | null> {
    const res = await this.call("channels.list", "channels", {
      part: "snippet,contentDetails,statistics",
      forHandle: handle.startsWith("@") ? handle : `@${handle}`,
      maxResults: 1,
    }, listOf(ChannelItem));
    return res.items[0] ?? null;
  }

  async channelsByIds(ids: string[]): Promise<ChannelItem[]> {
    if (ids.length === 0) return [];
    if (ids.length > 50) throw new Error("channelsByIds: max 50 ids");
    const res = await this.call("channels.list", "channels", {
      part: "snippet,contentDetails,statistics",
      id: ids.join(","),
      maxResults: 50,
    }, listOf(ChannelItem));
    return res.items;
  }

  async videosByIds(ids: string[]): Promise<VideoItem[]> {
    if (ids.length === 0) return [];
    if (ids.length > 50) throw new Error("videosByIds: max 50 ids");
    const res = await this.call("videos.list", "videos", {
      part: "snippet,contentDetails,statistics",
      id: ids.join(","),
      maxResults: 50,
    }, listOf(VideoItem));
    return res.items;
  }

  async videoStatsByIds(ids: string[]): Promise<VideoItem[]> {
    if (ids.length === 0) return [];
    const res = await this.call("videos.list", "videos", { part: "snippet,statistics", id: ids.join(","), maxResults: 50 }, listOf(VideoItem));
    return res.items;
  }

  async mostPopular(regionCode: string, categoryId: string): Promise<VideoItem[]> {
    const res = await this.call("videos.list", "videos", {
      part: "snippet,contentDetails,statistics",
      chart: "mostPopular",
      regionCode,
      videoCategoryId: categoryId,
      maxResults: 50,
    }, listOf(VideoItem));
    return res.items;
  }

  /** Returns recent upload IDs (newest first) from an uploads playlist. */
  async playlistVideoIds(playlistId: string, maxResults = 50): Promise<{ videoId: string; publishedAt?: string; title?: string }[]> {
    const res = await this.call("playlistItems.list", "playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: Math.min(50, maxResults),
    }, listOf(PlaylistItem));
    return res.items.map((i) => ({
      videoId: i.contentDetails.videoId,
      publishedAt: i.contentDetails.videoPublishedAt,
      title: i.snippet?.title,
    }));
  }

  async search(p: { q: string; publishedAfter: string; regionCode: string; relevanceLanguage?: string; maxResults?: number }) {
    const res = await this.call("search.list", "search", {
      part: "snippet",
      type: "video",
      q: p.q,
      publishedAfter: p.publishedAfter,
      regionCode: p.regionCode,
      relevanceLanguage: p.relevanceLanguage,
      order: "viewCount",
      maxResults: p.maxResults ?? 50,
    }, listOf(SearchItem));
    return res.items.map((i) => i.id.videoId).filter((v): v is string => !!v);
  }

  /** Top relevance comments; returns null when comments are disabled/unavailable (403/404). */
  async topComments(videoId: string, maxResults = 20): Promise<Comment[] | null> {
    try {
      const res = await this.call("commentThreads.list", "commentThreads", {
        part: "snippet",
        videoId,
        order: "relevance",
        maxResults,
        textFormat: "plainText",
      }, listOf(CommentThread));
      return res.items.map((t) => {
        const s = t.snippet.topLevelComment.snippet;
        return { text: clip(s.textOriginal ?? s.textDisplay ?? "", 400), likes: s.likeCount ?? 0 };
      });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 403 || err.status === 404) && !/quota/i.test(err.reason ?? "")) {
        log.info("comments unavailable", { videoId, reason: err.reason });
        return null;
      }
      throw err;
    }
  }
}
