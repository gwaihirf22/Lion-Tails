import { describe, it, expect } from "vitest";
import { sharedStoryView, isShareTarget, SHARE_TOKEN_PATTERN, sharePathFor } from "../shared/sharedStory";
import { BUILT_IN_STORY_IDS } from "../shared/quests";
import { newShareToken } from "../server/lib/sharing";
import {
  escapeHtml,
  previewDescription,
  renderSharePage,
  shareCardImage,
  SITE_COVER_ALT,
  SITE_COVER_HEIGHT,
  SITE_COVER_PATH,
  SITE_COVER_WIDTH,
} from "../server/lib/pageMeta";
import { builtInStoryById, isBuiltInStoryId } from "../server/lib/builtInStories";
import { QUEST_PROLOGUE, QUEST_PROLOGUE_ID } from "../server/data/questPrologue";

/**
 * Sharing a story by link.
 *
 * The public route hands `sharedStoryView` to anyone holding a link, with no
 * session. So the first block here is the one that matters: a fixture carrying
 * EVERYTHING a saved story holds that must not leave -- every prompt and raw
 * model reply, the children's details, the picture prompts written from the
 * character sheet -- and an assertion on the exact set of keys that come out.
 */

const SECRET_PROMPT = "SYSTEM: you are writing for Ellie, aged 7, who is frightened of storms";
const SHEET_LOOK = "freckles across her nose and a scar on her left knee";

const saved = {
  id: "s1",
  createdAt: "2026-09-01T00:00:00.000Z",
  isFavorite: false,
  expiresAt: "2027-09-01T00:00:00.000Z",
  universeId: "u1",
  heroId: "h1",
  images: [
    {
      id: "p1",
      url: "/public/images/stories/story_1.png",
      prompt: `Ellie, a 7-year-old girl with ${SHEET_LOOK}, in a boat`,
      createdAt: "2026-09-01T00:00:00.000Z",
      anchor: { quote: "the boat rocked", blockIndex: 3 },
    },
  ],
  editLog: [{ at: "2026-09-02T00:00:00.000Z", by: "parent" as const, changed: ["content"] }],
  request: { childName: "Ellie", gender: "girl", userInstructions: "she is scared of storms" },
  story: {
    title: "Ellie and the Storm",
    content: "The boat rocked. Ellie held on.\n\n## About this story\n\nEllie is invented.",
    storyType: "regular" as const,
    moralOutcome: "positive" as const,
    bibleVerse: { text: "Peace, be still.", reference: "Mark 4:39" },
    applicationQuestions: ["a", "b", "c", "d", "e"],
    imageUrl: "/public/images/stories/story_1.png",
    imagePrompt: `A storybook scene. ${SHEET_LOOK}`,
    debugData: [{ step: "chapter", prompt: SECRET_PROMPT, response: "raw model reply" }],
  },
} as any;

describe("what a stranger may see of a shared story", () => {
  it("is exactly the allow-list, and nothing else", () => {
    expect(Object.keys(sharedStoryView(saved)).sort()).toEqual(
      [
        "applicationQuestions",
        "bibleVerse",
        "content",
        "editLog",
        "imageUrl",
        "images",
        "moralOutcome",
        "storyType",
        "title",
      ].sort(),
    );
  });

  it("carries no prompt, no model reply and none of the children's details, anywhere", () => {
    const json = JSON.stringify(sharedStoryView(saved));
    for (const leak of [SECRET_PROMPT, "raw model reply", SHEET_LOOK, "scared of storms", "debugData", "imagePrompt", "userInstructions", "universeId", "heroId", "expiresAt"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("strips each picture down to where it goes, without its prompt", () => {
    const [p] = sharedStoryView(saved).images;
    expect(Object.keys(p).sort()).toEqual(["anchor", "id", "prompt", "url"]);
    expect(p.prompt).toBe("");
    expect(p.anchor).toEqual({ quote: "the boat rocked", blockIndex: 3 });
  });

  it("keeps the 'About this story' note, which must travel with the story", () => {
    expect(sharedStoryView(saved).content).toContain("## About this story");
  });

  it("rebuilds the edit log, so a future field on an entry is not published by accident", () => {
    const withExtra = { ...saved, editLog: [{ ...saved.editLog[0], who: "Paul" }] };
    expect(sharedStoryView(withExtra).editLog).toEqual([
      { at: "2026-09-02T00:00:00.000Z", by: "parent", changed: ["content"] },
    ]);
  });

  it("still shows the one picture of a story illustrated before galleries existed", () => {
    const legacy = { ...saved, images: undefined };
    const imgs = sharedStoryView(legacy).images;
    expect(imgs).toHaveLength(1);
    expect(imgs[0].url).toBe(saved.story.imageUrl);
    expect(imgs[0].prompt).toBe(""); // the legacy path reads imagePrompt -- not here
  });
});

describe("share tokens", () => {
  it("are 22 url-safe characters, matching the pattern the public route checks", () => {
    for (let i = 0; i < 200; i++) expect(newShareToken()).toMatch(SHARE_TOKEN_PATTERN);
  });

  it("do not repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, newShareToken));
    expect(seen.size).toBe(2000);
  });

  it("refuse anything that is not one, before it can reach the database", () => {
    for (const bad of ["", "short", "a".repeat(21), "a".repeat(23), "../../etc/passwd000000", "abc def ghi jkl mno pq", "aaaaaaaaaaaaaaaaaaaaa'"]) {
      expect(SHARE_TOKEN_PATTERN.test(bad)).toBe(false);
    }
  });

  it("make a path the page and the server agree on", () => {
    expect(sharePathFor("abc")).toBe("/s/abc");
  });
});

/**
 * The page head a messaging app's crawler reads. A title is model- or
 * parent-written text going into raw HTML, inside an attribute.
 */
const TEMPLATE = `<!doctype html><html><head>
    <title>Lion Tails — Real Stories. Timeless Truths.</title>
    <meta
      name="description"
      content="generic description"
    />
    <meta property="og:site_name" content="Lion Tails" />
    <meta property="og:title" content="Lion Tails — Real Stories. Timeless Truths." />
    <meta property="og:image" content="https://liontails.paul-blake.com/og-cover.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta name="twitter:card" content="summary_large_image" />
  </head><body><div id="root"></div></body></html>`;

describe("the preview card for a share link", () => {
  const meta = {
    title: `"><script>alert(1)</script>`,
    description: "Bramble woke before sunrise.",
    url: "https://liontails.paul-blake.com/s/abcdefghijklmnopqrstuv",
    image: "https://liontails.paul-blake.com/public/images/stories/story_1.png",
  };

  it("escapes a hostile title rather than letting it become markup", () => {
    const html = renderSharePage(TEMPLATE, meta);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("replaces the generic tags instead of adding a second set", () => {
    const html = renderSharePage(TEMPLATE, { ...meta, title: "Bramble's Winter Basket" });
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/property="og:image"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).not.toContain("generic description");
    expect(html).not.toContain('content="1200"'); // the generic image's size, wrong for this one
    expect(html).toContain(`<meta property="og:image" content="${meta.image}" />`);
    expect(html).toContain("Bramble&#39;s Winter Basket — Lion Tails");
    // Left alone: not a tag this owns.
    expect(html).toContain('property="og:site_name"');
  });

  it("asks search engines to stay away, for a live link AND a dead one", () => {
    expect(renderSharePage(TEMPLATE, meta)).toContain('name="robots" content="noindex, nofollow"');
    const dead = renderSharePage(TEMPLATE, null);
    expect(dead).toContain('name="robots" content="noindex, nofollow"');
    expect(dead).toContain("generic description"); // otherwise untouched
  });

  it("falls back to the small card when given no picture at all", () => {
    // The contract of the renderer on its own. The app never reaches it --
    // shareCardImage always supplies one, see below -- but a caller that
    // passes nothing must still get valid tags rather than an empty og:image.
    const html = renderSharePage(TEMPLATE, { ...meta, image: undefined });
    expect(html).not.toContain('property="og:image"');
    expect(html).toContain('name="twitter:card" content="summary"');
  });

  it("declares the cover's size, and never a story picture's", () => {
    // A crawler given the dimensions lays the card out without fetching the
    // image, and some show nothing while they wait. The cover's size is known;
    // a story picture's is not, and a WRONG width is worse than none.
    const cover = renderSharePage(TEMPLATE, {
      ...meta,
      ...shareCardImage(undefined, (u) => `https://liontails.paul-blake.com${u}`),
    });
    expect(cover).toContain(`content="${SITE_COVER_WIDTH}"`);
    expect(cover).toContain(`content="${SITE_COVER_HEIGHT}"`);

    const picture = renderSharePage(TEMPLATE, {
      ...meta,
      ...shareCardImage(meta.image, (u) => u),
    });
    expect(picture).not.toContain('property="og:image:width"');
  });
});

/**
 * WHICH picture the card carries.
 *
 * This page removes every og:image tag the template had before writing its
 * own, so a story with no picture used to strip the site cover and add
 * nothing: the shared link -- the one a stranger sees first -- was the only
 * page on the site with a blank card.
 */
describe("the picture on a share card", () => {
  const abs = (u: string) => `https://liontails.paul-blake.com${u}`;

  it("uses the story's own picture when it has one", () => {
    const chosen = shareCardImage("https://liontails.paul-blake.com/p/story_1.png", abs);
    expect(chosen.image).toBe("https://liontails.paul-blake.com/p/story_1.png");
    expect(chosen.imageIsCover).toBeUndefined();
  });

  it("uses the Lion Tails cover when the story has none", () => {
    const chosen = shareCardImage(undefined, abs);
    expect(chosen.image).toBe(`https://liontails.paul-blake.com${SITE_COVER_PATH}`);
    expect(chosen.imageAlt).toBe(SITE_COVER_ALT);
    expect(chosen.imageIsCover).toBe(true);
  });

  it("always chooses something, whatever it is handed", () => {
    // The invariant, stated once: there is no input that produces a blank card.
    for (const input of [undefined, "", "https://example.test/a.png"]) {
      expect(shareCardImage(input || undefined, abs).image).toBeTruthy();
    }
  });

  it("gives the built-in story the cover, because it has no picture", () => {
    // The case Blake asked for by name: the Timekeeper prologue ships with no
    // illustration, so its link is the cover art or nothing.
    const view = sharedStoryView(QUEST_PROLOGUE);
    expect(view.imageUrl).toBeUndefined();
    expect(shareCardImage(view.imageUrl, abs).imageIsCover).toBe(true);
  });
});

/**
 * The one story that is shared by its id rather than a token.
 *
 * story_shares.story_id is a foreign key to user_stories, and a built-in has
 * no row there -- so it CANNOT hold a token, by the shape of the database. It
 * needs none: nothing about it is private, it is already in every library, and
 * the link is the same for everyone.
 */
describe("sharing the story the app ships with", () => {
  it("is a built-in, found by its own id", () => {
    expect(isBuiltInStoryId(QUEST_PROLOGUE_ID)).toBe(true);
    expect(builtInStoryById(QUEST_PROLOGUE_ID)?.story.title).toBe(QUEST_PROLOGUE.story.title);
  });

  it("is recognised as a share target, by the check the CLIENT runs", () => {
    // The bug this pins: the share page tested the token shape alone and
    // answered "This story is no longer shared" for a link that worked,
    // without ever asking the server. Caught only by opening it in a browser.
    expect(isShareTarget(QUEST_PROLOGUE_ID)).toBe(true);
    expect(isShareTarget(newShareToken())).toBe(true);
    expect(isShareTarget("nonsense")).toBe(false);
    expect(isShareTarget("")).toBe(false);
  });

  it("lists the same built-ins on both sides", () => {
    // The client cannot import server/lib/builtInStories, so shared/quests.ts
    // carries a copy of the ids. Copies drift; this is what stops it.
    for (const id of BUILT_IN_STORY_IDS) expect(isBuiltInStoryId(id)).toBe(true);
    expect(isBuiltInStoryId(QUEST_PROLOGUE_ID)).toBe(true);
    expect(BUILT_IN_STORY_IDS).toContain(QUEST_PROLOGUE_ID);
  });

  it("has an id that could never be mistaken for a token", () => {
    // Both arrive as the same :token path segment, so the one must not match
    // the other's shape -- otherwise a built-in id would be looked up as a
    // token, or worse, a minted token could collide with a built-in id.
    expect(SHARE_TOKEN_PATTERN.test(QUEST_PROLOGUE_ID)).toBe(false);
    expect(isBuiltInStoryId(newShareToken())).toBe(false);
  });

  it("shares a readable story, with nothing of anyone's in it", () => {
    const view = sharedStoryView(QUEST_PROLOGUE);
    expect(view.title.length).toBeGreaterThan(0);
    expect(view.content.length).toBeGreaterThan(500);
    expect(view.editLog).toEqual([]);
  });
});

describe("the preview's line of text", () => {
  it("is the first sentence", () => {
    expect(
      previewDescription(
        "Bramble woke before sunrise to the sound of rain tapping on his roof. In three days, the woodland animals would gather.",
      ),
    ).toBe("Bramble woke before sunrise to the sound of rain tapping on his roof.");
  });

  it("skips a chapter heading and a scene break, and drops markdown", () => {
    expect(previewDescription("## Chapter One\n\n* * *\n\n*Ellie* ran to the **door** and stopped.")).toBe(
      "Ellie ran to the door and stopped.",
    );
  });

  it("keeps a closing quotation mark with its sentence", () => {
    expect(previewDescription(`"We cannot get home," said their mother. "Our food is on the other side."`)).toBe(
      `"We cannot get home," said their mother.`,
    );
  });

  it("cuts a very long opening at a word, with an ellipsis", () => {
    const long = "word ".repeat(80).trim();
    const d = previewDescription(long);
    expect(d.length).toBeLessThanOrEqual(200);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/\s…$/);
  });

  it("escapes what it is given, when it goes into the page", () => {
    expect(escapeHtml(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
  });
});
