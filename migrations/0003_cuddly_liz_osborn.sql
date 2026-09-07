CREATE TABLE "story_universes" (
	"universe_id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text,
	"summary_updated_at" timestamp with time zone,
	"summary_edited_at" timestamp with time zone,
	"summary_model" text,
	"summary_inputs_hash" text,
	"summary_covered_count" integer,
	"summary_dropped_count" integer,
	"pinned_canon" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_records" ADD COLUMN "kind" text DEFAULT 'story' NOT NULL;--> statement-breakpoint
ALTER TABLE "story_jobs" ADD COLUMN "kind" text DEFAULT 'story' NOT NULL;--> statement-breakpoint
ALTER TABLE "story_jobs" ADD COLUMN "universe_id" text;--> statement-breakpoint
ALTER TABLE "user_stories" ADD COLUMN "universe_id" text;--> statement-breakpoint
ALTER TABLE "story_universes" ADD CONSTRAINT "story_universes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_story_universes_user_id" ON "story_universes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_story_universes_user_name" ON "story_universes" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "story_jobs" ADD CONSTRAINT "story_jobs_universe_id_story_universes_universe_id_fk" FOREIGN KEY ("universe_id") REFERENCES "public"."story_universes"("universe_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_universe_id_story_universes_universe_id_fk" FOREIGN KEY ("universe_id") REFERENCES "public"."story_universes"("universe_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_story_jobs_one_active_summary" ON "story_jobs" USING btree ("universe_id") WHERE kind = 'summary' AND status IN ('queued','running');--> statement-breakpoint
CREATE INDEX "idx_user_stories_universe_id" ON "user_stories" USING btree ("universe_id");