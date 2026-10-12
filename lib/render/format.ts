export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}
const trim = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1).replace(/\.0$/, "") : x.toFixed(1).replace(/\.0$/, ""));

export function multiple(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)}×`;
}

export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export function duration(s: number | null | undefined): string {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function istDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso)) + " IST";
}

export function istDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export const FORMAT_LABEL: Record<string, string> = {
  tutorial: "Tutorial",
  review: "Review",
  comparison: "Comparison",
  news_reaction: "News / reaction",
  listicle: "Listicle",
  short: "Short",
  other: "Other",
};

export const LIFECYCLE_META: Record<string, { label: string; hint: string; color: string }> = {
  emerging: { label: "Emerging", hint: "New this month, few creators, overperforming", color: "#0f9d58" },
  rising: { label: "Rising", hint: "More creators joining week over week", color: "#1a73e8" },
  peaking: { label: "Peaking", hint: "Crowded; performance flat", color: "#e37400" },
  saturated: { label: "Saturated", hint: "Late — underperforming or peaked for weeks", color: "#9aa0a6" },
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
