CREATE TABLE "story_jobs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"request" jsonb NOT NULL,
	"brief" text NOT NULL,
	"system_prompt" text NOT NULL,
	"target_word_count" integer NOT NULL,
	"model" text NOT NULL,
	"worker_id" text,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"step" text,
	"outline" jsonb,
	"chapters" jsonb,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"story_id" text,
	"failure_code" text,
	"failure_message" text
);
--> statement-breakpoint
ALTER TABLE "generation_records" ADD COLUMN "job_id" text;--> statement-breakpoint
ALTER TABLE "story_jobs" ADD CONSTRAINT "story_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_story_jobs_user_id" ON "story_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_story_jobs_status" ON "story_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_story_jobs_claim" ON "story_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_job_id_story_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."story_jobs"("job_id") ON DELETE set null ON UPDATE no action;