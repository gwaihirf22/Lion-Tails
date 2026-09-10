/**
 * The Lion Tails universe: the small amount of it that exists so far.
 *
 * WHY THIS IS A MODULE AND NOT A FEW SENTENCES IN A PROMPT.
 *
 * When a character travels to an account, something has to carry them there,
 * and somebody has to know how. That is lore, and lore has two properties that
 * prompt strings handle badly. It gets RENAMED -- none of the names below are
 * settled, and a name baked into six prompt strings is renamed in five of them
 * by whoever is in a hurry. And it GROWS -- the intended destination is a real
 * universe with its own continuity, not a device that appears in paragraph one
 * and is never mentioned again.
 *
 * So the names are data. Renaming the keeper is one edit to one object, and
 * every prompt that mentions him follows. If a lore store or an MCP becomes
 * the source of this later, it replaces this file rather than being threaded
 * through the prompt builder.
 *
 * WHAT IS DELIBERATELY NOT HERE. Any of the universe's actual continuity: who
 * has travelled before, what happened last time, what is still unresolved.
 * That is not a constant, it is state -- and the app already has somewhere for
 * it. `story_universes.world_state` and the extraction in worldState.ts
 * already keep graded, evolving facts across a series, including the "you may
 * ignore these" tier that stops a sequel reading like a checklist. A Lion
 * Tails frame that remembers is that machinery pointed at this universe. This
 * file holds only what is true before any story is written.
 */

/**
 * The keeper: the adult who knows what the device is and does not explain it.
 *
 * Modelled on the role Whit plays in Adventures in Odyssey -- a good man who
 * helps a young person see history, who is trusted, and who is not the
 * protagonist. He is a door and a conscience, not a narrator.
 *
 * PLACEHOLDER. Blake has not settled on Barnabas, and nothing downstream reads
 * the string except through this object.
 */
export const KEEPER = {
  /** How he is introduced. */
  name: "Mr Barnabas",
  /** How he is referred to after that. */
  shortName: "Barnabas",
  /**
   * What the model needs to know to write him. Kept short on purpose: a long
   * character brief for a supporting figure crowds out the account, which is
   * what the story is actually about.
   */
  brief:
    "an old man who keeps the lantern, knows exactly what it does, and will " +
    "not explain it. He is kind, dry, and entirely unsurprised by any of this. " +
    "He never travels himself and he never tells anyone what they are about to " +
    "see.",
} as const;

/**
 * The device. It is a lantern for now, and that is the part most likely to
 * change -- hence one place to change it.
 */
export const DEVICE = {
  name: "the lantern",
  /**
   * How the travelling works, said in a way that does not invite the model to
   * write a science-fiction mechanism. Vagueness is the point: the moment a
   * story explains HOW, the explanation becomes canon and the next story
   * contradicts it.
   */
  brief:
    "an old lantern that does not light rooms. Lit in the right place it opens " +
    "onto somewhere else, some when else. Nobody in the story knows how, and " +
    "nobody explains it. Do not invent a mechanism for it.",
} as const;

/**
 * One way of opening a travelling story.
 *
 * `opening` is what happens in the Lion Tails present BEFORE the account
 * begins; `closing` is what the story may return to after it ends. Both are
 * instructions to the model, not text to be reproduced.
 */
export type FramingApproach = {
  /** Frozen onto the request. Stable: renaming one orphans stored requests. */
  id: string;
  /** For the debug panel, so a story can be traced to the frame it was given. */
  label: string;
  opening: string;
  closing: string;
};

/**
 * The approaches, one chosen per story.
 *
 * A SET, not a sentence, because Blake's requirement is that it cannot be the
 * same every time -- and a single line of arrival is exactly what makes every
 * time-travel story open identically. Five is deliberately a small number: it
 * is enough that two stories in a row differ, and it is honest about being a
 * foundation rather than a universe.
 *
 * Each one describes a SHAPE and leaves the content to the story. "An errand
 * that never got finished" produces a different errand every time; "they were
 * carrying the shopping in" produces the same opening every time.
 */
export const FRAMING_APPROACHES: readonly FramingApproach[] = [
  {
    id: "errand",
    label: "an errand interrupted",
    opening:
      "Open in the present day, with something ordinary already underway and " +
      "not yet finished -- a job half done, somewhere they were supposed to " +
      "be, a promise made that morning. The travelling interrupts it. Do not " +
      "resolve it before they go.",
    closing:
      "At the end, come back to the unfinished thing. They still have to " +
      "finish it, and they are not the same person doing it.",
  },
  {
    id: "question",
    label: "a question asked and not answered",
    opening:
      `Open in the present day with a question they put to ${KEEPER.shortName} -- ` +
      "something they genuinely want to know, and something he could answer in " +
      "a sentence if he chose to. He does not choose to. He sends them instead.",
    closing:
      "At the end, return to the question. They may answer it themselves, or " +
      "find it was the wrong question. Do not have him explain it to them.",
  },
  {
    id: "brought-back",
    label: "something brought back",
    opening:
      "Open in the present day, briefly, and get them travelling quickly. The " +
      "weight of this one is at the end.",
    closing:
      "They come back carrying something they did not leave with -- an object, " +
      "a habit, a piece of knowledge, a mark. Close on it, and on somebody " +
      "noticing. Do not explain what it means.",
  },
  {
    id: "someone-else-first",
    label: "someone was here first",
    opening:
      "Open in the present day with evidence that someone has used the " +
      "lantern before them and recently -- a name, a date, an object left " +
      `where it should not be. ${KEEPER.name} sees it and says nothing useful. ` +
      "Do not resolve who it was; this story is not about that.",
    closing:
      "At the end, the evidence is still there and still unexplained. Let them " +
      "notice it again.",
  },
  {
    id: "wrong-arrival",
    label: "not where they meant to be",
    opening:
      "Open in the present day and make the arrival go wrong -- the wrong day, " +
      "some distance from where the account happens, or early enough that they " +
      "have to wait. They walk into the account rather than landing in the " +
      "middle of it, and what they see on the way there matters.",
    closing:
      "At the end they have to get back to where they arrived, and the way " +
      "back is not the way they came.",
  },
];

/** The approach used when a frozen request names one that no longer exists. */
const FALLBACK_APPROACH = FRAMING_APPROACHES[0];

/**
 * Choose one, at enqueue.
 *
 * `rng` exists so a test can pin the choice. Production never passes it.
 */
export function pickFramingApproach(rng: () => number = Math.random): FramingApproach {
  return FRAMING_APPROACHES[Math.floor(rng() * FRAMING_APPROACHES.length)];
}

/**
 * Read an approach back off a frozen request.
 *
 * Falls back rather than returning undefined, and falls back DETERMINISTICALLY
 * rather than picking a fresh one. A request frozen against an approach that
 * has since been deleted must still replay to one story, not to a different
 * story each time -- that property is the entire reason the choice is made on
 * the server in the first place, and re-rolling here would quietly give it up.
 */
export function framingApproachOf(id?: string | null): FramingApproach {
  return FRAMING_APPROACHES.find((a) => a.id === id) ?? FALLBACK_APPROACH;
}
