ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_ip" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_model_calls_user_created" ON "model_calls" USING btree ("user_id","created_at");