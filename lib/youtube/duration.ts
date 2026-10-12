const ISO_DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Parses YouTube's ISO-8601 durations (e.g. "PT1H2M3S", "P1DT2H", "PT45S", "P0D"). Returns seconds or null. */
export function parseIsoDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = ISO_DURATION.exec(input.trim());
  if (!m || input === "P" || input.endsWith("T")) return null;
  const [, w, d, h, min, s] = m;
  const total =
    Number(w ?? 0) * 604800 + Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
  return Math.round(total);
}

export const SHORT_MAX_SECONDS = 180;

export function isShort(durationS: number | null): boolean {
  return durationS !== null && durationS > 0 && durationS <= SHORT_MAX_SECONDS;
}
