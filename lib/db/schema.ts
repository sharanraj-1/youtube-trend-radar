import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  real,
  serial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  config: jsonb("config").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: text("id").primaryKey(),
  handle: text("handle"),
  title: text("title").notNull(),
  subscriberCount: bigint("subscriber_count", { mode: "number" }),
  uploadsPlaylistId: text("uploads_playlist_id"),
  medianRecentViews: real("median_recent_views"),
  medianUpdatedAt: ts("median_updated_at"),
  isPeer: boolean("is_peer").notNull().default(false),
  isOwn: boolean("is_own").notNull().default(false),
  blocked: boolean("blocked").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const videos = pgTable(
  "videos",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id").notNull(),
    channelTitle: text("channel_title"),
    title: text("title").notNull(),
    descriptionSnippet: text("description_snippet"),
    tags: text("tags").array(),
    publishedAt: ts("published_at").notNull(),
    durationS: integer("duration_s"),
    isShort: boolean("is_short").notNull().default(false),
    langGuess: text("lang_guess"),
    source: text("source").notNull(), // peer | search | chart | own
    firstSeenRunId: integer("first_seen_run_id"),
  },
  (t) => [index("videos_published_idx").on(t.publishedAt), index("videos_channel_idx").on(t.channelId)],
);

export const videoSnapshots = pgTable(
  "video_snapshots",
  {
    id: serial("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    capturedAt: ts("captured_at").notNull().defaultNow(),
    views: bigint("views", { mode: "number" }).notNull(),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
  },
  (t) => [index("snapshots_video_time_idx").on(t.videoId, t.capturedAt)],
);

export const enrichments = pgTable("enrichments", {
  videoId: text("video_id")
    .primaryKey()
    .references(() => videos.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  entities: text("entities").array().notNull(),
  topicKey: text("topic_key").notNull(),
  topicSummary: text("topic_summary").notNull(),
  inNiche: boolean("in_niche"),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // weekly | manual | snapshot
  status: text("status").notNull().default("pending"), // pending | running | done | degraded | failed
  currentStage: text("current_stage").notNull().default("PENDING"),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  quotaUsed: integer("quota_used").notNull().default(0),
  geminiCalls: integer("gemini_calls").notNull().default(0),
  coverageNote: text("coverage_note"),
  error: text("error"),
});

export const stageOutputs = pgTable(
  "stage_outputs",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    status: text("status").notNull().default("pending"), // pending | running | done | failed | skipped
    payload: jsonb("payload"),
    attempts: integer("attempts").notNull().default(0),
    invocations: integer("invocations").notNull().default(0),
    error: text("error"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    durationMs: integer("duration_ms").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stage_outputs_run_stage_uq").on(t.runId, t.stage)],
);

export const clusters = pgTable(
  "clusters",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    topicKey: text("topic_key").notNull(),
    topEntity: text("top_entity"),
    label: text("label").notNull(),
    doc: text("doc").notNull().default(""),
    videoIds: text("video_ids").array().notNull(),
    stats: jsonb("stats").notNull(),
    lifecycle: text("lifecycle"),
    score: real("score"),
    selection: text("selection").notNull().default("none"), // top | skip | none
    narrative: jsonb("narrative"),
    matchedPrevClusterId: integer("matched_prev_cluster_id"),
  },
  (t) => [index("clusters_run_idx").on(t.runId)],
);

export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => runs.id, { onDelete: "set null" }),
  status: text("status").notNull(), // complete | degraded | fallback
  html: text("html").notNull(),
  json: jsonb("json").notNull(),
  promptVersion: text("prompt_version"),
  createdAt: ts("created_at").notNull().defaultNow(),
  deliveredAt: ts("delivered_at"),
  delivery: jsonb("delivery"),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  clusterId: integer("cluster_id").notNull(),
  vote: text("vote").notNull(), // up | down | filmed
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Run = typeof runs.$inferSelect;
export type StageOutput = typeof stageOutputs.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Cluster = typeof clusters.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type Enrichment = typeof enrichments.$inferSelect;
