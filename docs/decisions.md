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
`getCharacterById()` once took only an id, so looking one up by id alone would
let any user generate a story starring **another user's character**. The branch
version did exactly that.

**Since the character model widened, every storage method requires the owner
and scopes in the SQL**, so an id-only fetch no longer exists to be tempted by.
The three by-id routes had carried a commented-out ownership check —
*"in the future, we should check ownership"* — for as long as they had existed,
and that comment was accurate about why: `Character` had no `userId` to compare
against, so the check had nothing to say and was left as a note instead of a
guard. Putting the owner in the signature is what made it expressible. The
lesson is the general one: a check that cannot be written is not a check, and a
TODO beside it is a record of the gap, not a mitigation of it.

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

## 16. Every remedy we offer, we attempt -- or say why we must not

`server/lib/storyErrors.ts`, `server/lib/storyWorker.ts`

A failure message told the user "Try generating it again" while the worker
marked that same failure permanently failed. The advice was right; the worker
was right; the defect existed only in the relationship between the two files,
and a reviewer of either change alone would have approved it.

The rule is not "attempt your own advice" -- that would be wrong here. It is:
**for each remedy offered, either the system attempts it, or there is a stated
reason it must not.** Audited across every user-facing remedy:

| remedy | attempted? |
|---|---|
| "Try generating it again" | Yes -- `story_too_short` re-queues with a fresh draw |
| "Try a shorter story length" | No, and must not. Length is what the user asked for; silently shortening it delivers something other than the request |
| "switch to a stronger model" | No, and must not. Blake's explicit instruction: no automatic fallback to a paid model, because it spends his credits unasked |
| "ran out of room" | Yes -- the budget doubles and retries before the advice is ever shown |
| "Add your own API key" | Cannot be attempted |
| "wait until next month" | Cannot be attempted |

Two of those are must-nots that would be bugs if attempted. A blanket "do what
you advise" would have argued for both.

**A retry has to be able to produce a different answer.** `story_too_short` is
the only failure where every step *succeeded* and the assembled whole was
rejected, so there is no incomplete step for resume to redo -- resuming would
reassemble the identical story and fail identically, burning the error budget
for nothing. It therefore discards its checkpoint (`retryNeedsFreshDraw`), which
is the opposite of what the resume machinery is for, and makes it the most
expensive retry in the system. The other retryables are the reverse: the failing
step produced nothing, so resuming re-runs only that call.

---

## 17. `apiRequest` throws; `if (!response.ok)` after it is dead code

`client/src/lib/queryClient.ts`

`apiRequest` ends with `await throwIfResNotOk(res)`. It returns a `Response`, so
it looks like `fetch` — and every `fetch` idiom written against it is wrong. An
`if (!response.ok)` branch after it can never run.

This has been written four separate times. `Settings.handleModelChange` showed
"please try again" instead of the server's reason. The story-jobs provider had a
409 handler that could not fire, which would have discarded the in-flight job the
server sends specifically so the UI can point at it instead of showing a dead
end. **The guard is not merely redundant — it silently replaces the handling you
wrote with a thrown error.**

Use `apiRequestAllowingErrors` when the STATUS is meaningful: a 409 carrying the
conflicting record, a 404 that is a normal case rather than a failure. Both share
one `sendRequest` body and differ only in policy.

**Known remaining instances**, not fixed because they are harmless — the throw
surfaces the server's message, which is what those call sites wanted anyway — and
because rewriting them belongs in its own change: `SongSearch.tsx`,
`StoryDisplay.tsx`, `use-parent-mode.tsx`, `GenerateStory.tsx`,
`SavedStories.tsx`, `Settings.tsx`. Convert one the moment it needs to read a
status.

The general shape: a helper that returns the same type as the thing it wraps, but
with different semantics, invites every idiom from the original. The fix was to
document it at the definition and provide the variant, not to remember harder.

---

## 18. A Tailwind class built from a variable does not exist

`BookPage.tsx` composed its background class at runtime:

```ts
borderClass: `border-amber-800/60 ${getBgColorClass()}/95`,   // -> "bg-[#fff8e6]/95"
```

Tailwind's JIT scanner reads **source text**. It never executes the file, so a
class name that only exists after a template literal is evaluated is never
emitted. `grep 'bg-\[#fff8e6\]/95' dist/public/assets/*.css` returned **0**.

The colour picker therefore did nothing at all, for months, and this is the part
worth remembering: **it looked like it worked.** The eight swatch buttons kept
their own literal colour map, so each swatch painted itself the right colour.
Clicking one visibly selected it. Nothing threw, nothing logged, and `npm run
build` was perfectly happy. The only way to find it was to click a swatch and
notice the page had not changed — or to grep the built CSS, which nobody did.

Two rules follow:

1. **Never interpolate a Tailwind class name.** If a value comes from state or a
   database, drive it with a CSS custom property and an attribute selector
   (`[data-palette="night"] { --reader-bg: ... }`) — the class names stay
   literal and only the *values* vary. That is why `client/src/components/reader/reader.css`
   is plain CSS rather than utilities.
2. **A control and the thing it controls must read from one source.** The
   swatches disagreeing with the page was not a second bug; it was what hid the
   first. `.reader-swatch { background: var(--reader-bg) }` makes that
   disagreement impossible to express.

CI now greps the built stylesheet for the reader's rules
(`.github/workflows/ci.yml`, "Verify the reader's styles reached the CSS
bundle"). That gate was confirmed to **fail** when the reader stylesheet import
is removed — per the section below, a check that cannot fail is not a check.


---

## 19. A gate that asserts a value breaks; a gate that asserts an invariant holds

The CI database smoke test read:

```bash
if [ "$HEROES" -ne 15 ]; then
  echo "FAIL: reference data was not persisted to the database."
```

Fifteen was correct on the day it was written. It broke the deploy the moment
anyone added a hero — and it broke it in the most confusing way available,
because the step lives inside the job **named** "Typecheck and build", so the
failure was reported as a typecheck error. Typecheck was passing. Several
minutes went into a clean `npm ci` + `tsc` on `main`, which exited 0, before
looking at which *step* had actually failed.

The fix derives the expectation from the data:

```bash
EXPECTED_HEROES=$(npx tsx -e 'import { heroesOfFaithData } from "./server/data/heroes"; console.log(heroesOfFaithData.length)')
```

Note what was **not** done: bumping 15 to 41. That would have deferred the same
breakage to the next batch of heroes. The property worth asserting is *the
database holds what the seed defines*, and that survives every future addition.

Two generalisations:

1. **Before asserting a number, ask what makes it true.** If the answer is "it
   is what the code happens to do today", the assertion has a maintenance
   burden and no meaning. If it is "these two things must agree", assert the
   agreement.
2. **A job name is not a step name.** When CI reports a failure, read which step
   failed before believing the job's label. Ours cost time in exactly the
   direction the label pointed.

The empty-guard is still needed, and is still there: `EXPECTED_HEROES` is a
command substitution, and a failed `npx tsx` would make it empty, which `-ne`
would treat as 0 and pass against an empty table. It is checked for being empty
or less than 1 before use.

## 20. Facts in content get verified against sources, not recalled

Eighty hero profiles and sixteen scripture anchors are written from knowledge,
and knowledge is the thing this project has repeatedly caught being confidently
wrong. A generated Noah story invented "Noah's wife, Miriam" and "Shem, a young
man of twenty" — neither is in Genesis. A model recited scripture that read
correctly and was not.

So: **every verse is fetched from bible-api.com, and every date is checked
against Wikidata and Wikipedia** (`scripts/verify-heroes.ts`). This has caught
real errors that read perfectly well: Polycarp meeting Bishop Anicetus in
c. 154 when Anicetus was not bishop until c. 157; an invented c. 450 date for
Patrick's *Letter to Coroticus*; Jan Hus born c. 1372 rather than 1369; Adoniram
Judson credited with a dictionary he only half-finished before dying.

Three design rules the verifier arrived at the hard way, each after a false
report:

- **Two sources are required to convict.** Wikidata and Wikipedia genuinely
  disagree — Jim Elliot is born 1926 in one and 1927 in the other. A single
  dissenting source is a warning, not a failure.
- **A throttle is not a 404.** The first run reported fifteen missing articles
  including Martin Luther. They were all 429s: the fetch treated any non-OK
  response as "no such article". A check that reports failures it cannot
  distinguish is not a check — and it will be believed, because "Martin Luther
  has no Wikipedia article" is absurd enough to look like a code bug rather
  than a data one, which is where the time goes. The same bug recurred in the
  scripture-reference path with a weaker backoff than the article path, and
  produced a dozen "could not check" lines against references that were all
  fine.
- **A Wikipedia short description is not a life span.** "Pope of Alexandria
  from 328 to 373" is a term of office. Reading the first two four-digit
  numbers out of it made the verifier report Athanasius as born in 328 and
  Anselm in 1093. Life dates are now taken only from a parenthesised range.

**It is deliberately not in CI.** It depends on two free APIs that throttle;
running it on every PR would produce failures unrelated to the change, and a
gate that cries wolf is a gate people learn to skip. It is run by hand before
committing content, and `tests/heroes.test.ts` covers the structural half —
duplicate slugs, wrong-collection groups, a URL where an article title belongs
— with no network at all.

## 21. Biblical dates are estimates, and are written as estimates

Biblical figures are located in Scripture **by chapter and verse, not by year**.
Dating Abraham is an unsettled scholarly argument; "c. 2000 BC" printed flat on
a children's page states as fact something that is not one.

Life dates exist because a profile page with "Lived: ? - ?" on every single
biblical figure is worse than useless — but they carry `c.` or `fl.`, and the
page says underneath that they are estimates. `tests/heroes.test.ts` enforces
the prefix and carries a named exception list for the handful genuinely fixed
by evidence outside Scripture: Josiah died at Megiddo in 609 BC, the year the
Babylonian Chronicle independently dates Neco's march to Carchemish. Adding a
precise date means adding it to that list with the reason, which is the point —
the cost of asserting certainty should be having to write down what grounds it.

Adam, Eve and Noah have no dates at all. The page renders "Not datable" rather
than a range, because there is no scholarly estimate to give and inventing a
plausible-looking one is the exact failure this section exists to prevent.


---

## 22. One token cannot be both a surface and a text colour

`--accent` is shadcn's hover/highlight **surface**: every one of the twenty
`bg-accent` usages under `components/ui/` is a hover, focus or open state. It
was mapped here to a saturated brand colour — crimson in Paper, green in Sepia,
peach in Night — and `Footer` also used it as `hover:text-accent`, a link text
colour. One token, two jobs.

The measured result, for text that landed on an accent background without
switching to `--accent-foreground`:

| | ratio |
|---|---|
| Paper | 2.67 |
| Sepia | 1.84 |
| Night | **1.19** |
| Contrast | 2.10 |

1.19:1 is invisible. This is the **third** time this exact shape has bitten:
`--secondary` was mapped as a surface tint while the app used `text-secondary`
29 times as a text colour, which made headings disappear. When a token is used
both ways, both directions have to be checked, and it is usually better to stop
using it both ways.

`--popover` had a quieter version of the same problem: it was set to exactly
`--card` in all four palettes, so a dropdown opening over a card had a contrast
ratio of **1.00** against it — no separation whatsoever, only a faint border
and a shadow doing all the work.

`tests/theme.test.ts` now parses `theme.css` and checks every pair, in both
directions, in all four palettes.

### The grep that could not fire

The first guard for the pairing rule was a CI grep: lines containing
`bg-accent` and not containing `text-accent-foreground`. Reintroducing the bug
on purpose to check it — per the section below — it **did not fire**.

The offending line carried *two* accent backgrounds and one foreground:

```
focus:bg-accent data-[state=open]:bg-accent data-[state=open]:text-accent-foreground
```

The line contains `text-accent-foreground`, so the line-based exemption matched
and the check passed the exact bug it was written for. It is now a test that
scans **per variant prefix**, and the first thing that test asserts is that it
fires on that string.

Two more instances turned up the moment the check became precise. A weaker
check does not find a smaller number of problems — it finds a different set,
and lets you believe you looked.

The related trap in the same area: `bg-accent/50` is a translucent tint over
whatever is behind it, and pairing *that* with `text-accent-foreground` would
be actively wrong — white text on a half-strength tint over a white page is
invisible. So the pairing rule applies only to opaque backgrounds, and the
tint case is checked by compositing the colours and measuring instead.


---

## 23. A hardcoded colour is a guess about the background

`.nav-text` was `@apply text-white font-medium text-shadow-md`, and it was
applied to the nav links, the "More" trigger, the dropdown items, the username
and every item in the mobile sheet.

`text-white` is correct on exactly one of those. The active pill is a light
surface, the dropdown is a popover, and the mobile sheet is `bg-card` — all
three rendered **white text on near-white**. Hover appeared to "fix" it only
because hover added a dark colour. And in Night the bar itself is light, so
even the bar was wrong.

`text-shadow-md` is a 2px black shadow from when the header sat on a
photograph. On a flat bar it renders as a grey smudge around every glyph, and
on the active pill the shadow was the only thing still visible — the letters
themselves were white on white. A user reads that as "blurry", not as "wrong
colour", which is why it survived so long.

The rule: **a colour utility that names a literal is asserting what is behind
it.** Put the colour on the state that knows — the active pill inverts the bar,
so the active branch sets both halves — and let everything else take a token.

### The corollary: --header is not --primary

The bar was `bg-primary/80`. Two problems, one of which no amount of care
would have caught by eye:

- White on that blend measured **4.12:1 in Paper**, under AA. And because the
  bar was translucent, the number depended on whatever was scrolling behind
  it, so the contrast was not a fixed quantity that could be checked at all.
- Night's `--primary` is a **light** blue (75.7% lightness). A bar painted with
  it is the brightest thing on screen in the palette whose entire purpose is
  not being bright at bedtime.

`--header` / `--header-foreground` are their own tokens per palette. All four
clear AAA both ways round, because the active item inverts the bar and both
directions are real text. `tests/theme.test.ts` checks the pair, the hover
wash, and that Night's bar never becomes bright.

### And a dead override that was load-bearing anyway

`theme.css` carried this:

```css
header, footer { background: hsl(var(--card)); color: hsl(var(--foreground)); }
header :not(svg):not(path) { color: inherit; }
```

The first rule never applied. `header` is specificity 0,0,1 and
`.bg-primary\/80` is 0,1,0, so the class won and the bar stayed blue in every
palette — the rule had been dead since it was written.

The second rule was doing real work **by accident**. The settings and logout
buttons carry `text-foreground`, which is near-black; `color: inherit` was the
only thing stopping them from rendering near-black on a dark blue bar. Deleting
the "dead" block would have broken two buttons for a reason nothing in the
diff would explain.

Both are gone and every element in the header names its own token. Inheritance
that broad is how a dependency gets hidden: it makes an unrelated rule
load-bearing without saying so anywhere.


---

## 24. A world that remembers must be told which parts it may ignore

A story continuing another needs to know what is already true, or the villain's
name changes between episodes. But a model handed a list of facts treats it as a
checklist and writes the same story again. So the naive version of continuity
produces *either* inconsistency *or* a sequel-by-numbers, and the second is
harder to notice because it is a perfectly valid HTTP 200 story.

The fix is not more facts, it is **graded** facts. Three kinds, three renderings:

| kind | rendered as | force |
|---|---|---|
| `character` | "these are their names — but none of them has to appear" | identity |
| `fact` | "already true. Do not contradict any of this" | hard |
| `thread` | "you MAY pick ONE up, or ignore all of them" | explicitly optional |

**The third tier is the entire mechanism.** Everything else constrains; that one
says out loud that it does not, and that permission is what lets the next story
be different. It is measurable:

| | `gpt-oss:20b` | `gpt-5.6-luna` |
|---|---|---|
| open threads taken up | **all three** | the loaded one left alone |
| characters | forced in | used selectively |
| result | sequel-by-checklist | a new episode in the same world |

Both runs were the same universe, same threads, same unsteered request. **The
local model ignores the permission and the economy model honours it** — so this
prompt must not be tuned against the 20B, or it will be optimised for a model
production does not use. (A first comparison was run with a `customPrompt` that
steered the story away from the threads by itself; that was a confound and the
table above is from the re-run without it.)

### Why entries and not prose

Worlds change: someone falls ill, someone leaves. Prose can only be rewritten
wholesale, which costs a re-read of every story — the original summariser read up
to eight. Entries are superseded one at a time by the extraction that noticed the
change, so the world stays current for the price of reading the newest story, and
the summary it writes alongside them can never be stale.

`mergeWorldState` is deliberately total and forgiving because it consumes MODEL
output: an unknown id, a bad kind or an over-long line is dropped or truncated
rather than thrown. The alternative is losing a whole story's continuity to one
malformed row in a background job nobody is watching.

### The question the extraction asks

Not "summarise this story" but **"suppose someone writes the next story — what
must be noted so they do not contradict this one"**. Those produce different
output: the first gives a plot recap, the second gives the things it would be
wrong to change. On the economy model it recorded a lie as a world fact —
*"Mia told Counselor Ruth she had only stayed on the beach, though she had been
near the dock and had the key"* — which a plot summary would have flattened into
"Mia learned about honesty".

### When it runs, and why nothing gates it

Only when a sequel is plausible: the user ticked "I might write more", or the
story continues another. A one-off extracts nothing. It charges no quota
structurally — there is no `user_usage` write on the path — and it is excluded
from the user's concurrency limit, because that limit exists to stop one person
queueing five generations and an extraction is work they never asked for.
Counting it would let an invisible background job refuse the story they are
trying to write.

---

## 25. Children select, parents type — and that is two routes, not a flag

`server/routes.ts`, `shared/characterVocab.ts`

A character used to be a boy or a girl aged 5-12. Widening it to "anything"
raises a question the schema cannot answer: a seven-year-old should not be
typing free text into six boxes that reach an image model and a story prompt,
but the catalogue cannot anticipate everything a family wants either.

So the vocabulary is a list, and Parent Mode is the escape hatch. The list lives
in one file that is **both** the form's option source and the server's validator
— a second copy of "what may a dragon's scales be" is the four-schema-sources
failure in a new costume, and a form offering what the server refuses is the
same bug wearing a friendlier face.

**The permissive path is a separate route, not a flag on the strict one.**
`requireParentMode` is middleware: it reads the session, and it cannot look
inside a body to decide whether this particular request may be permissive.
Deciding that inside the handler is exactly the invisible-guard shape
`requireAuth.ts` was written against, and how eight unguarded write routes once
shipped. `PUT /api/universes/:id/summary` is the same arrangement for the same
reason.

### The patch is validated, not the merged character

The subtle one. A parent may have typed `kind: "space whale"`, which the
catalogue does not contain. Validating the merged document on the strict path
would then reject a **child's later edit to some unrelated field**, because the
merge still contains the custom value. The bug would appear only for families
who had used Parent Mode, and only on their next ordinary edit.

So the strict path checks only the keys present in the request, and
`customFields` records which values were typed so the form shows them as chosen
rather than blanking them for being off-list.

### Category is derived, never accepted

`category` picks which colour list a value is judged against. Taking it from the
request would let `{kind: "dragon", category: "human"}` be validated against the
human palette. The server derives it from `kind` on the strict path; on the
custom path a parent sets it, because an off-catalogue kind has none to derive.

---

## 26. The canon is small, split by audience, and the first story is a constant

`server/data/lionTails.ts`, `docs/quests-of-the-timekeeper.md`,
`server/data/questPrologue.ts`

The universe underneath the quests has an arc: a forgotten story, a Lion, an
ending. **None of that is given to the model.** A model told "the stories were
never separate" says so in chapter two, and §24 measured a model acting on
every optional thread it was handed — one Lion in the scene of every brief is
a lion in every story. So the Lion is a name Barnabas may say, once and
mysteriously, and never a creature in the scene. So there are two documents with two audiences: the data
module holds only what is TRUE and may show, phrased as fact and never as
something coming; the doc holds the movements, the planted mysteries, and a
table of what is withheld and until when. When a withheld thing becomes
showable it moves from one to the other. They are not two definitions of one
fact.

The model canon is composed, not written: one function assembles KEEPER,
DEVICE, SHOP, CANON and the frame, so the prompt cannot describe the man
twice in two ways. It is capped by a test on the RENDERED section — 750
words, about twice a hero's biography — because the constraint is attention,
not context: lore that outweighs the account gets written instead of it. The
original proposal's 2–5k tokens of permanent canon would fit an API model and
would still be the wrong trade; the layers that should grow are the
continuity layers, and those already exist.

### The world reaches every chapter, or it does not exist

The chapter projection carried no premise. Every story of a thousand words or
more is chapters, so the lantern's rules — and, worse, "stays on their
mission / does not die" — reached chapter 1 and no other. Both modes now have
a per-chapter anchor built from the same named sentences the full brief uses.
Two strings that must agree are one string.

### The first story is a constant, not a row

A story in every library, undeletable, identical for everyone, is exactly a
constant. A row per user needs a backfill migration, a hook in two storages,
an immutability column and three row mappers, and a reader can still end up
without it. `builtInStories.ts` splices the constant into the list route,
answers the id route, and refuses the mutating routes with a 403 that says
what the story is rather than "not found". Undeletable by construction: there
is no row to delete.

It is in second person because it is fixed text: no personalisation, no model
call, and the only story in the app one reader can quote to another.

---

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
