-- verification_tokens has never had a foreign key, so rows for deleted users
-- are still in there pointing at ids that no longer exist. The constraint
-- refuses to be created while they are, so they go first: every one of them
-- belongs to an account that does not exist, and nothing can deliver a token
-- anyway.
DELETE FROM "verification_tokens" vt
 WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u.id = vt.user_id);
--> statement-breakpoint
-- Guarded, because this migration may meet a database where an earlier hand
-- fix already added it. ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'verification_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "verification_tokens"
      ADD CONSTRAINT "verification_tokens_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
