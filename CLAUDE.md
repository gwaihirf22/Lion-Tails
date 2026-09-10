# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Read `docs/decisions.md` before changing anything that looks redundant or
improvable.** This codebase encodes a lot of hard-won rationale in comments;
several "obvious cleanups" here have caused production outages.

`docs/roadmap.md` lists what is outstanding and why, including the
known-but-unfixed items — check it before reporting something as a new find.

## Project Overview

Lion Tails generates personalised Christian bedtime stories for children, with a
song/chord library, "Heroes of Faith" content, character management and image
analysis. It is an Express 4 + TypeScript (ESM) server that also serves a React
18 / Vite SPA — one process, one port.

Deployed as a Docker container on an Unraid server, behind SWAG at
`liontails.paul-blake.com`.

## Development Commands

```bash
npm ci                 # install
npm run dev            # dev server, Vite middleware + HMR (server/dev.ts)
npm run build          # client -> dist/public, server -> dist/prod.js
npm start              # run the production build
npm run check          # typecheck
npm run db:generate    # generate a migration from shared/schema.ts (needs drizzle-kit)
npm run db:migrate     # apply pending migrations
```

```bash
npm test               # vitest, no network, no database
npm run lint           # React Rules of Hooks only
npx tsx scripts/verify-heroes.ts [name]   # hero facts vs Wikipedia/Wikidata/bible-api. NEEDS NETWORK
```

Tests cover **pure functions only** — the story parser, per-model request shape
and entitlement, and the hero data. There is no component, route or database
test, and no headless browser here. `verify-heroes.ts` is deliberately not in
CI: it depends on two free APIs that throttle, and a gate that fails for
reasons unrelated to the change is a gate people learn to ignore.

## The dev server

```bash
./scripts/dev-stack.sh up       # database + migrations + app + a usable account
./scripts/dev-stack.sh status
./scripts/dev-stack.sh down     # stop; data is kept
./scripts/dev-stack.sh reset    # throw the world away
```

Serves on **http://192.168.1.9:5250**, account `blake` / `LionTails-Dev-6a0cff`.

**It is a throwaway database, and it persists.** Those are not in tension: the
data is disposable, but it survives a stop and a host reboot, because a dev box
that forgets your account and your characters every morning is one you stop
using. A named volume (`lion-tails-dev-db-data`), `--restart unless-stopped`,
and no `--rm`. Verified by restarting the container: 18 stories and 2 populated
universes still there.

It is deliberately NOT production's database. This is where schema changes and
the story pipeline get tried, so a half-finished migration must not touch real
stories, and generation must not write real rows.

### The OpenAI key

`up` borrows it from the **running production container** over ssh and puts it in
the dev server's environment. Nothing is stored at rest — there is no `.env` to
leak, commit, or forget to rotate — and it is gone when the process stops.

`up` says which mode it is in:

```
openai:   key loaded from production (164 chars, not stored)
openai:   NO KEY -- local models only.
```

Without it the app still runs and the Ollama models still work, **but an account
whose stored model is an OpenAI one gets `503 no_model_available`** rather than a
story. That is the failure to expect if ssh to the host is unavailable. Export
`OPENAI_API_KEY` yourself and `up` will use that instead of reaching for
production's.

Model choice matters for judging output: `gpt-oss:20b` and the economy OpenAI
models behave measurably differently on continuity — see `docs/decisions.md` §24.
Do not tune a prompt against the local model.

## Architecture

```
client/        React SPA (Wouter, TanStack Query, Tailwind + Radix/shadcn)
  src/components/reader/  the /story e-reader; reader.css is PLAIN CSS on purpose
  src/lib/storyContent.ts purpose-built story parser — no markdown dependency
  src/theme.css           the four palettes mapped onto the shadcn tokens
server/        Express API + SPA serving
  index.ts     createApp() / startServer() — shared setup
  dev.ts       dev entrypoint: imports Vite
  prod.ts      prod entrypoint: MUST NOT import Vite (see below)
  static.ts    Vite-free static serving
  db.ts        pool, drizzle client, schema verification
  seed.ts      reference data, upserted on every boot
  routes.ts    the bulk of the API
  storage.ts   in-memory storage + IStorage interface
  db-storage.ts Postgres implementation
  lib/         modelPolicy, storyBrief, requireAuth, openai*, songGenerator
  data/heroes/ 80 hand-written profiles, one file per era
  data/biblicalEvents.ts  scripture anchors for story generation (NOT the same
               job as data/heroes/bible.ts — one anchors a retelling, the other
               describes a person; overlapping figures are deliberate)
shared/schema.ts  single source of truth for every table + Zod schemas
migrations/    generated SQL, applied at container start
tests/         vitest — pure functions only, no network, no database
scripts/verify-heroes.ts  hero facts vs Wikipedia/Wikidata/bible-api (network)
docs/decisions.md  non-obvious constraints — read this
```

### Two server entrypoints

`server/prod.ts` must **never** import `server/vite.ts`. The build uses
`esbuild --packages=external`, so anything reachable from the entry module must
exist in `node_modules` at runtime — and the runtime image installs production
dependencies only. A Vite import would drag in the whole devDependency tree and
crash at startup. CI greps `dist/prod.js` and then boots it.

### Storage has an in-memory fallback

If the database is unavailable the app still starts and serves, using
`MemStorage`. This is deliberate, but it means **writes can silently go
nowhere**. Never infer from a successful API response that data was persisted —
check the table. `/api/health` reports the real storage mode and returns 503
when a configured database is unreachable or its schema has drifted.

## Database

`shared/schema.ts` is the single source of truth for every table, including
`session` (owned by connect-pg-simple, which runs with
`createTableIfMissing: false`).

To change the schema: edit that file, run `npm run db:generate`, commit the SQL
under `migrations/`. `scripts/migrate.js` applies migrations at container start
using drizzle-orm's migrator — **drizzle-kit is a devDependency and is not in
the runtime image**, so generation is a development step and only application
happens at boot.

At startup `verifyOrmSchema()` checks every declared table against
`information_schema`, deriving the expectation from Drizzle's own
`getTableColumns()`. Do not replace that with a hardcoded column list.

## Authentication and authorisation

Passport local strategy (scrypt) with `express-session` and a Postgres-backed
store. There is **no JWT**: the bcrypt/JWT module that once lived at
`server/lib/auth.ts` was deleted, along with `jsonwebtoken`, `bcryptjs` and
`nodemailer`. `grep -r jsonwebtoken server/` returns nothing.

Guards live in `server/lib/requireAuth.ts` and are applied **per route in the
signature**, not via `app.use()`, so a missing guard is visible where the routes
are listed together. Writes to shared reference data (heroes, hero-stories,
songs) are admin-only; user content requires a session.

Admin status is `users.is_admin`. Never key authorisation off a username —
nothing reserves usernames, so a string comparison grants the privilege to
anyone who registers that name.

## Model selection

`server/lib/modelPolicy.ts` is the only place the model, provider base URL and
API key are decided. Tiers: local (Ollama, free, anyone), economy
(`gpt-5.6-luna` default, anyone, owner's key), premium (`gpt-5.6-terra`,
`gpt-6-astra`, `gpt-image-2`, admins or users with their own key).

**Request shape is per-model and lives in the catalogue, not at the call site.**
The GPT-5.6 generation rejects `max_tokens` (wants `max_completion_tokens`)
and rejects any `temperature` at all, including the default sent explicitly.
Use `tokenLimitFor(model, n)` and `temperatureFor(model, t)` and spread the
result; there are nine call sites. `gpt-5.6-luna` is the economy default, so
getting this wrong breaks generation for every user without their own key.

`dall-e-3` was **shut down** on 2026-05-12 and is gone from the catalogue. Do
not add it back.

Authorisation is resolved at **use**, not at selection. `grep
process.env.OPENAI_API_KEY server/` should return nothing outside
`modelPolicy.ts`.

Extend `MODEL_CATALOG` rather than adding another hardcoded model list — there
are already six, and the settings UI still uses its own.

## Environment

See `.env.example`. **`SESSION_SECRET` is the only secret required in
production** — `requiredSecret()` throws without it. `JWT_SECRET` was removed
with the JWT module and is no longer read anywhere; the bundle boots without it.

`EMAIL_*` is unused: no code path sends mail. Password reset generates a valid
token and then discards it (`server/auth.ts:185`, `// TODO: Send password reset
email`), so the endpoints answer 200 and look functional while the delivery half
does not exist. The token is returned in the response body only when
`NODE_ENV=development`.

## Story continuity

A story can belong to a series. After a series story, a background job extracts
what a LATER story must not contradict into `story_universes.world_state` and
refreshes the summary in the same call. `server/lib/worldState.ts` is pure and
holds the merge rules.

Three things here are load-bearing and easy to undo by tidying:

- **The three kinds are graded on purpose** — characters are identity ("none of
  them has to appear"), facts are hard, threads are explicitly OPTIONAL. Flatten
  them into one list and the next story becomes a sequel-by-checklist. This is
  measurably model-dependent; see `docs/decisions.md` §24.
- **Entries are revised, not only appended.** A closed entry is kept, not
  deleted, so a later extraction does not re-propose a thread already tied off.
- **`mergeWorldState` is total.** It consumes model output; a bad row is dropped,
  never thrown, because the alternative is losing a story's continuity inside a
  background job nobody is watching.

The extraction runs only when a sequel is plausible — the user opted in, or the
story continues another. It charges no quota, and is excluded from the user's
concurrency limit: background work must not refuse the story they are writing.

## Characters

`characterIds` is the field, capped at `MAX_STORY_CHARACTERS` (8), ordered, index
0 is the protagonist. `characterId` is LEGACY: read it only through
`characterIdsOf()`, the single place that knows the two are the same fact. A test
asserts the legacy name appears nowhere else in `server/`, `client/src` or
`shared/`.

A character may be a person, an animal, a dragon or a robot. **`kind` is the
noun the story uses, and `gender` is LEGACY** — read them only through
`characterKind()`, which is `characterIdsOf()`'s counterpart and the one place
that knows they are the same fact. `category` never reaches a prompt: it chooses
the form's vocabulary and the covering noun (`coveringNoun()` → hair, fur,
feathers, scales, plating), so the story sees only `kind` and a girl renders "a
girl" rather than "a human". A row saved before any of this has no category and
falls through to "hair", which is what keeps the golden briefs identical.

**Nothing on a character is defaulted.** Every field is optional, and the form
starts empty except the name. Six defaults — brown hair, brown eyes, blue,
reading, kind, age 8 — used to reach every story.

Three fields carry text, with three different forces: `mustBeTrue` (Parent Mode
only) is identity, reprinted every chapter under "keep this consistent";
`notes` (anyone) is colour, "only where a scene naturally calls for it", and
must never reach `userInstructions`, which is a directive channel; and
`canonicalLook` renders **nowhere** — it is stored for the avatar work.

**Children select, parents type.** `shared/characterVocab.ts` is one list serving
both the form's options and the server's validation. `POST/PUT /api/characters`
refuse anything off-catalogue; `POST /api/characters/custom` and
`PUT /api/characters/:id/custom` carry `requireParentMode` and accept anything.
The strict path validates **the patch, not the merged character**, or a parent's
custom value would block a child's unrelated edit.

Before changing `storyBrief.ts`, know that `tests/fixtures/brief-golden.json`
holds 44 captured strings (11 cases × 4 projections) asserting the rendered
brief. The first six are the compatibility set and **must not move**: they are
what a 0/1-character request rendered before any of this. If a change is
deliberate, read the diff before regenerating — that diff is the prompt every
existing story would now be written from. There is no regeneration script, which
makes it easy to regenerate first and "verify" against your own output.

## A character in a real account

Attaching a character to a hero or a biblical event is an explicit choice, not
an inference. `characterRole` is the field; `useTimeTravel` is LEGACY and both
are read only through `characterRoleOf()` — the `characterIdsOf()` precedent.

- `"absent"` — a straight retelling. Nobody is written into the account. The
  default, because being wrong this way gives a plainer story, and being wrong
  the other way puts a child into Scripture.
- `"meets"` — they meet the figure and join in. Fun and a little silly in how
  they arrive and help; the real events still happen in order, with the right
  names and outcome. The story gets a short appended note saying the meeting
  was invented.

**The note is appended by the server, never asked of the model** — a disclaimer
the model writes is one it can forget, soften, or bury mid-story, and this one
has to be exactly right and always present.

This exists because the two used to contradict each other with nothing making
anyone choose. The historical tab force-sets `useTimeTravel: false`, and the
brief then wrote the character into the account regardless: a story about Caleb
came back with a child called Esther in the wilderness of Paran, and because her
name is itself a figure in Scripture it read as the app confusing two people. It
was not — the account was accurate throughout. `soloRetelling` is carried on the
brief as a fact rather than inferred, because the full brief and the per-chapter
prompt must agree and once did not.

## Avatars

`POST /api/characters/:id/avatar` generates a portrait with `gpt-image-2` and
stores two things on the character: `avatarUrl` and **`avatarPrompt`, the exact
string it was generated from**. Both are server-owned — omitted from all four
character write schemas, Parent Mode included, because the field ends up in
`<img src>` and a request-supplied URL is a tracking pixel on a child's page.

The stored prompt is the consistency mechanism. Image models do not reproduce a
character from scratch: describe the same girl twice and you get two girls. So
an illustration that has to show a character again is built on that literal
string, never on a fresh or "tidied" description — a different prompt is a
different child. `buildAvatarPrompt()` is pure and unit-tested for exactly what
it must NOT contain: personality, hobby, notes, mustBeTrue and every stat.
`canonicalLook` leads when set, which is what it was stored for.

**This is a new owner-billed path**, and it runs against `decisions.md` §16
("no automatic fallback to a paid model, because it spends his credits
unasked"). `MAX_FREE_AVATARS` = 8 is what makes it acceptable, so the cap is the
feature rather than a detail:

- **Lifetime generations, never live characters.** A cap on how many a user
  currently HAS is farmable — delete, regenerate, repeat, owner pays each time.
- **Reserved before the call, refunded if nothing was generated.** Charging on
  success (what storyWorker does for stories) leaves a window in which two
  requests both read the same count and both increment. The two failure modes
  are not symmetric: a crash costs a user one picture, the other way costs the
  owner an unbounded bill. `chargeAvatarGeneration` is one statement for the
  same reason, and refuses on a database error rather than allowing.
- `user_usage.avatar_count` never resets. The monthly reset sets `count` by
  name, so this survives for free — verified against a real Postgres.
- A free account reaches the premium model only via
  `resolveModel(..., { grantedByAllowance: true })`, which is true of a single
  already-counted request and is not a property of the user. Charge first, then
  pass the result of having charged.

**Two caps, and they are not the same question.** `MAX_FREE_AVATARS` (8)
counts generations for the lifetime of an ACCOUNT and is about money.
`avatarCapFor()` bounds how many pictures ONE CHARACTER keeps — five with your
own key or admin, **one without**, because eight generations spread over five
slots each would be gone after two characters. Deleting frees a slot and
refunds nothing, which is what stops delete-and-regenerate being free. The
client never computes the cap: `GET /api/settings/models` returns `avatarCap`
from the same helper the route enforces with, the way `canIllustrate` already
does, so the UI cannot disagree with the server.

Generating takes a `note` (a one-off steer, appended to the prompt for that
picture) and `remember` (folds it into `canonicalLook` so later pictures keep
it). The note is appended by `generateAvatar`, never inside
`buildAvatarPrompt`, so that function stays pure and its tests keep meaning
what they say. Over the 300-character limit the note is refused rather than
truncated.

**Generation already survives the tab closing.** Express does not abort a
handler when the socket does, so the OpenAI call and the write both finish —
verified by hanging up a client mid-generation and watching the picture land.
What used to be missing was the UI finding out: `Characters.tsx` holds the
edited character's **id** and looks the row up from the query, so a refetch
reaches the open card instead of a snapshot taken when it was opened.

Files go to `public/images/stories/avatars`. That looks like the wrong
directory and is the right path: the parent is the mount point of the
`story_images` volume, so anything written there survives a redeploy and
anything written beside it does not.

## Attributes and Skills

The tab is **Attributes/Skills**. The five fixed values are attributes; skills
are named and user-added — "good at climbing" tells a story something a number
cannot, and costs one clause. That is deliberately instead of more built-in
attributes: the block works because an outlier is a SIGNAL, and a dozen columns
would bury the two that matter in a wall of baselines (and at eight characters,
cost ~96 numbers of prompt for background colour).

**The stored key is still `stats`, and that is on purpose.** It lives inside the
`character_data` jsonb, and `characterSchema` is a `z.object`, which strips
unknown keys — renaming it without a data migration would silently drop every
existing character's numbers on their next save. `story_jobs.brief` carries it
too, frozen at enqueue. This was a vocabulary change; paying a migration to make
an identifier match a label is the wrong trade. (`AdminStats`,
`/api/admin/generation-stats` and the usage stats in Settings are a different
feature — do not sweep them in.)

**Skills spend from the same pool.** A new one is added at `STAT_BASE + 1`, so
having it costs exactly one point by the arithmetic `pointsSpent` already does —
no special case anywhere, and `pointsAvailable`, `statsAreAffordable`, the
notable thresholds and the suppression rule all kept working. Names come from
`optionsFor("skill")`; Parent Mode's `/custom` routes take anything, as they do
for every other field. Duplicates and the count are refused server-side.

Two things had to move together in `renderAbilities()`: skills render as prose
under the table (they are named, so they cannot be columns), and the `touched`
predicate had to widen — keyed on attribute deviation alone, a character
ordinary at all five but good at climbing was suppressed entirely.

**Never build a regex from a skill name.** They are user text; compiling one is
an escaping bug and a denial of service at once. `skillLeakage()` is a plain
case-insensitive scan for the giveaway phrasing, and the attribute pattern in
`LEAK_PATTERNS` is built FROM `CHARACTER_STATS` so adding one cannot leave the
detector checking four of five.

## The character sheet's tabs and badges

Two badges say there is something waiting, because nobody opens a tab to find
out whether it has anything in it:

- **Stats** (renamed from "Statistics", which read as a record of things done —
  that is what Virtues is): `pointsAvailable()` above zero, and only when the
  sheet is switched on. That helper already existed and `CharacterForm` was
  re-deriving it inline; it now takes an optional live sheet, so the form and
  the card ask one function.
- **Virtues**: `unseenVirtues()`. `seenVirtues` is **server-owned** — omitted
  from all three write schemas, and `PUT /api/characters/:id/virtues/seen`
  computes the list from the row rather than the body. A client that could
  write it could silence its own badge, and virtues derive from `adventures`,
  which the client cannot write either. Both compare on the lowercased, trimmed
  key `virtueLevels()` builds, or "Courage" would sit unseen against a stored
  "courage" for ever.

A character with no `seenVirtues` shows a badge once. That is deliberate: those
virtues genuinely have not been looked at, and pretending otherwise is worse
than one badge.

**`--tab-*` is twenty-four hand-written values and that is on purpose.** The
compact version — a hue per tab plus a saturation/lightness knob per palette —
cannot be composed in CSS in a form `tests/theme.test.ts` can read: it parses
bare `H S% L%` triplets and nothing else, so `hsl(var(--h) var(--s) var(--l))`
would be invisible to every assertion in the file and an unreadable tab in
Night would ship green. The hue stays constant across palettes so a tab keeps
its colour when the theme changes; only saturation and lightness move. Class
names are written out in full, never interpolated — see `ci.yml` on the colour
picker that did nothing for months.

`--action` is the blue reroll button. It was `bg-blue-600`, which failed the
CI hardcoded-colour gate and would have been the brightest thing on the page in
Night.

## Heroes of Faith data

Eighty hand-written profiles in `server/data/heroes/`, one file per era, two
collections (`historical` 41, `biblical` 39). `index.ts` assembles them and
throws at import on a duplicate slug or a group from the wrong collection's
list — loudly, at boot, rather than silently dropping a person from the seed.

Rules that are easy to break without noticing:

- **Ids are slugs and are the upsert key.** They were `uuidv4()` at module
  load, so identity changed every process start and the seed could only ever
  run on an empty table.
- **`wikipedia` holds an article TITLE, not a URL**, because the name alone is
  ambiguous and disambiguation should be chosen here rather than guessed at
  fetch time.
- **Biblical key events carry `reference`, never `year`.**
- **Biblical life dates carry `c.` or `fl.`**, or are omitted entirely.
  `tests/heroes.test.ts` enforces this, with a named exception list for the
  few dates fixed by evidence outside Scripture.
- Verses are **fetched from bible-api.com, never recalled.** A model reciting
  scripture produces text that reads correctly and is not.

## Conventions

- ESM throughout (`"type": "module"`). `require()` is not available in the
  production bundle; a stray one throws `ReferenceError` at runtime only.
- Never hardcode a text colour on something that moves between surfaces.
  `.nav-text` was `text-white` and shipped white-on-white in the active nav
  pill, the "More" menu and the whole mobile sheet. See docs/decisions.md 23.
- `--track` is the unfilled part of a progress bar: a surface, never a text
  colour, per palette. The stat bars painted the track with `--secondary` and
  the fill with `--primary` — two brand colours within a few points of the
  same lightness. `tests/theme.test.ts` now checks the fill separates from the
  track AND that the track is visible on the card, because a track that
  vanishes into the card passes the first check alone.
- A design token is a surface colour OR a text colour, not both. --secondary
  and --accent were each mapped one way and used the other, and both produced
  text that was invisible in some palettes and fine in the one being looked at.
  See docs/decisions.md 22.
- Prefer fixing a duplicated pattern over fixing its instances. This repo has
  repeatedly produced bugs from parallel definitions: four schema sources, six
  model lists, four prompt sites, 29 inline auth checks.
- When a check passes, ask what it would have done had the thing been broken.
  Several outages here came from checks that could not fail. The mirror image is
  just as dangerous: before acting on a check that *fails*, confirm it is
  measuring what you think it is. See `docs/decisions.md`.
- Model calls are not free and not instant. `max_tokens` must cover reasoning as
  well as output on a thinking model, and the context window is shared between
  prompt and output. See `docs/decisions.md` §13.

## Deployment

Push to `main` runs `.github/workflows/ci.yml` on a self-hosted Unraid
runner: typecheck, build, tests, lint, the theming and reader-CSS greps, two
smoke tests, then push to Docker Hub, SSH, `docker compose pull && up -d`, wait
for the healthcheck. There is no separate `deploy.yml` — the deploy is the last
job of this one workflow, so it cannot run unless every gate passed.

**A gate that hardcodes a number will break the deploy for an unrelated
reason.** The hero-count assertion was `-ne 15`, correct when written and wrong
the moment anyone added a hero; it now derives the expectation from
`server/data/heroes`. Assert the invariant, not the current value.

The compose file in this repo is a **reference copy**. The authoritative one is
at `/mnt/user/appdata/lion-tails/docker-compose.yml` on the server and CI
deliberately does not overwrite it — keep them in sync by hand.

Never give a container on the shared `paulproxy` network a generic service name.
See `docs/decisions.md` §10.
