/**
 * PICTURES OF THINGS THAT HAVE TO LOOK THE SAME EVERY TIME.
 *
 * A character is consistent because a file of their face is attached to every
 * picture they are in. Everything else in this world -- the shop, its sign, the
 * lantern lit and the lantern dark, the stone it closes into -- was anchored to
 * one sentence: "Render in a beautiful biblical storybook illustration style
 * with soft colors." A sentence cannot pin a building.
 *
 * THE BUDGET IS WHY THIS IS A SHEET AND NOT SIX FILES. `images.edit` takes
 * sixteen reference images, which is not much once a cast, Barnabas and an era
 * are in. Six separate plates would spend six of those slots on furniture. One
 * sheet spends one, and the panels inside it are still big enough: the API
 * tokenises an input in 32x32 patches against a ~1,536-patch budget, and a
 * 1536x1024 sheet is 48x32 = exactly 1,536 -- the largest frame that is not
 * downscaled at all. Six panels in it come to ~256 patches each, about 512x512
 * of real detail. Ample for a building or a lantern. NOT enough for a face,
 * which is why faces stay on their own plates and are not packed in here.
 *
 * THE SHEET MUST SAY WHERE EVERYTHING IS. The API cannot label an input image;
 * the prompt is the only thing that can. A montage nobody navigates is a
 * collage the model guesses at, so `look` spells the layout out, and it is
 * built from PANELS below rather than typed twice.
 *
 * GATED LIKE THE KEEPER'S FACE, and for the same reason. Attaching Barnabas to
 * every quest once produced William Tyndale wearing Barnabas's face and coat
 * (illustration.ts). A shop front attached to a scene set in a granary is the
 * same mistake with different furniture, so the sheet goes only where the scene
 * actually calls for something on it.
 */

import { DEVICE, SHOP } from "./lionTails";

/** What the picture is of, as the model wrote it. All a gate gets to see. */
export type PlateContext = {
  /** The image prompt for THIS picture -- not the story, not the brief. */
  scene: string;
};

export type ReferencePlate = {
  id: string;
  /** Under SHIPPED_IMAGE_DIR, and never inside the volume that shadows it. */
  file: string;
  role: "background" | "object" | "clothing";
  /** How the prompt names it. */
  name: string;
  /** What it shows, and where each thing sits in it. */
  look: string;
  /** Whether this scene has any use for it. */
  when: (ctx: PlateContext) => boolean;
};

/**
 * The six things on the sheet, in the order they are laid out.
 *
 * The ORDER IS THE CONTRACT between this list and the artwork: the file is
 * drawn to match it, and the layout sentence below is generated from it. If the
 * art is ever redrawn, this list moves with it or the prompt starts pointing at
 * the wrong panel -- which is worse than no sheet at all, because it is
 * confidently wrong.
 *
 * NO WHITE FLAME. The lantern burning white is what happens when a story cannot
 * be found, and it belongs to Movement III (docs/quests-of-the-timekeeper.md).
 * Putting it on a sheet every quest sees would spend the reveal before it is
 * written.
 */
export const WORLD_SHEET_PANELS = [
  "the shop from the street, with its sign hanging over the door",
  "the sign on its own, the paint cracked and the brass letters gone green at the edges",
  "the inside of the shop: crowded shelves, a counter, none of it labelled",
  "the lantern, lit",
  "the lantern, dark",
  "the small smooth stone the lantern closes into",
] as const;

export const WORLD_SHEET_FILE = "timekeeper-world.webp";

/** Two rows of three, which is what the artwork is drawn to. */
const ROWS = 2;

/**
 * The layout, in words, built from the panels so the two cannot drift.
 *
 * Reads as "a sheet of six separate pictures, in two rows of three. Top row,
 * left to right: ... Bottom row, left to right: ..." -- because "a montage of
 * the shop and the lantern" tells the model nothing about where to look.
 */
export function worldSheetLook(panels: readonly string[] = WORLD_SHEET_PANELS): string {
  const perRow = Math.ceil(panels.length / ROWS);
  const rows = ["Top row, left to right", "Bottom row, left to right"];
  const described = rows
    .map((label, i) => {
      const slice = panels.slice(i * perRow, (i + 1) * perRow);
      return slice.length ? `${label}: ${slice.join("; ")}.` : "";
    })
    .filter(Boolean)
    .join(" ");
  return (
    `a sheet of ${panels.length} separate pictures of things in this world, in ${ROWS} rows of` +
    ` ${perRow}, and not a scene. ${described}`
  );
}

/**
 * Does this scene call for anything on the sheet?
 *
 * Built from the canon constants, never a retyped string -- the same discipline
 * as KEEPER_PATTERN in illustration.ts. These are our own words, not anything a
 * user can write into, so compiling them is safe.
 *
 * "stone" is deliberately NOT here on its own: it is an ordinary English word
 * and a story about a stone wall would drag the whole sheet in. It earns its
 * place only next to the lantern, which is the only thing that makes it *the*
 * stone.
 */
/**
 * "sign" is deliberately absent, for the same reason as "stone".
 *
 * It is an ordinary word -- a sign on a road, a sign from God, a sign of rain
 * -- and a scene that means Barnabas's sign almost always names the shop in the
 * same breath, which already matches. A false positive is not free: it spends a
 * reference slot AND hands the model a shop front to put in a scene that has
 * none, which is the Tyndale mistake with different furniture.
 */
const SHOP_WORDS = [SHOP.name.replace(/\s*&\s*Co\.?/i, ""), "shop", "shopfront", "storefront"];
const DEVICE_WORD = DEVICE.name.replace(/^the /i, "");

export const WORLD_SHEET_PATTERN = new RegExp(
  `\\b(${[...SHOP_WORDS, DEVICE_WORD].join("|")})\\b`,
  "i",
);

export const TIMEKEEPER_WORLD_SHEET: ReferencePlate = {
  id: "timekeeper-world",
  file: WORLD_SHEET_FILE,
  role: "background",
  name: "the world of the Timekeeper",
  look: worldSheetLook(),
  when: ({ scene }) => WORLD_SHEET_PATTERN.test(scene),
};

/** Every plate there is. One, for now. */
export const REFERENCE_PLATES: readonly ReferencePlate[] = [TIMEKEEPER_WORLD_SHEET];

/** The plates this scene has a use for, in a stable order. */
export function platesForScene(ctx: PlateContext): ReferencePlate[] {
  return REFERENCE_PLATES.filter((p) => p.when(ctx));
}
