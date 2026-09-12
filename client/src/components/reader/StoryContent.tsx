import { Fragment, useMemo } from "react";
import { anchorBlock, type Block, type Inline, type StoryDoc } from "@/lib/storyContent";
import type { StoryPicture } from "@shared/schema";

/**
 * The story text itself, and nothing else.
 *
 * Everything is a React node -- there is no dangerouslySetInnerHTML anywhere on
 * this path, so model output cannot inject markup no matter what it contains.
 */

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === "strong" ? (
          <strong key={i}>{p.v}</strong>
        ) : p.t === "em" ? (
          <em key={i}>{p.v}</em>
        ) : (
          <Fragment key={i}>{p.v}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * One block, with its position on it.
 *
 * `data-block` is ON the element and not on a wrapper, deliberately: every
 * rule in reader.css is a direct-child or adjacent-sibling selector
 * (`.reader-body > p`, `p + p`, `figure + p`), and a div between the body and
 * its paragraphs would silently take the paragraph spacing, the indents and
 * the drop cap with it. The attribute is the only identity a block has, and
 * it costs nothing.
 */
function BlockView({
  block,
  isOpener,
  index,
}: {
  block: Block;
  isOpener: boolean;
  index: number;
}) {
  switch (block.kind) {
    case "paragraph":
      return (
        // Lines joined with a space: within a prose block, a newline is soft
        // wrapping from the model, not a line the author meant to keep.
        // `reader-opener` is what the drop cap hangs off -- a class rather than
        // :first-of-type, so a leading heading or scene break cannot move it.
        <p data-block={index} className={isOpener ? "reader-opener" : undefined}>
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 ? " " : null}
              <Inlines parts={line} />
            </Fragment>
          ))}
        </p>
      );

    case "verse":
      // One span per line. A wrapped long line then HANGS, instead of looking
      // like a new line of the poem, which is what whitespace-pre-line would
      // have given us.
      return (
        <p data-block={index} className="reader-verse">
          {block.lines.map((line, i) => (
            <span className="reader-verse-line" key={i}>
              <Inlines parts={line} />
            </span>
          ))}
        </p>
      );

    case "heading": {
      const Tag = (`h${Math.min(6, Math.max(2, block.level))}`) as "h2";
      return (
        <Tag data-block={index} className="reader-heading">
          <Inlines parts={block.content} />
        </Tag>
      );
    }

    case "list":
      return (
        <ul data-block={index} className="reader-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines parts={item} />
            </li>
          ))}
        </ul>
      );

    case "sceneBreak":
      return <div data-block={index} className="reader-scene-break" role="separator" aria-hidden="true" />;
  }
}

/**
 * A picture inside the story, with the text flowing around it.
 *
 * A FLOAT, and therefore rendered BEFORE the block it belongs to: a float is
 * out of flow, and what wraps it is whatever comes after it in the source. So
 * the anchored paragraph and the ones following are the text that runs beside
 * the picture, which is the picture-book shape Blake asked for -- "wrapped by
 * text especially on large screens and even on small screens".
 *
 * The side alternates down the page, derived from position rather than
 * stored: nothing about which way a picture faces is worth a column.
 *
 * The button is the whole figure and carries no .reader-chrome -- focus mode
 * fades that class to opacity 0 AND pointer-events none, and a picture you
 * cannot open while reading is the one state this must not have.
 */
function StoryFigure({
  picture,
  side,
  onOpen,
}: {
  picture: StoryPicture;
  side: "left" | "right";
  onOpen: (picture: StoryPicture) => void;
}) {
  return (
    <figure className="reader-figure" data-side={side}>
      <button
        type="button"
        onClick={() => onOpen(picture)}
        aria-label="See this picture larger"
        className="reader-figure-button"
      >
        <img src={picture.url} alt={picture.prompt || "A picture from this story."} loading="lazy" />
      </button>
    </figure>
  );
}

export function StoryContent({
  doc,
  pictures,
  onOpenPicture,
  bodyBlocks,
}: {
  doc: StoryDoc;
  /**
   * The story's pictures. Only the anchored ones are drawn here; the rest are
   * the end-of-story picture and whatever else is in the gallery.
   */
  pictures?: StoryPicture[];
  onOpenPicture?: (picture: StoryPicture) => void;
  /** Anything at or past this index is an appendix. Nothing anchors there. */
  bodyBlocks?: number;
}) {
  // The doc is parsed ONCE by StoryDisplay and passed down. The first version
  // parsed here and reported the result upward with a callback during render,
  // which is a setState on a different component mid-render -- React warns,
  // and it can loop. Parsing where the result is needed by three components
  // removes the problem rather than working around it.

  // The first PARAGRAPH, not the first block -- a story that opens with a
  // heading or a scene break should still drop-cap its first real paragraph.
  const openerIndex = doc.blocks.findIndex((b) => b.kind === "paragraph");

  /**
   * Which pictures sit above which block.
   *
   * Resolved through anchorBlock, so a picture whose passage a parent has
   * rewritten finds its text again, and one whose passage is gone entirely
   * lands nowhere rather than above some unrelated paragraph.
   */
  const byBlock = useMemo(() => {
    const map = new Map<number, StoryPicture[]>();
    if (!pictures?.length || !onOpenPicture) return map;
    for (const picture of pictures) {
      if (!picture.anchor) continue;
      const at = anchorBlock(doc.blocks, picture.anchor, bodyBlocks);
      if (at === -1) continue;
      map.set(at, [...(map.get(at) ?? []), picture]);
    }
    return map;
  }, [doc.blocks, pictures, onOpenPicture, bodyBlocks]);

  // Alternating sides, counted down the page rather than per block, so two
  // pictures in a row do not both face the same way.
  let drawn = 0;

  return (
    <div className="reader-body">
      {doc.blocks.map((block, i) => (
        <Fragment key={i}>
          {byBlock.get(i)?.map((picture) => (
            <StoryFigure
              key={picture.id}
              picture={picture}
              side={drawn++ % 2 === 0 ? "right" : "left"}
              onOpen={onOpenPicture!}
            />
          ))}
          <BlockView block={block} isOpener={i === openerIndex} index={i} />
        </Fragment>
      ))}
    </div>
  );
}

export default StoryContent;
