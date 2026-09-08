import { Fragment, useMemo } from "react";
import { parseStoryContent, type Block, type Inline, type StoryDoc } from "@/lib/storyContent";

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

function BlockView({ block, isOpener }: { block: Block; isOpener: boolean }) {
  switch (block.kind) {
    case "paragraph":
      return (
        // Lines joined with a space: within a prose block, a newline is soft
        // wrapping from the model, not a line the author meant to keep.
        // `reader-opener` is what the drop cap hangs off -- a class rather than
        // :first-of-type, so a leading heading or scene break cannot move it.
        <p className={isOpener ? "reader-opener" : undefined}>
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
        <p className="reader-verse">
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
        <Tag className="reader-heading">
          <Inlines parts={block.content} />
        </Tag>
      );
    }

    case "list":
      return (
        <ul className="reader-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines parts={item} />
            </li>
          ))}
        </ul>
      );

    case "sceneBreak":
      return <div className="reader-scene-break" role="separator" aria-hidden="true" />;
  }
}

export function StoryContent({
  content,
  verse,
  onParsed,
}: {
  content: string;
  /** True for a poem, so single newlines are kept as lines. */
  verse?: boolean;
  /** The parsed doc, so the print path and the extras can reuse it. */
  onParsed?: (doc: StoryDoc) => void;
}) {
  const doc = useMemo(() => parseStoryContent(content, { verse }), [content, verse]);

  // Reported during render rather than in an effect: the parent only stores it,
  // and an effect would render the extras one frame late.
  if (onParsed) onParsed(doc);

  // The first PARAGRAPH, not the first block -- a story that opens with a
  // heading or a scene break should still drop-cap its first real paragraph.
  const openerIndex = doc.blocks.findIndex((b) => b.kind === "paragraph");

  return (
    <div className="reader-body">
      {doc.blocks.map((block, i) => (
        <BlockView key={i} block={block} isOpener={i === openerIndex} />
      ))}
    </div>
  );
}

export default StoryContent;
