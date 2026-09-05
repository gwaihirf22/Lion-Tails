# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Read `docs/decisions.md` before changing anything that looks redundant or
improvable.** This codebase encodes a lot of hard-won rationale in comments;
several "obvious cleanups" here have caused production outages.

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

There is **no test suite**. `npm run check` and the CI smoke test are the only
automated gates.

## Architecture

```
client/        React SPA (Wouter, TanStack Query, Tailwind + Radix/shadcn)
server/        Express API + SPA serving
  index.ts     createApp() / startServer() — shared setup
  dev.ts       dev entrypoint: imports Vite
  prod.ts      prod entrypoint: MUST NOT import Vite (see below)
  static.ts    Vite-free static serving
  db.ts        pool, drizzle client, schema verification
  seed.ts      reference data, seeded after the DB is ready
  routes.ts    the bulk of the API
  storage.ts   in-memory storage + IStorage interface
  db-storage.ts Postgres implementation
  lib/         modelPolicy, storyBrief, requireAuth, openai*, songGenerator
shared/schema.ts  single source of truth for all 10 tables + Zod schemas
migrations/    generated SQL, applied at container start
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
(`gpt-4o-mini`, anyone, owner's key), premium (`gpt-4o`/`dall-e-3`, admins or
users with their own key).

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

Push to `main` runs `.github/workflows/deploy.yml` on a self-hosted Unraid
runner: build, push to Docker Hub, SSH, `docker compose pull && up -d`, wait for
the healthcheck.

The compose file in this repo is a **reference copy**. The authoritative one is
at `/mnt/user/appdata/lion-tails/docker-compose.yml` on the server and CI
deliberately does not overwrite it — keep them in sync by hand.

Never give a container on the shared `paulproxy` network a generic service name.
See `docs/decisions.md` §10.
