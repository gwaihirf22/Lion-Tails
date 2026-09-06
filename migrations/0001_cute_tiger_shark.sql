CREATE TABLE "generation_records" (
	"generation_id" text PRIMARY KEY NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"story_length" text,
	"story_type" text,
	"reading_level" text,
	"target_word_count" integer,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"tier" text NOT NULL,
	"using_own_key" boolean DEFAULT false NOT NULL,
	"downgraded_from" text,
	"outcome" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"duration_ms" integer,
	"actual_word_count" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"model_calls" integer,
	"retried_calls" integer,
	"truncated_calls" integer,
	"app_version" text,
	"chapter_word_counts" jsonb,
	"steps" jsonb
);
--> statement-breakpoint
ALTER TABLE "user_stories" ADD COLUMN "generation_id" text;--> statement-breakpoint
ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_generation_records_user_id" ON "generation_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_generation_records_created_at" ON "generation_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_generation_records_model" ON "generation_records" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_generation_records_outcome" ON "generation_records" USING btree ("outcome");--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_generation_id_generation_records_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("generation_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_stories_generation_id" ON "user_stories" USING btree ("generation_id");