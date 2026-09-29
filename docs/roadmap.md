# Roadmap

What is outstanding, why it is outstanding, and what it would take. Kept here
rather than in issues so the reasoning lives next to the code it concerns.

Items are ordered by how much damage they do while unfixed, not by effort.

---

## Correctness and security

Closed since this list was written, recorded so nobody re-finds them:
`/api/auth/me` now answers `publicUser()` (picked fields, held by
`tests/publicUser.test.ts`); an unmatched `/api/*` path answers a JSON 404 in
production (`server/static.ts`) and in development (`server/vite.ts`).

### Story routes use inline auth checks -- DONE

Every route takes its guard in the signature now. The last thirteen inline
`if (!req.user)` checks were converted in one pass once
`tests/routeAuth.test.ts` existed to prove none of them lost its guard; that
suite reads the routes from the source, so a route added tomorrow is held to
a 401 the moment it is registered, and `if (!req.user` in a handler body is
a regression rather than a style.

### Email is wired to nothing -- DONE, for the reset link

`server/lib/mailer.ts` sends the password-reset link over SMTP (a Gmail
account with an app password, sending as the domain alias), and production
fails closed with a 503 when it is not configured rather than promising an
email nobody can send. The sign-in page asks for a reset and
`/reset-password/:token` takes the new password. Still deliberately absent:
sign-up verification (accounts are marked verified at creation and nothing
depends on `POST /api/auth/verify-email`) and an email mirror of the
Telegram alerts. Either is a decision, not a switch.

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

Stories are now linked back to the characters and heroes they are about
(a Stories tab on the sheet, and the hero dialog's tab actually receiving
data). Two small ones the library redesign left open: there is no way to put a
story INTO a universe by hand (`moveStory` is only ever called with `null`;
universes are made by the server when a story continues), so a "Move to
universe" control on the story card is the thing a "New universe" button
would need first; and `Header`'s exact-match highlight does not light "My
Stories" on a universe's page. And **rolling sessions**: the login cookie
lapses a week after the session was last written, so "Keep Parent Mode on"
is bounded by it and the copy says "or sign out". `rolling: true` would make
every login last a week after the last *request* instead — a change to
everyone's session lifetime, to be decided on its own.

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

It has somewhere to be toggled from now: `/admin/accounts` lists every
account and already promotes, bans and unbans through `requireAdmin` routes
(`POST /api/admin/accounts/:id/admin` and friends). An "upgraded" switch is
one more button on that page and one more column.

Deliberately not a subscription system. Blake: "I won't want to depart that
until/when we actually do want to create a subscribe function."

### `canonicalLook` reaches pictures only, never the story -- DONE

The character sheet's "how they look, for pictures" leads the avatar prompt
(`server/lib/avatar.ts`, `buildAvatarPrompt`) and a test still asserts it
appears in none of the four brief projections. Keeping appearance out of the
story prompt is what lets it be as detailed as anyone likes without competing
for the few facts per character the brief rations. The exact prompt each
portrait was generated from is stored beside it (`avatarPrompt`), which is
what lets a story illustration match the portrait.

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

### Pay-as-you-go charging -- the plan after the costs page

The costs page measures, prices and warns (CLAUDE.md, "What things cost"); it
charges nobody. What is left:

- **A balance and top-ups.** Stripe Checkout for one-off top-ups, tracked in our
  own database. At 2.9% + 30¢ the fixed fee is 62.9% of a $0.50 charge, 8.9%
  of $5 and 5.9% of $10 -- so no top-up below $5, and $10 as the default.
  Stripe's terms on stored value need reading before a balance ships; its
  real-time prepaid credits are Metronome-only.
- **Reserve at enqueue, settle at finish**, the avatar pattern: the published
  price for the chosen length and model is reserved, and refunded if nothing is
  written.
- **How it sits with the free credits.** The free 50 (and 10 a month) are
  counted in credits today; whether paid stories draw the free balance first,
  and what a credit is worth in cents, is Blake's call.
- **Own-key users** pay OpenAI directly and are charged nothing, as now.

## Known-but-unfixed, recorded so they are not rediscovered

| | |
|---|---|
| `searchMetadata` is five empty arrays everywhere | the search routes and both storages' search methods were removed (nothing called them); the field stays on the schema because every stored row carries it, and `updateStoryHeroId` still appends a tag to it |
| Stray `CREATE TABLE IF NOT EXISTS` inside `db-storage.ts` `toggleFavorite` | leftover from the pre-migration era |
| Two endpoints exist for story-favourite | `POST /api/story/favorite/:id` is called only from the unreachable branch of `GenerateStory.tsx`, which is kept on purpose (`decisions.md` §12) |
| Interrupted attempts write no `generation_record` | biases the stats toward failures |
| `GenerateStory.tsx`'s inline `StoryDisplay` (the branch under the "unreachable" comment) is unreachable | `setGeneratedStory` is only ever called with `null`. Verified — but see `decisions.md` §12 before deleting it |
| zod 3 → 4 migration | blocks `drizzle-zod` 0.8 only, which is the sole failure in the 54-package `production-minor` PR. Ignored in `dependabot.yml` until the migration happens |
| `@vitejs/plugin-react` 6 | needs Vite 5 → 8 plus three new peer deps. Not a bump; a build-system migration, and `@replit/vite-plugin-shadcn-theme-json` has to be replaced first |
| `characters` and `stories` tables | may still exist on old databases; never read, safe to drop |
| `StoryExtras.tsx` re-fetches the whole `SavedStory` | it needs `heroId` and `editLog` and pulls `debugData` with them — measured at up to 244 KB for one story (`generationRecords.ts`) — through `getQueryFn`, which leaves two `Response.clone()`s unread (`queryClient.ts:112-123`). Signed-in reader only; the share page does neither |
| `splitFurtherLearning`'s non-literal fallback | `storyContent.ts` cuts the story at the FIRST line matching `/For Further Learning:?/im`. The server only appends its own block when the model wrote none, so a model that writes that heading mid-story has everything after it silently moved into the "Further reading" accordion |

---

## Testing gaps

Coverage is pure functions plus three suites that read the real thing:
`tests/routeAuth.test.ts` boots `createApp()` in memory mode and holds
every route not on its public allowlist to a 401 with no cookie;
`tests/storageParity.test.ts` runs one suite against `MemStorage` always and
against `DbStorage` in CI's Postgres job; `tests/asyncRoutes.test.ts` scans
the route files. Deliberate, and still narrow.

Done since this list was written:

1. **Route-level auth tests** -- DONE. The suite reads the registrations
   from the source, so a route added tomorrow is covered the moment it is
   registered.
2. **Storage parity** -- DONE. Its first case pins the divergence that
   prompted it: `saveStory` used to read `heroId` from an argument in memory
   and from the request on Postgres; both read the request now.

Still worth adding:

3. **A schema round-trip test** -- insert, read back, compare -- for the
   tables with JSON columns, where a serialisation change is silent. The
   parity suite covers `user_stories`, `user_characters` and `story_shares`
   on that path; universes, `story_jobs` and `user_settings` are not yet
   exercised against Postgres.

Not worth adding here: component tests and anything needing a headless browser.
There is no browser in the deployment container, the reader's visual behaviour
is covered by the CSS-bundle greps in CI plus a short manual matrix, and a
brittle snapshot suite would cost more than it catches.
