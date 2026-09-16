ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "image_model" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "image_quality" text;