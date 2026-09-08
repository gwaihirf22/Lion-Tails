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
shared/schema.ts  single source of truth for all 13 tables + Zod schemas
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

`shared/schema.ts` is the single source of truth for all ten tables, including
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
