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
   * WHERE HE IS, and the reason this field exists at all.
   *
   * He had no place, so every story invented one and no two agreed: three test
   * stories in a row put him under a library staircase, in a churchyard, and
   * in "his room". That is not variety, it is a universe contradicting itself,
   * and it is the thing a reader notices first when they read two of these
   * back to back.
   *
   * The shop earns its keep three ways: every visit has something on a shelf
   * worth asking about, it explains without explaining why HE is the one who
   * has the lantern, and it is already where two of the framing approaches
   * below wanted to open -- "something brought back" and "someone was here
   * first" are both descriptions of this room.
   */
  place:
    "a crowded second-hand shop of things people brought back and never came " +
    "for. Every shelf has something on it that does not belong to the century " +
    "it is sitting in, and none of it is labelled.",
  /**
   * Who he is.
   *
   * This used to be one string, and three of its four clauses were
   * prohibitions -- which is exactly why he did nothing in a story but nod
   * twice and hand something over. A character defined by what he will not do
   * has nothing to do. The rules are still here, below, where they cannot
   * crowd him out.
   */
  who:
    "an old man, kind and dry and entirely unsurprised by any of this. He has " +
    "been doing whatever this is for a very long time. He asks better " +
    "questions than he answers, and he notices what a person is actually " +
    "asking rather than what they said.",
  /**
   * Why he lends it. He is not a mechanism; he chooses.
   *
   * Whit's role in Adventures in Odyssey: a good man who helps a young person
   * see history, who is trusted, and who is not the protagonist.
   */
  why:
    "He lends the lantern to people he judges ready for what is on the other " +
    "side of it, and he is rarely wrong. He does not say how he judges, and he " +
    "is not always pleased about it.",
  /** The rules, kept separate so they constrain him without replacing him. */
  never:
    "He never travels himself. He never explains the lantern. He never says " +
    "what someone is about to see, and he does not tell them what it meant " +
    "afterwards -- he lets them work that out.",
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
  /**
   * How it behaves once someone is through.
   *
   * PROMOTED FROM INVENTION TO CANON. Neither of these was in the data, and
   * the model reached for both anyway, in the same shape, in every test story:
   * the lantern went dark behind them on arrival, and it opened again when it
   * was time to come home. Left unwritten they would keep being reinvented,
   * and eventually reinvented differently -- so they are written down, in the
   * one file that gets to say what is true here.
   */
  rules:
    "Once someone is through, the lantern goes dark and stays dark; it is not " +
    "a door they can walk back through whenever they like. It lights again " +
    "when it is time to come back, and it decides when that is.",
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
