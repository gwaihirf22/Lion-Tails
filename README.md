# Lion Tails

Personalized Christian bedtime stories for children, with a Christian song/chord
library, "Heroes of Faith" content, character management, and image analysis.

Stories are generated with OpenAI `gpt-4o`; illustrations with `dall-e-3`.

## Stack

| | |
|---|---|
| Server | Express 4 + TypeScript (ESM) |
| Client | React 18 + Vite SPA (Wouter, TanStack Query, Tailwind + Radix/shadcn) |
| Database | PostgreSQL via Drizzle ORM (`pg` driver) |
| Auth | Passport local + JWT, `express-session` with a Postgres-backed store |

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
npm run db:init           # creates the tables
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (`server/dev.ts`, Vite middleware + HMR) |
| `npm run build` | Build client to `dist/public` and server to `dist/prod.js` |
| `npm start` | Run the production build |
| `npm run check` | TypeScript typecheck |
| `npm run db:init` | Create any missing tables (idempotent) |
| `npm run db:push` | Push the Drizzle schema (covers only the tables declared in `shared/schema.ts`) |

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
| `JWT_SECRET` | **yes in prod** | Same. |
| `OPENAI_API_KEY` | for AI features | Users can also supply their own key in app settings. |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` / `EMAIL_USER` / `EMAIL_PASSWORD` / `EMAIL_FROM` | no | SMTP for account verification and password resets; only used in production. |

## Deployment

Deployed to an Unraid server as a Docker container, published through SWAG at
<https://liontails.paul-blake.com>.

```
Cloudflare (orange cloud, SSL Full-Strict)
  └── SWAG (nginx)                     ── docker network: paulproxy
        └── lion-tails            :5000  (host 3002)
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

On startup `entrypoint.sh` waits for Postgres (`scripts/wait-for-db.js`) and
then applies the schema (`scripts/ensure-database.js`, idempotent
`CREATE TABLE IF NOT EXISTS`). A database failure is logged loudly but does not
stop the container, because the app has an in-memory fallback.

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
| `JWT_SECRET` | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | |
| `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASSWORD` | Optional; leave unset to disable email |

### One-time server setup

1. `mkdir -p /mnt/user/appdata/lion-tails` and copy `docker-compose.yml` there.
2. Confirm the `paulproxy` network exists: `docker network ls | grep paulproxy`.
3. Confirm host port 3002 is free: `docker ps --format '{{.Names}}\t{{.Ports}}'`.
4. Register a self-hosted runner for this repository with the labels
   `self-hosted, linux, x64, unraid-lion-tails`.
5. Add `/mnt/user/appdata/swag/nginx/proxy-confs/liontails.subdomain.conf`
   pointing at `lion-tails:5000` (the container-internal port — SWAG reaches it
   over `paulproxy`, not via the published host port), then `docker restart swag`.
6. Cloudflare: A record `liontails` → server IP, proxied, SSL/TLS Full (Strict).
7. Create the `flyingoat03/lion-tails` repository on Docker Hub.

## Known gaps

- The full schema is created by `scripts/ensure-database.js`, not by Drizzle
  migrations; `shared/schema.ts` declares only a subset of the tables. Moving to
  real migrations is the main outstanding piece of database work.
- There is no test suite.
