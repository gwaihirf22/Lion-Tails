CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"call_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"job_id" text,
	"story_id" text,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"tier" text NOT NULL,
	"owner_paid" boolean NOT NULL,
	"outcome" text NOT NULL,
	"input_text" integer DEFAULT 0 NOT NULL,
	"input_cached" integer DEFAULT 0 NOT NULL,
	"input_cache_write" integer DEFAULT 0 NOT NULL,
	"input_image" integer DEFAULT 0 NOT NULL,
	"input_image_cached" integer DEFAULT 0 NOT NULL,
	"output_text" integer DEFAULT 0 NOT NULL,
	"output_image" integer DEFAULT 0 NOT NULL,
	"reasoning" integer DEFAULT 0 NOT NULL,
	"image_size" text,
	"image_quality" text,
	"cost_micros" bigint,
	"price_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "model_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"model" text NOT NULL,
	"unit" text NOT NULL,
	"usd_per_million" numeric(14, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"item" text NOT NULL,
	"price_cents" integer NOT NULL,
	"basis_cost_micros" bigint NOT NULL,
	"samples" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"published_by" integer,
	"margin_pct" numeric(6, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" integer,
	"note" text,
	"evidence" jsonb
);
--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_job_id_story_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."story_jobs"("job_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_price_version_id_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_prices" ADD CONSTRAINT "model_prices_version_id_price_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."price_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_version_id_price_list_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."price_list_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_versions" ADD CONSTRAINT "price_list_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_model_calls_created_at" ON "model_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_model_calls_job_id" ON "model_calls" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_model_calls_story_id" ON "model_calls" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_model_prices_version_model_unit" ON "model_prices" USING btree ("version_id","model","unit");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_price_list_items_version_item" ON "price_list_items" USING btree ("version_id","item");--> statement-breakpoint
CREATE INDEX "idx_price_versions_status" ON "price_versions" USING btree ("status");