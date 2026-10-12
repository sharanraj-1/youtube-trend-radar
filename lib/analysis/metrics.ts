export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function ageHours(publishedAt: Date, now: Date): number {
  return Math.max(1, (now.getTime() - publishedAt.getTime()) / 3_600_000);
}

export function viewsPerHour(views: number, ageH: number): number {
  return views / Math.max(1, ageH);
}

/** views / channel median of recent uploads. null when the channel baseline is unknown or zero. */
export function outlierMultiple(views: number, channelMedian: number | null | undefined): number | null {
  if (!channelMedian || channelMedian <= 0) return null;
  return views / channelMedian;
}

export function engagementRate(views: number, likes: number | null, comments: number | null): number | null {
  if (!views) return null;
  return ((likes ?? 0) + (comments ?? 0)) / views;
}

export interface SnapshotPoint {
  capturedAt: Date;
  views: number;
}

/**
 * Views gained per hour over (up to) the last 72 hours of snapshots.
 * Needs two snapshots at least 1 hour apart; otherwise null.
 */
export function velocity72h(snaps: SnapshotPoint[]): number | null {
  if (snaps.length < 2) return null;
  const sorted = [...snaps].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const latest = sorted[sorted.length - 1];
  const windowStart = latest.capturedAt.getTime() - 72 * 3_600_000;
  const earliest = sorted.find((s) => s.capturedAt.getTime() >= windowStart) ?? sorted[0];
  const hours = (latest.capturedAt.getTime() - earliest.capturedAt.getTime()) / 3_600_000;
  if (hours < 1) return null;
  return Math.max(0, latest.views - earliest.views) / hours;
}

export function round(n: number | null | undefined, digits = 2): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Paid promotion inflates views without engagement (e.g. brand ads at 0.001% likes/views), which would produce
 * absurd outlier multiples. Only judged when likes are visible.
 */
export function likelyPromoted(views: number, likes: number | null, comments: number | null, minViews: number, maxEngagement: number): boolean {
  if (likes === null || views < minViews) return false;
  return (likes + (comments ?? 0)) / views < maxEngagement;
}
