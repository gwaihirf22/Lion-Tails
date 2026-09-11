import { useReadingPrefs } from "@/hooks/use-reading-prefs";
import { READER_FONT_STEPS } from "@shared/schema";
import StoryContent from "./StoryContent";
import type { StoryDoc } from "@/lib/storyContent";
import type { StoryPicture } from "@shared/schema";

/**
 * The reading surface: the article, and the four axes applied to it.
 *
 * The tokens live on THIS element rather than on :root. That is not a style
 * preference -- main.tsx sets ~20 CSS variables as inline styles on <html>,
 * and an inline style on an ancestor beats any :root rule from a stylesheet.
 * Scoping the reader's tokens to its own element makes it structurally immune
 * to that, and to whatever else ends up on <html> later.
 */
export function ReadingSurface({
  title,
  doc,
  note,
  pictures,
  bodyBlocks,
  onOpenPicture,
}: {
  title: string;
  doc: StoryDoc;
  /** The story's pictures. Only the anchored ones are drawn in the text. */
  pictures?: StoryPicture[];
  /** Anything at or past this block is an appendix; nothing anchors there. */
  bodyBlocks?: number;
  onOpenPicture?: (picture: StoryPicture) => void;
  /**
   * A line under the title -- "Edited by a parent · 3 Sep 2026". Inside the
   * article, because the reader's tokens are scoped to it (see above) and a
   * sibling outside would not inherit the palette.
   */
  note?: React.ReactNode;
}) {
  const { prefs, fontSizePx } = useReadingPrefs();

  return (
    <article
      className="reader-surface"
      data-palette={prefs.palette}
      data-font={prefs.font}
      data-typeset={prefs.typeset}
      // Also as an attribute, so reader.css can express "no drop cap on EB
      // Garamond at the smallest sizes" declaratively rather than in JS.
      data-font-step={prefs.fontStep}
      style={
        {
          "--reader-font-size": `${READER_FONT_STEPS[prefs.fontStep] ?? fontSizePx}px`,
        } as React.CSSProperties
      }
    >
      <h1 className="reader-title">{title}</h1>
      {note && (
        <p
          className="reader-note"
          style={{ color: "var(--reader-muted)", fontSize: "0.85em", marginTop: "-0.75em", marginBottom: "1.75em", textAlign: "center" }}
        >
          {note}
        </p>
      )}
      <StoryContent
        doc={doc}
        pictures={pictures}
        bodyBlocks={bodyBlocks}
        onOpenPicture={onOpenPicture}
      />
    </article>
  );
}

export default ReadingSurface;
