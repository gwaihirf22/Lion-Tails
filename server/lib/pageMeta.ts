/**
 * The <head> of a shared story's page, for the link previews.
 *
 * Blake chose previews that show the story itself -- its title and its picture
 * -- when a share link is pasted into iMessage, WhatsApp or Facebook. Those
 * apps fetch the page with a crawler that runs no JavaScript, so the SPA's
 * one static index.html would give every link the same generic card. For
 * `/s/:token` only, the server rewrites the head before sending it.
 *
 * PURE, so it is tested without a server; static.ts supplies the template (the
 * built index.html, read once) and the story.
 *
 * EVERYTHING INJECTED IS ESCAPED. A title is written by a model or typed by a
 * parent, and here it goes into raw HTML, inside an attribute. Unescaped, a
 * title of `"><script>...` would be script on a public page.
 *
 * Remove-then-add rather than editing tags in place: the template's tags span
 * several lines and are formatted by hand, and a rewrite that depends on that
 * formatting breaks the day someone reflows the file. Removing every tag this
 * owns and appending a fresh set before </head> works whatever it looks like.
 */

/**
 * The cover art, for a story with no picture of its own.
 *
 * WHY A FALLBACK IS NOT OPTIONAL HERE: this module REMOVES every og:image tag
 * before writing its own (see OWNED). Without something to put back, sharing a
 * picture-less story stripped the site cover that client/index.html sets and
 * added nothing -- so a shared story got a blank card while the plain home page
 * got the artwork. The link that matters most was the worst-looking one.
 *
 * Kept in step with client/index.html by hand, which is safe because both are
 * about the same file shipped at the same path: client/public is copied to the
 * site root verbatim, so /og-cover.jpg is stable and unfingerprinted. It is
 * already cropped to 1.91:1 at 1200x630, the ratio the scrapers use.
 */
export const SITE_COVER_PATH = "/og-cover.jpg";
export const SITE_COVER_WIDTH = 1200;
export const SITE_COVER_HEIGHT = 630;
export const SITE_COVER_ALT =
  "A lion and a lantern-keeper outside Barnabas & Co., with scenes from " +
  "Scripture and church history winding away behind them.";

export type ShareMeta = {
  title: string;
  description: string;
  /** Absolute. Crawlers do not reliably resolve a relative og:image. */
  url: string;
  /**
   * Absolute url of the picture for the card: the story's own if it has one,
   * otherwise the site cover. Optional only so a caller may deliberately pass
   * none; static.ts always supplies one.
   */
  image?: string;
  /** What that picture is, since it is no longer always from the story. */
  imageAlt?: string;
  /** Set when `image` is the site cover, so its known size can be declared. */
  imageIsCover?: boolean;
};

/**
 * Which picture the card shows, and what to call it.
 *
 * A function rather than two lines inside the route handler, because the
 * choice is the interesting part and a route handler is the one place a test
 * cannot reach. The rule: the story's own picture when it has one, the cover
 * when it does not, and NEVER neither -- this page strips the cover that
 * index.html sets, so "no picture" here means a blank card.
 */
export function shareCardImage(
  storyPicture: string | undefined,
  absolute: (url: string) => string,
): Pick<ShareMeta, "image" | "imageAlt" | "imageIsCover"> {
  return storyPicture
    ? { image: storyPicture, imageAlt: "A picture from this story." }
    : { image: absolute(SITE_COVER_PATH), imageAlt: SITE_COVER_ALT, imageIsCover: true };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The story's first sentence, for the preview's line of text.
 *
 * The first paragraph that is prose -- not a heading, not a scene break --
 * cut at its first sentence if that comes early enough, otherwise at a word
 * boundary with an ellipsis. Markdown emphasis is stripped: the preview is
 * plain text and "*Bramble*" would show its asterisks.
 */
export function previewDescription(content: string, max = 200): string {
  const paragraph =
    content
      .split(/\n\s*\n/)
      .map((p) => p.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim())
      .find((p) => p.length > 0 && !/^(chapter\b|[-*~=\s]+$)/i.test(p)) ?? "";

  const sentence = paragraph.match(/^.{20,}?[.!?](?=\s|["”’]?\s|$)["”’]?/);
  const text = sentence && sentence[0].length <= max ? sentence[0] : paragraph;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2))}…`;
}

/** The tags this module owns, found wherever and however they are written. */
const OWNED = [
  /<title>[\s\S]*?<\/title>\s*/gi,
  /<meta\b[^>]*\bname="(?:description|robots|twitter:card|twitter:title|twitter:description|twitter:image)"[^>]*>\s*/gi,
  /<meta\b[^>]*\bproperty="og:(?:type|title|description|url|image|image:width|image:height|image:alt)"[^>]*>\s*/gi,
];

/**
 * The page for a share link.
 *
 * `meta` null means the token opens nothing -- unknown, stopped, lapsed. The
 * generic card is left as it is, but `noindex` is still added: a dead share
 * url is not a page for a search engine either.
 */
export function renderSharePage(template: string, meta: ShareMeta | null): string {
  const noindex = `<meta name="robots" content="noindex, nofollow" />`;
  if (!meta) return template.replace("</head>", `    ${noindex}\n  </head>`);

  let html = template;
  for (const pattern of OWNED) html = html.replace(pattern, "");

  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const tags = [
    `<title>${t} — Lion Tails</title>`,
    `<meta name="description" content="${d}" />`,
    noindex,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    ...(meta.image
      ? [
          `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
          // The cover's size is known, so it is declared: a crawler that has
          // the dimensions up front lays the card out without fetching the
          // image first, and some show nothing at all while they wait. A
          // story's own picture has no size we know here, so it says nothing
          // rather than guessing wrong -- a WRONG width is worse than none.
          ...(meta.imageIsCover
            ? [
                `<meta property="og:image:width" content="${SITE_COVER_WIDTH}" />`,
                `<meta property="og:image:height" content="${SITE_COVER_HEIGHT}" />`,
              ]
            : []),
          `<meta property="og:image:alt" content="${escapeHtml(
            meta.imageAlt ?? "A picture from this story.",
          )}" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
        ]
      : [`<meta name="twitter:card" content="summary" />`]),
  ];
  return html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}
