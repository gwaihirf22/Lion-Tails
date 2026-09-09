import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Contrast, computed from the palette file itself.
 *
 * The reader's four palettes are the app's theme, so a colour that is only
 * checked by eye gets checked in whichever palette the person happened to be
 * using. Every combination below was, at some point, wrong in at least one
 * palette and fine in the one being looked at:
 *
 *   - --popover was IDENTICAL to --card in all four (ratio exactly 1.00), so a
 *     menu opening over a card had no background separation at all.
 *   - --accent was a saturated brand colour doing shadcn's hover-surface job,
 *     and anything that put default text on it measured 2.67 in Paper and
 *     1.19 in Night.
 *   - --secondary was mapped as a surface while the app used text-secondary
 *     29 times as a text colour, which made headings invisible.
 *
 * Reading the numbers out of theme.css means this cannot drift from what
 * ships. Tailwind consumes the same file.
 */

const css = fs.readFileSync(
  path.resolve(__dirname, "../client/src/theme.css"),
  "utf8",
);

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every token of every palette, read out of the stylesheet. */
function parsePalettes(): Record<string, Record<string, [number, number, number]>> {
  const out: Record<string, Record<string, [number, number, number]>> = {};
  const block = /(?:^|\n)(?::root,\s*)?\[data-palette="(\w+)"\][^{]*\{([^}]*)\}/g;
  for (const m of css.matchAll(block)) {
    const name = m[1];
    // Merge rather than assign: a palette name appears in several blocks (the
    // tokens, then the header and footer rules), and assigning would let a
    // later colourless block silently win and make every check vacuous.
    out[name] ??= {};
    for (const v of m[2].matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
      out[name][v[1]] = hslToRgb(+v[2], +v[3], +v[4]);
    }
  }
  return out;
}

const palettes = parsePalettes();
const NAMES = ["paper", "sepia", "night", "contrast"];

describe("palette parsing", () => {
  it("finds all four palettes with their tokens", () => {
    // If this file stops parsing, every check below passes vacuously.
    expect(Object.keys(palettes).sort()).toEqual([...NAMES].sort());
    for (const n of NAMES) {
      expect(Object.keys(palettes[n]).length, `${n} has too few tokens`).toBeGreaterThan(15);
    }
  });
});

/** [foreground token, background token, minimum ratio, what it is] */
const PAIRS: Array<[string, string, number, string]> = [
  // Body text: AAA, because this is a reading app.
  ["foreground", "background", 7, "body text on the page"],
  ["card-foreground", "card", 7, "text on a card"],
  ["popover-foreground", "popover", 7, "text in a dropdown"],
  ["accent-foreground", "accent", 7, "text on a highlighted menu item"],
  // Secondary and interactive: AA.
  ["muted-foreground", "background", 4.5, "secondary text on the page"],
  ["muted-foreground", "card", 4.5, "secondary text on a card"],
  ["muted-foreground", "popover", 4.5, "secondary line in a dropdown"],
  ["primary-foreground", "primary", 4.5, "text on a primary button"],
  ["secondary-foreground", "secondary", 4.5, "text on a secondary button"],
  ["destructive-foreground", "destructive", 4.5, "text on a destructive button"],
  // The bidirectional half: these tokens are ALSO used as text colours
  // (text-primary, text-secondary) on ordinary surfaces.
  ["primary", "background", 4.5, "primary used as a text colour"],
  ["secondary", "background", 4.5, "secondary used as a text colour"],
  ["primary", "card", 4.5, "primary as text, on a card"],
  ["secondary", "card", 4.5, "secondary as text, on a card"],
  // The branded top bar. AAA both ways round: the active nav item INVERTS the
  // bar (light pill, bar-coloured text), so both directions are real text.
  ["header-foreground", "header", 7, "nav text on the bar"],
  ["header", "header-foreground", 7, "the active nav pill, which inverts the bar"],
];

describe.each(NAMES)("%s palette", (name) => {
  const v = () => palettes[name];

  it.each(PAIRS)("%s on %s clears %s:1 — %s", (fg, bg, min) => {
    const tokens = v();
    expect(tokens[fg], `--${fg} is not defined in ${name}`).toBeDefined();
    expect(tokens[bg], `--${bg} is not defined in ${name}`).toBeDefined();
    const r = contrast(tokens[fg], tokens[bg]);
    expect(
      Number(r.toFixed(2)),
      `--${fg} on --${bg} in ${name} is ${r.toFixed(2)}:1, needs ${min}:1`,
    ).toBeGreaterThanOrEqual(min);
  });

  it("separates a dropdown from the card it opens over", () => {
    const { popover, card, border } = v();
    const sep = contrast(popover, card);
    const edge = contrast(border, popover);
    // Contrast is the deliberate exception: its surfaces are all pure white
    // and the separation is a pure black border, which is the point of it.
    if (name === "contrast") {
      expect(edge).toBeGreaterThan(10);
      return;
    }
    expect(
      Number(sep.toFixed(2)),
      `--popover and --card are the same surface in ${name}; a menu over a card has no edge`,
    ).toBeGreaterThan(1.05);
  });

  it("makes the hover highlight visible against the menu it sits in", () => {
    const { accent, popover } = v();
    const r = contrast(accent, popover);
    expect(
      Number(r.toFixed(2)),
      `--accent is indistinguishable from --popover in ${name}, so hover does nothing`,
    ).toBeGreaterThan(1.1);
  });
});

/**
 * Every element that paints an accent background sets its foreground.
 *
 * Source-scanning rather than colour arithmetic, because this is the failure
 * the palette numbers cannot catch: a component that opts into the highlight
 * surface and leaves the text at whatever it inherited. Two shipped that way,
 * and both were only wrong in some palettes -- 1.19:1 in Night, 1.37:1 in
 * Contrast, and perfectly legible in Paper, so whoever reviewed it in Paper
 * saw nothing.
 *
 * Checked PER VARIANT, not per line. The first version of this grepped for
 * lines containing bg-accent and not text-accent-foreground, and it did not
 * fire when the bug was reintroduced: the offending line carried TWO accent
 * backgrounds (focus: and data-[state=open]:) and only one foreground, so the
 * line matched the exemption and passed. That is the same "check that cannot
 * fail" shape docs/decisions.md is about.
 */
export function findUnpairedAccent(source: string): string[] {
  const problems: string[] = [];
  source.split("\n").forEach((line, i) => {
    // A Tailwind variant prefix: "focus:", "hover:", "data-[state=open]:", or
    // several chained. Empty for a bare, unconditional bg-accent.
    // Opaque only. "bg-accent/50" is a translucent TINT over whatever is
    // behind it, and pairing that with text-accent-foreground would be wrong --
    // white text on a half-strength tint over a white page is invisible. The
    // tint case is checked numerically instead, below.
    for (const m of line.matchAll(/((?:[\w-]+:|data-\[[^\]]+\]:)*)bg-accent(?![\w/-])/g)) {
      const prefix = m[1];
      if (!line.includes(`${prefix}text-accent-foreground`)) {
        problems.push(`${i + 1}: ${prefix}bg-accent has no ${prefix}text-accent-foreground`);
      }
    }
  });
  return problems;
}

describe("accent background/foreground pairing", () => {
  it("fires on the exact bug that shipped", () => {
    // Two accent backgrounds, one foreground. The line-based version of this
    // check passed this string.
    const shipped = `"... outline-none focus:bg-accent data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"`;
    const found = findUnpairedAccent(shipped);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("focus:bg-accent");
  });

  it("accepts a correctly paired line", () => {
    expect(
      findUnpairedAccent(`"focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"`),
    ).toEqual([]);
  });

  it("catches a bare, unconditional bg-accent", () => {
    expect(findUnpairedAccent(`<div className="bg-accent p-2">`)).toHaveLength(1);
  });

  it("finds none in the client source", () => {
    const dir = path.resolve(__dirname, "../client/src");
    const files: string[] = [];
    (function walk(d: string) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".tsx")) files.push(full);
      }
    })(dir);
    expect(files.length).toBeGreaterThan(20);

    const all: string[] = [];
    for (const f of files) {
      for (const p of findUnpairedAccent(fs.readFileSync(f, "utf8"))) {
        all.push(`${path.relative(dir, f)}:${p}`);
      }
    }
    expect(all).toEqual([]);
  });
});

describe("translucent accent tints", () => {
  /** Source-over compositing: what the eye actually sees behind the text. */
  const over = (
    fg: [number, number, number],
    bg: [number, number, number],
    alpha: number,
  ): [number, number, number] =>
    fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as [number, number, number];

  // navigation-menu uses bg-accent/50 for its active and open states, and
  // deliberately does NOT switch the text colour -- so the inherited
  // --foreground has to stay legible on the composited result.
  it.each(NAMES)("keeps default text legible on bg-accent/50 in %s", (name) => {
    const v = palettes[name];
    const tint = over(v.accent, v.background, 0.5);
    const r = contrast(v.foreground, tint);
    expect(
      Number(r.toFixed(2)),
      `--foreground on a 50% --accent tint in ${name} is ${r.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the header bar", () => {
  const over = (
    fg: [number, number, number],
    bg: [number, number, number],
    alpha: number,
  ): [number, number, number] =>
    fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as [number, number, number];

  it.each(NAMES)("keeps nav text legible on the hover wash in %s", (name) => {
    // Hover is header-foreground at 15% over the bar. The text stays
    // header-foreground, so it sits on a lightly-washed version of its own
    // colour -- the one combination that gets worse as the wash gets stronger.
    const v = palettes[name];
    const wash = over(v["header-foreground"], v.header, 0.15);
    expect(
      Number(contrast(v["header-foreground"], wash).toFixed(2)),
      `nav text on its hover wash in ${name}`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NAMES)("makes the hover wash visible against the bar in %s", (name) => {
    const v = palettes[name];
    const wash = over(v["header-foreground"], v.header, 0.15);
    expect(
      Number(contrast(wash, v.header).toFixed(2)),
      `hover is indistinguishable from the bar in ${name}`,
    ).toBeGreaterThan(1.2);
  });

  it.each(NAMES)("does not paint the bar with --primary in %s", (name) => {
    // Night's --primary is a light blue. A bar painted with it would be the
    // brightest thing on screen in the palette that exists to not be bright.
    // The tokens are allowed to coincide in light palettes; what must not
    // happen is Night inheriting a bright bar.
    if (name !== "night") return;
    const v = palettes[name];
    const barLum = contrast(v.header, [0, 0, 0]);
    const pageLum = contrast(v.background, [0, 0, 0]);
    expect(barLum, "Night's header bar is far brighter than its page").toBeLessThan(pageLum * 3);
  });
});
