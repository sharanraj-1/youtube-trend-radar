import { inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { log } from "../log";
import type { ChannelItem, YouTubeClient } from "./client";

const CACHE_MS = 7 * 86400_000;

export interface ResolvedHandle {
  handle: string;
  id: string;
  title: string;
  uploadsPlaylistId: string | null;
  subscriberCount: number | null;
}

export function channelRow(c: ChannelItem, extra: { handle?: string; isPeer?: boolean; isOwn?: boolean } = {}) {
  const subs = c.statistics?.hiddenSubscriberCount ? null : c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null;
  return {
    id: c.id,
    handle: extra.handle ?? c.snippet.customUrl ?? null,
    title: c.snippet.title,
    subscriberCount: subs,
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists.uploads ?? null,
    isPeer: extra.isPeer ?? false,
    isOwn: extra.isOwn ?? false,
    updatedAt: new Date(),
  };
}

export async function upsertChannels(rows: ReturnType<typeof channelRow>[], opts: { keepFlags?: boolean } = {}) {
  if (rows.length === 0) return;
  await db()
    .insert(schema.channels)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.channels.id,
      set: {
        title: sql`excluded.title`,
        subscriberCount: sql`excluded.subscriber_count`,
        uploadsPlaylistId: sql`excluded.uploads_playlist_id`,
        updatedAt: sql`excluded.updated_at`,
        handle: sql`COALESCE(excluded.handle, ${schema.channels.handle})`,
        ...(opts.keepFlags
          ? {}
          : { isPeer: sql`excluded.is_peer OR ${schema.channels.isPeer}`, isOwn: sql`excluded.is_own OR ${schema.channels.isOwn}` }),
      },
    });
}

/**
 * Resolves @handles to channel IDs via channels.list?forHandle (1 unit each), cached 7 days in `channels`.
 * Handles that don't resolve are returned in `unresolved` and dropped — channel IDs are never invented.
 */
export async function resolveHandles(
  yt: YouTubeClient,
  handles: string[],
  flags: { isPeer?: boolean; isOwn?: boolean } = {},
  opts: { useCache?: boolean } = { useCache: true },
): Promise<{ resolved: ResolvedHandle[]; unresolved: string[] }> {
  const norm = [...new Set(handles.map((h) => (h.startsWith("@") ? h : `@${h}`)))];
  const lower = norm.map((h) => h.toLowerCase());
  const cached = opts.useCache
    ? await db().select().from(schema.channels).where(inArray(sql`lower(${schema.channels.handle})`, lower))
    : [];
  const resolved: ResolvedHandle[] = [];
  const unresolved: string[] = [];
  for (const h of norm) {
    const hit = cached.find((c) => c.handle?.toLowerCase() === h.toLowerCase());
    if (hit && hit.uploadsPlaylistId && Date.now() - hit.updatedAt.getTime() < CACHE_MS) {
      resolved.push({ handle: h, id: hit.id, title: hit.title, uploadsPlaylistId: hit.uploadsPlaylistId, subscriberCount: hit.subscriberCount });
      continue;
    }
    const ch = await yt.channelByHandle(h);
    if (!ch) {
      log.warn("handle did not resolve; dropping", { handle: h });
      unresolved.push(h);
      continue;
    }
    const row = channelRow(ch, { handle: h, ...flags });
    await upsertChannels([row]);
    resolved.push({ handle: h, id: row.id, title: row.title, uploadsPlaylistId: row.uploadsPlaylistId, subscriberCount: row.subscriberCount });
  }
  return { resolved, unresolved };
}
