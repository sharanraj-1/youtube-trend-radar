CREATE TABLE "briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"status" text NOT NULL,
	"html" text NOT NULL,
	"json" jsonb NOT NULL,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivery" jsonb
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text,
	"title" text NOT NULL,
	"subscriber_count" bigint,
	"uploads_playlist_id" text,
	"median_recent_views" real,
	"median_updated_at" timestamp with time zone,
	"is_peer" boolean DEFAULT false NOT NULL,
	"is_own" boolean DEFAULT false NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"topic_key" text NOT NULL,
	"top_entity" text,
	"label" text NOT NULL,
	"doc" text DEFAULT '' NOT NULL,
	"video_ids" text[] NOT NULL,
	"stats" jsonb NOT NULL,
	"lifecycle" text,
	"score" real,
	"selection" text DEFAULT 'none' NOT NULL,
	"narrative" jsonb,
	"matched_prev_cluster_id" integer
);
--> statement-breakpoint
CREATE TABLE "enrichments" (
	"video_id" text PRIMARY KEY NOT NULL,
	"format" text NOT NULL,
	"entities" text[] NOT NULL,
	"topic_key" text NOT NULL,
	"topic_summary" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"cluster_id" integer NOT NULL,
	"vote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_stage" text DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"quota_used" integer DEFAULT 0 NOT NULL,
	"gemini_calls" integer DEFAULT 0 NOT NULL,
	"coverage_note" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_outputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"invocations" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"views" bigint NOT NULL,
	"likes" bigint,
	"comments" bigint
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"channel_title" text,
	"title" text NOT NULL,
	"description_snippet" text,
	"tags" text[],
	"published_at" timestamp with time zone NOT NULL,
	"duration_s" integer,
	"is_short" boolean DEFAULT false NOT NULL,
	"lang_guess" text,
	"source" text NOT NULL,
	"first_seen_run_id" integer
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_outputs" ADD CONSTRAINT "stage_outputs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_snapshots" ADD CONSTRAINT "video_snapshots_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clusters_run_idx" ON "clusters" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_outputs_run_stage_uq" ON "stage_outputs" USING btree ("run_id","stage");--> statement-breakpoint
CREATE INDEX "snapshots_video_time_idx" ON "video_snapshots" USING btree ("video_id","captured_at");--> statement-breakpoint
CREATE INDEX "videos_published_idx" ON "videos" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "videos_channel_idx" ON "videos" USING btree ("channel_id");