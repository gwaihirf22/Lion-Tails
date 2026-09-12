# Reference plates: how to make the Timekeeper world sheet

A **reference plate** is a picture attached to a generation so that something looks the same
every time. A character's portrait is a plate. `barnabas-timekeeper.webp` is a plate. This
document is the spec for the next one.

Until the file exists the app behaves exactly as it did before — the plate falls back to
describing itself in words and adds no reference image, which is pinned by a test. So this can
be made whenever, by whoever, without blocking anything.

## Why one sheet and not six files

`images.edit` takes **16** reference images. A quest can already want a cast, Barnabas, the
cover and the world's furniture, and six separate plates for the furniture would spend six of
those sixteen on scenery.

The arithmetic says one sheet is enough. An input image is tokenised in **32×32 patches
against a ~1,536-patch budget**, and OpenAI's docs state plainly that *"enlarging images
beyond model limits doesn't add detail"*. So:

- **1536×1024 is 48×32 = exactly 1,536 patches** — the largest frame that is not downscaled
  at all. Bigger is not better; it is the same budget spread thinner.
- Six panels in that frame come to **~256 patches each, about 512×512 of real detail**. Ample
  for a building, a sign or a lantern.
- **Not enough for a face.** Faces are high-frequency and want a full 1024×1024 plate of their
  own, which is why no face is packed onto this sheet.

## The file

| | |
|---|---|
| **Name** | `timekeeper-world.webp` |
| **Goes in** | `public/images/` |
| **Never in** | `public/images/stories/` — the `story_images` volume mounts over it at runtime and the file would vanish |
| **Size** | 1536×1024 |
| **Format** | `.webp`, `.png` or `.jpg` — the only three the images API takes |
| **Weight** | under 400 KB, so it stays cheap in every clone and image layer |

## The panels, in this exact order

**Two rows of three.** The order is a contract: `WORLD_SHEET_PANELS` in
`server/data/referencePlates.ts` generates the layout sentence the prompt uses, so if the art
and the list disagree the prompt points confidently at the wrong panel — worse than having no
sheet at all.

Top row, left to right:

1. the shop from the street, with its sign hanging over the door
2. the sign on its own, the paint cracked and the brass letters gone green at the edges
3. the inside of the shop: crowded shelves, a counter, none of it labelled

Bottom row, left to right:

4. the lantern, lit
5. **the lantern, dark**
6. the small smooth stone the lantern closes into

Each panel is a separate picture of a thing, not a scene. No people. One consistent style
across all six.

### What already exists, and what does not

Masters are in `attached_assets/`:

| panel | source |
|---|---|
| shop from the street | `lion_tails_cover.png` (1536×1024) — the shop is off to the left |
| the sign | `Barbnabas_&_Co_sign.png` (1774×887) |
| the lantern, lit | `lantern.png` (1254×1254) |
| the shop interior | **never drawn** |
| the lantern, dark | **never drawn** |
| the stone | **never drawn** |

`Barnabas_Timkeeper.png` (1254×1254) is his face and is *not* on this sheet — he has his own
plate at `public/images/barnabas-timekeeper.webp`.

### Not on the sheet: the white flame

The lantern burning white is what happens when a story cannot be found. It belongs to
Movement III (`docs/quests-of-the-timekeeper.md`), and a sheet every quest sees would spend
the reveal before it is written. A test asserts the panel list never mentions it.

## Making it

Pass the four masters above as reference images so the new panels land in the same style as
the ones that already exist, and ask for the six panels in the order above, in one 1536×1024
frame, two rows of three, each panel a separate picture of a thing with no people in it.

The dark lantern is the one that matters most, because the canon has said all along that the
lantern goes dark on the far side (`DEVICE.rules`, and `worldAnchor()` repeats it into every
chapter) and nothing has ever drawn one — there was no plate and no scene prompt that asked.

## When it lands

Drop the file into `public/images/` and it starts being used, with no code change. Then check
the layout constant against the art by eye once: panel 5 must actually be the dark lantern,
because the prompt will say it is.
