/**
 * "How to use Lion Tails": the guide's words, its shape, and what to photograph.
 *
 * ONE TABLE FOR BOTH. The guide is a tree of short explanations, each with a
 * screenshot of the control it is about. The words and the capture
 * instructions live together here, so `scripts/capture-guide.ts` and the dialog
 * read the same list -- a node cannot point at a screenshot nobody took, and a
 * screenshot cannot belong to a node nobody wrote.
 *
 * THREE LAYERS, AND WHY THERE ARE THREE:
 *  - a SCENE is a state of the app worth getting into (the Original tab with a
 *    character chosen, the reader with the picture bar armed). The capture
 *    script holds one builder per scene and builds each one ONCE.
 *  - a PLATE is one photograph taken in a scene. Several nodes may share it:
 *    the reader's bar has six controls worth explaining, and six photographs of
 *    the same toolbar is six times the bytes of one.
 *  - a NODE is one thing explained, and it says which plate to show and which
 *    control on it to ring.
 *
 * EMPHASIS IS NOT BAKED IN. The capture records each control's box as
 * fractions of its plate (`shared/guideShots.ts`, generated) and the app draws
 * the ring over the image at runtime: sharp at any width, right in all four
 * palettes, and re-recordable without redrawing anything.
 *
 * `data-guide` MARKERS ARE THE JOINT. Every control named here carries
 * `data-guide="<its id>"` in the app, and `tests/guide.test.ts` fails the build
 * if a marker is missing or appears twice. Labels in this app get rewritten
 * constantly; a text selector would quietly ring the wrong thing.
 */

/** Bump to show the welcome again after a substantial rewrite. */
import { FREE_STORIES, FREE_STORIES_PER_MONTH, PICTURE_CREDITS } from "./schema";

export const GUIDE_VERSION = 1;

export const GUIDE_TABS = [
  { id: "start", label: "Start here", tint: "bg-tab-basics", edge: "border-t-tab-basics" },
  { id: "create", label: "Create a Story", tint: "bg-tab-appearance", edge: "border-t-tab-appearance" },
  { id: "characters", label: "Characters", tint: "bg-tab-personality", edge: "border-t-tab-personality" },
  { id: "reading", label: "Reading", tint: "bg-tab-stories", edge: "border-t-tab-stories" },
] as const;

export type GuideTabId = (typeof GUIDE_TABS)[number]["id"];

/** What the app has to be showing. One builder each in the capture script. */
export const GUIDE_SCENES = [
  "create-top",
  "origin-blank",
  "origin-two-characters",
  "origin-with-character",
  "origin-series",
  "origin-somewhere-real",
  "origin-tail",
  "historical-chosen",
  "characters-list",
  "character-basics",
  "character-appearance",
  "character-stats",
  "character-grown-ups",
  "library",
  "reader",
  "reader-picking",
  "reader-picture-dialog",
  "reader-extras",
  "settings",
  "mobile-menu",
  // The only scene with the guide's OWN dialog open: it has a search box now,
  // and the guide explains its own controls like any other.
  "guide-open",
] as const;

export type GuideSceneId = (typeof GUIDE_SCENES)[number];

export type GuidePlate = {
  /** Also the webp's basename. */
  readonly id: string;
  readonly scene: GuideSceneId;
  /**
   * What to photograph, and the three kinds are a real distinction.
   *
   *  - `frame`: the marked element itself. For something that already IS a
   *    container with several controls in it -- the reader's bar, the row of
   *    actions, the sheet's tab strip.
   *  - `around`: the whole 390px viewport, scrolled so the marked control is
   *    in the middle of it. A control in a long form has no container worth
   *    framing, and a picture of the control alone tells you nothing about
   *    where to find it -- while wrapping one in a new div to photograph it
   *    would be changing the app to suit the guide.
   *  - neither: the viewport at the top of the page, for a page that is itself
   *    the subject.
   */
  readonly frame?: string;
  readonly around?: string;
};

export const GUIDE_PLATES = [
  { id: "create-top", scene: "create-top" },
  { id: "menu", scene: "mobile-menu", frame: "nav-panel" },
  { id: "origin-cast", scene: "origin-blank", around: "cast" },
  { id: "origin-quick", scene: "origin-blank", around: "quick-character" },
  { id: "origin-shared", scene: "origin-two-characters", around: "shared-story" },
  { id: "origin-story", scene: "origin-with-character", around: "what-should-happen" },
  { id: "origin-series", scene: "origin-series", around: "series" },
  { id: "origin-real", scene: "origin-somewhere-real", around: "somewhere-real" },
  { id: "origin-way-in", scene: "origin-somewhere-real", around: "the-way-in" },
  { id: "origin-life", scene: "origin-somewhere-real", around: "which-part" },
  { id: "origin-tail", scene: "origin-tail", around: "story-length" },
  { id: "origin-prompts", scene: "origin-tail", around: "prompt-editor" },
  { id: "origin-submit", scene: "origin-tail", around: "write-it" },
  { id: "historical", scene: "historical-chosen", around: "dig-into" },
  { id: "characters-list", scene: "characters-list" },
  { id: "character-tabs", scene: "character-basics", frame: "character-tabs" },
  { id: "character-family", scene: "character-basics", around: "family" },
  { id: "character-look", scene: "character-appearance", around: "character-pictures" },
  { id: "character-stats", scene: "character-stats", around: "stats" },
  { id: "character-grown", scene: "character-grown-ups", around: "grown-ups" },
  { id: "library", scene: "library" },
  { id: "story-top", scene: "reader", frame: "story-actions" },
  { id: "reader-bar", scene: "reader", frame: "reader-bar" },
  { id: "reader-actions", scene: "reader", frame: "reader-actions" },
  { id: "reader-picking", scene: "reader-picking", frame: "reader-picking" },
  { id: "picture-dialog", scene: "reader-picture-dialog", frame: "picture-dialog" },
  { id: "reader-extras", scene: "reader-extras", frame: "reader-extras" },
  { id: "settings-pictures", scene: "settings", around: "picture-settings" },
  { id: "settings-parent", scene: "settings", around: "parent-mode" },
  { id: "settings-resets", scene: "settings", around: "start-sheet-again" },
  { id: "settings-quests", scene: "settings", around: "quest-first-visit" },
  // `around`, not `frame`: a strip of the input alone would be a plate the ring
  // covers entirely, which GuideShot deliberately draws no ring for. The
  // viewport shows the box with the tabs under it, which is where it lives.
  { id: "guide-search", scene: "guide-open", around: "guide-search" },
] as const satisfies readonly GuidePlate[];

export type GuidePlateId = (typeof GUIDE_PLATES)[number]["id"];

export type GuideNodeSpec = {
  readonly id: string;
  readonly tab: GuideTabId;
  /** null for a tab's root. */
  readonly parent: string | null;
  /** The control's own words, wherever it has them. */
  readonly title: string;
  /** Why it is there, and why you would use it. One to three sentences. */
  readonly why: string;
  readonly shot?: { readonly plate: GuidePlateId; readonly emphasise: string };
  /** Honest about what a control needs. Rendered as a plain line. */
  readonly needs?: "parent-mode" | "own-key";
};

export const GUIDE_NODES = [
  // ---------------------------------------------------------------- Start here
  {
    id: "what-it-is",
    tab: "start",
    parent: null,
    title: "What Lion Tails is",
    why:
      "A story is written for the child who is going to hear it, by name, with the people and the " +
      "animals they know in it. Underneath every one is something true: a real account from " +
      "Scripture, somebody who really lived, or one choice worth talking about afterwards.",
  },
  {
    id: "how-to-use",
    tab: "start",
    parent: "what-it-is",
    title: "How to use",
    why:
      "This guide. It sits in the top left of the pages it covers, so you can open it beside the " +
      "thing you are looking at rather than trying to remember what it said.",
    shot: { plate: "create-top", emphasise: "how-to-use" },
  },
  {
    id: "guide-search",
    tab: "start",
    parent: "how-to-use",
    title: "Find it by name",
    why:
      "Type what you are after — pictures, series, credits, print — and this takes you straight to " +
      "the part that explains it, on whichever tab it lives. It answers with places to look rather " +
      "than answers of its own, so what you read is always the guide itself.",
    shot: { plate: "guide-search", emphasise: "guide-search" },
  },
  {
    id: "where-things-are",
    tab: "start",
    parent: "what-it-is",
    title: "Where everything lives",
    why:
      "Four places matter: Create Story writes one, My Stories keeps them, Characters is who they " +
      "are about, and the gear is Settings. Everything else can wait.",
    shot: { plate: "menu", emphasise: "nav-panel" },
  },
  {
    id: "parent-mode",
    tab: "start",
    parent: "what-it-is",
    title: "Parent Mode",
    why:
      "Your password unlocks the grown-up half: editing a story's words, typing anything you like " +
      "into a character sheet, and the prompt editor. It turns itself off after half an hour " +
      "unless you ask it to stay, because a shared tablet left unlocked is Parent Mode for the " +
      "children.",
    shot: { plate: "settings-parent", emphasise: "parent-mode" },
  },
  /**
   * CREDITS, in the guide rather than in a page of their own. Blake asked for
   * this where the how-to-use information already is, and the numbers are
   * interpolated from the constants the server charges with -- a price
   * written in prose is a price that outlives the code.
   */
  {
    id: "credits",
    tab: "start",
    parent: "what-it-is",
    title: "Credits",
    why:
      `Writing costs credits. You start with ${FREE_STORIES} and get ${FREE_STORIES_PER_MONTH} back at the ` +
      "start of each month, up to that same number again -- a top-up, not a refill, so a quiet " +
      "month does not stockpile. Settings shows what is left and what the next story costs.",
  },
  {
    id: "what-things-cost",
    tab: "start",
    parent: "credits",
    title: "What things cost",
    why:
      "A story is 1 credit on the usual model and 3 on the biggest one. A picture is " +
      `${PICTURE_CREDITS.medium} credit at standard, ${PICTURE_CREDITS.high} at detailed and ` +
      `${PICTURE_CREDITS.xhigh} at finest -- and every story draws a cover, so that is added to ` +
      "the price you see before you press. One expensive story can spend a month's credits, which " +
      "is worth knowing before a child picks the finest of everything.",
  },
  {
    id: "picture-settings",
    tab: "start",
    parent: "credits",
    title: "Pictures",
    why:
      "How good the pictures are, and therefore what they cost, in Settings. Turning them off " +
      "costs nothing at all and still writes the story -- which is the setting to reach for when " +
      "credits are low. It applies to a story's cover, to any picture you make while reading, and " +
      "to your characters' portraits.",
    shot: { plate: "settings-pictures", emphasise: "picture-settings" },
  },
  {
    id: "own-key",
    tab: "start",
    parent: "credits",
    title: "Using your own OpenAI key",
    why:
      "Put your own key in Settings and nothing costs credits at all: the stories and pictures go " +
      "to OpenAI on your account and are billed there. The eight free portraits every account " +
      "starts with are drawn at detailed quality at most; with your own key they are drawn at " +
      "whatever you chose.",
  },

  // ------------------------------------------------------------ Create a Story
  {
    id: "create",
    tab: "create",
    parent: null,
    title: "Create a Story",
    why:
      "Two kinds of story, and the choice is the first thing on the page. Original is a story " +
      "about your own character. Historical & Biblical is the real thing itself, with no " +
      "invented children in it.",
    shot: { plate: "create-top", emphasise: "story-tabs" },
  },
  {
    id: "original",
    tab: "create",
    parent: "create",
    title: "Original",
    why:
      "Your character's own story. All it needs is somebody to be about — everything below it is " +
      "optional, and a story with nothing else set still comes out whole.",
    shot: { plate: "create-top", emphasise: "original-tab" },
  },
  {
    id: "cast",
    tab: "create",
    parent: "original",
    title: "Choose who is in this story",
    why:
      "Saved characters, up to eight, and the first one is who the story follows. Use this rather " +
      "than typing a name each time: a saved character keeps their picture, their family and what " +
      "they have already learned.",
    shot: { plate: "origin-cast", emphasise: "cast" },
  },
  {
    id: "shared-story",
    tab: "create",
    parent: "cast",
    title: "No main character",
    why:
      "Tick it when two or three children should share the story rather than one leading it. The " +
      "crowns disappear, and the story stops treating anyone as the one it is about.",
    shot: { plate: "origin-shared", emphasise: "shared-story" },
  },
  {
    id: "quick-character",
    tab: "create",
    parent: "cast",
    title: "Quick Character",
    why:
      "A name and boy or girl, for a story right now without saving anybody. It disappears as " +
      "soon as you choose a saved character, because then there is nothing for it to do.",
    shot: { plate: "origin-quick", emphasise: "quick-character" },
  },
  {
    id: "what-should-happen",
    tab: "create",
    parent: "original",
    title: "What should happen in this story?",
    why:
      "The one box worth filling in. Whatever a child is actually facing — a first day, a lost " +
      "pet, a sister to forgive — put it here and the story is about that.",
    shot: { plate: "origin-story", emphasise: "what-should-happen" },
  },
  {
    id: "virtue",
    tab: "create",
    parent: "original",
    title: "Virtue to learn",
    why:
      "Pick one and the story is built to teach it, and every character in it keeps it afterwards " +
      "as something they have learned. Leave it empty and the story simply happens.",
    shot: { plate: "origin-story", emphasise: "virtue" },
  },
  {
    id: "story-type",
    tab: "create",
    parent: "original",
    title: "Story Type",
    why:
      "A regular story, a poem, or a moral story built around one choice. Poems and moral stories " +
      "are for your own ideas: a story set somewhere real is always a regular story, so those two " +
      "grey out once you set it somewhere real.",
    shot: { plate: "origin-story", emphasise: "story-type" },
  },
  {
    id: "series",
    tab: "create",
    parent: "original",
    title: "Part of a series?",
    why:
      "Tick it if you might write more in this world. The app then remembers what happened, so " +
      "the next story cannot contradict it. It costs one extra request at the end.",
    shot: { plate: "origin-series", emphasise: "series" },
  },
  {
    id: "cliffhanger",
    tab: "create",
    parent: "series",
    title: "Leave it on a cliffhanger",
    why:
      "Ends without resolving, on purpose, for a bedtime where tomorrow is the point. Only " +
      "offered when the story is part of a series, because a cliffhanger with nothing after it is " +
      "just an unfinished story.",
    shot: { plate: "origin-series", emphasise: "cliffhanger" },
  },
  {
    id: "somewhere-real",
    tab: "create",
    parent: "original",
    title: "Set it somewhere real",
    why:
      "The switch that turns an invented story into one that happens inside something true. " +
      "Everything it needs appears underneath it, greyed out until you turn it on, so you can see " +
      "what it is before you commit.",
    shot: { plate: "origin-real", emphasise: "somewhere-real" },
  },
  {
    id: "source",
    tab: "create",
    parent: "somewhere-real",
    title: "Where, or who?",
    why:
      "One event, one person who really lived, or one passage. Type a reference like John 3:16 and " +
      "it will study that. The account stays accurate; your character is the only invented thing " +
      "in it.",
    shot: { plate: "origin-real", emphasise: "source" },
  },
  {
    id: "the-way-in",
    tab: "create",
    parent: "source",
    title: "How does your character come to be there?",
    why:
      "Two ways, and they are genuinely different stories. Either they travel there from now, or " +
      "they were always there. The story is written differently for each.",
    shot: { plate: "origin-way-in", emphasise: "the-way-in" },
  },
  {
    id: "quest",
    tab: "create",
    parent: "the-way-in",
    title: "A Quest with the Timekeeper",
    why:
      "They start here and now, and a lantern takes them across. Choose this when the point is the " +
      "journey — a child who sees it happen, comes home, and knows something they did not know.",
    shot: { plate: "origin-way-in", emphasise: "quest" },
  },
  {
    id: "quest-world",
    tab: "create",
    parent: "quest",
    title: "The shop, the lantern and Mr Barnabas",
    why:
      "Every quest passes through one second-hand shop, kept by a man called Mr Barnabas, and the " +
      "lantern he hands over is what opens the way. Read the prologue in My Stories — it is in the " +
      "Timekeeper folder and it is always there.",
  },
  {
    id: "quest-length",
    tab: "create",
    parent: "quest",
    title: "A quest needs room",
    why:
      "A quest tells two stories — getting there and what they find — so the shorter lengths are " +
      "closed off and it starts at Long. It is written a chapter at a time and takes a few minutes.",
    shot: { plate: "origin-tail", emphasise: "story-length" },
  },
  {
    id: "quest-first-visit",
    tab: "create",
    parent: "quest",
    title: "Make the next quest a first visit",
    why:
      "After a few quests a character arrives already knowing the shop and the man. This, in " +
      "Settings, makes the next one a first visit again, so the wonder is new.",
    shot: { plate: "settings-quests", emphasise: "quest-first-visit" },
  },
  {
    id: "alongside",
    tab: "create",
    parent: "the-way-in",
    title: "They were always there",
    why:
      "No journey and no lantern: your character simply belongs in that time, helps, and pushes " +
      "back. Choose it when you want the account itself, with a familiar face inside it.",
    shot: { plate: "origin-way-in", emphasise: "alongside" },
  },
  {
    id: "which-part",
    tab: "create",
    parent: "source",
    title: "What part of their life?",
    why:
      "A whole life in one story is a summary. Pick one moment from it, or let the app choose, and " +
      "you get a scene instead. Only offered for people whose life has recorded moments.",
    shot: { plate: "origin-life", emphasise: "which-part" },
  },
  {
    id: "reading-level",
    tab: "create",
    parent: "original",
    title: "Reading Level",
    why:
      "Eight levels, from the first words to grown-up. It sets the sentences and the vocabulary, " +
      "not the subject, so the same idea can be told to a five-year-old or to you.",
    shot: { plate: "origin-tail", emphasise: "reading-level" },
  },
  {
    id: "story-length",
    tab: "create",
    parent: "original",
    title: "Story Length",
    why:
      "How long it takes to read aloud, from a couple of minutes to half an hour. Anything Long or " +
      "more is written a chapter at a time, which takes a few minutes and costs more.",
    shot: { plate: "origin-tail", emphasise: "story-length" },
  },
  {
    id: "prompt-editor",
    tab: "create",
    parent: "original",
    title: "Edit Prompts",
    why:
      "The exact words sent to the model, for when you want to change how it is asked rather than " +
      "what it is asked. Nothing here is needed for an ordinary story.",
    needs: "parent-mode",
    shot: { plate: "origin-prompts", emphasise: "prompt-editor" },
  },
  {
    id: "write-it",
    tab: "create",
    parent: "original",
    title: "Create Story",
    why:
      "Press it once. You can leave the page — it keeps writing, and it turns up in My Stories " +
      "when it is done. A long one takes several minutes.",
    shot: { plate: "origin-submit", emphasise: "write-it" },
  },
  {
    id: "historical",
    tab: "create",
    parent: "create",
    title: "Historical & Biblical",
    why:
      "The account on its own, with nobody invented in it. This is the tab for a child who asked " +
      "what really happened.",
    shot: { plate: "create-top", emphasise: "historical-tab" },
  },
  {
    id: "dig-into",
    tab: "create",
    parent: "historical",
    title: "What do you want to dig into?",
    why:
      "Pick the one thing the story is about — an event, a person, or a passage. Everything else " +
      "on this tab is about how far into it you want to go.",
    shot: { plate: "historical", emphasise: "dig-into" },
  },
  {
    id: "what-to-know",
    tab: "create",
    parent: "dig-into",
    title: "What do you want to know?",
    why:
      "Real questions, one to a line, and the suggestions underneath are there for when you cannot " +
      "think of one. This is what turns a retelling into an answer.",
    shot: { plate: "historical", emphasise: "what-to-know" },
  },
  {
    id: "digging-deeper",
    tab: "create",
    parent: "what-to-know",
    title: "Digging deeper",
    why:
      "Your questions are answered after the story, not inside it, and they appear under it in the " +
      "reader. A model asked to answer history inside a scene invents history.",
  },

  // --------------------------------------------------------------- Characters
  {
    id: "characters",
    tab: "characters",
    parent: null,
    title: "Your Characters",
    why:
      "Anyone you want stories about: someone you know, or someone invented. Save them once and " +
      "they can be in any story, with the same face and the same family every time.",
    shot: { plate: "characters-list", emphasise: "create-character" },
  },
  {
    id: "character-card",
    tab: "characters",
    parent: "characters",
    title: "A character's card",
    why:
      "Tap the card to open the sheet. A gold badge means new virtues to look at; a red one means " +
      "points waiting to be spent.",
    shot: { plate: "characters-list", emphasise: "character-card" },
  },
  {
    id: "sheet",
    tab: "characters",
    parent: "characters",
    title: "The character sheet",
    why:
      "Tabs down the sheet, and nothing on any of them is required — every field is optional, and " +
      "an empty one simply is not mentioned. Fill in what matters about this person and leave the " +
      "rest.",
    shot: { plate: "character-tabs", emphasise: "character-tabs" },
  },
  {
    id: "family",
    tab: "characters",
    parent: "sheet",
    title: "Family",
    why:
      "Say that Lucy's dad is Paul once, and Paul's sheet gets the other half of it by itself. The " +
      "story uses the words a child would — Dad, Mom, sister — and only when both of them are in " +
      "that story.",
    shot: { plate: "character-family", emphasise: "family" },
  },
  {
    id: "pets",
    tab: "characters",
    parent: "sheet",
    title: "Pets",
    why:
      "A named pet, with a tick for whether it comes along. A favourite animal is not a pet: the " +
      "stories used to invent a rabbit with a new name every time, which is exactly what this " +
      "replaces.",
    shot: { plate: "character-family", emphasise: "pets" },
  },
  {
    id: "appearance",
    tab: "characters",
    parent: "sheet",
    title: "Appearance",
    why:
      "A picture here is what makes them the same person in every story picture. Describing a " +
      "child in words gives you a different child each time; a portrait does not.",
    shot: { plate: "character-look", emphasise: "character-pictures" },
  },
  {
    id: "draw-a-picture",
    tab: "characters",
    parent: "appearance",
    title: "Draw a picture",
    why:
      "Draws them from what the sheet says. Do this once for anybody who will be in a story with " +
      "pictures.",
    shot: { plate: "character-look", emphasise: "draw-a-picture" },
  },
  {
    id: "photo-to-drawing",
    tab: "characters",
    parent: "appearance",
    title: "Turn a photo into a drawing",
    why:
      "The closest likeness of a real child. The photograph is used once and thrown away — only " +
      "the drawing is kept, and no code on that path can save the original.",
    shot: { plate: "character-look", emphasise: "photo-to-drawing" },
  },
  {
    id: "photo-as-it-is",
    tab: "characters",
    parent: "appearance",
    title: "Use a photo as it is",
    why:
      "Kept exactly as you upload it, and nothing is generated, so it costs nothing. It does not " +
      "have to be a person — a favourite toy works just as well.",
    shot: { plate: "character-look", emphasise: "photo-as-it-is" },
  },
  {
    id: "stats",
    tab: "characters",
    parent: "sheet",
    title: "Attributes and skills",
    why:
      "Five numbers and any skills you name, spent from one pool. Leave them alone and the story " +
      "says nothing about them: they are for a child who likes that their character is good at " +
      "climbing.",
    shot: { plate: "character-stats", emphasise: "stats" },
  },
  {
    id: "virtues",
    tab: "characters",
    parent: "sheet",
    title: "Virtues",
    why:
      "What this character has learned, and it fills itself in from the stories they have been in. " +
      "Nothing to fill out — it is a record, and the badge tells you when there is something new.",
  },
  {
    id: "grown-ups",
    tab: "characters",
    parent: "sheet",
    title: "Grown-ups",
    why:
      "Type anything at all, instead of choosing from the lists, and say what must always be true " +
      "of this character. It is behind Parent Mode because it goes straight into the story.",
    needs: "parent-mode",
    shot: { plate: "character-grown", emphasise: "grown-ups" },
  },
  {
    id: "start-sheet-again",
    tab: "characters",
    parent: "characters",
    title: "Start a character's sheet again",
    why:
      "Clears the numbers, the skills and the virtues a character has collected, in Settings. The " +
      "stories they have been in are untouched.",
    shot: { plate: "settings-resets", emphasise: "start-sheet-again" },
  },

  // ------------------------------------------------------------------ Reading
  {
    id: "library",
    tab: "reading",
    parent: null,
    title: "My Stories",
    why:
      "Four folders: everything, the Timekeeper's quests, your favourites, and the worlds stories " +
      "share. Stories are kept for a year; a favourite is kept for good.",
    shot: { plate: "library", emphasise: "folders" },
  },
  {
    id: "story-card",
    tab: "reading",
    parent: "library",
    title: "A story's card",
    why:
      "Tap it to read. The buttons on it favourite, share or delete the story without opening it, " +
      "and the chips underneath say who is in it and what it was written from.",
    shot: { plate: "library", emphasise: "story-card" },
  },
  {
    id: "reader-bar",
    tab: "reading",
    parent: "library",
    title: "The bar at the top",
    why:
      "How the story looks while you read it. Everything here is yours, not the story's, so it " +
      "follows you to the next one.",
    shot: { plate: "reader-bar", emphasise: "reader-bar" },
  },
  {
    id: "text-size",
    tab: "reading",
    parent: "reader-bar",
    title: "Text size",
    why: "Bigger for a child reading it themselves, smaller for you reading it aloud.",
    shot: { plate: "reader-bar", emphasise: "text-size" },
  },
  {
    id: "palette",
    tab: "reading",
    parent: "reader-bar",
    title: "Colour theme",
    why:
      "Paper, sepia, night and high contrast. Night is the one for a dark bedroom, and it changes " +
      "the whole app, not just the story.",
    shot: { plate: "reader-bar", emphasise: "palette" },
  },
  {
    id: "font",
    tab: "reading",
    parent: "reader-bar",
    title: "The reading font",
    why:
      "Several faces, including ones that are easier for a new or dyslexic reader. Worth trying " +
      "with the child rather than choosing for them.",
    shot: { plate: "reader-bar", emphasise: "font" },
  },
  {
    id: "classic",
    tab: "reading",
    parent: "reader-bar",
    title: "Classic",
    why:
      "Drop capitals, indented paragraphs and ornaments between scenes — a storybook rather than a " +
      "web page. Turn it off if it gets in the way of reading.",
    shot: { plate: "reader-bar", emphasise: "classic" },
  },
  {
    id: "focus",
    tab: "reading",
    parent: "reader-bar",
    title: "Focus",
    why:
      "Fades everything except the story. Move the pointer or press Escape and it all comes back.",
    shot: { plate: "reader-bar", emphasise: "focus" },
  },
  {
    id: "make-a-picture",
    tab: "reading",
    parent: "reader-bar",
    title: "Make a picture",
    why:
      "Draws any moment of the story you choose, using your characters' own faces. It takes a few " +
      "minutes and costs credits, so the price is written on the button — and the box that opens " +
      "says it again before anything is spent.",
    shot: { plate: "reader-bar", emphasise: "make-a-picture" },
  },
  {
    id: "picking",
    tab: "reading",
    parent: "make-a-picture",
    title: "Choosing the moment",
    why:
      "Highlight the sentence you want drawn and press Draw this. Nothing is drawn yet — it asks " +
      "first. The picture lands in the story beside that passage, and the text wraps around it.",
    shot: { plate: "reader-picking", emphasise: "picking" },
  },
  {
    id: "picture-note",
    tab: "reading",
    parent: "picking",
    title: "Anything that must be in the picture?",
    why:
      "The picture is drawn from the story, so it already knows who is in this part and where it " +
      "happens. This is for what it would not think of: the rain, the red umbrella, the time of " +
      "day. Leave it empty and the story alone decides.",
    shot: { plate: "picture-dialog", emphasise: "picture-note" },
  },
  {
    id: "picture-cost",
    tab: "reading",
    parent: "picking",
    title: "What it costs before you press it",
    why:
      "The box says what this picture costs — credits for most accounts, or the money it takes on " +
      "your own key — what you have left, and how many of the twelve this story has used. Nothing " +
      "is spent until you press the button inside it, so Cancel costs nothing at all.",
    shot: { plate: "picture-dialog", emphasise: "picture-cost" },
  },
  {
    id: "gallery",
    tab: "reading",
    parent: "make-a-picture",
    title: "Every picture is kept",
    why:
      "A new one is added rather than replacing the old — the first is often the better one. A " +
      "strip of them appears under the story as soon as there is more than one: tap a picture to " +
      "make it the story's own, or delete one you do not want.",
  },
  {
    id: "actions",
    tab: "reading",
    parent: "library",
    title: "What you can do with a story",
    why: "A row under the bar: keep it, share it, print it, save it, or edit its words.",
    shot: { plate: "reader-actions", emphasise: "reader-actions" },
  },
  {
    id: "favourite",
    tab: "reading",
    parent: "actions",
    title: "Favourite",
    why:
      "The one that matters: a favourite is kept for good, and everything else is cleared after a " +
      "year. Use it the first time a child asks for a story again.",
    shot: { plate: "reader-actions", emphasise: "favourite" },
  },
  {
    id: "share",
    tab: "reading",
    parent: "actions",
    title: "Share",
    why:
      "A link anybody can read without an account. It shows the story, its pictures and nothing " +
      "else about your family, and you can stop it at any time.",
    shot: { plate: "reader-actions", emphasise: "share" },
  },
  {
    id: "print-save",
    tab: "reading",
    parent: "actions",
    title: "Print and Save",
    why:
      "Print gives you a clean storybook page with the pictures in place. Save downloads the words " +
      "as a plain text file, so a story you love is not only in here.",
    shot: { plate: "reader-actions", emphasise: "print" },
  },
  {
    id: "edit-story",
    tab: "reading",
    parent: "actions",
    title: "Edit",
    why:
      "Change the title or the words yourself, for the line that came out wrong. The note saying " +
      "the story was written with AI cannot be edited away, and the story is marked as edited by a " +
      "parent.",
    needs: "parent-mode",
    shot: { plate: "reader-actions", emphasise: "edit-story" },
  },
  {
    id: "extras",
    tab: "reading",
    parent: "library",
    title: "After the story",
    why:
      "Questions to talk about, further reading that links to real passages and articles, and how " +
      "the story was made. The questions are the part worth using at bedtime.",
    shot: { plate: "reader-extras", emphasise: "extras" },
  },
  {
    id: "continue-story",
    tab: "reading",
    parent: "library",
    title: "Continue this story",
    why:
      "Writes the next one, knowing everything that happened in this one. This is how a series " +
      "starts, and the world it remembers becomes a universe in My Stories.",
    shot: { plate: "story-top", emphasise: "continue-story" },
  },
  {
    id: "add-to-universe",
    tab: "reading",
    parent: "continue-story",
    title: "Add to this Universe",
    why:
      "A new story in the same world rather than a direct sequel. Same memory, different " +
      "adventure. The button appears once a story belongs to a universe, which happens the " +
      "first time you continue one.",
  },
] as const satisfies readonly GuideNodeSpec[];

export type GuideNode = (typeof GUIDE_NODES)[number];
export type GuideNodeId = GuideNode["id"];

/**
 * What people TYPE, where it is not what the guide says.
 *
 * Blake: search "should basically just bring the user to the right location for
 * a feature that they are looking for" -- and a parent looking for the print
 * button types "pdf", which appears nowhere in the guide's prose. So a handful
 * of words per item, searched ahead of the prose (see shared/guideSearch.ts).
 *
 * ONE BLOCK, NOT A FIELD ON EACH NODE, for two reasons: the keys are
 * `GuideNodeId`, so a typo or a deleted node is a COMPILE error rather than a
 * word that quietly finds nothing; and the whole vocabulary is readable at
 * once, which is the only way to notice that two items claim the same word.
 * Sharing one is allowed and often right -- "cost" belongs to the credits item
 * and to the picture box -- and a test holds that every word here still finds
 * the item it belongs to.
 *
 * Lower case, no punctuation, and a phrase is fine ("dark mode"): the matcher
 * lowercases the query and matches whole words.
 */
export const GUIDE_KEYWORDS: Partial<Record<GuideNodeId, readonly string[]>> = {
  // ---- Start here -------------------------------------------------------
  "how-to-use": ["help", "guide", "instructions", "how do i"],
  "where-things-are": ["menu", "navigation", "pages", "where is"],
  "parent-mode": ["password", "lock", "locked", "pin", "grown ups only"],
  credits: ["cost", "money", "price", "free", "allowance", "run out", "how many"],
  "what-things-cost": ["cost", "money", "price", "spend", "per story"],
  "picture-settings": ["quality", "model", "cheaper", "turn off pictures", "detailed", "finest"],
  "own-key": ["api key", "openai", "own key", "unlimited"],
  // ---- Create a Story ---------------------------------------------------
  cast: ["who is in it", "add a character", "choose people", "more than one"],
  "shared-story": ["ensemble", "no lead", "share the story", "together"],
  "quick-character": ["one off", "temporary", "without saving", "just once"],
  "what-should-happen": ["idea", "plot", "what happens", "prompt"],
  virtue: ["moral", "lesson", "values", "teach"],
  "story-type": ["poem", "poetry", "moral story", "kind of story"],
  series: ["sequel", "next story", "universe", "same world", "carry on"],
  cliffhanger: ["to be continued", "unfinished", "ends mid"],
  "somewhere-real": ["bible", "history", "real place", "true story", "scripture"],
  source: ["hero of faith", "passage", "event", "verse", "who it is about"],
  "the-way-in": ["how they get there", "join the story"],
  quest: ["time travel", "lantern", "timekeeper", "barnabas", "shop", "travel back"],
  "quest-first-visit": ["reset quests", "first time again", "forget the quests"],
  alongside: ["was there", "already there", "no time travel", "belongs to that time"],
  "reading-level": ["age", "younger", "older", "hard words", "vocabulary"],
  "story-length": ["longer", "shorter", "chapters", "word count", "how long"],
  "prompt-editor": ["prompts", "advanced", "behind the scenes"],
  "write-it": ["generate", "make the story", "start writing"],
  historical: ["retelling", "no characters", "the real thing", "just the account"],
  "digging-deeper": ["questions", "answers", "facts", "explain"],
  // ---- Characters -------------------------------------------------------
  "character-card": ["badge", "alert", "waiting", "card"],
  family: ["mum", "mom", "dad", "brother", "sister", "parents", "relations", "cousin"],
  pets: ["dog", "cat", "pet", "animal"],
  appearance: ["looks", "hair", "eyes", "how they look", "description"],
  "draw-a-picture": ["avatar", "portrait", "face", "picture of them"],
  "photo-to-drawing": ["photo", "camera", "cartoon", "upload", "real picture"],
  "photo-as-it-is": ["photo", "upload", "keep the photo", "real picture"],
  stats: ["skills", "strength", "numbers", "points", "abilities"],
  virtues: ["courage", "receipts", "what they have done"],
  "grown-ups": ["must be true", "notes", "private", "only i can see"],
  "start-sheet-again": ["reset", "clear", "start over", "wipe"],
  // ---- Reading ----------------------------------------------------------
  library: ["my stories", "find a story", "folders", "saved stories", "old stories"],
  "story-card": ["thumbnail", "open a story", "delete a story"],
  "text-size": ["bigger", "smaller", "font size", "zoom", "too small"],
  palette: ["dark mode", "night", "sepia", "theme", "colours", "background", "bright"],
  font: ["typeface", "letters", "dyslexia", "easier to read"],
  classic: ["drop cap", "indent", "storybook", "fancy"],
  focus: ["full screen", "distraction", "hide everything"],
  "make-a-picture": ["illustration", "image", "art", "draw a scene"],
  picking: ["highlight", "select text", "which part", "choose the moment"],
  "picture-note": ["instructions", "must include", "ask for something", "extra detail"],
  "picture-cost": ["cost", "price", "money", "credits", "how much"],
  gallery: ["delete a picture", "choose a picture", "more than one picture"],
  favourite: ["keep", "star", "expires", "save forever", "delete"],
  share: ["link", "send", "show someone", "grandma", "public"],
  "print-save": ["pdf", "paper", "download", "export", "printer", "bedtime copy"],
  "edit-story": ["change the words", "fix", "rewrite", "typo", "mistake"],
  extras: ["verse", "questions", "further reading", "after"],
  "continue-story": ["next", "sequel", "more of this", "carry on"],
  "add-to-universe": ["universe", "same world", "collection"],
};
/** The ids that carry a screenshot -- what the generated manifest must cover. */
export type GuideShotNodeId = Extract<GuideNode, { shot: unknown }>["id"];

export type GuideTreeNode = {
  node: GuideNodeSpec;
  depth: number;
  children: GuideTreeNode[];
};

/**
 * The tables again, widened.
 *
 * `as const` is what gives the ids their literal types (and the compiler its
 * grip on the generated manifest), but it also makes every entry its own type
 * -- and an entry without `shot` or `frame` does not have that property to
 * read. The helpers below work over these views; the tables above are what the
 * types come from.
 */
const NODES: readonly GuideNodeSpec[] = GUIDE_NODES;
const PLATES: readonly GuidePlate[] = GUIDE_PLATES;

const byId = new Map<string, GuideNodeSpec>(NODES.map((n) => [n.id, n]));

/**
 * The tree for one tab, roots first.
 *
 * THROWS AT IMPORT on a parent that does not exist, a node in a different tab
 * from its parent, or a cycle -- questPrologue's rule. The alternative is a
 * blank tab that nothing explains.
 */
export function guideTree(tab: GuideTabId): GuideTreeNode[] {
  const wanted = NODES.filter((n) => n.tab === tab);
  const made = new Map<string, GuideTreeNode>();
  const roots: GuideTreeNode[] = [];
  for (const node of wanted) {
    const depth = depthOf(node);
    const entry: GuideTreeNode = { node, depth, children: [] };
    made.set(node.id, entry);
    if (node.parent === null) roots.push(entry);
  }
  for (const node of wanted) {
    if (node.parent === null) continue;
    const parent = made.get(node.parent);
    if (!parent) throw new Error(`guide: "${node.id}" has parent "${node.parent}", which is not in the ${tab} tab`);
    parent.children.push(made.get(node.id)!);
  }
  return roots;
}

/** How deep a node sits, and the cycle check. */
function depthOf(node: GuideNodeSpec): number {
  const seen = new Set<string>([node.id]);
  let depth = 0;
  let at = node;
  while (at.parent !== null) {
    const parent = byId.get(at.parent);
    if (!parent) throw new Error(`guide: "${at.id}" has parent "${at.parent}", which does not exist`);
    if (seen.has(parent.id)) throw new Error(`guide: "${node.id}" is in a loop of parents`);
    seen.add(parent.id);
    at = parent;
    depth += 1;
    if (depth > 20) throw new Error(`guide: "${node.id}" is nested absurdly deep`);
  }
  return depth;
}

/** Flattened in tree order: what the dialog renders and the tests walk. */
export function guideNodes(tab: GuideTabId): GuideTreeNode[] {
  const out: GuideTreeNode[] = [];
  const walk = (entries: GuideTreeNode[]) => {
    for (const entry of entries) {
      out.push(entry);
      walk(entry.children);
    }
  };
  walk(guideTree(tab));
  return out;
}

export function guideNode(id: string): GuideNodeSpec | undefined {
  return byId.get(id);
}

export function guidePlate(id: GuidePlateId): GuidePlate {
  const plate = PLATES.find((p) => p.id === id);
  if (!plate) throw new Error(`guide: no plate "${id}"`);
  return plate;
}

/** Every plate taken in one scene -- the capture script builds a scene once. */
export function platesForScene(scene: GuideSceneId): readonly GuidePlate[] {
  return PLATES.filter((p) => p.scene === scene);
}

/** Every node that shows this plate, so the script knows what to measure. */
export function nodesForPlate(plate: GuidePlateId): readonly GuideNodeSpec[] {
  return NODES.filter((n) => n.shot?.plate === plate);
}

/** Every node that carries a screenshot, for the manifest and its tests. */
export type GuideShot = NonNullable<GuideNodeSpec["shot"]>;

export function shotNodes(): readonly (GuideNodeSpec & { shot: GuideShot })[] {
  return NODES.filter(
    (n): n is GuideNodeSpec & { shot: GuideShot } => Boolean(n.shot),
  );
}

/** Every `data-guide` marker the guide depends on: frames and rings alike. */
export function guideMarkers(): string[] {
  const markers = new Set<string>();
  for (const plate of PLATES) {
    if (plate.frame) markers.add(plate.frame);
    if (plate.around) markers.add(plate.around);
  }
  for (const node of shotNodes()) markers.add(node.shot.emphasise);
  return [...markers].sort();
}

export const NEEDS_LABEL: Record<NonNullable<GuideNodeSpec["needs"]>, string> = {
  "parent-mode": "Needs Parent Mode, which you turn on in Settings.",
  "own-key": "Needs an admin account, or your own OpenAI API key in Settings.",
};
