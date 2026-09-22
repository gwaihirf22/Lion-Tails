-- Numbered 0016, leaving 0015 to the delete-account branch, which already
-- holds that number on a branch of its own. Either can land first: the two
-- touch different tables, and drizzle applies whatever the journal lists that
-- the database has not seen.
--
-- IF NOT EXISTS throughout, like the migrations before it: this is applied at
-- container start, and a migration that cannot be run twice turns a retried
-- deploy into a boot loop.
CREATE TABLE IF NOT EXISTS "account_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "account_events" ADD CONSTRAINT "account_events_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_events_user_created" ON "account_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_events_created_at" ON "account_events" USING btree ("created_at");
