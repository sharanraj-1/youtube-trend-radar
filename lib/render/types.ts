export interface BriefVideo {
  id: string;
  title: string;
  channel: string;
  views: number;
  published_at: string;
  url: string;
  thumb: string;
}

export interface BriefCluster {
  id: number;
  label: string;
  theme_name: string;
  mode: "full" | "stats_only";
  stats_only_reason?: string;
  why_now?: string;
  angles?: string[];
  confidence?: "low" | "medium" | "high";
  lifecycle: string;
  lifecycle_confidence: "low" | "normal";
  score: number;
  stats: {
    creators: number;
    videos: number;
    median_outlier: number | null;
    winning_format: string | null;
    typical_length_s: number | null;
    shorts_share: number;
    median_views_per_hour: number | null;
    wow_channel_growth: number | null;
  };
  questions: { text: string; likes: number; video_id: string }[];
  evidence: BriefVideo[];
  covered: { date: string; title: string; url: string } | null;
  feedback: { up: string; down: string; filmed: string };
}

export interface BriefSkip {
  id: number;
  label: string;
  creators: number;
  median_outlier: number | null;
  videos: number;
}

export interface BriefJson {
  version: 1;
  run_id: number | null;
  status: "complete" | "degraded" | "fallback";
  generated_at: string;
  collected_at: string | null;
  week_summary: string;
  banner: string | null;
  lifecycle_note: string | null;
  clusters: BriefCluster[];
  skip: BriefSkip[];
  footer: {
    sources: {
      peer_channels: string[];
      unresolved_handles: string[];
      chart: string;
      searches: number;
      videos_analysed: number;
    };
    quota_used: number;
    gemini_calls: number;
    coverage_note: string | null;
    prompt_versions: string[];
  };
}
