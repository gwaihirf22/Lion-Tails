# Roadmap

What is outstanding, why it is outstanding, and what it would take. Kept here
rather than in issues so the reasoning lives next to the code it concerns.

Items are ordered by how much damage they do while unfixed, not by effort.

---

## Correctness and security

### `/api/auth/me` returns password-reset and verification tokens to the browser

The handler serialises the whole user row. A reset token in a response body is a
credential sitting in the browser's memory, in any logging proxy, and in the
network tab of a shared family computer. Fix: pick the fields explicitly rather
than deleting the bad ones, so a future column is excluded by default.

### Mistyped `/api/` paths return 200 and HTML

A POST to a route that does not exist falls through to the SPA catch-all in
`server/static.ts` and returns **200 with index.html**. A client reads that as
success and only discovers otherwise several requests later. Found by a harness
that "successfully registered" a user against a route that has never existed.
Fix: 404 as JSON for unmatched `/api/*` before the SPA fallback is reached.
See `decisions.md`, "Known open instance".

### Story routes use inline auth checks

Every story route does its own `if (!req.user)` rather than taking
`requireAuth` in the signature. There are 29 of these, and it is how eight
unguarded write routes once shipped: a missing check is invisible when it is
supposed to be in the body, and obvious when it is supposed to be in the
signature. Fix is mechanical but touches many routes, so it wants its own PR.

The five character routes were converted when the character model widened,
since that change rewrote those handlers anyway. The rest are untouched.

### Email is wired to nothing

Password reset generates a valid token and discards it (`server/auth.ts:185`,
`// TODO: Send password reset email`), so the endpoints answer 200 and look
functional. `server/lib/auth.ts` has a working nodemailer transport and is
imported by nothing. Setting `EMAIL_*` changes nothing. Either wire the live
path to a mailer or remove the dead module and the config that implies it works
— the current state is the worst of both.

---

## Content

### More biblical figures

39 of the biblical collection are written. Reasonable next additions, by era:

- **Patriarchs** — Hagar, Rebekah, Leah, Judah
- **Exodus** — Jethro, Bezalel
- **Judges & Kings** — Samson, Jonathan, Abigail, Hezekiah, Naaman
- **Prophets** — Ezekiel, Hosea, Amos, Micah, Habakkuk
- **Exile & Return** — Ezra, Zerubbabel, Shadrach/Meshach/Abednego
- **Gospels** — Martha, Zacchaeus, Nicodemus, the centurion, Joseph of Nazareth
- **First Christians** — Priscilla and Aquila, Philip, Cornelius, Silas, Apollos

Every one needs `npx tsx scripts/verify-heroes.ts <id>` to pass before commit.
Verses are fetched, never recalled — `decisions.md` §20.

### One open question, answered; one still open

**Answered:** `biblicalEvents.ts` and `heroes/bible.ts` stay separate. They do
different jobs -- one anchors a retelling, the other describes a person -- and
the focus picker made the difference concrete: heroes carry `keyEvents` a story
can be aimed at, biblical events are single accounts with no sub-structure.

**Still open:** should the Heroes page default to `Through History`, or remember
the last-used tab? Remembering is friendlier for repeat visits and worse for a
first-time visitor who lands on whichever tab someone else last opened.


---

## Features

### Quests of the Timekeeper

The universe underneath the travelling mode. `docs/quests-of-the-timekeeper.md`
is the arc; this is the build order.

**Done (2026-09-10):** the canon as data (`server/data/lionTails.ts`), reaching
the full brief as its own section and every chapter as an anchor; the mode
renamed *A Quest with the Timekeeper*; the prologue as a built-in story in
every library.

**Next, in order:**

1. **The per-user quest universe.** `resolveUniverseForRequest` grows a branch
   that finds-or-creates a universe named after the series for any request
   whose `characterRole` is `travels`, and the extraction runs for it. That
   is the "current arc / previous chapter" layers of the original proposal —
   `story_universes.world_state` and `summary`, pointed at this universe.
   It also makes "Continue this story" on the prologue mean something, which
   is why the reader hides that button today rather than the server refusing
   it.
2. **The Quests page.** Separate, less editable, API-model only, and *guided*:
   the story chooses the destination, the arc is released movement by
   movement under program control, and the Lion appears there and nowhere
   else. Most of the generation pipeline is reused; what is new is program
   state for "where in the arc is this reader" and a form that does not ask
   what to write about.
3. **Whether the Original tab's quest mode should refuse the local tier.**
   Blake: "We will not use local AI for this." The canon is sized for
   attention rather than the 16k window, so nothing breaks on the local
   model today; the question is whether a quest written by it is worth
   having.
4. **The first saga outline** — twenty to thirty beats, mysteries planted
   early and paid off late — as a doc, before any adventure is written for
   the page.
5. **The first adventure** on the page. Not before 4.

Two small ones the library redesign left open: there is no way to put a
story INTO a universe by hand (`moveStory` is only ever called with `null`;
universes are made by the server when a story continues), so a "Move to
universe" control on the story card is the thing a "New universe" button
would need first; and `Header`'s exact-match highlight does not light "My
Stories" on a universe's page.

Closed on the way: the `alongside` mode's "stays on their mission / does not
die / never the villain" lines reached chapter 1 and no other. Both modes
carry a per-chapter anchor now.

### Phase C — story arcs: DONE

Shipped as the series flag and the cliffhanger option. The tension recorded here
-- that `moralOutcome` says resolve while an opening says do not -- was real, and
is resolved the way a retelling already resolved it: the cliffhanger suppresses
`moralOutcome` entirely rather than arguing with it.


### `users.is_upgraded` — grant an account premium access without making it an admin

**The one piece of the continuity work that was designed and not built.**

Today there are exactly two ways to get premium models and skip the free quota:
be an admin, or supply your own OpenAI key. Neither fits "let my brother test
it" — admin also unlocks `/admin/stats` and write access to shared reference
data (heroes, songs), and expecting a family member to create an OpenAI account
is not realistic.

`resolveModel` already falls back to `process.env.OPENAI_API_KEY` when a user has
no key of their own, so an upgraded account transparently spends the owner's key.
The flag therefore only has to do three things: allow premium models, skip the
quota charge, and be readable by one `isEntitled()` helper — so the three
existing restatements of "own key or admin" (`isModelAllowedFor`,
`concurrencyLimitFor`, `shouldChargeQuota`) do not become six.

It also needs somewhere to be toggled from. The only admin route today is
`GET /api/admin/generation-stats`; there is no user list, so this currently means
hand-written SQL against production. A `PATCH /api/admin/users/:id` guarded by
`requireAdmin` **in the signature** is the minimum.

Deliberately not a subscription system. Blake: "I won't want to depart that
until/when we actually do want to create a subscribe function."

### `canonicalLook` is stored and rendered nowhere

The character sheet collects "how they look, for pictures" and saves it. Nothing
reads it yet, and a test asserts it appears in none of the four brief
projections.

That is deliberate rather than unfinished: keeping appearance out of the story
prompt is what lets it be as detailed as anyone likes without competing for the
few facts per character the brief rations. The avatar work will use it for image
prompts only — and will want to store the exact prompt an avatar was generated
from, or story illustrations will not match the portrait.

### Promote an invented character

The extraction records characters the model invented, which is what makes this
possible: a "save to my characters" button on a world entry would turn a
character the AI created into a reusable one. Blake raised it and left it open —
"I don't know what to do about that yet." The data exists; the UI does not.

### Retire the old summary path

The extraction now writes the summary, so `POST /api/universes/:id/summary`, the
8-story window in `universeSummary.ts`, the staleness fingerprint and the
window-shrinking retry are all superseded for universes maintained this way.
They are still there deliberately — the extraction shipped first so any
regression is attributable — and removing them is its own change.

### Focus mode on a hybrid device

The mouse reveal is a top strip and the touch reveal is a scroll-up, chosen per
event rather than per device, so a laptop with a touchscreen gets both. What is
untested is a tablet with a trackpad case: pointer events there report as mouse,
which is probably right, but nobody has actually tried it.

### Reading position memory

The reader has no bookmark and no scroll restore. A child interrupted at
bedtime restarts at the top. Cheap to add per-story in `localStorage`;
account-synced is a schema change.

---

## Known-but-unfixed, recorded so they are not rediscovered

| | |
|---|---|
| `searchMetadata` is always five empty arrays in production | the extraction logic exists only in `MemStorage`, so the Postgres path stores nothing |
| `searchStoriesByTags` matches `request.theme` and has no route | dead as written |
| `HeroesOfFaith.tsx:65` tests a tag nothing ever writes | always false |
| Stray `CREATE TABLE IF NOT EXISTS` inside `db-storage.ts` `toggleFavorite` | leftover from the pre-migration era |
| Two endpoints exist for story-favourite | one is unused |
| Interrupted attempts write no `generation_record` | biases the stats toward failures |
| `GenerateStory.tsx:293`'s `StoryDisplay` is unreachable | `setGeneratedStory` is only ever called with `null`. Verified — but see `decisions.md` §12 before deleting it |
| The settings UI carries its own hardcoded model list | `GET /api/settings/models` exists precisely so it does not have to |
| zod 3 → 4 migration | blocks `drizzle-zod` 0.8 only, which is the sole failure in the 54-package `production-minor` PR. Ignored in `dependabot.yml` until the migration happens |
| `@vitejs/plugin-react` 6 | needs Vite 5 → 8 plus three new peer deps. Not a bump; a build-system migration, and `@replit/vite-plugin-shadcn-theme-json` has to be replaced first |
| `characters` and `stories` tables | may still exist on old databases; never read, safe to drop |

---

## Testing gaps

Current coverage is pure functions only: the story parser, per-model request
shape and entitlement, and hero data structure. Deliberate, and narrow.

Worth adding, roughly in order of value:

1. **Route-level auth tests.** The inline-check problem above is exactly the
   sort of thing a test catches once and forever: for every write route, assert
   an unauthenticated request gets 401.
2. **Storage parity.** `MemStorage` and `DbStorage` implement one interface and
   have already diverged (`searchMetadata`). One suite run against both would
   have caught it.
3. **A schema round-trip test** — insert, read back, compare — for the tables
   with JSON columns, where a serialisation change is silent.

Not worth adding here: component tests and anything needing a headless browser.
There is no browser in the deployment container, the reader's visual behaviour
is covered by the CSS-bundle greps in CI plus a short manual matrix, and a
brittle snapshot suite would cost more than it catches.
