import { READER_FONTS, type ReadingPrefs } from "@shared/schema";

/**
 * Display metadata for the font picker.
 *
 * The KEYS come from READER_FONTS in shared/schema.ts, so this cannot drift out
 * of step with what the server accepts. The CSS families live in reader.css and
 * are NOT duplicated here -- `cssFamily` exists only so the picker can call
 * document.fonts.load() for a hover preview, which needs a family name string.
 */
export type ReaderFontKey = ReadingPrefs["font"];

export const READER_FONT_META: Record<
  ReaderFontKey,
  { label: string; note: string; cssFamily: string | null }
> = {
  literata: {
    label: "Literata",
    note: "Made for reading on screens",
    cssFamily: "Literata Variable",
  },
  ebgaramond: {
    label: "EB Garamond",
    note: "Classic storybook feel",
    cssFamily: "EB Garamond Variable",
  },
  atkinson: {
    label: "Atkinson Hyperlegible",
    note: "Letters are easy to tell apart",
    cssFamily: "Atkinson Hyperlegible",
  },
  lexend: {
    label: "Lexend",
    note: "Open and easy on the eyes",
    cssFamily: "Lexend Variable",
  },
  // Null: nothing to load, because there is nothing to download.
  system: { label: "Your device's font", note: "Nothing to download", cssFamily: null },
};

export const READER_FONT_KEYS = READER_FONTS;

export const PALETTE_META: Record<ReadingPrefs["palette"], { label: string }> = {
  paper: { label: "Paper" },
  sepia: { label: "Sepia" },
  night: { label: "Night" },
  contrast: { label: "High contrast" },
};
