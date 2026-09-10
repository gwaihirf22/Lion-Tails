# Lion Tails

**A way to learn the key events and people of Scripture and church history by
reading good stories about them.** That is the point of the app: a child
remembers Corrie ten Boom hiding her neighbours far longer than they remember a
paragraph about her, and the same is true of the flood, the exodus and the
resurrection.

So the stories are personalised — the reader picks the characters, and can put
themselves or their children in — but the accounts underneath are real, anchored
to written source material rather than to whatever the model recalls. Alongside
them: profiles of eighty people that can be read with the AI switched off, a
song/chord library, character management, and image analysis.

Stories are generated with an OpenAI or self-hosted model depending on the
user's tier (see [Model tiers](#model-tiers)); illustrations with `gpt-image-2`.

## Stack

| | |
|---|---|
| Server | Express 4 + TypeScript (ESM) |
| Client | React 18 + Vite SPA (Wouter, TanStack Query, Tailwind + Radix/shadcn) |
| Database | PostgreSQL via Drizzle ORM (`pg` driver) |
| Auth | Passport local strategy + `express-session`, Postgres-backed session store |

The server and the client are served by a **single process on a single port**:
in development Vite runs as middleware with HMR, and in production the
pre-built client is served from `dist/public`.

## Local development

```bash
npm ci
cp .env.example .env      # then fill in the values
npm run dev               # http://localhost:5000
```

A database is optional for a quick look: without `DATABASE_URL` the app falls
back to in-memory storage. **Nothing persists across a restart in that mode**,
so use a real Postgres for anything real:

```bash
docker run -d --name liontails-pg -p 5432:5432 \
  -e POSTGRES_DB=liontails -e POSTGRES_USER=liontails -e POSTGRES_PASSWORD=liontails \
  postgres:15
npm run db:migrate        # applies migrations to create the tables
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (`server/dev.ts`, Vite middleware + HMR) |
| `npm run build` | Build client to `dist/public` and server to `dist/prod.js` |
| `npm start` | Run the production build |
| `npm run check` | TypeScript typecheck |
| `npm run db:generate` | Generate a migration from `shared/schema.ts` (dev only; needs drizzle-kit) |
| `npm run db:migrate` | Apply pending migrations |
| `npm test` | Unit tests (vitest, no network — see [Tests](#tests)) |
| `npm run test:watch` | The same, in watch mode |
| `npm run lint` | ESLint — React Rules of Hooks only, deliberately narrow |
| `npx tsx scripts/verify-heroes.ts [name]` | Check the Heroes of Faith against Wikipedia, Wikidata and bible-api.com. **Needs network**, so it is run by hand, not in CI |
| `./scripts/dev-stack.sh up` | The whole dev stack: database, migrations, app, seeded account. See [The dev server](#the-dev-server) |

### Why there are two server entrypoints

`server/prod.ts` is the production entrypoint and **must never import
`server/vite.ts`**. The build bundles with `esbuild --packages=external`, so
anything reachable from the entry module has to exist in `node_modules` at
runtime — and pulling Vite in would make the runtime image depend on the whole
devDependency tree. `server/dev.ts` is the only file that imports Vite.
CI enforces this with a grep over `dist/prod.js`.

Shared setup lives in `server/index.ts` (`createApp()` / `startServer()`);
`server/static.ts` holds the Vite-free static file serving.

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

## Environment variables

See `.env.example`. Summary:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | recommended | Postgres connection string. Unset ⇒ in-memory storage, no persistence. |
| `PORT` | no | Defaults to `5000`. |
| `FRONTEND_URL` | production | Base URL used in verification / password-reset email links. |
| `SESSION_SECRET` | **yes in prod** | App refuses to start without it when `NODE_ENV=production`. |
| `OPENAI_API_KEY` | for AI features | Users can also supply their own key in app settings. |
| `OLLAMA_BASE_URL` | no | Self-hosted Ollama endpoint for the free local tier. Defaults to `http://ollama:11434/v1`. Use the container name, not an IP. |
| `EMAIL_*` | no | **Currently unused.** See [Email](#email) — the live auth path sends no mail, so setting these changes nothing today. |

## Schema and migrations

`shared/schema.ts` is the single source of truth for every table, including
`session` (owned by connect-pg-simple, which is configured with
`createTableIfMissing: false` so migrations own it instead).

Change the schema by editing that file, then `npm run db:generate` and commit
the generated SQL under `migrations/`. `scripts/migrate.js` applies them at
container start using `drizzle-orm`'s migrator — note that **drizzle-kit is a
devDependency and is not in the runtime image**, which is why generation is a
development step and only application happens at boot.

At startup `server/db.ts` verifies every declared table against
`information_schema`, deriving the expectation from Drizzle's own
`getTableColumns()` so there is no second list to drift. A mismatch is reported
by `/api/health` as a 503.

## Model tiers

Which model a request may use is decided by `server/lib/modelPolicy.ts`, and the
gate is about **who pays** rather than about roles:

| Tier | Models | Available to |
|---|---|---|
| local | `gpt-oss:20b`, `nemotron-3-nano:4b` | everyone — free, runs on the self-hosted Ollama, needs no key |
| economy | `gpt-5.6-luna` (default), `gpt-4o-mini` | everyone — billed to the server owner's key |
| premium | `gpt-5.6-terra`, `gpt-6-astra`, `gpt-4o`, `gpt-image-2` | admins, or **any user who has supplied their own API key** |

That last rule needs no role check: you may use expensive models if you are
paying for them.

`gpt-4o-mini` and `gpt-4o` are kept selectable rather than removed: thousands
of existing stories were written on them and a `user_settings` row still naming
one has to keep resolving.

**The GPT-5.6 generation takes a different request shape**, and this is not
cosmetic — it is per-model, so it belongs in the catalogue rather than at the
call site. Those models reject `max_tokens` (they want
`max_completion_tokens`) and reject any `temperature` other than the default,
including the default sent explicitly. `tokenLimitFor()` and
`temperatureFor()` return the right fragment to spread into a request; there
are nine call sites and none of them should decide this for itself.

`dall-e-3` **was shut down on 2026-05-12**, not merely deprecated. It remained
the image default for four months afterwards, so every illustration attempt by
an entitled user failed — silently, because `generateStoryImage` catches the
error and returns undefined so a story is never lost over a missing picture.
The reader simply showed the stock lion. Nothing logged; nothing alerted.

Authorisation is resolved **at use, not only at selection**. The stored
preference is a request, never a permission — a user who selects a premium
model with their own key and then deletes that key is downgraded at generation
time rather than silently billing the owner.

`GET /api/settings/models` returns the models a given user may select, with
tier and quality warnings. **The settings UI does not yet call it** and offers
its own hardcoded list, four entries of which are rejected with a 403 — see
`docs/decisions.md`.

Vision and image generation have separate allowlists, so a chat-only model
cannot leak into an image call. Illustration is skipped with a logged reason,
rather than failing the story, when the user is not entitled to it.

## Series and continuity

A story can be one of a set. Two flags on Create Story:

- **"I might write more stories in this world"** — opt-in, because it buys one
  extra model call after the story is written. A continuation implies it without
  the box, since a story continued once is likely to be continued again.
- **"Leave it on a cliffhanger"** — ends without resolving. It has to *suppress*
  `moralOutcome`, which is picked at random when the user does not choose one and
  instructs the story to resolve; a retelling already suppresses it for the same
  reason. It still insists the scene finishes: an unresolved story is not an
  unfinished sentence.

### What a world remembers

After a series story, a background job reads it and asks **"suppose someone
writes the next story — what must be noted so they do not contradict this one?"**
It records three kinds of thing in `story_universes.world_state`, and refreshes
the universe summary in the same call.

The three kinds are **graded**, and that grading is the whole design — see
`docs/decisions.md` §24:

```
People who exist … but none of them has to appear:   identity, not obligation
Already true. Do not contradict any of this:         hard
Threads left open. You MAY pick ONE up, or ignore    explicitly optional
  all of them — possibilities, not instructions:
```

A model handed one undifferentiated list treats it as a checklist and writes the
same story again. Saying out loud which parts it may ignore is what lets the next
story be different — and it is measurably model-dependent: the economy OpenAI
model honours it, `gpt-oss:20b` does not.

Entries are **revised**, not only appended: someone falls ill, someone leaves. A
closed entry is kept rather than deleted, so a later extraction can see a thread
was already tied off instead of proposing it again.

There is no "make summary" button any more, and no staleness badge. Every story
in a series rewrites both, so there is nothing to press and nothing that can fall
behind.

## Characters

Up to **8 per story**, ordered — index 0 is the protagonist and gets the full
description in the prompt; everyone else gets a name and at most two facts. Eight
characters at parity would be ~48 facts, which is the character-sheet tour at
scale.

`characterIds` is the field; `characterId` is legacy and read **only** through
`characterIdsOf()`, which is the one place that knows the two are the same fact.
A test asserts the legacy name appears nowhere else in the codebase.

On a continuation the cast carries over from the parent, and removing an
inherited character asks first.

## Aiming a historical story

A Hero of Faith is a whole life, and asked for "a story about Corrie ten Boom" a
model returns a summary of all of it. Picking a hero reveals a **focus** select
built from that hero's own `keyEvents` — which every hero already carries and
`/api/heroes` already returns, so it costs no model call and no new content.
"Surprise me" is settled server-side at enqueue and written onto the request, so
the same request replays to the same story.

Biblical *events* deliberately have no focus control: a `biblicalEvents` entry is
one account with no sub-events, and only 8 of the 15 slugs have a matching hero
to borrow from — the rest are `creation`, `nativity`, `crucifixion`, where "which
part of their life" is not a sensible question.

## Quests of the Timekeeper

Every library begins with the same story: **The Shop That Wasn't There**, the
prologue to *Quests of the Timekeeper*. It is a constant in
`server/data/questPrologue.ts`, not a row — in every account, pinned first,
not deletable, revised by editing the file. `server/lib/builtInStories.ts`
splices it into `GET /api/stories` and refuses every route that would change
it.

A story on the Original tab can be **A Quest with the Timekeeper**: the
reader's character starts here and now, and Mr Barnabas's lantern takes them
into a real account. What the model knows about that world lives in
`server/data/lionTails.ts` — the shop, the shelf, the lantern's rules, why
the quests happen — and reaches the full brief as its own section and every
chapter as a short anchor. What the model is *not* told — the arc, the
forgotten story, the Lion — is in `docs/quests-of-the-timekeeper.md`, for
people. A model told the ending says so in chapter two.

## Heroes of Faith

Eighty hand-written profiles in `server/data/heroes/`, split into **two
collections** that the page shows as two tabs:

| Collection | Count | Grouped by |
|---|---|---|
| `historical` | 41 | era — early church, medieval, reformers, puritans, awakening, missionaries, modern |
| `biblical` | 39 | where they sit in the story — beginnings, patriarchs, exodus, judges & kings, prophets, exile, gospels, first Christians |

They are two collections rather than one list on purpose. What is known about
Moses comes from a text the reader treats as revelation; what is known about
Calvin comes from letters and council minutes. Those are not the same kind of
claim, and one list would quietly suggest they were.

Each entry carries a 250–350 word biography, key events, a quote, tags, an
English Wikipedia **article title** (not a URL — the UI builds the link, and
the name alone is ambiguous: "Jonathan Edwards" is a triple jumper before he is
a theologian), and `complications` where a figure did something significant
enough to state plainly. **The page works with the AI switched off**; that is
the point of writing them out rather than generating them.

Two rules specific to the biblical collection:

- **Events are located by chapter and verse, never by year.** Dating Abraham is
  an unsettled scholarly argument, and "c. 2000 BC" on a children's page states
  as fact something that is not one.
- **Life dates are estimates and are written as estimates**, carrying `c.` or
  `fl.`, with the page saying so under the dates. A handful genuinely are fixed
  by evidence outside Scripture — Josiah's death at Megiddo in 609 BC is tied to
  the Babylonian Chronicle — and those are listed by name in
  `tests/heroes.test.ts` with the reason. Adding a precise date means adding it
  there. Adam, Eve and Noah have no dates at all, and the page says
  "Not datable" rather than inventing a range.

`server/seed.ts` upserts every hero on every boot, keyed on the slug, and
retires superseded rows. Ids are **slugs, not uuids**: they were `uuidv4()` at
module load, so hero identity changed with every process start and the seed had
nothing stable to upsert against.

### Verifying them

```bash
npx tsx scripts/verify-heroes.ts              # everything (slow — it is polite to two free APIs)
npx tsx scripts/verify-heroes.ts bible-ruth   # one, by id or name
```

For church-history figures it confirms the article exists, then compares birth
and death years against **both** Wikidata and Wikipedia's own one-line
description, and checks every key-event year against the article text. For
biblical figures it checks that every scripture reference resolves against
bible-api.com — "Genesis 55:3" reads exactly like a real reference, and is the
sort of error a children's Bible resource must not ship.

It has caught real content errors: Polycarp meeting Bishop Anicetus three years
before Anicetus was bishop, an invented date for Patrick's *Letter to
Coroticus*, Jan Hus's birth year, and Judson credited with a dictionary he only
half-finished before he died.

It is **not** in CI, deliberately: it depends on two free APIs that throttle,
and a gate that fails for reasons unrelated to the change is a gate people
learn to ignore. Two sources are required to convict — Wikidata and Wikipedia
genuinely disagree (Jim Elliot is born 1927 on one and 1926 on the other), so a
single dissenting source is reported as a warning, not a failure.

## Tests

```bash
npm test
```

Vitest, Node environment, **no network and no database**. Coverage is
deliberately narrow: the pure functions with a history of shipping bugs.

| File | What it guards |
|---|---|
| `tests/storyContent.test.ts` | The story parser. The path it replaced split on whitespace and re-joined with spaces, annihilating every newline — which turned prose into one wall of text and destroyed poems outright. Also that print HTML escapes every text node, replacing two `content.replace(/\n/g, "<br>")` injection sites. |
| `tests/modelPolicy.test.ts` | Per-model request shape and entitlement. `gpt-5.6-luna` is the economy default, so the `max_tokens` and `temperature` rejections broke generation for **every user without their own key**. |
| `tests/heroes.test.ts` | Eighty hand-written profiles: duplicate slugs (which make the seed silently drop a person), groups from the wrong collection's list, a Wikipedia URL where an article title belongs, a biblical date written as settled fact. |
| `tests/theme.test.ts` | Contrast, computed from `theme.css` itself, for every token pair in all four palettes — plus that every element painting `bg-accent` also sets `text-accent-foreground`. Both failures it guards were invisible in Paper and unreadable in Night. |
| `tests/focusMode.test.ts` | What may interrupt the reader's focus mode. Mouse movement across the page and taps must not; reaching the top strip and scrolling up must. |
| `tests/storyBrief.test.ts` | The prompt. **Golden strings** assert that a request with no cast renders byte-identically to before multi-character shipped — which is what makes "backward compatible" a check rather than a claim — and one case captures the Lion Tails canon so a change to it is read rather than felt. Plus the cast weighting, the cliffhanger, the three continuity tiers, and that the legacy `characterId` appears nowhere it should not. |
| `tests/worldState.test.ts` | What a world remembers: superseding an entry rather than duplicating it, closing rather than deleting, and staying inside the cap by dropping closed entries first. |

`vitest.config.ts` is separate from `vite.config.ts` on purpose —
`vite.config.ts` sets `root: client/`, which would hide every test under
`server/` and `shared/` from the runner.

What is **not** covered, and why: there is no component, route or database
test, and no headless browser in the deployment container. The reader's visual
behaviour is checked by the CSS-bundle greps in CI and by a short manual
matrix; the schema is checked at startup by `verifyOrmSchema()` and in CI
against a real Postgres; hero content is checked by `verify-heroes.ts` against
live sources.

## The story reader

`/story` is an e-reader, and the reader owns the whole viewport there —
`App.tsx` drops the app background, the overlay and the content card on that
route rather than fighting inline styles with `!important`.

Four **independent** axes, stored per account in `user_settings` and mirrored
to `localStorage` so the first paint is already correct:

| Axis | Values | Controls |
|---|---|---|
| Palette | `paper` `sepia` `night` `contrast` | colour only |
| Font | `literata` `ebgaramond` `atkinson` `lexend` `system` | family only |
| Typeset | `classic` `plain` | drop cap, indent vs spacing, scene-break ornament |
| Size | step 0–6 | one variable |

Independent because the old system had one axis — eight bundled "themes" —
doing four jobs badly. Splitting them is what makes "turn the classical feel
off" a single switch instead of a colour change nobody asked for. Composition
costs 4 + 5 + 2 = 11 CSS rules, not a cross product.

Body text clears WCAG **AAA (7:1)** in all four palettes. Night uses `#C9CCD1`
rather than white, because pure white on near-black causes halation — the exact
complaint the palette exists to fix.

Two things in `client/src/components/reader/reader.css` are load-bearing and
easy to "tidy" into breakage:

- **It is plain CSS, not Tailwind utilities.** `::first-letter`, `p + p`,
  `::before` ornaments and verse hanging indents are awkward-to-impossible as
  utilities — and the bug that caused this rewrite was a Tailwind class built
  by string interpolation, which the JIT scanner never sees. CI greps the built
  stylesheet to prove the rules shipped.
- **`font-size` and `max-width: 66ch` sit on the same element.** `ch` resolves
  against that element's own computed font-size, so characters per line stays
  constant across all seven size steps *and* self-corrects across the five
  fonts with no per-font tuning.

### Focus mode

Fades everything but the story — header, footer, toolbar and the extras block —
to `opacity: 0` without collapsing them, so nothing reflows.

**Almost nothing is allowed to bring the chrome back**, and that is the whole
design. Revealing on any pointer movement and any tap, which is what it did
first, means a hand resting on a trackpad or a finger near the screen keeps
undoing the feature. There are two gestures, one per input type:

| Input | Gesture |
|---|---|
| Mouse | move into the top 80px, where the (sticky) toolbar already is |
| Touch | scroll **up** — 40px accumulated, reset by any downward movement |

Scrolling down never reveals, because scrolling down is reading. A tap never
reveals, because a tap is how you turn a page. Escape leaves focus mode
entirely, and `focusin` always reveals, because keyboard focus must never land
on something invisible.

Faded chrome is `pointer-events: none` — an invisible toolbar must not swallow
taps at the top of a phone screen. That is safe only because the reveal is
driven by pointer *position* rather than by hovering the element itself.

The decision rules are pure functions (`pointerReveals`, `foldScroll`) and are
tested, since they are a specific behavioural contract rather than something to
re-derive from event handlers later.

Fonts are self-hosted via `@fontsource-variable/*` and fetched lazily by the
browser's own rules: an `@font-face` rule that no rendered element matches is
not downloaded, which is specified behaviour rather than an optimisation to
hope for. So all five are declared and exactly one is fetched. They are not
loaded from the Google CDN — hotlinking sends every reader's IP to Google, and
the app is self-hosted specifically so a household on a flaky link still works.

## Email

**No email is sent, by any path.** This is worth stating plainly because the
code looks like it should work:

- `server/auth.ts` is the live authentication path and contains no mail code.
- `server/lib/auth.ts` contains `sendVerificationEmail`, `isEmailConfigured` and
  a nodemailer transport — and is imported by nothing.
- `POST /api/auth/reset-password-request` generates a valid reset token, then
  drops it: the handler carries a literal `// TODO: Send password reset email`
  and returns the token in the response body **only** when
  `NODE_ENV=development`. In production the token is created and discarded.
- `POST /api/auth/reset-password` works correctly — it is the delivery of the
  token that is missing, not the consumption of it.

Consequences: account verification email is never sent, and email verification
is not enforced anywhere (`requireVerified` is applied to zero routes), so this
does not block signup. Password reset is unreachable in production. Setting the
`EMAIL_*` variables changes none of this; wiring the live path to a mailer is
the outstanding work.

## Deployment

Deployed to an Unraid server as a Docker container, published through SWAG at
<https://liontails.paul-blake.com>.

```
Cloudflare (orange cloud, SSL Full-Strict)
  └── SWAG (nginx)                     ── docker network: paulproxy
        └── lion-tails            :5000  (host 3003)
              └── lion-tails-postgres :5432  (not published to the host)
```

Pushing to `main` triggers `.github/workflows/ci.yml` — there is no separate
`deploy.yml`; the deploy is the last job of the CI workflow and runs only when
every gate before it passed. On the self-hosted Unraid runner it:

1. builds the image for `linux/amd64` and pushes
   `flyingoat03/lion-tails:latest` and `:<sha>` to Docker Hub;
2. SSHes to the server, writes a transient `.env` from GitHub secrets,
   runs `docker compose pull && docker compose up -d` in
   `/mnt/user/appdata/lion-tails`, waits for the container healthcheck, prunes
   old images, and removes the `.env`.

The compose file in this repo is a **reference copy**. The authoritative one
lives at `/mnt/user/appdata/lion-tails/docker-compose.yml` on the server; CI
deliberately does not overwrite it. Keep the two in sync by hand.

`GET /api/health` backs the container healthcheck. It probes the database live
and returns **503** when `DATABASE_URL` is set but unreachable, or when the live
schema is missing columns that `shared/schema.ts` declares (checked at startup
against Drizzle's own metadata, so there is no hand-maintained list to drift), so a container
that fell back to in-memory storage fails its healthcheck and fails the deploy,
rather than reporting success while quietly losing every write on the next
restart. With no `DATABASE_URL` at all it returns 200 with
`"persistence": false`, since that is a deliberate choice rather than a fault.

On startup `entrypoint.sh` waits for Postgres (`scripts/wait-for-db.js`) and
applies pending migrations (`scripts/migrate.js`). A database failure is logged
loudly but does not stop the container, because the app has an in-memory
fallback — enforcement is the `/api/health` 503, not a refusal to boot.

`.github/workflows/ci.yml` is the whole pipeline — build, gates, and the deploy
as its last job. On every PR it runs:

| Gate | Catches |
|---|---|
| `npm run check` | type errors |
| `npm run build` | build failure |
| no Vite in `dist/prod.js` | the dev/prod entrypoint split regressing, which would crash the runtime image at startup |
| `npm test` | the parser, model request shape and hero data (see [Tests](#tests)) |
| `npm run lint` | React Rules of Hooks — a runtime ordering rule `tsc` and the build are both blind to, which once rendered a page blank |
| no hardcoded colours | a component silently opting out of theming: right in Paper, wrong in Sepia, unreadable in Night |
| reader CSS reached the bundle | the Tailwind-JIT bug that made the original colour picker do nothing for months |
| production-bundle smoke test | a bundle that builds and will not boot |
| real-database smoke test | migrations, the table count, and that the seed actually persisted |
| schema check fails when the schema is wrong | the check being unable to fail — see `docs/decisions.md` |
| Docker build, Trivy scan, `npm audit` | vulnerable images and dependencies |

The hero-count assertion in the database smoke test derives its expectation
from the data file:

```bash
EXPECTED_HEROES=$(npx tsx -e 'import { heroesOfFaithData } from "./server/data/heroes"; console.log(heroesOfFaithData.length)')
```

It was hardcoded to `15`, which was correct on the day it was written and broke
the deploy the moment anyone added a hero. Reading it from the source keeps the
invariant that is actually worth asserting — *the database holds what the seed
defines* — rather than a number that has to be maintained in two places.

### Required GitHub secrets

| Secret | Notes |
|---|---|
| `DOCKER_USERNAME` / `DOCKER_TOKEN` | Docker Hub credentials |
| `UNRAID_HOST` / `UNRAID_USERNAME` | Server address and SSH user |
| `SSH_PRIVATE_KEY_RAW` | SSH private key for the deploy |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | |
| `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASSWORD` | Optional; leave unset to disable email |

### Server setup

Most of this is already done on PaulServer:

- `/mnt/user/appdata/lion-tails/docker-compose.yml` is in place (host port
  **3003** — 3002 was already taken by `libation-gui`).
- The `paulproxy` network exists.
- A self-hosted runner container `Github-Runner-Lion-Tails` is registered to
  this repository with the labels `self-hosted, linux, x64, unraid-lion-tails`.
  Runners are per-repository on a personal account, so the paul-blake-website
  runner could not be reused.
- `deploy/liontails.subdomain.conf` is staged at
  `/mnt/user/appdata/swag/nginx/proxy-confs/` and passes `nginx -t`.
- SWAG already holds a wildcard `*.paul-blake.com` certificate via the
  Cloudflare DNS plugin, and `liontails.paul-blake.com` already resolves — so
  no certificate or DNS work is needed.

Remaining:

1. Set the GitHub secrets listed above. `POSTGRES_PASSWORD` must be set before
   the first deploy or `postgres:15` refuses to initialize.
2. Reload SWAG so the staged proxy conf takes effect (`docker restart swag`).
   Until then `liontails.paul-blake.com` will not route.
3. Enable autostart for the `Github-Runner-Lion-Tails` container in the Unraid
   Docker tab, or it will not survive a reboot.
4. Create the `flyingoat03/lion-tails` repository on Docker Hub.

### Shared-network naming rule

`paulproxy` is a **shared external** network. A compose *service name* becomes
a DNS alias on every network its container joins, so a generic service name
(`postgres`, `redis`, `db`, `cache`, `api`) collides with any other app that
picked the same one. Docker then round-robins between them, which fails
intermittently rather than outright — the worst kind of failure. This app's
database is therefore named `lion-tails-db` and lives on a private
`lion-tails-internal` network rather than on `paulproxy`, since nothing outside
this app has any business reaching it.

## Further reading

- `docs/decisions.md` — non-obvious constraints and the reasoning behind them.
  Read it before "tidying" anything in this repo.
- `docs/roadmap.md` — what is outstanding and why, including the known-but-unfixed list.
- `CLAUDE.md` — orientation for AI agents working in this codebase.

## Known gaps

- **Email does not work, and setting `EMAIL_*` will not make it work.** The live
  authentication path (`server/auth.ts`) contains no mail code at all. The
  module that does (`server/lib/auth.ts`) is imported by nothing. See
  [Email](#email).

- `characters` and `stories` tables may still exist on databases created before
  the migration cutover. They were never read by anything and are safe to drop.
- Test coverage is deliberately narrow — pure functions only. There is no
  component, route or database test. See [Tests](#tests).
- `searchMetadata` is always five empty arrays in production: the extraction
  logic exists only in `MemStorage`, so the Postgres path stores nothing.
- `/api/auth/me` returns `resetPasswordToken` and `verificationToken` to the
  browser.
- Every story route uses an inline auth check rather than `requireAuth` in the
  signature, which is how eight unguarded write routes once shipped.
- The zod 3 → 4 migration blocks `drizzle-zod` 0.8, which is the only failure in
  the 54-package Dependabot update. It does **not** block `zod-validation-error`
  5, which needed one import specifier — see `docs/decisions.md`.
- There is no way to grant an account premium models without making it an admin.
  `users.is_upgraded` is designed but not built — see `docs/roadmap.md`.
