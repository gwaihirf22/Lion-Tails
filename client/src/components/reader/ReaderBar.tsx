import { Minus, Plus, Type, Palette, Sparkles, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReadingPrefs } from "@/hooks/use-reading-prefs";
import { READER_PALETTES, READER_FONT_STEPS, type ReadingPrefs } from "@shared/schema";
import { PALETTE_META, READER_FONT_META } from "./fonts";
import FontPicker from "./FontPicker";

/**
 * The reading controls: size, palette, font, classic styling, focus.
 *
 * They live here rather than only on the Settings page because reading settings
 * are adjusted WHILE reading -- you find out the text is too small by trying to
 * read it. Settings carries the same controls for completeness.
 */
export function ReaderBar({
  focusArmed,
  onToggleFocus,
}: {
  focusArmed: boolean;
  onToggleFocus: () => void;
}) {
  const { prefs, setPalette, setFont, setTypeset, setFontStep, fontSizePx } = useReadingPrefs();
  const atMin = prefs.fontStep <= 0;
  const atMax = prefs.fontStep >= READER_FONT_STEPS.length - 1;

  return (
    <div
      className="reader-chrome sticky top-0 z-30 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-1 px-3 py-2"
      style={{ background: "var(--reader-surface)", color: "var(--reader-fg)" }}
    >
      {/* Text size. Two buttons rather than a slider: easier to hit on a phone
          in a dark room, and the value is announced for screen readers. */}
      <div className="flex items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={atMin}
          aria-label="Decrease text size"
          onClick={() => setFontStep(prefs.fontStep - 1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="sr-only" aria-live="polite">
          Text size {fontSizePx} pixels
        </span>
        <Type className="h-4 w-4 opacity-60" aria-hidden="true" />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={atMax}
          aria-label="Increase text size"
          onClick={() => setFontStep(prefs.fontStep + 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Palette. Each swatch paints itself from the very tokens it selects --
          see .reader-swatch in reader.css for why that matters. */}
      <div className="ml-1 flex items-center gap-1" role="radiogroup" aria-label="Colour theme">
        <Palette className="h-4 w-4 opacity-60" aria-hidden="true" />
        {READER_PALETTES.map((p: ReadingPrefs["palette"]) => (
          <button
            key={p}
            role="radio"
            aria-checked={prefs.palette === p}
            aria-label={PALETTE_META[p].label}
            title={PALETTE_META[p].label}
            data-palette={p}
            onClick={() => setPalette(p)}
            className={`reader-swatch h-6 w-6 rounded-full transition ${
              prefs.palette === p ? "ring-2 ring-offset-1" : "opacity-80 hover:opacity-100"
            }`}
          />
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="ml-1 h-8 gap-1 px-2 text-xs">
            {READER_FONT_META[prefs.font].label}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="p-0"
          style={{ background: "var(--reader-surface)", color: "var(--reader-fg)" }}
        >
          <FontPicker value={prefs.font} onChange={setFont} />
        </PopoverContent>
      </Popover>

      {/* Classic styling: drop cap, indented paragraphs, an ornamental scene
          break. Separate from the font on purpose, so choosing the accessible
          face does not silently cost you the storybook feel. */}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2 text-xs"
        aria-pressed={prefs.typeset === "classic"}
        onClick={() => setTypeset(prefs.typeset === "classic" ? "plain" : "classic")}
        title="Drop caps, indented paragraphs and ornamental scene breaks"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Classic{prefs.typeset === "classic" ? "" : " off"}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-8 gap-1 px-2 text-xs"
        aria-pressed={focusArmed}
        onClick={onToggleFocus}
        title="Fade everything but the story. Escape or move the pointer to bring it back."
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        Focus
      </Button>
    </div>
  );
}

export default ReaderBar;
