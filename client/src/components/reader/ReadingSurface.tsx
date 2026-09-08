import { useReadingPrefs } from "@/hooks/use-reading-prefs";
import { READER_FONT_STEPS } from "@shared/schema";
import StoryContent from "./StoryContent";
import type { StoryDoc } from "@/lib/storyContent";

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
  content,
  verse,
  onParsed,
}: {
  title: string;
  content: string;
  /** True for a poem: single newlines are lines, not soft wraps. */
  verse?: boolean;
  onParsed?: (doc: StoryDoc) => void;
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
      <StoryContent content={content} verse={verse} onParsed={onParsed} />
    </article>
  );
}

export default ReadingSurface;
