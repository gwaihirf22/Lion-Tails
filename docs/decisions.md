# Decisions and non-obvious constraints

Things in this codebase that look wrong, redundant or improvable, and are not.
Each entry exists because someone already made the tempting change, or nearly
did, and it broke something.

The corresponding code carries a short comment pointing here. **If you are about
to "tidy up" one of these, read the entry first.** Several of them cost a
production outage to learn.

---

## 1. `import pg from "pg"` — never `import { Pool } from "pg"`

`server/db.ts`, `server/index.ts`

`pg` is CommonJS. The production bundle is ESM built with
`esbuild --packages=external`, so `pg` is loaded as CJS at runtime and Node
cannot destructure named exports from it:

```
SyntaxError: Named export 'Pool' not found. The requested module 'pg' is a
CommonJS module, which may not support all module.exports as named exports.
```

Import the default and destructure at runtime; take the *type* via
`import type`, which erases at compile time.

**Why this is easy to get wrong:** the named import compiles cleanly and the
build passes. The failure appears only when Node instantiates the module — i.e.
in production, as a crash loop. A green build proves nothing here, which is why
CI now boots `dist/prod.js` for real (see §9).

The same trap applies to any CJS dependency reached from the bundled server
path. Everything else currently in that path was exercised on the old Replit
deployment, so it is known-good by accident rather than by verification.

---

## 2. Model authorisation happens at USE, not at SELECTION

`server/lib/modelPolicy.ts`

Validating `POST /api/settings/openai-model` is necessary but **not sufficient**.
Entitlement can change after a value is stored:

- the catalog tightens, or
- a user selects a premium model while holding their own API key, then calls
  `DELETE /api/settings/openai-key`.

Their stored preference would then bill the server owner. So the stored model is
treated as a *request*, never as a permission, and `resolveModel()` re-checks and
downgrades at generation time.

`modelPolicy.ts` is also the only place the model, provider base URL and API key
are decided. Before it there were nine hardcoded model names across four files
and three separate client factories — nine places for the policy to drift.
`grep process.env.OPENAI_API_KEY server/` should return nothing outside that
file. If it returns something, a bypass has been reintroduced.

**Deliberate inconsistency:** `server/lib/openai-vision.ts` keeps its own
stricter rule requiring the user's own key, with no fallback to the owner's.
Routing it through the shared policy would *create* an owner-billable path where
none existed. Only the model name comes from the shared catalog.

---

## 3. Reference data is seeded after the database is ready, not during route registration

`server/seed.ts`

Hero seeding used to be a fire-and-forget async IIFE inside `registerRoutes`,
with nothing awaiting database initialisation. It reliably lost that race:

1. `getAllHeroesOfFaith()` hit the `isDatabaseAvailable()` guard and returned an
   empty array **as a fallback**,
2. the seeder concluded the table was empty,
3. every `createHeroOfFaith()` hit the same guard and returned a discarded
   in-memory instance.

Fifteen writes to nowhere, on every boot. It appeared to work only because an
early boot won the race and populated the table; against a fresh database it
would have failed permanently and silently while `/api/heroes` kept serving the
in-memory copy — so the endpoint would have lied.

`seedReferenceData()` therefore awaits the exported `databaseReady` promise, and
**reads back after writing** rather than trusting its own writes. The whole
failure mode was a storage layer that silently accepts writes that go nowhere;
the seeder must not assume otherwise.

---

## 4. The story brief is built once and shared

`server/lib/storyBrief.ts`

`storyRequestSchema` declares 22 fields and the form collects them. The
generator destructured **four**. A chosen character, hero of faith, biblical
event, animal companion, learning focus and custom instructions were all
collected, validated, stored on the request — and discarded before any prompt
was built.

The abandoned `windsurf` branch fixed this by repeating a 14-field destructure
and a character lookup in each prompt function. That was rejected: two field
lists drift apart, which is the same failure this bug already was.

`buildStoryBrief()` is built once per request and threaded through every prompt
site. Adding a field to `storyRequestSchema` means touching one place.

`resolveStoryCharacter()` scopes the lookup to the requesting user via
`getAllCharacters(userId)`. `Character` carries no `userId` and
`getCharacterById()` takes only an id, so looking one up by id alone would let
any user generate a story starring **another user's character**. The branch
version did exactly that.

---

## 5. A reachable database is not a correct one

`server/db.ts`, `/api/health`

`verifyOrmSchema()` compares the live columns against Drizzle's own
`getTableColumns()` — so the expectation comes from `shared/schema.ts` and there
is no second list to drift. Every exported `pgTable` is checked, so a new table
is covered automatically.

This exists because three schema definitions once disagreed: `shared/schema.ts`,
hand-written SQL in a bootstrap script, and lazy `CREATE TABLE` statements
inside `db-storage.ts`. `users` was created with 6 of its 13 columns, and the
only symptom was a 500 on the first signup.

Do **not** replace this with a hardcoded list of expected columns. That would be
a fourth schema definition, and on this codebase's record it would drift too.

The last lazy `CREATE TABLE` was removed from `db-storage.ts` when
`generation_records` was added: `saveStory()` still carried a
`CREATE TABLE IF NOT EXISTS user_stories` declaring six columns where the real
table has eight. It could only fire on a database where migrations had not run,
and would then build a table this check correctly rejects.

**Two table counts that look like they disagree, and both are right.** CI asserts
11 tables scoped to `schemaname='public'`; the nightly `pg_dump` reports 12,
because it also includes Drizzle's `__drizzle_migrations` bookkeeping table in
its own schema. Neither number is wrong. Expect them to differ by one.

---

## 6. `/api/health` probes the database live, and returns 503 on failure

`server/routes.ts`

Two separate constraints:

**It returns 503, not 200-with-a-flag.** The container healthcheck is
`wget --spider`, which reads the status code and discards the body. An endpoint
that always returned 200 meant a container which had fallen back to in-memory
storage still reported healthy and still produced a green deploy — while quietly
losing every write on the next restart.

**It runs `SELECT 1` rather than reading `dbConnectionStatus`.** That flag is
only ever set to `"connected"` during startup, and the idle-client handler (§7)
sets it to `"error"` with nothing resetting it. Keying health off it would make
a single transient blip mark the container unhealthy *permanently* — including
after the pool had fully recovered.

The `DATABASE_URL`-unset early return must keep returning 200: CI's smoke test
depends on that branch.

---

## 7. `pool.on("error")` is load-bearing

`server/db.ts`

node-postgres emits `error` on the pool when an **idle** client's backend
connection fails — the ordinary case being the Postgres container restarting
underneath a running app. With no listener, Node treats it as an uncaught
exception and kills the process. Under `restart: unless-stopped` that converts a
brief database blip into a restart loop.

---

## 8. The `@replit/` Vite plugin is load-bearing

`vite.config.ts`

`@replit/vite-plugin-shadcn-theme-json` looks like leftover Replit cruft. It is
not. `client/src/index.css` defines **no** `:root` custom properties — this
plugin generates every shadcn CSS variable from `theme.json` at build time.
Removing it silently breaks all theming.

The other two Replit plugins were dev-only and have been removed. This one stays
until the generated variables are frozen into `index.css`.

---

## 9. Dockerfile: `--omit=dev` is only safe because of the entrypoint split

`Dockerfile`, `server/prod.ts`, `server/dev.ts`

The runtime image installs production dependencies only. That is safe **solely**
because `server/prod.ts` never imports `server/vite.ts`. esbuild bundles with
`--packages=external`, so anything reachable from the entry module must exist in
`node_modules` at runtime; a single Vite import would drag the entire
devDependency tree in and crash at startup.

CI enforces this by grepping `dist/prod.js`, and then by booting it.

`WORKDIR` must stay `/app`: generated story images are written to
`process.cwd()/public/images/stories` and served from `process.cwd()/public`.
The compose volume mount depends on that path.

---

## 10. Service names on a shared Docker network

`docker-compose.yml`

A compose *service name* becomes a DNS alias on every network its container
joins. `paulproxy` is shared with other applications, and naming this project's
database service `postgres` collided with a neighbouring app's alias. Docker
round-robins between colliding aliases, so roughly half of **the other
application's** new connections were reaching this database.

The database is therefore named `lion-tails-db` and lives on a private
`lion-tails-internal` network rather than on the shared one. Never give a
container on a shared network a generic service name — `postgres`, `redis`,
`db`, `cache`, `api`.

---

## 11. `GET /api/settings/models` exists so there is one model catalog

`server/lib/modelPolicy.ts`, `server/routes.ts`

`client/src/pages/Settings.tsx` renders this endpoint's response, grouped by
tier, with unavailable models shown but disabled so it is clear what supplying
your own key would unlock. It holds no model ids of its own — not even a default
for the initial state, which belongs to `MODEL_CATALOG`.

It previously carried two hardcoded lists totalling six options, four of which
the server rejected with a 403, and omitted the free local tier entirely.

The endpoint returns exactly the models a given user may select, with tier and
warning text. **Extend `MODEL_CATALOG`; do not add a seventh list.**

---

## 12. Unused is not the same as unnecessary

`server/lib/requireAuth.ts`

`requireAuth`, `requireAdmin` and `requireVerified` were once deleted as dead
code. The verification was correct — they had zero references. The conclusion
was wrong.

They were unwired, not unwanted. The evidence pointing the other way was already
present: 29 copy-pasted inline `if (!req.user || !req.isAuthenticated())` checks
across roughly 55 handlers. Eight write routes had been missed entirely and were
reachable anonymously on the public internet, including
`DELETE /api/heroes/:id`.

Duplication is usually evidence that an abstraction is **missing**, not that one
is unwanted. This codebase has produced the same lesson repeatedly — four schema
definitions, six model lists, four prompt sites, 29 auth checks. When an audit
finds an unused helper whose job is visibly being done by hand elsewhere, the
finding is "wire it up", not "delete it".

Auth guards are applied per-route in the signature rather than via `app.use()`,
so a missing one is visible where the routes are listed together, instead of
depending on CI to catch it.

---

## 13. Token budgets are sized for reasoning plus output

`server/lib/openai-implementation.ts`

`max_tokens` was 2048 at three of four story call sites and 4096 at the fourth.
Every 2048 site failed and the 4096 site worked, across two different models.

The cause is that **`gpt-oss:20b` is a thinking model**: its internal reasoning
is billed to `completion_tokens` and counts against `max_tokens`. At 2048 it
reasoned for the entire budget and emitted zero visible content —
`finish_reason: "length"`, 2048 completion tokens, an empty string — so
`JSON.parse("")` threw `Unexpected end of JSON input`. The model was not bad at
JSON. It never reached the JSON.

Measured, not guessed: one outline for a *short* story consumed 8192 tokens and
only succeeded on a retry at 16384. Reasoning overhead routinely exceeds the
visible output.

Three consequences worth keeping:

- **`finish_reason` distinguishes a resource problem from a capability one**, so
  reading it turns a cryptic `SyntaxError` into an accurate message. But it is
  **not always populated**: a reply cut off mid-array arrived with
  `finish_reason: null` and zeroed usage counters. Treating that as "not
  truncated" sent a resource problem down the capability path and retried it at
  the *same* budget, which cannot work — it succeeded only on the variance of a
  second draw. So `"stop"` is the only value that confirms completion; anything
  else escalates the budget on retry. Require positive evidence that the model
  finished, not positive evidence that it did not.
- **The context window is shared between prompt and output.** Doubling the output
  budget past what the prompt left free achieves nothing, so the retry clamps to
  measured headroom (`usage.prompt_tokens`) and stops rather than spending an
  identical call. `MODEL_CONTEXT_LIMIT` must match Ollama's
  `OLLAMA_CONTEXT_LENGTH`.
- **Reasoning length varies enormously run to run.** The same model, same
  prompt and same budget has produced 754 completion tokens and `stop` on one
  attempt and 8192 with `finish_reason: "length"` and *zero content* on the
  next. The retry is therefore load-bearing for `gpt-oss:20b`, not a rare
  safety net — several successful generations depend on the second attempt.
- **`usage.prompt_tokens` is not always the prompt.** Ollama has reported 253
  then 5037 for an identical prompt, apparently slot state on a reused slot. The
  clamp takes the smallest value observed across attempts, since the prompt
  string cannot grow between them; trusting the latest reading would understate
  headroom and suppress a retry that had room.
- **An underspecified prompt makes reasoning unbounded.** The same model at the
  same budget used 768 tokens with the real structured prompt and the entire cap
  with a stripped-down one. Pinning down the expected output is not only a
  quality measure; it is what stops a thinking model reasoning until it dies.

## 14. The Ollama container's limits are reserved for Plex, not defaults

Host configuration, `ollama` container

`OLLAMA_KEEP_ALIVE=5h` and `OLLAMA_MAX_LOADED_MODELS=1` are annotated in the
Unraid template as being set "so Plex keeps VRAM for NVENC". They look like
conservative defaults worth tuning. They are a deliberate reservation of a
shared GPU, and raising either takes VRAM from video transcoding.

**`OLLAMA_CONTEXT_LENGTH` is 16384 and raising it is not safe on this hardware.**
It was briefly set to 32768 after measuring that the extra KV cache cost no VRAM
at all. The host then produced six of these in 31 minutes:

    CUDA error: an illegal memory access was encountered
    slot: n_ctx_slot = 32768, task.n_tokens = 306

They struck prompts as small as 306 tokens, so the 32k slot allocation itself
was the trigger rather than any large input. Reverted to 16384, after which they
stopped. The GPU showed no retired pages or ECC errors and Plex was unaffected
throughout, but the app returned HTTP 500s while it lasted.

`MODEL_CONTEXT_LIMIT` in this app must be kept in step with it (§13). The two
were genuinely out of step during the revert, which is why the effective limit
is now logged once at startup.

## 15. A 200 is not a success

`server/lib/openai-implementation.ts`

Story length is part of the request, so a story far below the requested word
count is a failed request rather than a short one. The same model, prompt and
code produced 4294 words against a 2500 target on one run and 794 on the next —
both HTTP 200. "Long" meant anything from a third to nearly double what was
asked for, and nothing anywhere noticed.

Two causes, both fixed, and both worth recognising by shape:

- **Structurally valid, semantically wrong.** The outline validator checked that
  the reply was an array of strings. A model returned ONE element containing
  every chapter joined by `\n\n` — valid JSON, correct shape, and it made the
  chapter loop run once. The count was the thing that mattered. This is the same
  family as a reply with the wrong keys (§13), one level up: the check tested
  the form and not the meaning.
- **The same quantity derived twice.** `generateStoryOutline` asked for
  `ceil(words/500)` parts while `generateStoryChapter` sized each chapter as
  `words / max(3, ceil(words/500))`. For a 1000-word story that meant asking for
  2 chapters of 333 words: a structural 33% undershoot before the model was
  involved. `getChapterCount()` is now the single source, and the per-chapter
  target derives from the outline actually returned.

Enforcement is asymmetric on purpose. An overlong story still contains what was
asked for and is usable, so it is recorded and returned; a short one is missing
content the user requested, so below `MINIMUM_LENGTH_RATIO` (0.6) it fails.

### Open hypothesis: models anchor to different ends of the band

**Not verified. One generation of evidence. Do not act on this without more.**

The chapter instruction names a target with a floor and a ceiling either side
(±15%). On the identical prompt, target 333, band 283-383:

    gpt-oss:20b   342, 424, 397   -> 1163 words (116% of target)
    nemotron-4b   290, 291, 221   ->  802 words ( 80% of target)

gpt-oss clusters at and above the target, pushing through the ceiling.
nemotron clusters seven and eight words above the **floor**. Both are obeying
the same instruction; they are anchoring to different numbers in it. That is
why the band moved gpt-oss's short story from 89% to 115% and moved nemotron's
by six words across three runs.

If this holds, stating a floor gives a weak model something to satisfy minimally,
and the floor ends up doing more work than the target. The cheap test is to
narrow the floor toward the target — say ±5% rather than ±15% — and see whether
nemotron's chapters follow it up while gpt-oss's stay put.

It has not been run. A single generation from a model with this much variance is
exactly the evidence you should not tune a prompt against, so this is recorded
as a hypothesis rather than a finding, and stage 2's telemetry is the right place
to settle it.

Separately, nemotron's **final** chapter came in at 221 against a 283 floor while
the other two cleared it — a model shortening the last chapter to wrap up. That
alone is most of the shortfall: at 290 the story would have been 871, not 802.

**Record per-chapter word counts, not just the story total.** The total said
"nemotron short is 81%" three times and nothing more. The per-chapter numbers
separated "the model is weak" from "the model is anchoring low" from "the last
chapter is short" in one look, and those have different fixes. The signal was in
debugData for all three runs; nobody looked below the total — which is the same
mistake as reading the status column and not the word count.

**The wider point.** These cells were reported green because green meant "HTTP
200 with a story", which is the exact standard this codebase already rejects for
canned error stories. Word counts were printed beside the status the whole time
and read as information rather than as a result. A check is only a check if
something acts on it.

## Recurring failure shape

Most incidents here have had the same form: **a check that reported success
without having verified the thing that mattered.**

- `tsc` aborted on a config error before reading a single file, and reported one
  error — so the typecheck had never run at all.
- A `sed` reported a plausible count while silently missing four multi-line
  call sites.
- A green `npm run build` over a bundle that could not start.
- `CREATE TABLE IF NOT EXISTS` printing `Table 'users' verified.` against a
  table with half its columns missing.
- `/api/heroes` serving 15 heroes from memory while the table stayed empty.

When a check passes, ask what it would have done had the thing been broken. If
the answer is "the same", it is not a check.

### The mirror image: a test that fails plausibly

The opposite error is rarer and more dangerous. A test that cannot fail hides a
broken system; **a test that fails plausibly makes you break a working one.**

A unit test of three newly-added validators reported 2 of 10 failing, both
"correct shape rejected" — which, if believed, meant every story failing after
two wasted API calls. The validators were correct. The *test* mapped them to the
wrong call sites, because they appear in the file in a different order than
assumed, and it reported the mismatch as a code fault.

It was one step from ripping out working code on the authority of a broken test.
What caught it was printing what the extraction had actually captured rather
than trusting the labels attached to it — the same move as reading
`finish_reason` instead of inferring truncation from a parse error.

So: when a check fails, confirm it is measuring what you think it is measuring
before acting on it. A plausible result is not evidence that the measurement was
sound.

### And the third: a plausible number, correctly derived, still wrong

Raising Ollama's context from 16384 to 32768 was estimated to cost about
+384 MiB of VRAM, reasoned correctly from the model's reported KV cache size.
The GPU is shared with Plex transcoding and had roughly 1 GiB free, so that
estimate turned a configuration change into a judgement call about someone
else's headroom.

Measured instead — by loading the model at `num_ctx=32768` through Ollama's
native API, which needs no restart and commits to nothing:

    ctx=32768   size_vram=8780 MiB   free=1041 MiB
    ctx=16384   size_vram=9168 MiB   free=1031 MiB

Free VRAM was **identical**. The estimate was not sloppy; it was derived
correctly from a real number and was still wrong, because the quantity it
reasoned about was not the one that determines the outcome.

The generalisation: an estimate that is cheap to replace with a measurement
should be. This one cost one API call and removed the need to weigh a risk at
all.

**And then the same shape again, one level up.** That measurement was correct
and the change was still wrong. VRAM was free at 32768, and the context was
reverted days later because the driver and this llama.cpp build produce illegal
memory accesses at that slot size on this card (§14). "Does it fit" had been
measured twice, carefully. "Is it stable" was never asked.

### And the fourth: independent checks that agree because they share a mistake

A backup was reported healthy, then nearly reported broken, on three separate
findings: the newest dump was dated yesterday, there was no `.cron` file in the
scripts directory, and `crontab -l` showed nothing. Each was a real observation.
All three were wrong in the same direction — the nightly run had not yet
happened that day, the cron file lives at the user.scripts plugin root rather
than under `scripts/`, and user.scripts installs into `/etc/cron.d/root` rather
than a user crontab.

Agreement between independent checks is the usual defence against one bad check.
Here it was what made the wrong conclusion persuasive: three confirmations is
normally where you stop looking. What settled it was not a fourth check of the
same kind but the artefact recording what had actually happened — a log line
with a timestamp, filename and table count:

    [2026-09-05 03:15:01] OK: liontails-2026-09-05_0315.sql.gz (28K, 11 tables)

When several checks agree, ask what assumption they share. These three shared a
belief about where things live, and were each wrong for that one reason.

Worth recording that two agents made opposite errors about the same backup
within an hour — one asserting no backup existed, from a stale memory of their
own unfinished work; the other nearly asserting a working one was broken.
Neither had looked at the artefact.

---

So the sequence went: a plausible number derived from the wrong quantity,
corrected by measuring the right quantity — and the measurement was still of the
wrong *question*. The binding constraint was the one nobody had thought of, and
no amount of rigour applied to the constraints you have thought of will surface
it. The only defence is to change one thing at a time and watch what breaks,
which is what caught this: the faults were traceable to a single config change
made 31 minutes earlier.

### Known open instance: mistyped API paths return 200 and HTML

A POST to an `/api/` path that does not exist — `/api/login` rather than
`/api/auth/login`, say — falls through to the SPA catch-all in
`server/static.ts` and returns **HTTP 200 with index.html**. A client reads that
as success and only discovers otherwise several requests later, when something
downstream 401s.

This was found by a benchmark harness that "successfully registered" a user
against a route that has never existed. Unfixed at the time of writing; the
remedy is for unmatched `/api/*` requests to 404 as JSON before the SPA
fallback is reached.
