CREATE INDEX "idx_generation_records_job_id" ON "generation_records" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_hero_stories_user_id" ON "hero_stories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_story_shares_user_id" ON "story_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_verification_tokens_token" ON "verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_verification_tokens_user_id" ON "verification_tokens" USING btree ("user_id");