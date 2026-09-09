import { describe, it, expect } from "vitest";
import {
  mergeWorldState,
  activeWorld,
  parseWorldPatch,
  extractionUserPrompt,
  MAX_WORLD_ENTRIES,
  MAX_ENTRY_LENGTH,
  type WorldEntry,
} from "../server/lib/worldState";

const entry = (over: Partial<WorldEntry> = {}): WorldEntry => ({
  id: "e1", kind: "fact", text: "The lantern is empty", status: "current",
  sourceStoryId: "s1", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});

const opts = { sourceStoryId: "s2", now: "2026-02-01T00:00:00.000Z", newId: (() => {
  let n = 0; return () => `new${++n}`;
})() };

describe("merging what a story added", () => {
  it("adds new entries with provenance", () => {
    const out = mergeWorldState([], { add: [{ kind: "character", text: "Lily, 7, lives next door" }] },
      { ...opts, newId: () => "n1" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "character", status: "current", sourceStoryId: "s2" });
  });

  it("does not re-add something already recorded", () => {
    // The common model failure: re-proposing a fact it was just shown. Left
    // unchecked the world grows without bound and the prompt fills with copies.
    const out = mergeWorldState([entry()], { add: [{ kind: "fact", text: "The lantern is empty" }] }, opts);
    expect(out).toHaveLength(1);
  });

  it("ignores case when deciding that", () => {
    const out = mergeWorldState([entry()], { add: [{ kind: "fact", text: "the LANTERN is EMPTY" }] }, opts);
    expect(out).toHaveLength(1);
  });

  it("drops entries with no text or an unknown kind", () => {
    const out = mergeWorldState([], {
      add: [
        { kind: "fact", text: "   " },
        { kind: "villain" as never, text: "real text" },
        { kind: "thread", text: "The treehouse was never finished" },
      ],
    }, opts);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("thread");
  });

  it("truncates rather than rejecting an over-long entry", () => {
    // Losing a whole story's continuity because one line ran long is the wrong
    // trade. This consumes model output; it has to be total.
    const out = mergeWorldState([], { add: [{ kind: "fact", text: "x".repeat(500) }] }, opts);
    expect(out[0].text).toHaveLength(MAX_ENTRY_LENGTH);
  });
});

describe("revising what changed", () => {
  it("supersedes an entry rather than duplicating it", () => {
    // Blake's example: "Leroy is sick".
    const leroy = entry({ id: "L", kind: "character", text: "Leroy, Mia's uncle, runs the bakery" });
    const out = mergeWorldState([leroy], {
      update: [{ id: "L", text: "Leroy, Mia's uncle, is ill and the bakery is shut" }],
    }, opts);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("is ill");
    expect(out[0].updatedAt).toBe(opts.now);
  });

  it("closes an entry rather than deleting it", () => {
    // "Joseph left the story". Kept, so a later extraction can see it was
    // already tied off instead of proposing it again.
    const out = mergeWorldState([entry({ id: "J", kind: "thread" })], {
      update: [{ id: "J", status: "closed" }],
    }, opts);
    expect(out[0].status).toBe("closed");
    expect(out).toHaveLength(1);
  });

  it("ignores an id the model invented", () => {
    const out = mergeWorldState([entry()], { update: [{ id: "nope", text: "x" }] }, opts);
    expect(out[0].text).toBe("The lantern is empty");
  });
});

describe("staying inside the cap", () => {
  it("keeps everything under the limit untouched", () => {
    const many = Array.from({ length: 10 }, (_, i) => entry({ id: `e${i}` }));
    expect(mergeWorldState(many, {}, opts)).toHaveLength(10);
  });

  it("drops closed entries before current ones", () => {
    // A resolved thread is the least useful thing to keep; dropping a current
    // fact would let the next story contradict something it was told.
    const closed = Array.from({ length: 5 }, (_, i) =>
      entry({ id: `c${i}`, status: "closed", updatedAt: `2020-01-0${i + 1}T00:00:00.000Z` }));
    const current = Array.from({ length: MAX_WORLD_ENTRIES }, (_, i) =>
      entry({ id: `k${i}`, text: `fact ${i}`, updatedAt: "2026-01-01T00:00:00.000Z" }));
    const out = mergeWorldState([...closed, ...current], {}, opts);
    expect(out).toHaveLength(MAX_WORLD_ENTRIES);
    expect(out.every((e) => e.status === "current")).toBe(true);
  });
});

describe("what the next story is told", () => {
  it("separates the three kinds and hides closed entries", () => {
    const w = activeWorld([
      entry({ id: "a", kind: "character", text: "Lily" }),
      entry({ id: "b", kind: "fact", text: "The lantern is empty" }),
      entry({ id: "c", kind: "thread", text: "The treehouse was never finished" }),
      entry({ id: "d", kind: "thread", text: "Resolved already", status: "closed" }),
    ]);
    expect(w.characters).toEqual(["Lily"]);
    expect(w.facts).toEqual(["The lantern is empty"]);
    expect(w.threads).toEqual(["The treehouse was never finished"]);
  });
});

describe("reading the model's reply", () => {
  it("accepts a well-formed patch", () => {
    const p = parseWorldPatch({ add: [{ kind: "fact", text: "A" }], update: [{ id: "x", status: "closed" }] });
    expect(p?.add).toHaveLength(1);
    expect(p?.update).toHaveLength(1);
  });

  it("rejects a reply that found nothing", () => {
    // Every story introduces someone or establishes something, so an empty
    // extraction is a failed one -- and requestModelJson retries on undefined.
    expect(parseWorldPatch({ add: [], update: [] })).toBeUndefined();
    expect(parseWorldPatch({})).toBeUndefined();
    expect(parseWorldPatch(null)).toBeUndefined();
    expect(parseWorldPatch("nope")).toBeUndefined();
  });

  it("filters junk out of an otherwise good reply", () => {
    const p = parseWorldPatch({
      add: [{ kind: "fact", text: "Kept" }, { kind: "nonsense", text: "Dropped" }, { kind: "fact" }],
      update: [{ id: "ok" }, { nope: 1 }],
    });
    expect(p?.add).toEqual([{ kind: "fact", text: "Kept" }]);
    expect(p?.update).toHaveLength(1);
  });
});

describe("the extraction prompt", () => {
  const story = { title: "The Brass Lantern", content: "Mia found a lantern." };

  it("asks the continuation question, not for a summary", () => {
    // The framing is the load-bearing part: "summarise this" gives a plot
    // recap, "what must be noted if it continues" gives the things it would be
    // wrong to change.
    const p = extractionUserPrompt(story, []);
    expect(p).toContain("Suppose someone writes the NEXT story");
    expect(p).toContain("do not contradict this one");
    expect(p).not.toContain("Write a summary");
  });

  it("asks for invented characters by name", () => {
    // Blake's rule: a character who was there is one whose name must not change.
    const p = extractionUserPrompt(story, []);
    expect(p).toContain("Include people the story invented");
    expect(p).toContain("Do not record unnamed extras");
  });

  it("only offers revision when there is something to revise", () => {
    // A first story has nothing recorded, so an update block would invite the
    // model to invent ids to fill it.
    expect(extractionUserPrompt(story, [])).not.toContain('"update"');
    const withKnown = extractionUserPrompt(story, [entry({ id: "L" })]);
    expect(withKnown).toContain('"update"');
    expect(withKnown).toContain("L [fact] The lantern is empty");
  });

  it("does not show closed entries as revisable", () => {
    const p = extractionUserPrompt(story, [entry({ id: "Z", status: "closed" })]);
    expect(p).not.toContain("Z [fact]");
  });
});
