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
