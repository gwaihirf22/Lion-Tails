# Quests of the Timekeeper — the arc

This is the story underneath the stories. It is written for the people who
build Lion Tails, and **it is never given to the model.** The model gets
`server/data/lionTails.ts`, which holds only what is true and may show; this
file holds what is coming, and when the reader is allowed to find out. A
model told the ending says so in chapter two.

Two documents, two audiences. They are not two definitions of one fact: when
something here becomes true-and-showable, it moves to `lionTails.ts` and is
deleted from the "withheld" table below.

## The central mystery

The world is not suffering a time malfunction. Time is working exactly as it
should. **What is going wrong is memory.**

People remember that wars were fought and forget courage. They remember that
people suffered and forget sacrifice. They remember that people believed and
forget faithfulness. They remember that someone spoke the truth and forget
what it costs to speak truth when a lie would be easier.

A world that forgets virtue becomes a world that cannot recognise it.

That is why the quests exist. The reader is not sent into history because a
story generator needs a setting. They are sent because a particular story
holds something that must be remembered — and a Timekeeper is not someone who
controls time, but someone who keeps what must not be forgotten.

## Who chooses

Two kinds of quest, and they differ on exactly this:

- **On the Original tab** (shipped): the reader picks the hero or the event.
  From inside the fiction that pick *is* the lantern's pull. Barnabas still
  does not know why this one and still does not explain. The picker is part
  of the story, not something the story apologises for.
- **On the Quests page** (planned): the story chooses. The reader is guided,
  the destination is not theirs to pick, the arc unfolds movement by
  movement under program control, and this is where they meet the Lion.

The canon in `lionTails.ts` is written to hold for both. Anything only true
on the Quests page is withheld from the model now, not just from the reader.

## The five movements

### I. The Door

The reader finds the shop. They learn almost nothing. They have a first quest
and discover that a historical story contains something more than facts. They
come back — and something in the shop has changed. An object on a shelf that
was not there before. Barnabas refuses to explain it.

*The prologue (`server/data/questPrologue.ts`) is the first half of this
movement, and every library begins with it.*

### II. The Stories

Many quests. Biblical accounts, church history, missionaries, martyrs,
explorers, scientists, kings, children, ordinary people, famous people. Some
Christian, some not. Every one contains something worth remembering.

Gradually the reader notices the quests are not random. Certain objects keep
appearing. The same phrase turns up in different centuries. Someone mentions
a Lion. Someone else mentions a Lamb. A historical figure says something they
could not possibly know. And Barnabas always seems to know more than he says.

### III. The Forgotten Story

There are stories Barnabas cannot find. The lantern searches. Nothing. He is
genuinely troubled, because this has never happened before: a story forgotten
so completely that even a Timekeeper cannot reach it.

The question becomes *what has been forgotten* — and *why does the Lion keep
appearing around it.*

### IV. The Great Lion

The reader encounters the Lion, and never in an exposition scene. At first
they only see him: across a valley; on a hill; standing beside someone about
to die; walking through a battlefield; watching a child pray. Always at the
edge of the story. Never explained.

Eventually: "Who is he?" Barnabas does not answer at once. Then: "You've met
him before." — "No I haven't." — "Not in the way you mean." And much later:
"Some call him the Lion. Others know him as the Lamb." That is all. The
reader has to discover the rest.

### V. The Great Story

The revelation is **not** that Barnabas was secretly God, and the Lion is
**not** an Aslan substitute. It is this: the stories were never separate.
Daniel, a Roman soldier, a missionary, a mother, a martyr, a king, a child, a
carpenter, a disciple, a person the world remembers, a person nobody
remembers — all of them are inside one Great Story. And so is the reader.

The quests were never merely trips into the past. They were teaching the
reader to recognise the shape of the story they are living in now.

> "You thought you were remembering the past. You were learning how to live
> in the present."

## The Lion

Grounded in **Revelation 5:5–6**: the Lion of the tribe of Judah who, when
John turns to look, is a Lamb standing as though slain. That is the whole of
his identity and it is Scripture's, not ours.

What he is not: Aslan. No "not a tame lion", no stone table, no wardrobe, no
talking. He does nothing that explains him. He is never a character with
lines.

When he may appear: **Movement IV, on the Quests page, and nowhere else.** A
Lion in the scene of every brief is a lion in every story (`docs/decisions.md`
§24 measured a model acting on every optional thread it was handed).

What the model *is* given is the hint, in Barnabas's mouth: asked how he does
any of this — "I have no control over this." Pressed — "The great Lion knows
no bounds." Mysteriously, once, and no more. `CANON.lion` says exactly that,
and in the same breath that the Lion does not appear: not seen, not heard, not
described. The prologue's last lines are fixed text and keep him: a lion, not
roaring, calling; and at the end, beginning to walk.

## Planted mysteries

| planted | where | pays off |
|---|---|---|
| The thing under the cloth — "a story I must tell you later" | prologue | III / V |
| "Not something. Someone." | prologue | III |
| The lantern burning white | prologue | III (it does this again when a story cannot be found) |
| The shelf objects — button, toy, compass, key, journal, crown, watch | prologue; one may be noticed per quest | II (recurrence), V (each belongs to a story the reader has been in) |
| A lion, calling | prologue | IV |
| "You think you're going into history. You're not." | prologue | V |
| Something on a shelf that was not there before | end of I | II |
| "I don't send you where you go." — "Then who does?" — a look at the lantern | I or II | IV |
| A historical figure who knows something they cannot know | II | V |
| Lion / Lamb mentioned in different centuries | II | IV |
| Other Timekeepers ("there are others") | canon, Movement I | open |

## What is withheld from the model, and until when

| withheld | why | released when |
|---|---|---|
| That a specific story has been forgotten | it is Movement III's plot | the Quests page reaches III |
| The Lion in the scene | a Lion in every brief = a lion in every story; his NAME, in Barnabas's mouth, is allowed | the Quests page reaches IV |
| Lion / Lamb, Revelation 5 | his identity is the reveal | IV, on the page, by design not by prompt |
| "The stories were never separate" | the ending | V |
| What is under the cloth | unwritten, deliberately | when it is written |
| Who the other Timekeepers are | unwritten | when it is written |

Everything in `lionTails.ts` is phrased as something that is TRUE, never as
something that is COMING.

## Who holds the lantern

**The Lion does, and he is not a tame lion.** Blake's line, and the answer to
the question the whole device raises: the lantern answers to stories and not
to instructions, Barnabas says "I have no control over this", and *something*
decides where it opens and when it flares again. This is what.

**It is withheld from the model, and this paragraph is why it lives here.**
`lionTails.ts` holds what may be shown; a model told who controls the lantern
will have Barnabas explain it in chapter two, and the reveal in Movement IV is
spent before anyone reaches it. What the model gets is the shape without the
name — the lantern decides, the traveller does not, nobody in the story knows
how — plus `CANON.lion`, which lets him say the name once and mysteriously and
forbids the Lion appearing at all.

The stone is the same fact at a smaller scale. It sleeps in a pocket and wakes
when it wants; a reader who asks *why it chose that moment* is asking the
question this file answers and the stories do not.

## Canon, and still open

**Settled** (in `lionTails.ts`, and in the prologue a reader can check):
Mr Barnabas, the Timekeeper; the shop, *Barnabas & Co. — Keepers of Things
Lost to Time*; the shelf; the lantern that answers to stories, goes dark on
the far side and closes into a small stone the traveller carries — waking and
opening again, of its own accord, to move them elsewhere in the same account;
that a quest begins in the traveller's own life and the shop comes to them,
seen by nobody else; that a figure may meet the same traveller years apart and
the traveller has not aged; that he lends it to the person and never chooses
the story; that arrival has a cause and the way back is a threshold; that he
asks what they found and never tells; that he never goes with them, never
explains, and is not God.

**Open:** what is under the cloth; who the other Timekeepers are; how the
forgotten story is found; the Lion's first appearance; whether the Original
tab's quest mode should refuse the local model tier.

## Barnabas, in a sentence each

He asks better questions than he answers. He is never the protagonist. He is
kind, dry, and unsurprised. He may turn up inside a quest, purposefully and
never conveniently, but he never takes the journey for anyone. And he does
not grade:

> "What did you find?"
> "I thought Daniel was brave because he wasn't afraid."
> "Wasn't he?"
> "…He was afraid."
> "Then perhaps you have learned something."

That exchange is how virtue is taught here without the app becoming a moral
lesson machine, and it is why `CANON.ending` says he asks again when the
answer is too easy.

## How it maps onto the app

| layer (from the original proposal) | what it is here |
|---|---|
| Permanent canon | `server/data/lionTails.ts` — `worldCanon()` in the full brief, `worldAnchor()` in every chapter |
| Current story arc | this file, for now; on the Quests page, program state |
| Current adventure | the request: source, character, frame (`travelFrame`) |
| Previous chapter summary | `story_universes.world_state` + `summary`, once the per-user quest universe exists (`docs/roadmap.md`) |

The proposal's "outline first, then chapters" is already the architecture
(`server/lib/openai-implementation.ts`); the world reaching every chapter is
what this change added.
