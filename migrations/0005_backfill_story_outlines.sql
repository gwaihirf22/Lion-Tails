-- Backfill the chapter outline onto stories that already exist.
--
-- HAND-WRITTEN, and there is no DDL here on purpose: `outline` lives inside
-- user_stories.story_data, which is jsonb, so the schema does not change and
-- drizzle-kit generate would produce an empty migration. 0005_snapshot.json is
-- therefore a copy of 0004's -- the schema really is identical.
--
-- Why this runs at all: the outline is written to story_jobs.outline as a
-- resume checkpoint and nothing prunes that table, so the plan for every story
-- ever generated is already sitting there. Copying it onto the story makes it
-- durable -- shared/schema.ts calls story_jobs "prunable operational state",
-- and a user-facing feature reading from a table whose own schema invites
-- deletion breaks silently the day someone accepts that invitation.
--
-- Done once here rather than as a read-time fallback because story_jobs is
-- indexed on user_id, status and (status, lease_expires_at) but NOT on
-- story_id: a fallback would sequentially scan the jobs table on every
-- continuation of an older story, forever.

UPDATE user_stories us
   SET story_data = jsonb_set(us.story_data, '{outline}', j.outline)
  FROM (
         -- kind = 'story' is load-bearing. A SUMMARY job also has an `outline`
         -- column, and it holds the ids of the stories its window covered --
         -- a different fact wearing the same column name. Writing those onto a
         -- story would render a "chapter plan" that is a list of uuids.
         --
         -- DISTINCT ON because a story can be preceded by more than one job
         -- row: a retryable failure re-queues, and story_too_short clears the
         -- outline and draws again. The newest succeeded job is the one whose
         -- plan the saved story was actually written from.
         SELECT DISTINCT ON (story_id) story_id, outline
           FROM story_jobs
          WHERE kind = 'story'
            AND status = 'succeeded'
            AND story_id IS NOT NULL
            AND outline IS NOT NULL
          ORDER BY story_id, updated_at DESC
       ) j
 WHERE j.story_id = us.story_id
   AND us.story_data ? 'story'            -- a well-formed saved story, not a stray row
   AND NOT (us.story_data ? 'outline');   -- idempotent: never overwrite one already there
