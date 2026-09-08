import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import { READER_FONT_KEYS, READER_FONT_META, type ReaderFontKey } from "./fonts";

/**
 * Choose a typeface.
 *
 * THE PREVIEW PROBLEM. Rendering every row in its own face is exactly what
 * makes all four families download, which defeats the whole lazy-loading
 * strategy (see fonts.css). So rows start in the UI font and each one loads its
 * real face only when you hover or focus it -- you see the face you are about
 * to choose, and you pay for at most the ones you actually looked at.
 *
 * document.fonts.load() rather than just letting the render trigger it, so the
 * row swaps once the face is ready instead of flashing through a half-swap.
 */
export function FontPicker({
  value,
  onChange,
}: {
  value: ReaderFontKey;
  onChange: (v: ReaderFontKey) => void;
}) {
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set([value]));

  const preview = useCallback(
    (key: ReaderFontKey) => {
      if (loaded.has(key)) return;
      const family = READER_FONT_META[key].cssFamily;
      if (!family) {
        setLoaded((s) => new Set(s).add(key));
        return;
      }
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (!fonts) {
        // No FontFaceSet (very old browser). Render it anyway; worst case the
        // row paints in the fallback until the face arrives.
        setLoaded((s) => new Set(s).add(key));
        return;
      }
      fonts
        .load(`1em "${family}"`)
        .then(() => setLoaded((s) => new Set(s).add(key)))
        // A failed font load must not break the picker.
        .catch(() => undefined);
    },
    [loaded],
  );

  // data-font on the container so --reader-family resolves HERE. Without it
  // the sample below renders in whatever font the surrounding page uses: Radix
  // portals the popover outside the <article> that carries the reader's tokens,
  // and on the Settings page there is no article at all. A font sample shown in
  // the wrong font is worse than no sample.
  return (
    <div role="radiogroup" aria-label="Reading font" className="w-64 p-1" data-font={value}>
      {READER_FONT_KEYS.map((key) => {
        const meta = READER_FONT_META[key];
        const showReal = loaded.has(key);
        return (
          <button
            key={key}
            role="radio"
            aria-checked={value === key}
            onPointerEnter={() => preview(key)}
            onFocus={() => preview(key)}
            onClick={() => onChange(key)}
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
          >
            <Check
              className={`h-4 w-4 shrink-0 ${value === key ? "opacity-100" : "opacity-0"}`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span
                className="block truncate text-[15px]"
                // Applied only once the face is actually loaded, so the label
                // never renders in a fallback that misrepresents the choice.
                style={showReal && meta.cssFamily ? { fontFamily: `"${meta.cssFamily}"` } : undefined}
              >
                {meta.label}
              </span>
              <span className="block truncate text-xs opacity-60">{meta.note}</span>
            </span>
          </button>
        );
      })}

      {/* Always-on sample in the CURRENT family. Free: that font is loaded by
          definition, because it is the one rendering the story behind this. */}
      <p
        className="mt-1 border-t px-2 pt-2 text-sm opacity-75"
        style={{ fontFamily: "var(--reader-family)" }}
      >
        The lion shook his mane and the little one laughed.
      </p>
    </div>
  );
}

export default FontPicker;
