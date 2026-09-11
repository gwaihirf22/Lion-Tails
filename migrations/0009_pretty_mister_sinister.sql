CREATE TABLE "story_shares" (
	"token" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "story_shares" ADD CONSTRAINT "story_shares_story_id_user_stories_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."user_stories"("story_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_shares" ADD CONSTRAINT "story_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_story_shares_story_id" ON "story_shares" USING btree ("story_id");