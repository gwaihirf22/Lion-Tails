# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Read `docs/decisions.md` before changing anything that looks redundant or
improvable.** This codebase encodes a lot of hard-won rationale in comments;
several "obvious cleanups" here have caused production outages.

`docs/roadmap.md` lists what is outstanding and why, including the
known-but-unfixed items — check it before reporting something as a new find.

## Project Overview

Lion Tails generates personalised Christian bedtime stories for children, with a
song/chord library, "Heroes of the Faith" content, character management and image
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

### Signing up is challenged, and the challenge is checked HERE

Blake: *"We need to update the captcha to something more than what I did with
Replit"* — *"It is just a question asking who the son of God is. Not a true
captcha."* It was less than that. The form asked the question, compared the
answer to `"jesus"` in the browser, and then **deleted the field before
sending** (`const { confirmPassword, challenge, ...registerData } = values`).
The server had never heard of it, so `curl` with three fields minted accounts —
and a new account carries 50 story credits and 8 portraits on the owner's key,
about **$1.40 a signup** and ~$0.20 a month after.

- **Cloudflare Turnstile, verified server-side** (`server/lib/turnstile.ts`),
  on `POST /api/auth/register` and `POST /api/auth/reset-password-request`.
  No library: `fetch` against siteverify, like `priceWatch.ts`. `req.ip` goes
  with it as `remoteip` — SWAG restores the real address and `trust proxy` is
  on. `TURNSTILE_SECRET` or `TURNSTILE_SECRET_FILE`, read on every use, one
  reader function: `adminKey()`'s convention exactly.
- **THE CHALLENGE RUNS AT SUBMIT, NOT ON PAGE LOAD.** `execution: "execute"`
  plus `appearance: "interaction-only"`, and `TurnstileGate` exposes one
  `execute()` through a ref; the token is no longer a form field at all.
  Two reasons, the second discovered from the dashboard:
  - **A token is single-use and lasts about five minutes**, which is less than
    filling a form with a child on your knee. Minted on load, a parent who
    stops halfway submitted an expired one and was told to tick a box again
    for no visible reason (`timeout-or-duplicate`).
  - **Cloudflare warned "siteverify isn't being called".** It was — the
    production log carries Cloudflare's own `invalid-input-response`, which
    only a completed siteverify call can produce, and an unreachable
    Cloudflare answers 503 rather than 400. What the warning measured was the
    RATIO: a token issued for every visit to `/auth`, and only a *submitted*
    one ever validated. Minting at submit fixes the ratio and the expiry
    together.
  - The cost is that a checkbox, where Cloudflare wants one, now appears
    AFTER the press: `before-interactive-callback` makes the form say so, and
    the button reads "Checking...". The silent wait is capped
    (`SILENT_WAIT_MS`) and **that timer is cancelled once a checkbox is
    shown** — from then on the wait is a person reading, and the challenge
    expiring on them has its own callback. Every failure path resolves to a
    sentence a parent can act on, never a button that sits there.
  - `execute()` **resets the widget first**: a token is single-use, so a
    second press after a username clash needs the widget back at its start.
- **FAIL CLOSED, and on in production whatever the config says.**
  `challengeRequired()` is true when a secret exists **or**
  `NODE_ENV=production`, so a live box whose secret went missing refuses
  sign-ups (503, "we cannot take new sign-ups just now") rather than quietly
  returning to the hole. **Consequence: set `TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET` in production before deploying this, or nobody can
  register.**
- **Off on a dev box with no secret**, which is load-bearing:
  `scripts/dev-seed.ts` and `scripts/capture-guide.ts` register over this API
  with no browser in sight. `GET /api/auth/challenge` tells the form whether to
  draw a widget and hands it the public site key — a route rather than a
  build-time constant, so one image serves production and a dev box on
  Cloudflare's test keys, and a key can be rotated without shipping a client.
- **The token and the answer are read off the RAW body and consumed there.**
  `registerBodySchema` strips unknown keys (that is the privilege fix) and the
  handler spreads `...credentials` into drizzle's `.values()`, which copies
  whatever keys it is handed — a token that reached the parsed object would try
  to become a column. A test asserts both fields are stripped.
- **THE QUESTION IS GONE.** "Who is the Son of God? (hint: 5 letters)" had two
  lives: decoration (checked in the browser, deleted before sending), and then
  a second server-checked filter kept mostly because Blake wrote it. He asked
  for it once Turnstile was live and verified in production, which retires that
  reason — a fixed answer in a public bundle stops nothing determined, and it
  is one more thing to fumble on a form whose real gate is invisible. Nothing
  depended on it: the Turnstile check fails closed, so the question was never
  the last line. `shared/challenge.ts` keeps the history and now holds only the
  token's field name and `CREDENTIAL_RULES`.
- **The API validates credentials at all now.** `registerBodySchema` inherited
  `z.string()` from drizzle-zod, so `email: "a"` and a one-character password
  were accepted; the rules existed only in the browser, and the strict versions
  sat unused in `shared/schema.ts`. `CREDENTIAL_RULES` (3/8 characters, a real
  email) is the one definition, extended onto the schema — never replacing the
  `omit()`s — and `POST /api/auth/reset-password`, which had no rule at all,
  meets the same minimum.
- **Reset tokens come from the CSPRNG** (`server/lib/tokens.ts`).
  `createVerificationToken` built them from `Math.random()` in both storages —
  xorshift128+, whose state is recoverable from a handful of outputs, minting a
  password-reset credential. Harmless only because no token is ever delivered;
  account takeover the day a mailer exists. **Tokens written before that fix
  are still weak** — they expire in 24 hours and nothing can deliver them, so
  they were left to age out rather than purged; read the claim as "made from
  here on", not "every row".
- **Rate limiting is `server/lib/rateLimit.ts`**, written rather than
  installed: on one container express-rate-limit's store is the same in-memory
  map, and a decision inside a dependency cannot be unit tested. `hit()` is a
  pure fixed-window rule; `limiter()` wraps it with `peek` (ask without
  counting) and `forget` (a correct answer clears the slate). Four guards:
  login 20 an address / 8 a username per 15 minutes, register and
  reset-password 5 an address an hour, stories 30 and pictures 40 an hour per
  ACCOUNT. All 429 with `Retry-After`.
  - **Login counts failures, and only the ADDRESS is checked before the
    password.** Refusing on the username first means anyone who knows a name
    can lock its owner out by getting it wrong eight times — measured on dev,
    it refused the real password for fifteen minutes. The username allowance
    is spent only after a wrong answer.
  - **These are a ceiling behind the credits, not instead of them.** Credits
    limit a family; these catch a loop, which matters most for the admin and
    own-key accounts credits never touch.
  - **It forgets on restart**, deliberately: a deploy is minutes, the windows
    are minutes, and surviving one would cost a table and a cleanup job.
- **Not in this piece, deliberately:** the login challenge after repeated
  failures. Registration still answers "Username
  already exists" and "Email already in use" distinctly, which is an
  enumeration oracle and a decision — telling a parent which field clashed is
  worth more here.

Admin status is `users.is_admin`. Never key authorisation off a username —
nothing reserves usernames, so a string comparison grants the privilege to
anyone who registers that name.

## The free story allowance

**The unit is credits, not stories** (see "Model selection"): a Luna story is
1, a Terra story 3, so the names below say STORIES and mean credits. `count`
kept its column and its meaning — Luna-only history is identical either way.

`FREE_STORIES` (50) and `FREE_STORIES_PER_MONTH` (10) in `shared/schema.ts`,
and **one pure function, `storyAllowance()`**, which every screen and the
enforcement path call. It is a balance that TOPS UP, not an allowance that
refills: each calendar month forgives ten of what has been used, stopping at
zero. A heavy user gets ten a month after the first fifty; a light user sits at
fifty. Expressed as forgiving `count` rather than as a stored balance, so the
existing column keeps its meaning and nothing needed migrating.

`applyStoryTopUp()` persists it in **one statement whose WHERE clause is the
guard**, advancing `last_reset_date` by exactly the months applied — so running
it twice is a no-op. The reset it replaces was a blind `count = 0` that two
concurrent calls could both fire, each pushing the date forward again.

**`GET /api/story/usage` is the only endpoint that reports it**, typed as
`StoryUsage` so a renamed field breaks the build rather than rendering
undefined, and both screens read it through the same query key.

What this replaced, because the shape of the bug is worth remembering: five
restatements of 50 and 10, four different meanings of "a month", two endpoints
that were exact inverses (one called the total 60 when there was no reset date,
the other when there was), a pill computing `max(0, 10 - count)` against a
lifetime count so it read 0 for anyone past ten stories, and a `count < 50`
early return that made the monthly top-up unreachable — the user got fifty
more, not ten. Five storage methods that looked like the counter were all dead:
the real increment is raw SQL inside the worker's finishing transaction, which
is where it has to be to share that transaction.

## Reading levels

`READING_LEVELS` in `shared/schema.ts` is the tuple; `READING_LEVEL_AGES`
and `READING_LEVEL_LABELS` are total Records over it, so adding a level
without an age or a label is a compile error. **The form renders from the
tuple** — it used to carry its own five `<SelectItem>`s and had drifted a
year from the ages. Eight levels now, up to `high-school` (15–17), `adult`
("aged 18 or over", phrased to follow "a reader") and `expert` — an appetite,
not an age: "aged 18 or over and reading to be stretched", and the only level
with a craft line of its own (`EXPERT_CRAFT` in `storyBrief.ts`: layered
meaning, the exact word, moral weight left to the reader, and a closing warning
against purple prose, because that is the easy failure). No persona says
"children" any more, so an adult level is not fighting the system prompt.

## Model selection

`server/lib/modelPolicy.ts` is the only place the model, provider base URL and
API key are decided. Tiers: local (Ollama, free, anyone), economy
(`gpt-5.6-luna`, anyone, owner's key), premium (`gpt-5.6-terra`,
`gpt-6-astra`, `gpt-4o`, `gpt-image-2`, admins or users with their own key —
**except Terra for stories, which a free account buys with credits**).

**Credits.** The free allowance is counted in credits, and a story costs
`storyCreditsFor(model, entitlement)`: Luna 1, Terra 3, from `storyCredits`
on the catalogue entry. Blake, 2026-09-13, after the Luna/Terra/Astra
baseline: Terra on the free tier "will take 3 credits instead of just 1", Terra
is the default for the paid tier, and Astra is not offered to free accounts.

- **Paid tier = `hasUnlimitedUse`** (admin or own key). They are charged 0 on
  every model and default to Terra (`defaultChatModelFor`). A stored choice
  always wins, so nobody who picked Luna is moved onto Terra.
- **`DEFAULTS.chat` stays Luna, and is the floor.** It is what a refused choice
  falls back to; a premium floor is `null` — no story — for a free account.
- **A premium model is open to a free account because it has a price.**
  `isModelAllowedFor` lets a free account reach a premium model only for
  `chat` and only when `storyCredits` is set; a test asserts every such model
  is priced. Unpriced premium (Astra, gpt-4o) stays locked.
- **One price, three readers**: the enqueue check (`canEnqueueWithinQuota`,
  "enough for THIS story", not "any left"), the charge in `finishSucceeded`
  (by the model that RAN, re-resolved at job start), and the price in the
  picker and `/api/story/usage`.
- **Credit-bought Terra is for the story only** — `resolveModel(..., {
  forStory: true })`, checked by `paidFor()`. Chords, universe summaries and
  world extractions charge nothing, so on Terra they would be free premium
  calls as often as asked for; for a free account they run on Luna. Forgetting
  `forStory` fails cheap.
- A story enqueued on Luna and switched to Terra before the worker starts is
  charged 3 into a balance that could not afford it. `used` keeps the overdraft
  and the next top-up pays it back; the concurrency limit of 1 bounds it to one
  story.

**A picture costs credits too, from the same bucket.** `PICTURE_CREDITS`
(`shared/schema.ts`, shared so the guide and Settings quote one table):
standard 1, detailed 3, finest 6, **no picture 0** — a real choice, so an
account down to its last credits keeps writing stories. `pictureCreditsFor`
returns 0 for `hasUnlimitedUse`, like `storyCreditsFor`.

- **Bought, not gated.** Pictures used to be admin/own-key only; the price is
  what stops them being farmed now, so `canIllustrate` is gone and
  `GET /api/settings/models` carries a `pictures` block instead.
- **Charged inside `generateStoryImage`**, before the call, and refunded when
  nothing was drawn — never when an edit fell back to a generate, which drew
  one. That is the avatar rule (`chargeAvatarGeneration`), and putting it
  inside is what keeps `grantedByAllowance`'s contract literally true.
- **The cover is charged, and a story is never lost over it**: refused, the
  story is delivered with no picture. `canEnqueueWithinQuota` adds the cover's
  price so that is rare, and the `credits === 0` early return is gone — a
  local story is free and its cover is not.
- **`pictureChoiceFor(userId)` is the one reader** of `user_settings.image_model`
  / `image_quality`, re-validated at use (decisions §2), returning model, tier,
  credits and whether anyone is charged.
- **Free portraits are held at `FREE_PORTRAIT_CEILING`** (`portraitTier`): the
  eight free ones are paid for by a cap, so "finest" there would be eight of
  the dearest pictures on the owner.

**Quality is a per-model map, and the names are not equivalent.**
`qualityFor(model, tier)` spreads `{ quality }` from `ModelSpec.quality`, like
`inputFidelityFor`. `gpt-image-2` has **no map** and is sent nothing: its
"high" measured 7,024 output tokens where 2.5's spends 1,756 — the same word,
four times the money. `max` is in no map (16x standard for a difference nobody
could see). Before this existed nothing sent a quality at all, so the API
chose: 439 to 7,024 tokens, $0.013 to $0.21, 27s to 173s, recorded as "auto".
`tests/pictureQuality.test.ts` greps every `images.edit`/`images.generate` call
site for `qualityFor`.

**Request shape is per-model and lives in the catalogue, not at the call site.**
The GPT-5.6 generation rejects `max_tokens` (wants `max_completion_tokens`)
and rejects any `temperature` at all, including the default sent explicitly.
Use `tokenLimitFor(model, n)` and `temperatureFor(model, t)` and spread the
result; there are nine call sites. `gpt-5.6-luna` is the economy default, so
getting this wrong breaks generation for every user without their own key.

`dall-e-3` was **shut down** on 2026-05-12 and is gone from the catalogue. Do
not add it back.

**Never give an app setting one of the OpenAI SDK's own names.** `new OpenAI()`
reads `OPENAI_PROJECT_ID`, `OPENAI_ORG_ID`, `OPENAI_BASE_URL`,
`OPENAI_ADMIN_KEY` and others from the environment and SENDS them. The cost
bill check was given `OPENAI_PROJECT_ID` (2026-09-15); the SDK put it in an
`OpenAI-Project` header on every story call, the app's key belongs to another
project, and every story failed with "401 OpenAI-Project header should match
project for API key". The cost settings are `COSTS_*`, and
`tests/openaiEnvNames.test.ts` reads the SDK's names from the installed package
and fails on any of them (but `OPENAI_API_KEY`) in `server/`, `shared/`,
`client/src`, `scripts/` or the reference compose file.

Authorisation is resolved at **use**, not at selection. `grep
process.env.OPENAI_API_KEY server/` should return nothing outside
`modelPolicy.ts`.

Extend `MODEL_CATALOG` rather than adding another hardcoded model list — there
are already six, and the settings UI still uses its own.

## What things cost

Blake wants a pay-as-you-go price that covers costs with a small margin, so
the app measures what a story and a picture really cost, keeps prices as data
someone approves, and warns when OpenAI's prices move. **No charging exists
yet** -- the balance and Stripe are the next plan (`docs/roadmap.md`), built on
these numbers. `/admin/costs` is the page.

- **The ledger is `model_calls`: one row per paid call ATTEMPT**, retries and
  failures included, because they were paid for. Tokens are split the way they
  are billed (`usageBreakdown()` in `server/lib/costMath.ts`): uncached,
  cached and cache-write input, image input, text and image output. Reasoning
  is recorded and never added -- it is already inside output, which is how it
  is billed. Ollama calls are not recorded.
- **`cost_micros` is frozen at write** from the approved price in effect, and
  is **null, never zero**, when there was none. A later price change never
  rewrites a past story's cost. Micros because `tokens × $/1M` is micros
  exactly.
- **Every paid call reaches the ledger**, and a test fails when one does not:
  `requestModelJson`/`requestModelText` take a `ledger` context and record
  each attempt (story, outline, chapter, finalize, digging deeper, extraction,
  summary); the passage scene, pictures, avatars, chords and vision record
  directly. `tests/modelCallsLedger.test.ts` greps `server/` for any file that
  makes a paid call without reaching the recorder -- a new call path that
  records nothing reads exactly like a cheap app. Pass `ledger` to any new
  wrapper call.
- **Prices are rows, never constants.** `price_versions` (proposed / approved /
  dismissed) and `model_prices`, dollars per million per unit. A model's price
  is its newest APPROVED version, whole -- never merged unit by unit across
  versions. `MODEL_CATALOG` has no price field on purpose; `storyCredits` is
  what a free account is charged in credits, a different fact.
- **The watch** (`server/lib/priceWatch.ts`, daily and on "Check now") reads
  LiteLLM's price file and OpenAI's `pricing.md`, Standard tier only
  (`priceFeeds.ts`, pure, tested against saved real copies). OpenAI's page
  wins where both have a price; every disagreement is kept and shown. A
  difference files ONE proposal (fingerprinted, never twice) and **nothing is
  applied until a person approves it**. A feed that changes shape is a
  warning, not "no change". A unit a feed stops listing is carried forward, not
  made free.
- **The bill check** needs an organisation Admin key: `COSTS_ADMIN_KEY_FILE`
  (a root-only file mounted read-only -- production's is
  `/mnt/user/appdata/lion-tails/openai-admin-key`) or `COSTS_ADMIN_KEY`, read
  by `adminKey()` in `priceWatch.ts` only and never returned by a route -- and
  `COSTS_PROJECT_ID` (Lion Tails is "Lion's Tail",
  `proj_uQjN5Xv24HRqdr0AqaV9E0zp`; the organisation also holds Open WebUI's
  project, so without it the check compares both). **Written against a real
  bill, not the docs** (`parseLineItem`, `readBill`): line items are
  `gpt-5.6-luna, cache writes` and `gpt-image-2-2026-04-21 image, output` --
  dated snapshots, the modality after the model, token types in words -- and
  rows come per day AND per project. **Free rows are not a price**: whole days
  of Luna were billed $0 (the organisation's complimentary allowance) beside
  rows at exactly list, and averaging them read as Luna at a fifth of its
  price. The charged rate comes from paid rows only, flagged beyond 2%; the
  comparison with the ledger uses every token at the APPROVED price (the
  ledger prices at list too), flagged beyond 5%, and starts at the ledger's
  first whole day, so a new ledger is not read as every call going unrecorded.
  First real check, 2026-09-07 to 09-14: $10.49 charged, $2.42 of free usage
  at list, gpt-image-2 at exactly $30 / $8 / $5.
- **Costs are measured, not estimated** (`costStats.ts`): a story is the sum of
  its job's calls plus the extraction it caused, by length and model; a story
  with any unpriced call is left out, not counted cheap. Pictures by purpose.
- **The price list is published, never live.** Suggested = p75 × (1 + margin,
  default 20%, `app_settings.pricing_margin_pct`), rounded UP to a cent, and
  only for items with `MIN_SAMPLES` (5). Publishing computes the list on the
  server -- a client-supplied list could be set to zero. A published price
  below today's measured p75 is a warning. `GET /api/pricing` returns prices
  only, no costs.
- **The published list is what the reader is told a picture costs.**
  `/api/pricing` also answers `pictureCents` (typed as `PriceList` in
  `shared/schema.ts`), the image row plus the scene-writing row summed on the
  server, and `PictureDialog` shows it before anything is spent. **Until a
  price is approved and published, that is null and the dialog says so in
  words** -- so approving prices on `/admin/costs` is what turns "costs real
  money" into "about 14¢" everywhere at once. Nothing charges yet; this is
  telling a parent what they are spending on somebody's key.

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

**Two resets, in Settings, and they are separate things.** "Start a
character's sheet again" (`startingOver()`, `POST …/reset`) clears attributes,
skills, adventures and the virtue receipts — offered only to a character with
stats on. "Make the next quest a first visit" (`startingQuestsAgain()`,
`POST …/reset-quests`) stamps `travelsResetAt` and nothing else — offered to
everyone, because a character with stats off still goes on quests. The quest
count is derived from the library (`countQuestsFor` → `questsSince`), not
stored, so a reset cannot clear it: only quests written after the stamp count,
absent means count everything, and a story with no usable date counts so an
older row never drops out of a veteran's history over a null column.
`GET /api/characters/quests` is the count by id, for the card; it is registered
before `/api/characters/:id` or Express reads "quests" as an id.

**The four human age-nouns are reconciled with the age.** `characterKind()`
turns `boy`/`girl`/`man`/`woman` plus an age into the right one of the
four (18 is the line, as it already was for `"human"`); with no age the
chosen noun stands, so every older row renders as before. A preset of "boy"
saved with an age of 33 used to reach the brief as "aged 33, a boy", and the
model obediently wrote "thirty-three, though he was still a boy". The
character form says what the story will call them under the age field —
automatic, and visible, rather than a warning to click through.

**A story may have NO main character.** `noMainCharacter` on the request,
read only through `isEnsemble()` — the flag is meaningless with one character,
and a request can carry it from a cast later cut to one. Absent means the old
shape, so every frozen request still means what it meant. The brief carries
`ensemble` as a fact (like `soloRetelling`) because the full brief AND the
chapter projection both need it, and the chapter projection is the one that
writes every chapter: its "use them only where this chapter's instruction calls
for them" is what MAKES a supporting character, so it needs the opposite
sentence here. **Two or three share the lead's full description**
(`ENSEMBLE_FULL_DETAIL_MAX`), four or more fall back to the two-fact ration —
the "eight equal names is eight protagonists" argument is about eight, not two.
The story form's companion animal stays one per story. A shared quest adds two lines to the
brief and **does not touch the canon**, which is capped by a test and singular
on purpose: "the traveller" means all of
them. The crowns in `CharacterPicker` disappear when it is ticked — a crown on
screen while the prompt says nobody leads is the UI contradicting the model.
Verified on real generations: ticked, Ada 26 / Eli 24; unticked, Ada 38 / Eli 15.

**The hobby and the favourite colour are permission, not inventory.** They
render on their own line — *"Things a scene may notice about Mia, and none has
to: likes drawing; favourite colour purple."* — the shelf's grading applied to a
person (`BriefCharacter.mayNotice`, `softFacts()`). Measured before this across
seven real stories: hobby nouns 5–18 times per ~1,200 words and four of seven
titles carrying the sheet's colour or hobby. Blake: "Hobbies should probably not
be as influential as they are." This was the first change to move the
compatibility goldens on purpose, at his say-so: ten cases × (single + outline),
each by exactly that relocation. Hair, eyes, nature, the companion and the notes
stay in `colour`; the supporting cast's two-fact ration is untouched.

**A favourite animal is not a pet, and a pet is named.** The brief used to fall
back to the sheet's favourite animal as the story's companion ("give it a name
and a personality"), so every story grew a rabbit with a new name. Blake: "that
is not the way I want that to work." The favourite animal is now the third
may-notice fact, followed once per brief by `FAVOURITE_IS_NOT_A_PET`; only the
story form's own animal (relabelled "An animal in this story") is a companion.
Pets are on the sheet (`pets`, Basics tab: name, animal, **In stories**), and
`petsComingAlong()` brings the ticked ones across the whole cast, once each by
name and kind, into single/outline ("give no one another pet"), every chapter,
and the picture. On a quest `PET_CROSSES_OVER` sends it through the lantern —
said only when there is a pet, not as a `DEVICE` rule. "Include animals" off
removes the favourite animal and the pets too. Compatibility cases 2 and 5
moved for this, by exactly that relocation, with Blake's yes.

**Family is by id, in the brief by name, and only among the cast.**
`relations` (`shared/family.ts`) is `{ relativeId, relation }` — `relativeId`,
not `characterId`, which a test reserves for the legacy request field. Stored
gender-neutral (parent, sibling, auntUncle, spouse, stepparent, parentInLaw…);
"Dad"/"Mom" is `relationLabel()` from the related character's sex at render — through `sexForWords()`, because every "boy" or "man" saved before the sex question has a kind that says it and no `sex`.
**Server-owned and mirrored:** omitted from all four write schemas and from
the form's schema; `PUT|DELETE /api/characters/:id/relations/:otherId` calls
`setRelation`, which writes both rows in one transaction, and
`updateCharacter` keeps the row's live `relations` in its UPDATE so a stale
form cannot undo a mirror. Deleting a character strips it from its family in
the same transaction. A new character's family waits in the form and is sent
after the create returns an id. In the brief, `familySentences()` ("Paul is
Lucy's father.") covers only pairs where both are in the cast — relatives
outside it are left out, Blake's choice — and `namesakeLines()` adds one
sentence when a cast member's first name is in the account or is the
Timekeeper's. Whole-word match without a regex: names are user text. Ids never
reach a STORY prompt; a test holds that — pictures are the exception, below.
See `docs/decisions.md` §28.

**A NAMESAKE IS NOT THE RELATIVE, and the brief has to say so.** Blake, when
this was built: *"If I (Paul) am Lucy's dad … the AI might put Paul the apostle
as her dad in a story about Paul the Apostle."* It then happened — "The Rock,
the Board, and Malta", 2026-09-16: *"it made the Apostle Paul me (Paul) and
Lucy the daughter of the Apostle Paul."* Two things were wrong, and both are
fixed:

- **The namesake sentence never contradicted the family sentence.** The brief
  says "Paul is Lucy's father." FIRST and then "the reader's Paul is not the
  Paul of the account" — so nothing stopped a model satisfying both by
  collapsing who "her father" meant. `namesakeLines()` now denies the relation
  by name: *"Lucy's father is this Paul and nobody else: the Paul of the
  account is not, and never becomes anybody's family in this story."* Only for
  relations `familySentences()` actually asserts (both people in the cast), so
  a namesake with no family in the story keeps the sentence it always had.
- **The protection needed a RESOLVED account and silently vanished without
  one.** `namesakeSourcesOf` read `sourceMaterial`, which exists only for a
  catalogue event or a hero of the faith — so a **typed passage** ("Acts 27 —
  Paul's shipwreck"), a first-class choice in the form, had no era, no cautions
  and **no namesake sentence**; nor did a request carrying an event id the
  catalogue does not know, which is what the Malta story had
  (`pauls-missionary-journeys`; the real id is `paul`). The brief now carries
  `sourceNames` — the WORDS that name the setting, from `sourceNamesOf()`,
  whether or not an account resolved — and both the prose and the picture read
  it through the one `namesakeSourcesOf`. The unresolved-slug premise line says
  the words rather than the identifier, which `BiblicalEvent.label`'s own doc
  comment ("the slug must never reach a prompt") already demanded. Matching for
  a namesake is looser than `containsWholeWord` on purpose (`mentionsName`:
  lower case, and a bare possessive) — an extra namesake sentence costs a line
  of prompt, a missing one cost a child's father.

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
holds 68 captured strings (17 cases × 4 projections) asserting the rendered
brief. **Cases 1–5 are the compatibility set and must not move**: they are
what a 0/1-character request rendered before any of this. **Case 6, "time
travel", is the lore's own golden** — it embeds the Lion Tails canon verbatim
and moves whenever `server/data/lionTails.ts` does; read that diff, it is the
prompt every quest is written from. Regenerate with `UPDATE_GOLDEN=1 npm test
-- storyBrief`, and read the diff before believing it.

## A character in a real account

Attaching a character to a hero or a biblical event is an explicit choice, not
an inference. `characterRole` is the field; `useTimeTravel` is LEGACY and both
are read only through `characterRoleOf()` — the `characterIdsOf()` precedent.

- `"absent"` — a straight retelling. Nobody is written into the account. The
  default, because being wrong this way gives a plainer story, and being wrong
  the other way puts a child into Scripture.
- `"travels"` — **A Quest with the Timekeeper** in the UI. They start here and
  now and the lantern takes them into the account. The world reaches the
  brief as its own section and every chapter as an anchor; see "Quests of the
  Timekeeper" at the end of this file.
- `"alongside"` — they were always there. No journey, no lantern. They help
  and push back; the figure stays on their mission; they do not die.
- `"meets"` — LEGACY, resolves to `"alongside"`. See "The two story tabs".

Either way in, the story gets a short appended note saying what was invented.

**The note is appended by the server, never asked of the model** — a disclaimer
the model writes is one it can forget, soften, or bury mid-story, and this one
has to be exactly right and always present.

**The story never narrates the limits; the note does.** Told three ways per
chapter what the character cannot change, the model hedged by writing it —
"He did not build the wall. He did not make the family's decision. He only
held one board." `notNarrated()` forbids writing what the character did
not do, could not change, or only watched, and points at the appended note
as the only place that is said. It rides in both modes' premise lines AND
both chapter anchors, and — for a traveller — in the premise too, because
the helping permission (`partOfIt`) is chapter-only by design and the
outline had heard only the prohibitions. The permission itself widened:
carries, warns, comforts, holds the board, is the reason a small thing goes
right. What the account records still happens, and never because of them.

This exists because the two used to contradict each other with nothing making
anyone choose. The historical tab used to force-set `useTimeTravel: false`,
and the brief then wrote the character into the account regardless: a story about Caleb
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

### From a photograph

Blake: *"turns a real life image into an avatar… doesn't keep the image… And I
also just want to have where you can upload an image and leave the image there.
So it is what it is."* Three buttons on the Appearance tab, each saying what it
does: **Draw a picture**, **Turn a photo into a drawing**, **Use a photo as it
is**. One route, `POST /api/characters/:id/avatar/photo?mode=drawing|photo`.

- **`drawing` never writes the photograph.** It is a Buffer handed to
  `generateAvatar({ photo })` as the `images.edit` reference and dropped — the
  way to make "discarded" true is for no code on that path to be able to write
  it. Charged and refunded exactly like a generation, because it is one.
  Verified: one upload, one new file in the directory, and it is the drawing.
- **`photo` keeps the file and charges nothing.** There is no model call, and
  `MAX_FREE_AVATARS` bounds what the owner spends. The per-character cap still
  binds both modes; that one bounds what a character holds.
- **Raw bytes, `image/png` only, via `express.raw` on that route alone.** The
  browser converts first (`client/src/lib/imageFile.ts`: EXIF-rotated, fitted to
  1024, re-encoded) so there is no `sharp` in the build and ONE format in
  `AVATAR_DIR` — `readAvatarFile` only reads `avatar_<uuid>.png`, and
  `illustration.ts` sends these declaring `image/png`. `isPngImage` checks the
  magic bytes, never the header. **Do not copy `pages/ImageAnalysis.tsx`**: it
  posts base64 through `express.json()`'s 100kb default and cannot have worked
  on a real photo.
- **Every photo is framed before it is sent** (`PhotoCropper.tsx`). Blake:
  "needs a crop or zoom out option so that the file can fit where it needs to
  in the window." Every portrait is shown square and `object-cover`, so a
  photo that is not square was being cropped anyway, by the display, with no
  say in where. Drag to move, pinch/slider/wheel to zoom, and two one-tap
  framings: **Whole photo** (zoomed out, gap filled) and **Fill the square**
  (the default — doing nothing gives the old result).
  - **The preview IS the file.** Both are drawn by `renderCrop()`, placing the
    photo with `placement()` from `client/src/lib/imageCrop.ts` (pure, tested).
    No CSS transform stands in for the crop. Verified in a browser: the saved
    1024px file and the on-screen frame are the same picture.
  - The view is stored in fractions of the square's side, not pixels, so the
    same framing renders identically at 300px and 1024px.
  - **The gap is filled with the average of the photo's EDGES that touch it**
    (`edgeColour()`), averaged in JS from a 32px downscale. Shrinking straight
    to one pixel does not average — the browser samples near the middle, and
    a teddy on a cream kitchen table came back framed in maroon off its ribbon.
  - The slider is logarithmic: linear, a 3:4 photo's whole zoom-out range is
    the first 8% of the track.
  - Callback refs, not `useRef`: the dialog is portalled, and an effect reading
    `ref.current` can run before the node exists, leaving a blank preview.
  - The three picture buttons wrap their labels (`h-auto whitespace-normal`):
    the stock Button is nowrap at a fixed height, and beside the portrait on a
    390px phone "Turn a photo into a drawing" ran out through its border.
- **`storeAvatarFile` is the one place a portrait is named and written.**
  `generateAvatar` uses it too. A file named any other way is served fine and
  then silently skipped the first time a story tries to draw that character.
- **`source: "photo"` marks a kept photograph**, on `generatedPictureSchema`,
  optional, absent means drawn — so no migration. It **must** be declared there:
  `characterSchema` is a `z.object` and strips unknown keys, so a `source` set in
  the route and missing from the schema is dropped on the way to the database
  with every route test still green. A cartoonised photo is NOT marked: by the
  time it is stored it is a drawing.
- **A story is told when its reference is a photograph.**
  `chosenAvatarIsPhoto()` — keyed on the CHOSEN portrait, so choosing a drawing
  stops a photograph mattering — sets `fromPhoto` in `illustrationCast`, and
  `composeIllustrationPrompt` adds one line straight after that member's own:
  *"Reference image N is a photograph, not a drawing… never reproduce the
  photograph."* Per member, so the numbering is untouched; only when a photo is
  in the cast, so every other picture renders the string it always did.
- **A refusal is not a failure.** `looksLikeRefusal()` → `avatar_refused` →
  "it will not draw that, describe them in your own words", instead of "try
  again". Blake hit it asking for Yoshi; OpenAI's real answer is `400 Your
  request was rejected by the safety system`. Deliberately tight: a 400 whose
  message is not about moderation — `input_fidelity`, say — is ours, and must
  not be reported to a parent as theirs.

### Portraits are behind the login

`GET /public/images/stories/avatars/:file` is a `requireAuth` route in
`routes.ts`, serving through `readAvatarFile` (the one traversal guard) with
`Cache-Control: private` so SWAG cannot hand one family's portrait to another.
Story illustrations beside it stay static.

**It works only because of where the static mount is.** `server/index.ts`
mounts `/public` statically AFTER `registerRoutes`, because `setupAuth` runs
inside it. **Moving that line back above `registerRoutes` is silent**: nothing
errors, no test fails, and every portrait answers 200 without a session again.
Check with `curl` — an avatar url with no cookie must be 401.

This is possible at all because **the client's Bearer header is vestigial**:
nothing in `server/` reads `Authorization`, auth is the passport session
cookie, and an `<img>` sends that on a same-origin request.

## The picture at the end of a story

`server/lib/illustration.ts` is the only place a story is drawn.
`generateStoryImage` moved here out of `openai-implementation.ts`, with
`downloadImage`, and it now takes a CAST.

**A description will not reproduce a person.** Ask an image model twice for
"an 8-year-old girl with brown hair" and you get two different girls — which
is why the story's picture never matched the character sheet, silently, with
nothing to see in a log. So the picture is drawn FROM the portrait:
`images.edit` with the avatars as reference images. `avatar.ts` has drawn
second portraits this way all along; the same mechanism now points at the
story.

**`input_fidelity` goes through the catalogue, never literally.**
`gpt-image-2` answers **400** to it, whatever the SDK's doc comment says, so
`inputFidelityFor(model)` is spread in — `temperatureFor`'s shape, and the
same rule: request shape is a property of the model. Sending it literally
cost this feature its first real test. The 400 fell through to a plain
`images.generate`, which threw away every reference image and drew a
different child, and the only sign was one line in the log.

- **`describeCharacter()` is the one definition of how somebody looks**, in
  `avatar.ts`. `buildAvatarPrompt` is that sentence plus the portrait's own
  framing. A character with no portrait is described with it; a character
  with one is described with it AND matched against the file. If those two
  ever disagree, the picture stops matching the portrait, which is the whole
  bug.
- **Text is the fallback, not the mechanism.** Every cast member carries
  `look` whether or not they have a `reference`, so a failed `images.edit`
  falls back to `images.generate` with everyone still described rather than
  losing the picture.
- **An empty cast renders byte-for-byte what it always did.** A retelling
  with nobody in it, a cast with no portraits, an older row — those pictures
  must not change because this shipped, and a test holds the string.
- **Nobody is drawn into a story they are not in.**
  `charactersAreInTheStory()` is deliberately NOT `storyBrief`'s
  `anonymous`: that keys on a source that RESOLVES, this keys on a source
  field being filled at all, because the two mistakes do not cost the same.
  A missing face is a generic picture; a wrong face in a biblical scene is
  the Esther bug with a camera.
- **One visual rule rides on the image projection of a quest brief, and only
  there:** `CROSSING_OVER_DRESS` — the lantern outfits the traveller for the
  place. It goes to the prose as well, so story and picture agree.
  It lives in `referencePlates.ts`, beside the plates: visual rules stay in one
  file, and CANON is edited often enough that a new key there is a merge
  conflict waiting to happen. There used to be a second one for the stone; the
  stone is gone from the canon (see the Quests section) and the rule with it.
- **"They were always there" dresses them too** (`ALONGSIDE_DRESS`, image
  projection only; the prose already said "nothing from another century").
  Blake's Paul stood in Lystra in a t-shirt, jeans and a cap because the image
  prompt took each person's CLOTHING from their portrait. `illustrationCast`
  now marks members `dressed: "always"` (alongside) or `"farSide"` (quests),
  and then the portrait gives face, hair and colouring only, and the scene's
  time and place gives the clothes; the cover-as-style line stops asking for
  the same clothes too. Stories set now keep the sentence they always had.
  **Animals are not dressed** (Blake: "Animals though, that may be
  different"): a `notAPerson` member is drawn as shown, and in the past with
  nothing modern on it; `ANIMALS_AS_THEY_ARE` says the same for a pet.
- **At most three faces**, which is the rule the brief's `"image"`
  projection already states in words.
- **The Timekeeper has one face and it is a file.**
  `public/images/barnabas-timekeeper.png`, named by `KEEPER_FACE_FILE` in
  `lionTails.ts` — a separate export, never a `KEEPER` field, because
  `worldCanon()` renders `KEEPER` into the brief and a filename has no
  business in a story prompt. **Where it lives is load-bearing**: `public/`
  ships, but the `story_images` volume mounts over `public/images/stories`
  only, so a file beside that directory survives a redeploy and a file inside
  it is shadowed at runtime. `attached_assets/` is not in the runtime image
  at all. `KEEPER.look` is the sentence that stands in if the file cannot be
  read; `worldCanon()` does not render it.
- **Shipped artwork is webp, and the source PNG stays in `attached_assets`.**
  These renders are photographic, which PNG is the wrong container for: 2.2MB
  against 167KB for the same picture at 1024px. The images API takes png,
  webp and jpg, and `mimeFor()` follows the extension — a reference sent
  under the wrong type is a 400 that costs the whole picture. There is no
  image tooling in this container and none in the repo; convert with a
  throwaway install rather than adding a native dependency to `package.json`
  for an occasional job:

  ```bash
  npm i --prefix /tmp/imgtools sharp
  node -e "require('/tmp/imgtools/node_modules/sharp')('attached_assets/X.png')
    .resize(1024,1024).webp({quality:88}).toFile('public/images/x.webp')"
  ```

- **He is attached ONLY when the scene names him**, and that is the second
  answer. The first attached him to every quest and marked him optional
  ("need not appear"), so a scene calling him "the old shopkeeper" could not
  slip past. What came back was **William Tyndale wearing Barnabas's face and
  coat**: the scene wanted an older man at a desk, an older man's face was in
  the request, and the model used it — twice, including after the prompt was
  told everyone else is a different person. The failures are not equal. Not
  attaching him to a scene he is quietly in costs one generic old man;
  attaching him to a scene he is not in draws a real historical figure as a
  fictional character, in an app whose point is that the history is true.
- **A face is bound by picture ID, not by name.** Blake's "From Stones to
  Rome" put his character Paul's portrait on the apostle in all six panels:
  the scene said "the apostle Paul", a reference image was labelled "Paul",
  and every portrait was attached whatever the scene said. Each character
  now has a picture ID, `pictureRef()` in `shared/family.ts` — `[c6108b]`,
  the start of their character id. Only the brief's **image** projection
  lists them (never single/outline/chapter, which write text a child reads),
  and both scene writers are reminded to tag each person they draw
  (`PICTURE_ID_REMINDER`). `drawnCharacters()`/`chooseDrawn()` attach a
  portrait for a tagged person, or an untagged one whose name nobody in the
  account shares; a shared name without its tag is left out, and a scene with
  no tags at all is held to the same named rule and never to "the first
  three" -- that fallback put Ellie in Mordecai's crown and Elijah at Haman's
  reins for a passage naming neither (2026-09-15); older prompts name the
  children, so they keep their faces. `withRefsResolved()` turns each ID
  into "the person in reference image N" before the image model sees
  anything, and a shared-name member's reference line drops the name.
  Blake chose pictures only, not story prompts. **Readers never see an ID**:
  `withoutPictureRefs()` on the stored gallery prompt, the legacy fold in
  `storyImagesOf()`, and the three places the reader shows a prompt;
  `story.imagePrompt` keeps its tags so a redraw binds by them.
- **A story keeps its pictures.** A redraw APPENDS — Blake: "the chances are
  that the old one may be better than the last with AI" — up to
  `MAX_STORY_IMAGES` (5, the same as `MAX_AVATARS`), past which it is
  **refused** with a 409 rather than dropping the oldest, because a silent
  drop is the automatic discard the gallery exists to stop.
  `savedStory.images` is the list, `story.imageUrl` stays the CHOSEN one and
  the field everything else reads, and `storyImagesOf()` folds a pre-gallery
  row into a list of one exactly as `avatarsOf()` does. Both use one
  `generatedPictureSchema`. `setStoryImages()` writes the pair in ONE leaf
  merge (`editStory`'s rule: never `jsonb_set`, which returns NULL into a
  missing key and erases the row); its null branch `#-` removes `imageUrl`
  rather than writing JSON null, which the schema would refuse to parse.
- **Only `DELETE /api/stories/:id/image/:imageId` removes a picture**, and the
  reader asks first. Deleting the chosen one promotes the newest of what is
  left, and the file goes only AFTER the row no longer points at it.
- **A picture can be IN the story, not only at the end.** Highlight a
  passage in the reader, and `POST /api/stories/:id/illustrate` takes a
  `passage` alongside everything it already does — one route, one gate, one
  cap, one gallery.
  - **The scene is written by the same call the end-of-story picture uses.**
    `server/lib/passageScene.ts` (built like `diggingDeeper`: a second call
    in its own module) sends the passage plus `renderBrief(brief, "image")`,
    with the brief **rebuilt** through `resolveHeroOfFaith` +
    `buildStoryBrief` rather than restated. Blake: "it is just a bit in the
    AI face HEY, WE WANT A PICTURE OF THIS SPECIFIC MOMENT. with all the same
    parameters as before." **The brief says WHO, the passage says WHERE** —
    the image projection is "<the lead> — a scene from <the account>", so the
    setting rides along with the cast, and the first real generation put a
    moment set in Barnabas's shop "in the world of William Tyndale". The
    prompt now says so out loud.
  - **For an OpenAI model it reads the whole story.** Passage-only, "They
    crossed to the shop together" came back as the shop "in ancient Susa",
    girls in Persian dress. Now `storyWithoutAppendices` of the body, the
    outline, the brief and the cover's prompt (looks only) go FIRST and are
    the same for every picture of a story, and end at an **explicit cache
    breakpoint** (`passageScenePromptParts`, `prompt_cache_options: explicit`,
    `prompt_cache_key` per story). The implicit one is not enough on gpt-5.6:
    measured, it covered the whole prompt, so the second picture re-read the
    story at full price. The look book, the lead-in and the passage go LAST.
    The scene must open with when and where ("In the present day, …") and say
    what everyone wears — an image model cannot see the story. **That opening
    is read by the server**: `isPresentDayScene()` in `illustration.ts` turns a
    quest traveller's far-side dress rule off and says "present-day clothes".
    Left to the image model ("in a scene set in the past…"), a shop scene
    that said "In the present day … contemporary clothes" still came back in
    Persian tunics — "biblical storybook" style, a mostly-Persian montage as
    the look of the book, and a room full of old things all said "past". Who,
    where and what they wear come from the story up to the moment; what is
    happening from the passage. Over `MAX_SCENE_STORY_CHARS` the part around
    the passage is sent. **A local model gets the old passage-only prompt,
    byte for byte** — its context cannot hold a story.
  - **The look book** (`shared/lookBook.ts`, `story_data.lookBook`): the same
    scene call returns one sentence of looks for each person it drew who has
    no portrait. **The server attaches the saved sentences** (`withLooks`, by
    whole-word name, only for names the scene uses) — asked to copy them in,
    the model saved Mordecai's look and then described him in its own words. Blake: "every
    character that appears in the generated story in words could then easily
    appear in the pictures too." **First words win** — `newLooks` never
    replaces an entry, and `addStoryLooks` puts the stored book on the right
    of `||` so a racing picture cannot either. Cast names and Barnabas are
    refused (they have faces). Server-owned, declared on `savedStorySchema`
    or zod strips it, and not in `sharedStoryView`.
  - **The anchor is a quote first and an index second**
    (`pictureAnchorSchema`). The reader's blocks have no identity —
    `StoryContent` keys them by array index and the array is rebuilt whenever
    the text changes — and a parent edit rewrites the whole body through a
    textarea with **no concurrency control anywhere on that path**. So
    `anchorBlock()` finds the block that still contains the quote (nearest
    the remembered index, because a story for children repeats itself), falls
    back to the index, and otherwise returns -1. A lost anchor is never a
    lost picture: it stays in the gallery and simply is not in the text.
  - **Nothing anchors into the appendices.** `bodyBlocks` is a second parse
    of `splitAppendices(content).body`, which is cheaper and more honest
    than teaching the parser about them.
  - **The figure floats and the text wraps it**, alternating sides down the
    page, full width below 32rem — "except small phone". `data-block` goes
    ON the block element, never a wrapper: every rule in `reader.css` is a
    direct-child or adjacent-sibling selector, and a div between the body and
    its paragraphs takes the spacing, the indents and the drop cap with it.
    `figure + p` restores the indent that `p + p` no longer matches.
  - **No new `Block` kind**: the figures render from a `pictures` prop
    beside the blocks, so `storyToPrintHtml` and `ContinuationContext` are
    untouched and the parser stays a pure function of the text.
  - The lightbox carries **no `.reader-chrome`** — focus mode fades that to
    `opacity: 0; pointer-events: none`, taking the close button with it.
    It is full screen, and a tap toggles fitted ↔ the file's own pixels in a
    scrolling box (a six-panel cover fitted to a phone is six thumbnails). The
    picture at the end opens it too.
  - **Twelve pictures a story**, not the five a character keeps: one is the
    picture at the end and the rest are the pictures in the story.
  - **A passage picture is a page, not a cover.** It never changes
    `story.imageUrl`; only a redraw or choosing from the strip does. It used
    to write it unconditionally, so a picture drawn for paragraph 32 also
    became the story's picture and then rendered twice.
  - **The gallery strip is not part of the figure.** It was a figcaption of
    the end-of-story picture, so a story whose pictures are all inside the
    text -- now the normal state -- had no strip and no way to delete one.
  - **The control lives in `ReaderBar`**, not the action row: choosing a
    passage means scrolling to it, and the bar is the one that comes with you.
- **EVERY PICTURE ASKS FIRST** (`client/src/components/reader/PictureDialog.tsx`).
  Blake: *"it should pop up a dialogue box with information on pricing and ask
  them if there are any additional or imperatives that should be included in
  the picture."* One component for all three spends on this route -- a passage,
  a story's first picture, and a redraw -- because all three are minutes of
  waiting and real money, and two of them used to go on ONE tap with no price
  anywhere. A `Dialog`, not an `AlertDialog`: it holds a text field, the rule
  the avatar dialog states.
  - **It says what a picture costs, in the unit the account actually pays in.**
    Charged credits (the normal case): the tier's price and the balance beside
    it, out of the same `pictures` block the button's own price comes from.
    Charged none -- an admin, or an own key -- and the honest number is the
    money one, from the published list: `GET /api/pricing` sums the image row
    and the scene-writing row (`pictureListPrice`, `pictureItemKey`) because a
    picture is two paid calls, keyed on the model, size and tier the ledger
    WILL record, so it matches a published row by construction or matches
    nothing. **Null until prices are published on `/admin/costs`**, and then it
    reads a real number with no code change; with no price it says what is true
    in words rather than inventing one.
  - **`onOpenAutoFocus` is prevented.** Radix focuses the first tabbable thing,
    which is the note field, and on a phone the keyboard then covers the price
    line and both buttons. The card takes focus instead.
  - **The passage is snapshotted when the box opens.** `usePassagePicker` is
    still listening to `selectionchange`, and nothing may swap what is about to
    be drawn out from under the quote on screen. Cancel leaves the picker
    armed; only a finished picture clears the selection.
- **The note reaches both models that decide what is drawn**
  (`shared/pictureNote.ts`, 300 characters, refused over it).
  `renderPictureNoteSection` goes to the scene writer in `rest` -- **never
  `prefix`**, which is the cached part every picture of a story shares -- and
  `withPictureNote` **appends** it to the image prompt server-side, because a
  model asked to carry a sentence through writes its own words instead (the
  look book's whole history). Appended, never prepended: `isPresentDayScene`
  reads the opening. **`illustrationCast` and `illustrationPlates` are resolved
  from the prompt WITHOUT it** -- they attach faces and furniture by finding
  names, so "Barnabas is not in this one" would attach exactly what it asks to
  leave out. With no note the prompt is byte-for-byte what it was, and a test
  holds that. Verified on a real generation: asked for "the rock resting in her
  open palm, and a stormy grey sky", the scene said both and the picture showed
  both.
- **The chosen picture is the look of the book.** It is attached as a
  reference to every picture drawn from a passage, so the people a story
  invented -- a hero of the faith, a shopkeeper, anyone with no character sheet --
  are the same person on every page. `hero.imageUrl` is on the schema and
  **empty for all eighty heroes**, so there is nothing else they could be
  matched against. Verified: Corrie ten Boom came out the same woman across a
  cover and two independently drawn pages.
  - Anchored to the CHOSEN picture, never chained to the previous one:
    picture 9 copying picture 8 copying picture 7 compounds its drift, and
    the reader already controls which picture is chosen.
  - Never on a redraw -- that supersedes the chosen picture, and anchoring a
    redraw to the thing you are redoing is the one case where this is
    backwards.
  - `COVER_SHOWS_PEOPLE` asks the auto-generated picture for **recognisable**
    people, never "facing the viewer" or "portrait": the wording is the whole
    risk, and those turn a storybook cover into a school photograph. 34 of 34
    covers in a real library already put a named person in frame, so it is
    close to a no-op. A test asserts the phrases that must NOT be in it.
- **Redraw is `{ redraw: true }` on `POST /api/stories/:id/illustrate`**, and
  the entitlement is checked BEFORE any work — admin or own key, derived from
  `isModelAllowedFor` like `canIllustrate`, answering 403 rather than the
  503 that comes out the far end. Blake: "that is a farming method
  otherwise."

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

**Skills spend from the same pool, and a skill's cost IS its level.** A new one
starts at `SKILL_START` (1) and costs one point; level 4 costs four. Attributes
measure distance from an ordinary 3 because everybody HAS a strength — nobody
has climbing by default, so there is no baseline for a skill to be a distance
from. Getting that wrong made a new skill cost four points and a skill at 1
refund two. `notableSkills()` returns everything for the same reason: there is
no free level to filter out. Names come from
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

## Heroes of the Faith data

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

## Dropdowns

`ui/select.tsx` sized its scrolling viewport with
`h-[var(--radix-select-trigger-height)]` — the height of the CLOSED control,
not the list — so `max-h-96` on the content could never apply and a long list
rendered without scrolling. Stock shadcn, and wrong for all thirteen dropdowns
here; the 31-item skill list is only what made it obvious. It is `max-h-72
overflow-y-auto` now, the idiom `HeroPicker`, `CharacterPicker` and
`AnimalAutocomplete` already used, with `flex flex-col` on the content so
Radix's own `flex: 1` can apply.

`SelectItem` styles `data-[highlighted]` as well as `focus` — Radix highlights
on pointer move, and `focus:` alone left the list with no hover feedback. Both
halves of the accent pair, always: `findUnpairedAccent` in `tests/theme.test.ts`
scans `components/ui` too.

**A Select inside a dialog renders in place, and it decides that itself.**
Radix's Dialog locks scroll with react-remove-scroll, which cancels wheel
events outside DialogContent — and a portalled list lands on document.body,
outside it. So the wheel moved nothing and hovering highlighted nothing, while
the same list on a plain page worked. `DialogContent` provides
`InsideDialogContext` and `SelectContent` defaults `portalled` from it; an
explicit prop still wins. It used to be a prop each call site had to remember:
CharacterForm's three did, and SettingsPanel's model picker could not have —
that panel is both the Settings page and the body of the gear-icon dialog.
Measured in a browser at 1280px and 390px: in the dialog the wheel went 0px →
40px and hover returned, the page is unchanged, and the bottom option is
hit-tested under its own centre, so the dialog's `overflow-y-auto` and
centring transform do not clip it.

**A tabbed dialog must be anchored, not centred.** `DialogContent` is
`top-[50%] translate-y-[-50%]` with an intrinsic height, so switching to a
shorter tab moved the whole card, tab strip included. The three dialogs that
host `CharacterForm` override it with `top-[4vh] translate-y-0`; the other
seven call sites are fine centred.

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
- A change to the app is a change to the guide. See The guide ("How to use") —
  the words go stale silently, and no test can see it.
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

## The two story tabs

They mean two different things, and they used to overlap in ways that
confused everyone:

- **Original** — a story about YOUR character. Optionally set somewhere real,
  through the "Set it somewhere real" gate: pick a source, then one of the two
  ways in (`characterRole`). The labels live in
  `client/src/lib/characterRole.ts`, read by the form AND the Parent-Mode
  preview; the ids are frozen in `story_jobs.request` and are not renamed.
- **Historical & Biblical** — the real thing itself. **No user characters at
  all.** One source, plus questions.

`characterRole` is `"absent" | "travels" | "alongside"` — read ONLY through
`characterRoleOf()`. Legacy `useTimeTravel: true` resolves to `"travels"`;
legacy `"meets"` resolves to **`"alongside"`**, not `"travels"`, because those
requests were made with no journey in them and resolving them the other way
would put a lantern into a story a reader has already read.

**One source per story.** `biblicalEvent`, `heroOfFaith` and `biblePassage` are
three columns of one decision, kept apart only because thousands of frozen
requests carry them. `resolveStorySource()` settles it at enqueue and clears
the losers — it runs BEFORE `resolveHeroOfFaith`, because normalising after
`heroId` is stamped would leave that column pointing at somebody the story is
not about. Precedence keys on whether the event RESOLVES, not on whether the
field is filled.

**What the server appends** is named in `shared/storyAppendices.ts`, and
`storyWithoutAppendices()` takes it back off before a story reaches the
universe summariser — otherwise "Ada is invented" is summarised as an event and
a disclaimer becomes canon for the next story in that world.

**Digging deeper** (`server/lib/diggingDeeper.ts`) is a second call, after the
story, never woven into it: a model asked to answer a history question inside a
scene answers it by inventing history. It never throws — a failed job is
retried whole, so an exception would regenerate the whole story for free.

## Quests of the Timekeeper

The universe underneath the `travels` mode. Read
`docs/quests-of-the-timekeeper.md` before touching any of it.

**Two audiences, two homes.** `server/data/lionTails.ts` holds only what the
model may know — the shop, the shelf, the lantern's rules, why the quests
happen — phrased as what is TRUE, never as what is coming. The arc, the
forgotten story, the Lion and the ending are in the doc, for people. A model
told the ending says so in chapter two. When something withheld becomes
showable it moves; it is never in both.

**Composed, not written.** `worldCanon(frame)` and `worldAnchor()` assemble
`KEEPER`, `DEVICE`, `SHOP`, `CANON` and the frame. Do not add a prose block
that re-describes the man or the lantern; edit the field it belongs to. The
rendered section is capped by a test (750 words) because the constraint is
attention, not context — lore that outweighs the account gets written instead
of it.

**A quest is not named after its furniture.** Every quest long enough to be
written in chapters was coming back "The Lantern and the ..." -- four in a
row, across four different framing approaches. The frames were not at fault:
their openings genuinely differ. The title was asked for with **no guidance at
all** (`{ "title": "..." }` on the chaptered path) while the lantern was the
most repeated noun in the story, and the outline handed the model the shape
ready-made by calling its own first chapter "The Lantern and the Trenches".
`questTitleRule()` composes the rule from `DEVICE`, `SHOP` and `KEEPER` --
the three props in every quest, which is the whole test: a title that would
fit any of these stories is not a title for one of them. Applied at both title
sites, gated on `brief.world`, which IS the fact "this is a quest" and is
already on the frozen brief. Ordinary stories get nothing: there is no lantern
in one.

**A quest ends at home, and the last chapter has to be told that it is last.**
Blake reported a four-character quest as "cut off… no resolution, about
halfway through". Nothing was cut off — 4,366 words, `truncated_calls: 0`, and
the reader rendered every one of them. The prompt had told the final chapter
not to finish: `"The story has N chapters of similar length, so do not try to
finish the whole story in this one"` was appended to **every** chapter, and the
chapter prompt never said which chapter it was on at all. Four things now:

- `chapterPositionRule()` (pure, exported) says "part N of M", and on the last
  one drops that sentence for "this is where the story ENDS", with a ceiling of
  1.35× rather than 1.15× because that part carries a scene AND an ending. A
  **cliffhanger** gets the first half only — told it is last so it finishes its
  scene, never told to end the story, which its own premise forbids.
- `questShape()` budgeted part 1 ("the way in and nothing else") and nothing
  for the way home, so the last part had the account, the return and the close
  in one part's words and dropped the half it had least room for. It now names
  the last part too.
- `CANON.ending` said Barnabas "may appear before the journey, during it, or at
  its end", so an outline wrote "Mr Barnabas is waiting **only if** the story
  has brought her back to him" and the chapter took the exit. He **is** there
  when the traveller comes back; "purposefully and never conveniently" now
  governs only his appearances during a journey. Blake's call.
- `StoryBrief.cliffhanger` is carried as a fact, like `soloRetelling` and
  `ensemble`, because the quest shape and the last chapter both read it. An
  older frozen brief is recognised by `CLIFFHANGER_PREMISE` being in its own
  premise — those jobs are in flight across the deploy.

**`tests/fixtures/chapter-prompt-golden.json` captures the ASSEMBLED chapter
prompt**, first, middle and last. The brief goldens could not have caught any
of the above: the defect was in the wrapper around the brief, which no fixture
could see. `buildChapterPrompt()` is pure for that reason. Regenerate with
`UPDATE_GOLDEN=1 npm test -- chapterPrompt` and read the diff.

**Nobody is written out of a story.** At four or more characters the brief caps
a scene at three of them — and the outline read that as licence to delete
people, instructing its own last chapter with "Elijah is waiting nearby, while
Ellie and Lucy are no longer beside Esther". Two of four children vanished a
page from the end, which to a reader is a missing page. The cap now says what
it is *not* about, the outline is told to write what happens rather than the
casting, and the **chapter projection** — which had no cast rule at all, and is
the prompt that writes actual sentences — carries "leave out whoever this part
does not need, silently".

**The word cap is per FRAME, not per brief.** `worldCanon(frame)` renders five
different documents and the cap test measured one of them -- it passed while
`wrong-arrival` rendered at 752 against a ceiling of 750. It now asserts every
frame, which is the "what would this check have done had the thing been
broken" rule applied to the check that was already there.

**It reaches every chapter.** `StoryBrief.world` renders as `THE WORLD THIS
HAPPENS IN` in the full brief and as `world.anchor` in the chapter
projection; `StoryBrief.participationAnchor` carries both modes' "stays on
their mission / does not die / do not change history" lines into every
chapter too. Both are absent on briefs frozen before they existed, and those
render exactly as before.

**There is no stone.** The lantern stays behind with the shop; the traveller
carries nothing; the way opens again on its own. The stone was Blake's idea and
it was his call to drop it, after a real quest made a girl's rock-collection
stone the key that opened the lantern — the only two prompt lines about it
both described a thing that *opens*, and neither said it does not exist before
the first crossing. `DEVICE`'s doc comment records the whole argument.

**Knowing the shop is not knowing the story.** `questFamiliarity()` tells a
returning traveller they know the shop, the man and the lantern — and nothing
said that was all they know, so one arrived in Jericho already knowing where
the spies had come from. `FAR_SIDE_UNKNOWN` (every quest, brief and every
chapter): a traveller arrives knowing nothing of the account they could not
see or be told; what the narrator tells the reader, the traveller learns by
watching or asking. Blake: familiarity "should ONLY pertain to the Timekeeper."

**Four framing approaches, not five.** `someone-else-first` — "evidence that
someone else has been here recently: a name, a date" — twice produced a brass
tag naming the destination. Dropped; a frozen request carrying it resolves to
the fallback deterministically, and old briefs have the frame text baked in.

**Barnabas is rarely surprised, not never.** `KEEPER.who` said "entirely
unsurprised by any of this"; it now says it shows when he is, and that he may
guess where the lantern will open and be wrong. Blake: "things should still
surprise him… he might be able to guess."

**The prologue is a constant.** `server/data/questPrologue.ts` is in every
library, pinned first, and refused by every mutating route through
`server/lib/builtInStories.ts` — the only place that knows its id. It is one
sentence to a line, every line its own paragraph: joined with single newlines
the reader renders it as a poem, and a test holds the shape. It carries the home page picture as its own (`public/images/quest-prologue-cover.webp`, a copy of the bundled `cover.webp`, whose hashed name a constant cannot know), so it has a thumbnail and a picture at the end like any story. Two pictures sit IN its text (`quest-prologue-shop.webp` above "You stared at it.", `quest-prologue-door.webp` above "Barnabas held out the lantern."), anchored by quote through `inText()`, which throws at import if a line moves. They were drawn with the canonical face and world sheet, vetted against the prose, and chosen by Blake — never generated at request time. The gallery strip is hidden for built-in stories, whose pictures the server refuses to change. The series name
is `QUEST_SERIES_TITLE` in `shared/quests.ts`, because the card and the
prologue heading both print it.

**The world sheet has no stone, and a lion's shadow the prompt never names.**
Redrawn panels (shop sign mounted on the wall, books and hidden biblical
objects inside, the back wall with a faint lion's shadow in place of the old
stone panel), each chosen by Blake. `WORLD_SHEET_PANELS` describes the shadow
only as "a large soft shadow" and names none of the hidden objects; a test
holds that neither "stone" nor "lion" is in it. The same objects are on the story's shelf as bare nouns (`SHOP.hidden`,
"Half-hidden: …"), graded like the rest of it, so a story may notice one;
the world cap went 1000 → 1010 for them. The lion's shadow is not in any story
prompt. See the doc's "Hidden in the shop's art".

**The Lion is a name, not a character, in the model canon.** `CANON.lion` lets
Barnabas say "I have no control over this" and, pressed, "The great Lion knows
no bounds" — once — and forbids the Lion appearing at all. He belongs to the
guided Quests page, which does not exist yet. The prologue's last lines are
fixed text and keep him. **His shadow is allowed, and only his shadow**
(Blake, after it went onto the world sheet): sometimes, when the lantern
flares, a faint lion's shadow crosses the wall with nothing to cast it, and
nobody explains it. A traveller may remark on it only at
`LION_SHADOW_VISITS` (5) quests or more, through `questFamiliarity()`, and is
told "very rarely -- not in most stories" — a line in every veteran's brief is
otherwise a line in every veteran's story. The world cap stayed at 1010: the
Lion sentence was rewritten shorter rather than the cap raised again.

## The library

My Stories is four folders, every story one card, every universe one card.

- **The stories are a query** (`client/src/hooks/use-stories.ts`). They were
  a raw `useEffect` into `useState`, which meant `use-universes`' `moveStory`
  and `remove` -- which already invalidate `["/api/stories"]` -- were talking
  to nobody. The hook has no job awareness: `use-story-jobs.tsx` invalidates
  both `["/api/stories"]` and `["/api/universes"]` when a job finishes, and a
  second mechanism for the same fact is how this codebase grew six model
  lists.
- **`STORY_FOLDERS`** (`client/src/lib/storyFolders.ts`) is one table for the
  strip, the counts and the contents. There were two copies -- a switch and a
  filter per trigger -- and a tab the switch had not heard of silently showed
  the temporary list.
- **The folder strip is one component**, `FolderTabs` -- see "Tab strips"
  below. The tints are the sheet's own `--tab-*` tokens, written out in
  full; `tests/theme.test.ts` reads every `bg-tab-*` / `border-t-tab-*`
  literal in `client/src` and fails on one the palettes do not define --
  otherwise a typo is a transparent tab and nothing says so.
- **`StoryCard`** is the one card. Its two `AlertDialog`s are SIBLINGS of the
  card, never children: the card navigates on click, and React events follow
  the React tree, so a dialog inside it would open the story on Cancel.
  "Remove from this universe" and "Delete" are two buttons, two dialogs, two
  sentences that cannot be mistaken for each other.
- **A universe's page** (`/universes/:id`, `client/src/pages/Universe.tsx`)
  selects from the list query; there is no `GET /api/universes/:id`. Its
  story count is derived from the stories the library can see, never
  `universe.storyCount` -- the server counts expired rows the library hides,
  and "3 stories" over a list of 2 looks like a bug in the list.
- **`builtIn`, `universeId` and `heroId`** on `savedStorySchema` are
  server-owned: the server grafts them onto rows; nothing reads them from a
  request. **`rowToSavedStory()` in `db-storage.ts` is the one place the
  columns win over the blob.** There were twenty-one inline copies of that
  spread, and that is how `hero_id` was written on every hero story and
  visible to nobody: the code that set the column looked correct, and the
  reader was looking in the blob.
- **A multi-segment query key needs its own `queryFn`.** The default
  fetcher requests `queryKey[0]` and nothing else. The hero dialog's key
  `['/api/heroes', id, 'stories']` fetched the whole heroes list for months,
  destructured two empty arrays from it, and said "No Stories Yet" with no
  error anywhere.
- **Stories are linked back to what they are about.** A character's sheet
  has a Stories tab (the seventh; `--tab-stories`, only when editing) listing
  every story whose cast -- read through `characterIdsOf()` -- includes it;
  a hero's dialog lists the user's stories about them. Both are `StoryRow`s,
  not `StoryCard`s: a card navigates on click and owns dialogs, and these sit
  inside an open Dialog over a form.

## The guide ("How to use")

Blake: *"an instructional welcome page/popup. Onboarding."* A dialog with four
folder tabs; the Create a Story tab is an upside-down tree, root at the top,
Quests its deepest branch. Every item says why a control exists, with a phone
screenshot of it in place and the control ringed. Reachable from the **top
left** of Create a Story, Characters, My Stories and the reader, and from
Settings; it opens itself **once per account** (`user_settings.guide_seen_at`,
mirrored in localStorage only to stop it flashing open before that answers).

- **THE GUIDE IS PART OF A CHANGE, NOT A FOLLOW-UP.** Anything that adds,
  moves, renames or removes a control -- or changes what one does -- updates
  `shared/guide.ts` in the SAME change: a new node with its `why`, a rewritten
  `why` where the words went stale, a node deleted where the feature went, and
  a re-capture of the plates it appears on. Blake, 2026-09-16, adding the
  picture dialog: *"we are always checking to update the How to use with new
  possible info or remove old info as the app evolves."* A guide that
  confidently describes a button that no longer does that is worse than no
  guide, and **nothing automated can catch prose that has gone out of date** --
  the marker test only catches a control that moved or vanished. The first case
  was `picking`, whose words said Draw this drew the picture; it now asks
  first.
- **`shared/guide.ts` is the one table**: tabs, scenes, plates, nodes, and how
  to photograph each. The dialog and `scripts/capture-guide.ts` read the same
  list, so a node cannot point at a screenshot nobody took.
- **Search takes you to an item; it never answers.** Blake: it *"should
  basically just bring the user to the right location for a feature that they
  are looking for."* `searchGuide()` (`shared/guideSearch.ts`, pure) ranks in
  tiers — title, then `GUIDE_KEYWORDS`, then the prose — and the words of a
  query are an AND, so "picture cost" is one item rather than everything about
  pictures. **No regex is built from the query**; it is index arithmetic on a
  lowercased haystack, as `containsWholeWord` and `lookBook`'s `mentions` are.
  Only word STARTS match (a substring tier let "rint" find Print and Save), and
  a trailing "s" is stemmed so a plural works either way round.
  - **`GUIDE_KEYWORDS` is what people TYPE**, keyed by `GuideNodeId` so a typo
    or a deleted node is a compile error: `pdf` → Print and Save, `dark mode` →
    Colours, `sequel` → Part of a series, `time travel` → the quest. A test
    holds that every word still finds the item it was added for, and another
    that every item is reachable by its own title.
  - **Picking a result must open AND scroll**, and neither was free.
    `GuideTree` seeded its open item from `openNode` once, with no effect, so
    asking for an item while the dialog was already on that tab did nothing;
    `use-guide`'s `jump` counter is what makes the same search twice land
    twice. The scroll sets `scrollTop` against `[data-guide-scroll]`'s own
    rect rather than calling `scrollIntoView`, which drags the card sideways
    (CharacterForm's picker documents that at length).
  - **Escape belongs to the dialog.** Radix hears it on the document in the
    CAPTURE phase, so nothing in the input can stop it — measured, a search
    for something the guide does not have closed the whole guide. The query
    lives in `GuideDialog` and `onEscapeKeyDown` clears it instead.
  - `onOpenAutoFocus` is prevented for the same reason as PictureDialog: the
    box is the first tabbable thing, the guide opens itself once per account,
    and a phone keyboard over the guide is not a welcome.
- **Scene → plate → node.** A SCENE is a state worth getting into (one builder
  each in the script, a total Record so a missing one will not compile); a
  PLATE is one photograph taken in it; a NODE is one thing explained. Several
  nodes share a plate -- the reader's bar has seven, and seven photographs of
  one toolbar is seven times the bytes.
- **`data-guide="<marker>"` is the joint, and the staleness gate.** Every
  control the guide names carries one, and `tests/guide.test.ts` fails if a
  marker is missing or appears twice -- the failure that actually misleads a
  parent is a ring over whatever moved into that place. Labels here get
  rewritten constantly, so a text selector would be that failure waiting.
  `FormSection`, `FolderTabs` and `SourcePicker` take it as a `guide` prop,
  which is what lets one component mean two things (the source picker is
  "Where, or who?" on one tab and "What do you want to dig into?" on the
  other). Never interpolate one: the test reads literals.
- **The ring is drawn by the app, not painted into the file.**
  `shared/guideShots.ts` (GENERATED) holds each plate's size and each control's
  box as FRACTIONS of it, so the same webp rings correctly at 340px and 600px
  and in all four palettes. An **outline**, not `ring-*`: Tailwind's ring is a
  box-shadow and the scrim (`0 0 0 9999px rgba(0,0,0,0.45)`, inline) overwrote
  it -- measured, the picture came back dimmed with no red anywhere. A box
  covering the whole plate draws nothing: the picture is the subject.
- **`grid-cols-1` on the dialog is load-bearing.** `DialogContent` is a grid,
  and its implicit column is sized by content -- the 780px plates grew the
  dialog to 780px inside a 390px phone. The dialog is also **anchored**
  (`top-[4vh] translate-y-0`), the tabbed-dialog rule.
- **Re-run the capture when Create a Story, the character sheet or the reader
  changes.** It is dev-only and never in CI (`verify-heroes.ts`'s reasoning):

  ```bash
  . /root/.claude/tools/env.sh        # playwright-core + sharp are BORROWED
  ./scripts/dev-stack.sh up && ./scripts/dev-stack.sh admin guide-demo
  npx tsx scripts/capture-guide.ts [--base http://127.0.0.1:5250] [--only reader-bar]
  ```

  The `--only` merge reads the existing manifest back as the JSON it is; it
  used to "repair" it first, which quoted the `23:` inside a timestamp, threw,
  and silently dropped the other 29 plates. A merge that cannot read what it is
  merging into now stops.

  It uses its **own account** (`guide-demo`) holding only the four demo people
  from `scripts/demoPeople.ts`, and **aborts if anyone else is in it**: these
  images ship, so a real family must never be in one. It refuses any base but
  a local app, needs `canIllustrate` for the reader's "Make a picture", turns
  Parent Mode on for the run, and saves a hand-written demo story
  (`scripts/guideDemoStory.ts`) rather than generating one -- the built-in
  prologue hides Favourite, Edit and the picture button, which are exactly
  what the Reading tab must show. A ring outside its plate is a hard failure,
  which is how three plates came to be split.
- Images live in `public/images/guide/` -- **not** under
  `public/images/stories`, which the `story_images` volume mounts over. About
  1.5MB of webp for 32 plates; a test holds 120KB a plate and 1.6MB the
  directory.

## Tab strips

Two, and the second is the template for any new one.

- **`FolderTabs`** (`client/src/components/FolderTabs.tsx`) -- coloured
  folder tabs, used by the character sheet (seven) and My Stories (four).
  Pass `{ value, label, tint, edge, badge? }` and keep the `Tabs` value and
  panels yourself. **Every tab is always on screen**: under `md` the list is
  a two-column grid, as many rows as it takes; from `md` up it is one row
  that joins the panel exactly. It used to be one row that scrolled at every
  width, with arrows, and on a phone three tabs of seven were visible -- to
  anyone who did not already know the app, the other four did not exist.
  The join is drawn once, under the last row, so on the grid only a tab on
  that row touches the panel; that trade was chosen over hiding tabs.
- **Heroes of the Faith** keeps its own four-icon grid (`grid-cols-4`, an icon
  each, labels from `sm` up). Four tabs that each have an icon fit one row
  at any width. It is not the template: it only works when every tab has an
  obvious icon and there are few enough to share a row on a phone.

## Parent Mode

A fact about the SESSION, decided by one predicate: `parentModeActive()` in
`shared/parentMode.ts`, read by `requireParentMode`, by the forced-summary
check in `routes.ts`, and by the status route the client polls. It used to
be written twice on the server and derived a third time on the client from
`expiresAt`; "until I turn it off" is not an expiry, and the copies would
have disagreed about it.

- **Two ways on, chosen at the password prompt each time**: the 30-minute
  window (`PARENT_MODE_WINDOW_MS`), or `keep` — `parentModeIndefinite` on
  the session, no expiry. Never a setting: a forgotten setting on a shared
  device is Parent Mode for the children.
- **"Indefinite" is bounded by the login cookie**, which is not rolling: it
  lapses a week after the session was last written. The copy says "until
  you turn it off or sign out". Making sessions rolling is an open decision
  on the roadmap, not something to flip while passing.
- **Off is a route**, `POST /api/auth/parent-mode-off`. Before it existed
  the client's disable cleared React state and the next status poll turned
  Parent Mode back on.
- Parent Mode gates: custom character fields, a universe's summary, canon,
  **name**, **a story's title and text** (`PATCH /api/stories/:id`), and
  **creating a share link** (`POST /api/stories/:id/share`). Stopping a share
  is deliberately NOT gated.
- **Editing is offered, then unlocked in place.** The story Edit button (and
  the "Make it yours" invitation under the AI note) shows on every story you
  own; with Parent Mode off it opens `ParentModeUnlockDialog` — the one
  password prompt, shared with the Settings switch — then the editor. A save
  refused with `parent_mode_required` (it lapsed mid-edit) re-opens the
  prompt and keeps the draft. The PATCH keeps `requireParentMode`.

## Sharing a story by link

Blake: *"a link that would allow a person to view the story without having an
account… and attached to this share page an invitation for them to create
their own stories."* `/s/:token` is public; everything else about a story is
not.

- **The public response is an allow-list, never the row.**
  `sharedStoryView()` in `shared/sharedStory.ts`, and
  `tests/sharedStory.test.ts` asserts its exact keys. A saved story carries
  `debugData` (every prompt and raw model reply), `request` (the children),
  and picture prompts written from the character sheet's APPEARANCE fields —
  "How they look, for pictures" reaches no story text by design, so publishing
  a prompt would publish a child's details the story never mentions. Pictures
  go out rebuilt key by key with `prompt: ""`; spreading one leaks. Adding a
  field there is a decision to publish it.
- **`story_shares` is its own table** (migration 0009): token PK (16 CSPRNG
  bytes, base64url, 22 chars — `SHARE_TOKEN_PATTERN`), `story_id` UNIQUE and
  CASCADE, so one link per story and a deleted story takes its link with it.
  Not a column on `user_stories`, so `rowToSavedStory()` is untouched.
  `createShare` is one statement: it SELECTs from the owner's own row (no
  link to someone else's story) and `ON CONFLICT … DO UPDATE` returns the
  existing token (two taps, one link). Stopping and sharing again mints a new
  token, so a stopped link stays dead.
- **Visibility is the library's rule**, not `getStoryById`'s (which has none):
  `is_favorite OR expires_at IS NULL OR expires_at > NOW()`. A lapsed story's
  link dies with it. One identical 404 for malformed, unknown, stopped and
  lapsed, so the route never confirms a story exists. `no-store` (a stopped
  link stops now) and `X-Robots-Tag: noindex` (a child's story is not for
  search engines).
- **The page is the ordinary reader**: `StoryDisplay` with no `storyId` (the
  read-only path) plus `shared`, which hides Favourite and Share. App.tsx's
  `bareReader` includes `/s/` — WITH the slash, or `/saved-stories` and
  `/settings` match. The invitation sits after the story's own ending, and its
  colours fall back to the theme because `--reader-*` only exist while a
  reader is mounted (the "no longer shared" page has none).
- **Link previews are server-rendered for `/s/:token` only**, in
  `server/static.ts` via `renderSharePage()` (`server/lib/pageMeta.ts`, pure):
  remove the generic tags, append the story's title, first sentence and
  ABSOLUTE picture URL, all HTML-escaped (a title is model- or parent-written
  text in raw HTML). URLs come from `req.protocol` + the `Host` header —
  SWAG's proxy.conf sets `Host $host` and `X-Forwarded-Proto`, and
  `trust proxy` is on. Not `X-Forwarded-Host`, which SWAG sends with `:443`.
  Production only; dev serves the generic card. `index.html`'s own
  `og:image` is absolute too — the spec wants a full URL.

## The AI note and Further reading

**Every AI-written story says so.** `AI_NOTE` (`shared/aiNote.ts`): "Written
with AI. … AI can get things wrong …". Rendered by the READER (`StoryExtras`),
the print path (`storyToPrintHtml` `aiNote`) and the .txt download — never
written into `story.content` — so stories already in a library have it, the
universe summariser cannot read it as an event, and a parent edit cannot remove
it. Not on a built-in story (a person wrote it); `sharedStoryView` carries
`builtIn` so a shared prologue shows none either.

**Further reading is built from checked data, never from a model.** The story
calls cannot browse, and a model asked for sources from memory invents books
and links. `furtherReadingFor()` (`shared/furtherReading.ts`, pure) turns the
account a story was written against into links: the event's passage and key
verse and the request's own passage on Bible Gateway (WEB, the translation the
app's verses were fetched in), a hero's Wikipedia article, verse and up to
three key-event references, and the books on their profile (unlinked — the
data has no URLs and none is invented). Capped at eight, then the two general
links every story always had. **Derived when served**
(`furtherReadingForRequest` on `GET /api/stories/:id` and `/api/shared/:token`),
not stored, so old stories get it and a book added to a hero shows everywhere.
The fixed "For Further Learning" block still goes into new stories' text and
is the fallback when a payload has no list (the just-generated view). Links
were fetched and read: the pages are the right passages and people.
Blake chose this over live web search (`responses` + a search tool, never
used here), knowing it puts verification on whoever adds people.

## Poems and moral stories are the free modes

Only a regular story is set somewhere real. `storyTypeFitsRole()`
(`shared/storyTypes.ts`, with `STORY_TYPE_OPTIONS` — the select's words, one
definition) is read by the form, which disables Poem/Moral while "Set it
somewhere real" is on and disables that switch for a poem or moral story,
and by the generate route, which refuses the pair with
`story_type_needs_regular`. Read the role through `characterRoleOf`. A poem
quest used to generate and silently lose the quest shape (decisions.md 30).
The copy frames every story as a first draft to change; keep new copy that
way, and keep the factual notes ("About this story", the AI note) factual.

## Editing what the app wrote

- **A story edit is a leaf merge, never read-mutate-write.** `editStory` is
  one UPDATE: `story_data || jsonb_build_object('story', COALESCE(...) ||
  $patch, 'editLog', COALESCE(...) || $entry)`. No `jsonb_set` — into a
  missing key it returns NULL and erases the row (`updateStoryHeroId`'s
  warning) — and nothing else in `story` is touched. Nothing validates
  `story_data` on write, so the write must be unable to break the
  five-questions / `moralOutcome` invariants by construction.
- **The appendices survive.** "About this story" (the disclaimer that must
  always be present) and "Digging deeper" live inside `content`. The editor
  edits the BODY; the route re-attaches whatever the stored content carried
  via `splitAppendices()`. A parent cannot delete the disclaimer.
- **The log is one module**, `shared/editLog.ts`: the entry type, the label
  `EDITED_LABEL` ("Edited" — it was "Edited by a parent"; the stored
  `by: "parent"` is unchanged), `lastEditedAt()`. Stories keep it in
  `story_data.editLog`; universes in `story_universes.edit_log` (migration
  0008), appended by `renameUniverse` and `editSummary`. `summary_edited_at`
  stays — it clears staleness, a different job. The log never carries a
  name: reader-visible provenance is for everyone, including a child.
- **Story chips** (`client/src/lib/storyChips.ts`) are what a card says about
  a story, pure and tested: the source, the cast by name, the way in (via
  `ROLE_OPTIONS`, never a second spelling), the length, "Edited". The old details row read fields a modern request does not carry.
- **"Add to this Universe"** sends `universeId` on the request — a field the
  server always resolved and no client ever sent. The worker's extraction
  condition includes it, or a story would be written against a world's
  memory and never added to it. Explicit id wins in
  `resolveUniverseForRequest`, so `GenerateStory` sends it only when not
  continuing.
