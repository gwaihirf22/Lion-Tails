/**
 * Turns a story's `content` string into blocks the reader can render.
 *
 * WHY THIS IS NOT A MARKDOWN LIBRARY
 * Markdown collapses single newlines by design. A poem IS single newlines --
 * the generator asks for 12 to 64 lines of verse and rejects a reply that does
 * not deliver them -- so adding a markdown parser means immediately fighting
 * the parser you just added. The only markdown the models reliably emit is
 * **bold**, occasional *em* and "- " bullets, which is a short scanner. And
 * emitting React nodes rather than HTML means no sanitiser is needed at all:
 * a markdown renderer would reintroduce exactly the dangerouslySetInnerHTML
 * risk this change removes from StoryDisplay.
 *
 * No React and no imports on purpose, so it can be exercised directly with
 * `npx tsx` in a repo that has no test runner.
 */

export type Inline = { t: "text" | "strong" | "em"; v: string };

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "verse"; lines: Inline[][] }
  | { kind: "heading"; level: number; content: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "sceneBreak" };

export type Resource = { label: string; url?: string };

export type StoryDoc = {
  blocks: Block[];
  /** The server's appended block, lifted out of the reading flow. */
  furtherLearning: Resource[] | null;
};

/**
 * The exact text server/lib/openai-implementation.ts appends to every story.
 * Matched literally first so the common case is exact rather than heuristic.
 */
const FURTHER_LEARNING_LITERAL =
  "\n\n**For Further Learning:**\n\n- **BibleGateway.com** - Read Bible stories.\n- **GotQuestions.org** - Find answers about faith.";

/** Fallback for older rows, or a model that wrote the heading itself. */
const FURTHER_LEARNING_HEADING = /^[ \t]*\*{0,2}For Further Learning:?\*{0,2}[ \t]*$/im;

/**
 * Inline scanner for **strong** and *em* / _em_.
 *
 * A scanner rather than a regex, deliberately. The natural pattern needs a
 * lookbehind to avoid matching inside a word, which Safari did not support
 * until 16.4, and `(.+?)` alternation backtracks badly on a 3000-word
 * paragraph containing one unclosed asterisk. This is linear and has no
 * engine dependency.
 */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text) {
      out.push({ t: "text", v: text });
      text = "";
    }
  };

  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "**") {
      const end = src.indexOf("**", i + 2);
      // An unclosed marker is literal text, not an unterminated span.
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", v: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    const one = src[i];
    if (one === "*" || one === "_") {
      const end = src.indexOf(one, i + 1);
      // Require non-empty content, and refuse to open mid-word so that
      // snake_case and a lone asterisk survive as themselves.
      const prev = i > 0 ? src[i - 1] : " ";
      if (end > i + 1 && !/\w/.test(prev) && src.slice(i + 1, end).trim()) {
        flush();
        out.push({ t: "em", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

/** Splits the appended resource block off the end of the content. */
function splitFurtherLearning(content: string): { body: string; further: Resource[] | null } {
  let body = content;
  let section: string | null = null;

  const literalAt = body.lastIndexOf(FURTHER_LEARNING_LITERAL);
  if (literalAt !== -1) {
    section = body.slice(literalAt);
    body = body.slice(0, literalAt);
  } else {
    const m = body.match(FURTHER_LEARNING_HEADING);
    if (m && m.index !== undefined) {
      section = body.slice(m.index);
      body = body.slice(0, m.index);
    }
  }
  if (section === null) return { body, further: null };

  const further: Resource[] = [];
  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line || FURTHER_LEARNING_HEADING.test(line)) continue;
    // Strip the bullet and any bold markers, then keep the whole line.
    const clean = line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim();
    if (!clean) continue;
    const domain = clean.match(/\b([\w-]+\.(?:com|org|net|edu|gov))\b/i);
    // The previous implementation kept ONLY lines containing a domain and
    // discarded the rest of the section outright. A resource without a URL is
    // still a resource; it just does not get a link.
    further.push(domain ? { label: clean, url: `https://${domain[1]}` } : { label: clean });
  }
  return { body: body.trimEnd(), further: further.length ? further : null };
}

const SCENE_BREAK = /^([*\-—–_~]\s*){3,}$/;

/**
 * Does this WHOLE DOCUMENT look like verse?
 *
 * `verse` from the request is the primary signal. This is a genuinely
 * independent second one -- it reads the TEXT rather than the request -- which
 * matters for rows saved before storyType was on the story object, and for a
 * story opened from a shared link.
 *
 * Judged per DOCUMENT, not per block. The first version asked "does this block
 * have >= 2 short lines", which misfired on ordinary prose: a paragraph the
 * model happened to soft-wrap once became two short lines and got rendered as
 * verse. A story is prose or it is verse; it is not a mixture, so the decision
 * belongs at the document level where there is far more evidence.
 *
 * The discriminating signal is LINES PER BLOCK. Prose arrives as one long line
 * per paragraph, so its ratio sits near 1. Verse arrives as many short lines
 * inside one or two stanza blocks, so its ratio is high -- the real poem this
 * was calibrated against is 20 lines in a single block.
 */
function documentLooksLikeVerse(body: string): boolean {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (blocks.length === 0 || lines.length < 6) return false;
  const linesPerBlock = lines.length / blocks.length;
  const shortLines = lines.filter((l) => l.length < 60).length / lines.length;
  return linesPerBlock >= 3 && shortLines >= 0.6;
}

export function parseStoryContent(content: string, opts?: { verse?: boolean }): StoryDoc {
  const { body, further } = splitFurtherLearning(content ?? "");
  const blocks: Block[] = [];
  // Decided once, for the document, before any block is classified.
  const asVerse = opts?.verse ?? documentLooksLikeVerse(body);

  for (const chunk of body.split(/\n{2,}/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (SCENE_BREAK.test(trimmed)) {
      blocks.push({ kind: "sceneBreak" });
      continue;
    }

    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

    const atx = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (atx && lines.length === 1) {
      blocks.push({ kind: "heading", level: atx[1].length, content: parseInline(atx[2]) });
      continue;
    }
    // A short, wholly-bold line on its own is a heading in every story that
    // has ever come out of this generator.
    if (lines.length === 1 && /^\*\*.+\*\*$/.test(trimmed) && trimmed.length < 80) {
      blocks.push({
        kind: "heading",
        level: 3,
        content: parseInline(trimmed.replace(/^\*\*|\*\*$/g, "")),
      });
      continue;
    }

    if (lines.length > 0 && lines.every((l) => /^([-*]\s+|\d+\.\s+)/.test(l))) {
      blocks.push({
        kind: "list",
        items: lines.map((l) => parseInline(l.replace(/^([-*]\s+|\d+\.\s+)/, ""))),
      });
      continue;
    }

    if (asVerse) {
      // Every line is preserved. This is the whole reason poems were broken:
      // the old path rendered a block as one <p>, so HTML collapsed the single
      // newlines into spaces and a stanza ran together as prose.
      blocks.push({ kind: "verse", lines: lines.map(parseInline) });
      continue;
    }

    blocks.push({ kind: "paragraph", lines: lines.map(parseInline) });
  }

  return { blocks, furtherLearning: further };
}

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

function inlineToHtml(parts: Inline[]): string {
  return parts
    .map((p) =>
      p.t === "strong"
        ? `<strong>${escapeHtml(p.v)}</strong>`
        : p.t === "em"
          ? `<em>${escapeHtml(p.v)}</em>`
          : escapeHtml(p.v),
    )
    .join("");
}

/**
 * The story as HTML, for printing.
 *
 * Replaces two separate `story.content.replace(/\n/g, '<br>')` injections that
 * wrote raw model output into the DOM and into a document that was then
 * printed. Every text node here goes through escapeHtml, so injection is
 * structurally impossible rather than merely unlikely.
 */
export function storyToPrintHtml(
  doc: StoryDoc,
  title: string,
  verse?: { text: string; reference: string },
): string {
  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`];

  for (const block of doc.blocks) {
    switch (block.kind) {
      case "paragraph":
        parts.push(`<p>${block.lines.map(inlineToHtml).join(" ")}</p>`);
        break;
      case "verse":
        parts.push(`<p class="verse">${block.lines.map(inlineToHtml).join("<br>")}</p>`);
        break;
      case "heading":
        parts.push(`<h${block.level}>${inlineToHtml(block.content)}</h${block.level}>`);
        break;
      case "list":
        parts.push(`<ul>${block.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("")}</ul>`);
        break;
      case "sceneBreak":
        parts.push(`<p class="scene-break">&#10086;</p>`);
        break;
    }
  }

  if (verse) {
    parts.push(
      `<blockquote><p>${escapeHtml(verse.text)}</p><cite>${escapeHtml(verse.reference)}</cite></blockquote>`,
    );
  }
  if (doc.furtherLearning?.length) {
    parts.push("<h3>For Further Learning</h3>");
    parts.push(
      `<ul>${doc.furtherLearning.map((r) => `<li>${escapeHtml(r.label)}</li>`).join("")}</ul>`,
    );
  }
  return parts.join("\n");
}
