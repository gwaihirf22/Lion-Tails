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

### Two open questions, unanswered

1. **Should the Heroes page default to `Through History`, or remember the
   last-used tab?** Remembering is friendlier for repeat visits and worse for a
   first-time visitor who lands on whichever tab someone else last opened.
2. **Should `server/data/biblicalEvents.ts` and `server/data/heroes/bible.ts`
   stay separate for the figures they share** (Noah, Abraham, Moses, Daniel)?
   They do different jobs — one anchors a retelling, the other describes a
   person — but the duplication is real and this repo has a history of parallel
   definitions drifting apart.

---

## Features

### Phase C — story arcs

`seriesRole: standalone | opening | middle | finale`: an option telling the
model this is the first of a series so it leaves the story open, and later the
ability to close the arc. `finale` is the half that needs the existing summary
and canon to know what is outstanding.

Two interactions to **design rather than discover**:

- `moralOutcome` is in tension with `opening` — one says resolve, the other says
  do not.
- An opening story must still hit its word target, so "leave it open" cannot
  become "stop early".

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
| zod 3 → 4 migration | blocks two Dependabot PRs |
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
