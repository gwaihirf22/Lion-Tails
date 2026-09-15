import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessageFor, isGatewayTimeout } from "../client/src/lib/apiError";
import { requestPicture } from "../client/src/lib/pictureRequest";

// The start of the page Cloudflare really sent on a 524 (2026-09-15).
const CLOUDFLARE_524 =
  '<!DOCTYPE html>\n<html class="no-js" lang="en-US"> <head><title>liontails.paul-blake.com | 524: A timeout occurred</title>' +
  '<div id="cf-wrapper"> <div class="cf-error-source relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left ' +
  'md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">'.repeat(20);

describe("what a failed request tells a person", () => {
  it("never shows a proxy's HTML page", () => {
    const m = errorMessageFor(524, "", CLOUDFLARE_524);
    expect(m).toBe("The server took too long to answer. Please try again in a moment.");
    expect(m).not.toContain("<");
  });

  it("keeps the app's own message", () => {
    expect(errorMessageFor(409, "Conflict", JSON.stringify({ message: "This story already has 12 pictures." })))
      .toBe("This story already has 12 pictures.");
  });

  it("keeps a short plain-text body, and replaces a long one", () => {
    expect(errorMessageFor(500, "Internal Server Error", "Database unavailable")).toBe("Database unavailable");
    expect(errorMessageFor(500, "Internal Server Error", "x".repeat(400))).toBe("Something went wrong (500 Internal Server Error).");
  });

  it("knows a proxy timeout from an app refusal", () => {
    expect(isGatewayTimeout(524)).toBe(true);
    expect(isGatewayTimeout(504)).toBe(true);
    expect(isGatewayTimeout(403)).toBe(false);
  });
});

describe("a slow picture is not a failed one", () => {
  beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null }));
  afterEach(() => vi.unstubAllGlobals());

  const story = (ids: string[]) =>
    new Response(JSON.stringify({ id: "s1", story: { title: "t", imageUrl: `/img/${ids.at(-1)}.png` }, images: ids.map((id) => ({ id, url: `/img/${id}.png`, prompt: "", createdAt: "2026-09-15T00:00:00Z" })) }), { status: 200 });

  it("waits for the picture when the proxy gives up at 100 seconds", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(CLOUDFLARE_524, { status: 524 });
      gets++;
      // before the request, one poll with nothing new, then the picture lands
      return story(gets <= 2 ? ["a"] : ["a", "b"]);
    }));
    const stillDrawing = vi.fn();
    const result = await requestPicture("s1", { redraw: false }, { onStillDrawing: stillDrawing, sleep: async () => {} });
    expect(stillDrawing).toHaveBeenCalledTimes(1);
    expect(result.images.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("reports a real refusal straight away, without waiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ message: "Only admins can redraw." }), { status: 403 })
        : story(["a"]),
    ));
    const stillDrawing = vi.fn();
    await expect(requestPicture("s1", { redraw: true }, { onStillDrawing: stillDrawing, sleep: async () => {} }))
      .rejects.toThrow("Only admins can redraw.");
    expect(stillDrawing).not.toHaveBeenCalled();
  });

  it("gives up after the wait, and says to look before trying again", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? new Response(CLOUDFLARE_524, { status: 524 }) : story(["a"]),
    ));
    await expect(requestPicture("s1", {}, { sleep: async () => {} })).rejects.toThrow(/look in the gallery/);
  });
});
