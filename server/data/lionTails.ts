/**
 * The Lion Tails universe -- "Quests of the Timekeeper" -- as much of it as the
 * MODEL is allowed to know.
 *
 * WHY THIS IS A MODULE AND NOT A FEW SENTENCES IN A PROMPT.
 *
 * When a character goes on a quest, something has to carry them there, and
 * somebody has to know how. That is lore, and lore has two properties that
 * prompt strings handle badly. It gets RENAMED -- a name baked into six prompt
 * strings is renamed in five of them by whoever is in a hurry. And it GROWS --
 * this is a real universe with its own continuity, not a device that appears
 * in paragraph one and is never mentioned again.
 *
 * So the names are data, and the rules are data, and one function composes
 * them into the prompt. Renaming the keeper is one edit to one object, and
 * every prompt that mentions him follows.
 *
 * TWO AUDIENCES, TWO HOMES. This file holds only what the model may let show.
 * The arc -- the five movements, the story that has been forgotten, who the
 * Lion is, how it ends -- lives in docs/quests-of-the-timekeeper.md, for
 * humans. The Lion himself is the line: the model may put his NAME in
 * Barnabas's mouth, once, mysteriously, and may never put HIM in the scene. A model told the ending says so in chapter two. So a rule below is
 * phrased as something that is TRUE, never as something that is COMING.
 *
 * WHAT ELSE IS DELIBERATELY NOT HERE. The universe's actual continuity: who
 * has travelled before, what happened last time, what is still unresolved.
 * That is state, not a constant, and the app already has somewhere for it:
 * `story_universes.world_state` and the extraction in worldState.ts keep
 * graded, evolving facts across a series, including the "you may ignore these"
 * tier that stops a sequel reading like a checklist. A quest that remembers is
 * that machinery pointed at this universe. This file holds only what is true
 * before any story is written.
 */

/**
 * The shop, and what is on its shelves.
 *
 * The sign is quoted in the prologue every reader starts with, so it is canon
 * in the strongest sense: a reader can check it. The shelf is the prologue's
 * too. These objects are how the quests will eventually turn out to be one
 * story rather than many -- the same button in two centuries -- and that only
 * works if every story draws from one list.
 */
export const SHOP = {
  name: "Barnabas & Co.",
  sign: "BARNABAS & CO. -- KEEPERS OF THINGS LOST TO TIME",
  /**
   * What a story may notice on a shelf. PERMISSION, not inventory: the prompt
   * says one of these may be seen and none has to be, the same grading
   * worldState.ts uses for threads, because a list of eight rendered as a list
   * is the character-sheet tour in a new costume.
   */
  shelf: [
    "a compass carried farther than its owner meant to go",
    "a wooden toy carved by a father unsure he would see his children again",
    "a brass key to a door that no longer exists",
    "a button from a coat worn by a man who stood when everyone else ran",
    "a faded journal",
    "a tiny crown",
    "a broken watch",
  ],
  /** Never uncovered, never described. The one thing the model may not use. */
  underTheCloth: "one small thing under a cloth",
} as const;

/**
 * The keeper: the adult who knows what the device is and does not explain it.
 *
 * Modelled on the role Whit plays in Adventures in Odyssey -- a good man who
 * helps a young person see history, who is trusted, and who is not the
 * protagonist. He is a door and a conscience, not a narrator.
 *
 * Settled. A two-thousand-word prologue and a universe named after him settle
 * it. Nothing downstream reads the name except through this object, and the
 * prologue is built from it too.
 */
export const KEEPER = {
  /** How he is introduced. */
  name: "Mr Barnabas",
  /** How he is referred to after that. */
  shortName: "Barnabas",
  /** What he is. The UI, the appended note and the prologue all say this word. */
  title: "the Timekeeper",
  /**
   * WHERE HE IS, and the reason this field exists at all.
   *
   * He had no place, so every story invented one and no two agreed: three test
   * stories in a row put him under a library staircase, in a churchyard, and
   * in "his room". That is not variety, it is a universe contradicting itself,
   * and it is the thing a reader notices first when they read two of these
   * back to back.
   */
  place:
    `${SHOP.name}, a crowded second-hand shop of things people brought back ` +
    "and never came for, none of it labelled. The sign over the door reads " +
    `"${SHOP.sign}".`,
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
    "neither particularly old nor particularly young, with silver in his " +
    "hair and clothes from a century nobody could name; kind, dry, and " +
    "entirely unsurprised by any of this. He has been doing whatever this is " +
    "for a very long time. He asks better questions than he answers, and he " +
    "notices what a person is actually asking rather than what they said.",
  /**
   * Why he lends it. He is not a mechanism; he chooses -- but he chooses the
   * PERSON, never the destination. That distinction is the universe's, and it
   * used to be contradicted right here ("ready for what is on the other side
   * of it" says he knows what is there).
   */
  why:
    "He lends the lantern to people he judges ready for a story, and he is " +
    "rarely wrong about the person. Which story is not his to say: he does " +
    "not choose where it opens and does not always know. He knows the rules, " +
    "not the place. He does not explain how he judges, and he is not always " +
    "pleased about it.",
  /**
   * The rules, kept separate so they constrain him without replacing him.
   *
   * "Never goes with them", not "never travels": he exists partly outside
   * ordinary time and may turn up inside a quest, purposefully. What he never
   * does is take the journey for them.
   */
  never:
    "He never goes with them. He never explains the lantern. He never says " +
    "what someone is about to see, and never, afterwards, what it meant.",
  /**
   * FOR PICTURES ONLY, and only when the drawing cannot be read.
   *
   * worldCanon() does not render this and must not start: the story is told
   * what he is LIKE (`who`), which is the fact a story can use, and a list of
   * garments is prompt weight spent on nothing. The real answer for a picture
   * is KEEPER_FACE_FILE; this is the sentence that stands in for it if the file
   * is missing, and it describes the same man.
   */
  look:
    "a man with grey-white hair and a full grey beard, in a heavy dark brown " +
    "coat over an embroidered waistcoat, carrying a brass lantern.",
} as const;

/**
 * HIS FACE, and there is only one.
 *
 * A separate export rather than a field on KEEPER, because KEEPER is the text
 * a model is allowed to read and worldCanon() renders it into the brief -- a
 * filename has no business anywhere near a story prompt.
 *
 * It is a file and not a description on purpose. "Silver in his hair and
 * clothes from a century nobody could name" is enough for a sentence and
 * nowhere near enough for a picture: an image model asked twice draws two
 * different men. The drawing is passed to the image model as a reference so
 * that every Barnabas who appears is this Barnabas.
 *
 * WHERE IT LIVES IS LOAD-BEARING. public/ is copied into the runtime image,
 * but the story_images volume mounts over public/images/stories -- so a file
 * beside that directory ships and survives a redeploy, and a file inside it is
 * shadowed by the volume and simply is not there. attached_assets/ (where the
 * artwork was committed) is not in the runtime image at all.
 *
 * WEBP, NOT THE SOURCE PNG. The artwork is a 1254px photographic render and
 * PNG is the wrong container for one: 2.2MB, in every clone and every layer of
 * the image, against 167KB at 1024px in webp -- which the images API takes
 * alongside png and jpg. The full-size PNG stays in attached_assets as the
 * master. Replace this file to change his face; nothing reads its bytes but
 * the image call, and mimeFor() follows the extension.
 */
export const KEEPER_FACE_FILE = "barnabas-timekeeper.webp";

/**
 * The device. A lantern, and one place to change it.
 */
export const DEVICE = {
  name: "the lantern",
  /**
   * How the travelling works, said in a way that does not invite the model to
   * write a science-fiction mechanism. Vagueness is the point: the moment a
   * story explains HOW, the explanation becomes canon and the next story
   * contradicts it.
   *
   * "Opens onto a story", not "onto somewhere else": where it opens is not
   * chosen by lighting it, and the story it opens onto is the thing the
   * quest is for. KEEPER.why says who does not choose; this says what does.
   */
  brief:
    "an old lantern that does not light rooms. Lit, it opens onto a story -- " +
    "somewhere else, some when else. It answers to stories, not to " +
    "instructions: lighting it is not what chooses where. Nobody in the story " +
    "knows how it works, and nobody explains it. Do not invent a mechanism " +
    "for it.",
  /**
   * How it behaves once someone is through.
   *
   * The first half was PROMOTED FROM INVENTION TO CANON: the model reached
   * for "the lantern went dark behind them" in every test story, and left
   * unwritten it would keep being reinvented, eventually differently. The
   * second half REPLACES an earlier rule that the lantern "lights again when
   * it is time to come back" -- which contradicted the way home the universe
   * actually uses (see CANON.wayBack): a threshold on the far side.
   *
   * The lantern GOES with them. A first draft of this said it did not, and
   * the first quest written against it had the traveller carrying it through
   * every threshold anyway -- as Barnabas does in the prologue, which is
   * canon a reader can check. The data was wrong, not the story.
   */
  rules:
    "Once someone is through, the lantern goes dark and stays dark, however " +
    "far they carry it. It is not a door to walk back through whenever they " +
    "like. The way back, when it is time, is a threshold on the far side.",
} as const;

/**
 * The rules of the universe, as the model may know them.
 *
 * Each is a statement about what is TRUE, never about what is coming. Read the
 * header comment before adding one: if it would make a reader of this file
 * understand the ending, it does not belong here.
 */
export const CANON = {
  keeper:
    "A Timekeeper does not control time. A Timekeeper keeps what must not be " +
    "forgotten. There are others; this story has one.",
  forgetting:
    "What is going wrong in the world is not time but memory. People remember " +
    "that wars were fought and forget courage; that people suffered and " +
    "forget sacrifice; that someone spoke the truth and forget what it cost. " +
    "Every journey is into a story that holds something that must be " +
    "remembered, and the traveller is not told what.",
  /**
   * HOW A QUEST BEGINS, and it is not in the shop.
   *
   * Four of five long quests opened inside it, because worldCanon's first
   * line established the shop as the world before anything else was said and
   * the frame's opening arrived last. The rule was already true in two places
   * and told to the model in neither: the prologue -- canon a reader can
   * check -- says "Most people walk past it ... And some, very rarely, see
   * the light", and CANON.wayBack said the shop may appear where it could not
   * logically be, filed under the RETURN so the model only used it at the end.
   * That sentence now lives here, once.
   *
   * A MOMENT, NOT A CRISIS. Blake: "not something going on, but something
   * happening that in some way can relate to the story, like they are tempted
   * to sin against someone in some way or they have to deal with being
   * patient as someone is taking a long time." Nothing is broken and nobody
   * needs rescuing -- an opening that poses a problem makes the journey an
   * errand to solve it, which is the shape this is written to avoid.
   *
   * AND NOBODY EVER SAYS WHY. That the arrival has a cause is already canon
   * (see arrival, below); WHO causes it is withheld, and naming the link
   * between their morning and their destination would both leak that and turn
   * a quest into an illustration of a moral.
   */
  beginning:
    "A quest begins in the traveller's own life, never in the shop. Something " +
    "there is asking something of them -- a temptation to be unkind, a wait " +
    "they are impatient with, a slight they would like to repay. A moment, " +
    "not a crisis: nothing is broken and nobody needs rescuing. The story " +
    "they are sent to bears on that same thing, and NOTHING ever says so -- " +
    "not the narrator, not the Timekeeper, not the traveller. Then the shop " +
    "is there, where a shop could not be: the end of a corridor, a gap " +
    "between two houses. Sudden, or so quiet they half expected it. Always " +
    "the same shop, the same sign and the same man; only where and how it " +
    "arrives is new. Only they see it -- anyone else passing sees a " +
    "second-hand shop, an empty building, or nothing worth looking at.",
  arrival:
    "Arrival always has a cause, even when the traveller does not understand " +
    "it; it is never arbitrary teleportation. The boundary between times goes " +
    "thin first -- a familiar door, a lantern where no lantern should be, a " +
    "bell, a voice saying their name, a reflection in a window.",
  wayBack:
    "The way back is a threshold, never an announcement: a doorway, a road, a " +
    "shop window, a brass bell. The story ends when it has given the " +
    "traveller what they were sent to find.",
  ending:
    "Afterwards Barnabas asks what they found -- never whether they learned " +
    "something -- and if the answer is too easy, he asks again. He may appear " +
    "before the journey, during it, or at its end, purposefully and never " +
    "conveniently, and he is not omniscient.",
  /**
   * A HINT, in his mouth, and never in the scene. Blake's line. The model
   * gets the allusion; who the Lion is, and the Lion himself, are withheld --
   * one Lion in the scene of every brief is a lion in every story.
   */
  lion:
    "Asked how he does any of this, Barnabas says he does not: \"I have no " +
    "control over this.\" Pressed, he may say \"The great Lion knows no " +
    "bounds\" -- mysteriously, once, and no more. He never says who the Lion " +
    "is, and the Lion does not appear: not seen, not heard, not described.",
  boundaries:
    "Barnabas is not God and nobody treats him as one. Invent no doctrine, " +
    "contradict no Scripture, and let a real account happen exactly as it is " +
    "recorded.",
} as const;

/**
 * One way of opening a quest.
 *
 * `opening` is what happens in the present BEFORE the account begins;
 * `closing` is what the story may return to after it ends. Both are
 * instructions to the model, not text to be reproduced.
 */
export type FramingApproach = {
  /** Frozen onto the request. Stable: renaming one orphans stored requests. */
  id: string;
  /**
   * A human name for the approach. Not rendered anywhere yet -- the chosen
   * frame is visible only as its prose inside the prompt tab of the debug
   * panel. Kept because a trace surface will want it, and because a test
   * asserts every approach has one.
   */
  label: string;
  opening: string;
  closing: string;
};

/**
 * The approaches, one chosen per story.
 *
 * A SET, not a sentence, because Blake's requirement is that it cannot be the
 * same every time -- and a single line of arrival is exactly what makes every
 * quest open identically. Five is deliberately a small number: it is enough
 * that two stories in a row differ, and it is honest about being a foundation
 * rather than a universe.
 *
 * Each one describes a SHAPE and leaves the content to the story. "An errand
 * that never got finished" produces a different errand every time; "they were
 * carrying the shopping in" produces the same opening every time.
 *
 * NONE OF THEM OPENS IN THE SHOP. CANON.beginning owns the arrival -- their
 * own life, a moment asking something of them, and then the shop where a shop
 * could not be -- so what a frame varies is WHAT is being asked and HOW the
 * shop turns up. Two of these used to start with the traveller already
 * talking to Barnabas, which is most of why four of five long quests opened
 * inside the shop; both work one beat later, once they are through the door.
 */
export const FRAMING_APPROACHES: readonly FramingApproach[] = [
  {
    id: "errand",
    label: "an errand interrupted",
    opening:
      "Something ordinary is already underway and not yet finished -- a job " +
      "half done, somewhere they were supposed to be, a promise made that " +
      "morning and now inconvenient. The shop is on the way, on a stretch of " +
      "the way that has never had a shop on it. Do not resolve the unfinished " +
      "thing before they go.",
    closing:
      "At the end, come back to the unfinished thing. They still have to " +
      "finish it, and they are not the same person doing it.",
  },
  {
    id: "question",
    label: "a question asked and not answered",
    opening:
      "Open with a question already sitting in them, put badly or not out " +
      "loud -- something about what they are supposed to do, or why somebody " +
      "else does not have to. They are still carrying it when the shop turns " +
      `up in front of them. Inside, they put it to ${KEEPER.shortName}, who ` +
      "could answer it in a sentence if he chose to. He does not choose to. " +
      "He hands them the lantern instead.",
    closing:
      "At the end, return to the question. They may answer it themselves, or " +
      "find it was the wrong question. Do not have him explain it to them.",
  },
  {
    id: "brought-back",
    label: "something brought back",
    opening:
      "Open briefly -- one small moment in their day where something is being " +
      "asked of them and they have not answered it yet -- and get them " +
      "travelling quickly. The shop is simply there, and they go in without " +
      "much fuss. The weight of this one is at the end.",
    closing:
      "They come back carrying something they did not leave with -- an object, " +
      "a habit, a piece of knowledge, a mark. Close on it, and on somebody " +
      "noticing. Do not explain what it means.",
  },
  {
    id: "someone-else-first",
    label: "someone was here first",
    opening:
      "Open in their day with something small they would rather not have to " +
      "do well. When the shop arrives and they are inside it, there is " +
      "evidence that someone else has been here recently -- a name, a date, " +
      `an object left where it should not be. ${KEEPER.name} sees it and says ` +
      "nothing useful. Do not resolve who it was; this story is not about that.",
    closing:
      "At the end, the evidence is still there and still unexplained. Let them " +
      "notice it again.",
  },
  {
    id: "wrong-arrival",
    label: "not where they meant to be",
    opening:
      "Open with them mid-something that is testing their patience or their " +
      "temper, and let the shop appear at the least convenient moment. Then " +
      "make the arrival go wrong -- the wrong day, some distance from the " +
      "account, or early enough to wait. They walk INTO the account rather " +
      "than landing in the middle of it, and what they see on the way matters.",
    closing:
      "At the end they have to get back to where they arrived, and the way " +
      "back is not the way they came.",
  },
];

/** The approach used when a frozen request names one that no longer exists. */
const FALLBACK_APPROACH = FRAMING_APPROACHES[0];

/**
 * What a quest may not be named after.
 *
 * Every quest story was coming back called "The Lantern and the ...": four in
 * a row, across four different framing approaches, on every story long enough
 * to be written in chapters. The cause is not the frames -- those vary, and
 * the openings they produce genuinely differ -- it is that the title is asked
 * for with no guidance at all while the lantern is the most repeated noun in
 * the story, and the outline hands the model the shape ready-made by calling
 * its own first chapter "The Lantern and the Trenches".
 *
 * So the rule names the three props that are in EVERY quest and rules them
 * out, which is the whole test: a title that would fit any of these stories
 * is not a title for one of them. Composed from the canon rather than typed
 * again, so renaming the shop cannot leave this banning a word nobody uses.
 *
 * Not applied to an ordinary story. There is no lantern in one, and a rule
 * about furniture that is not there is prompt spent on nothing.
 */
export function questTitleRule(): string {
  const device = DEVICE.name.replace(/^the /i, "");
  return [
    `Title it from what happens in THIS story -- the account they walk into, what it costs them,`,
    `what they carry back. NOT after ${DEVICE.name}, ${SHOP.name}, or ${KEEPER.shortName}: those are in`,
    `every one of these stories, so a title built on them would fit any of them and belongs to none.`,
    `Do not use the word "${device}" in the title at all.`,
    `Suggest rather than summarise -- make a reader curious instead of explaining the story before it starts.`,
  ].join(" ");
}

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

/**
 * The world, for the full brief -- composed, not restated.
 *
 * ONE function assembles KEEPER, DEVICE, SHOP, CANON and the frame, so the
 * prompt cannot describe the man twice in two ways. Order matters and is
 * deliberate: who and where; what he keeps; what is true about journeys; the
 * shelf, as permission; his rules last, so the prohibitions are the most
 * recent thing said about him rather than the whole of it; then the frame,
 * which is where THIS story opens and closes.
 */
export function worldCanon(frame: FramingApproach): string[] {
  return [
    `${KEEPER.name} is ${KEEPER.title}. He is ${KEEPER.who} ${KEEPER.why}`,
    CANON.keeper,
    // The premises AFTER the man and what he does, never before: leading
    // with the shop is what made the shop the place every story started.
    `He keeps ${KEEPER.place}`,
    CANON.beginning,
    `What he keeps is ${DEVICE.brief} ${DEVICE.rules}`,
    CANON.forgetting,
    CANON.arrival,
    CANON.wayBack,
    CANON.ending,
    `On the shelves: ${SHOP.shelf.join("; ")}; and ` +
      `${SHOP.underTheCloth}. One of these may be noticed in passing. None of ` +
      "them has to be. Never the thing under the cloth.",
    KEEPER.never,
    CANON.lion,
    CANON.boundaries,
    frame.opening,
    frame.closing,
  ];
}

/** "a, b and c" */
const list = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** One traveller and how many quests they have already been on. */
export type Traveller = { name: string; visits: number };

/**
 * Who has been here before, and what that changes about the opening.
 *
 * Blake: "if this is the character's first time going. and if ANY of the
 * characters it is their first time it should be noteworthy, and the 2nd time
 * is worth noting as well. but after that the characters should respond with
 * some knowledge of barnabas and the shop, the 'magic'."
 *
 * Three registers and no more. A fourth -- "they have been nine times" --
 * would say nothing a story could act on that the third does not already say.
 *
 * A NEWCOMER OUTRANKS EVERYONE. With a mixed cast the first-timer is the one
 * the opening is about, because the wonder belongs to whoever still has it,
 * and a veteran standing next to them is what makes it visible.
 *
 * Outside worldCanon deliberately: the canon is the same for every story and
 * is capped as such, and this changes per cast. It renders beside it.
 */
export function questFamiliarity(travellers: readonly Traveller[]): string {
  const newcomers = travellers.filter((t) => t.visits === 0).map((t) => t.name);
  const returning = travellers.filter((t) => t.visits === 1).map((t) => t.name);
  const seasoned = travellers.filter((t) => t.visits >= 2).map((t) => t.name);
  const out: string[] = [];

  if (newcomers.length > 0) {
    const they = newcomers.length === 1 ? "has" : "have";
    out.push(
      `${list(newcomers)} ${they} never been. The shop is new, ${KEEPER.shortName} is a ` +
        "stranger, and nothing about any of it has been explained. Make that the weight " +
        "of the opening: let them work out where they are, and do not have anyone give " +
        "them a tour of it.",
    );
  }
  if (returning.length > 0) {
    const they = returning.length === 1 ? "has" : "have";
    out.push(
      `${list(returning)} ${they} been once. They know the shop is real and are not ` +
        "sure it will be there again. Let them notice that it is.",
    );
  }
  if (seasoned.length > 0) {
    const they = seasoned.length === 1 ? "knows" : "know";
    out.push(
      `${list(seasoned)} ${they} the shop, the man and what the lantern does. Explain ` +
        "none of it to them again, and do not have them marvel at the shop itself; " +
        "whatever is strange this time is strange to them too.",
    );
  }
  if (newcomers.length > 0 && seasoned.length + returning.length > 0) {
    out.push(
      "Let the one who has never been see it the way the others no longer can.",
    );
  }
  return out.join(" ");
}

/**
 * The world, for every chapter.
 *
 * The chapter prompt is the second-tightest in the system and is repeated per
 * chapter, so this is the handful of rules that fail PER CHAPTER rather than
 * per story: the thin place before a crossing, the threshold home, the
 * Timekeeper asking rather than telling, and the boundaries. Everything else
 * is already encoded in the outline.
 */
export function worldAnchor(): string {
  return (
    `This is a quest with ${KEEPER.name}, ${KEEPER.title}. Nothing crosses ` +
    "between times without the boundary going thin first -- a door, a bell, a " +
    "lantern where none should be -- and nothing is arbitrary. The lantern " +
    "stays dark on the far side; the way back is a threshold, never an " +
    "announcement, and the story ends when it has given what it was sent to " +
    `give. ${KEEPER.shortName} asks what they found and never says what it ` +
    "meant. He is not God; invent no doctrine and contradict no Scripture. " +
    "The great Lion is a name he may say once and never explain; the Lion " +
    "does not appear."
  );
}
