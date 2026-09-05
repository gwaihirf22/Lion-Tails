# Lion Tails

Personalized Christian bedtime stories for children, with a Christian song/chord
library, "Heroes of Faith" content, character management, and image analysis.

Stories are generated with an OpenAI or self-hosted model depending on the
user's tier (see [Model tiers](#model-tiers)); illustrations with `dall-e-3`.

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

### Why there are two server entrypoints

`server/prod.ts` is the production entrypoint and **must never import
`server/vite.ts`**. The build bundles with `esbuild --packages=external`, so
anything reachable from the entry module has to exist in `node_modules` at
runtime — and pulling Vite in would make the runtime image depend on the whole
devDependency tree. `server/dev.ts` is the only file that imports Vite.
CI enforces this with a grep over `dist/prod.js`.

Shared setup lives in `server/index.ts` (`createApp()` / `startServer()`);
`server/static.ts` holds the Vite-free static file serving.

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

`shared/schema.ts` is the single source of truth for all ten tables, including
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
| economy | `gpt-4o-mini` | everyone — billed to the server owner's key |
| premium | `gpt-4o`, `dall-e-3` | admins, or **any user who has supplied their own API key** |

That last rule needs no role check: you may use expensive models if you are
paying for them.

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

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs on the
self-hosted Unraid runner and:

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

`.github/workflows/ci.yml` runs on every PR: typecheck, build, the
no-Vite-in-the-bundle assertion, a Docker build, a Trivy scan, and `npm audit`.

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
- `CLAUDE.md` — orientation for AI agents working in this codebase.

## Known gaps

- **Email does not work, and setting `EMAIL_*` will not make it work.** The live
  authentication path (`server/auth.ts`) contains no mail code at all. The
  module that does (`server/lib/auth.ts`) is imported by nothing. See
  [Email](#email).

- `characters` and `stories` tables may still exist on databases created before
  the migration cutover. They were never read by anything and are safe to drop.
- There is no test suite.
