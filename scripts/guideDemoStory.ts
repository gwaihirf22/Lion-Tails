/**
 * The story the guide's screenshots are taken of.
 *
 * WRITTEN BY HAND, NOT GENERATED. The Reading tab has to show Favourite, Edit,
 * "Make a picture" and the gallery, and the built-in prologue hides all of
 * them (the server refuses to change a built-in story's pictures, so a strip
 * that only answers 403 is not shown). Generating one instead would cost money
 * every time anybody re-took the screenshots, and would put a different story
 * in the pictures each time.
 *
 * It ends with the real appendix headings from shared/storyAppendices.ts, so
 * the "After the story" plate shows what a reader really sees, and its picture
 * is one already shipped with the app -- no image model is called.
 *
 * Demo names only (Mia is one of the four seeded characters). Blake's family
 * must never appear in artwork that ships.
 */
import {
  MEETING_NOTE_HEADING,
  DIGGING_DEEPER_HEADING,
  FURTHER_LEARNING_HEADING,
} from "../shared/storyAppendices";

const BODY = [
  "Mia had lost the umbrella on a Tuesday, which is a bad day to lose anything.",
  "",
  "It was yellow, and it had a wooden handle worn smooth where her grandmother used to hold it. She had taken it to the park because the sky looked like rain, and she had come home with wet hair and no umbrella at all.",
  "",
  "“We will look tomorrow,” her mother said.",
  "",
  "Tomorrow was worse. The park was full of puddles and the bench where she had sat was empty, and a man with a broom told her that things left behind go to a cupboard behind the café.",
  "",
  "The cupboard was dark and smelled of wet coats. There were three umbrellas in it, and none of them was hers.",
  "",
  "Mia sat down on the step outside and did not cry, which took some doing.",
  "",
  "“Yellow?” said the woman from the café. “With a wooden handle?”",
  "",
  "She had kept it inside, by the till, because it looked like something somebody would come back for.",
  "",
  "Mia held it all the way home, and she did not open it once, even though it rained.",
].join("\n");

const CONTENT = [
  BODY,
  "",
  `${MEETING_NOTE_HEADING} Mia is invented, and so is the café. Nothing in this story is a real event.`,
  "",
  `${DIGGING_DEEPER_HEADING}`,
  "",
  "**Why do people keep lost things?** Because somebody might come back for them — which is a small kindness done in advance, for a person you have not met yet.",
  "",
  `${FURTHER_LEARNING_HEADING}`,
  "",
  "Ask what your family would do if they found something that mattered to somebody else.",
].join("\n");

export const GUIDE_DEMO_TITLE = "Mia and the Lost Umbrella";

/** The body of POST /api/story/save. `characterIds` is filled in at capture. */
export function guideDemoStory(characterId: string) {
  return {
    story: {
      title: GUIDE_DEMO_TITLE,
      content: CONTENT,
      moralOutcome: "positive" as const,
      storyType: "regular" as const,
      bibleVerse: {
        reference: "Luke 6:31",
        text: "As you would like people to do to you, do exactly so to them.",
      },
      applicationQuestions: [
        "Has anything of yours ever been lost and come back?",
        "Why do you think the woman kept the umbrella by the till?",
        "What could you keep safe for somebody else this week?",
        "Mia did not cry. Was that brave, or was it something else?",
        "What would you have said to the man with the broom?",
      ],
      // Already shipped with the app, so the reader has a picture at the end
      // and a gallery of one without any image model being called.
      imageUrl: "/public/images/quest-prologue-shop.webp",
      imagePrompt: "A yellow umbrella with a wooden handle, standing by a café till.",
    },
    request: {
      characterIds: [characterId],
      readingLevel: "early-elementary",
      storyLength: "short",
      storyType: "regular" as const,
      characterRole: "absent" as const,
    },
    isFavorite: false,
  };
}
