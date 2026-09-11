import { describe, it, expect } from "vitest";
import {
  clampView,
  DEFAULT_VIEW,
  MAX_ZOOM,
  minZoomFor,
  panView,
  placement,
  zoomView,
} from "../client/src/lib/imageCrop";

/**
 * Framing a photo as a square portrait.
 *
 * `placement()` draws BOTH the cropper's preview and the 1024px file that is
 * uploaded, so what these assert is what a person sees and what they get. The
 * failure they guard against is silent: a frame that drifts by a few percent
 * between preview and file, or a drag that pushes a photo off the square and
 * saves a sliver of background.
 */

const W = 3000; // a 3:4 portrait photo, as a phone takes one
const H = 4000;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("the default frame", () => {
  it("fills the square, centred -- what the display showed before cropping existed", () => {
    // object-cover on a square: the short side spans it, the long side
    // overflows equally at both ends.
    const p = placement(W, H, 1000, DEFAULT_VIEW);
    expect(p.w).toBeCloseTo(1000);
    expect(p.h).toBeCloseTo(4000 / 3);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo((1000 - 4000 / 3) / 2);
  });

  it("is the same frame at any size, so the preview and the file agree", () => {
    const view = { zoom: 1.7, x: 0.08, y: -0.11 };
    const small = placement(W, H, 300, view);
    const big = placement(W, H, 1024, view);
    const k = 1024 / 300;
    expect(big.x).toBeCloseTo(small.x * k);
    expect(big.y).toBeCloseTo(small.y * k);
    expect(big.w).toBeCloseTo(small.w * k);
    expect(big.h).toBeCloseTo(small.h * k);
  });
});

describe("zooming out, which is what was asked for", () => {
  it("can go far enough that the whole photo fits", () => {
    const whole = clampView(W, H, { zoom: 0, x: 0, y: 0 });
    expect(whole.zoom).toBeCloseTo(0.75);
    const p = placement(W, H, 1000, whole);
    // The LONG side now spans the square and nothing is cut off.
    expect(p.h).toBeCloseTo(1000);
    expect(p.w).toBeCloseTo(750);
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w).toBeLessThanOrEqual(1000 + 1e-9);
  });

  it("stops there, rather than shrinking the photo into a dot", () => {
    expect(clampView(W, H, { zoom: 0.01, x: 0, y: 0 }).zoom).toBeCloseTo(minZoomFor(W, H));
  });

  it("has nothing to zoom out to for a square photo", () => {
    expect(minZoomFor(2000, 2000)).toBe(1);
  });

  it("is the same for a landscape photo as for a portrait one, turned", () => {
    expect(minZoomFor(4000, 3000)).toBeCloseTo(minZoomFor(3000, 4000));
  });
});

describe("keeping the photo on the square", () => {
  it("never lets an edge be dragged inside the square when there is picture to show", () => {
    // Fill-the-square, then drag a long way down: the top edge of the photo
    // may reach the top of the square and no further.
    const v = panView(W, H, DEFAULT_VIEW, 0, 100000, 1000);
    const p = placement(W, H, 1000, v);
    expect(p.y).toBeCloseTo(0);
    // And across: at zoom 1 the width exactly fits, so there is no slack.
    const across = panView(W, H, DEFAULT_VIEW, 100000, 0, 1000);
    expect(across.x).toBeCloseTo(0);
  });

  it("zoomed out, lets the photo slide within the square but never out of it", () => {
    const whole = clampView(W, H, { zoom: 0.75, x: 0, y: 0 });
    const v = panView(W, H, whole, 100000, 0, 1000);
    const p = placement(W, H, 1000, v);
    expect(p.x + p.w).toBeCloseTo(1000); // pushed to the right edge, not past it
    expect(p.x).toBeGreaterThan(0);
  });

  it("converts a drag in pixels into the same move at any preview size", () => {
    const zoomed = { zoom: 2, x: 0, y: 0 };
    // 30px on a 300px preview is the same fraction as 102.4px on 1024px.
    const a = panView(W, H, zoomed, 30, -15, 300);
    const b = panView(W, H, zoomed, 102.4, -51.2, 1024);
    expect(near(a.x, b.x) && near(a.y, b.y)).toBe(true);
  });

  it("ignores a drag against a square of no size, rather than dividing by zero", () => {
    expect(panView(W, H, DEFAULT_VIEW, 50, 50, 0)).toEqual(DEFAULT_VIEW);
  });

  it("repairs a view that is not a number", () => {
    const v = clampView(W, H, { zoom: 2, x: Number.NaN, y: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
  });
});

describe("zooming keeps the middle in the middle", () => {
  it("scales the offset with the zoom, so an off-centre face stays put", () => {
    const v = clampView(W, H, { zoom: 2, x: 0.2, y: -0.1 });
    const z = zoomView(W, H, v, 3);
    expect(z.zoom).toBeCloseTo(3);
    expect(z.x).toBeCloseTo(0.3);
    expect(z.y).toBeCloseTo(-0.15);
  });

  it("re-clamps on the way out, so zooming out cannot strand the photo off the square", () => {
    const v = clampView(W, H, { zoom: 3, x: 1, y: 1 }); // pushed to a corner
    const out = zoomView(W, H, v, 0.75);
    const p = placement(W, H, 1000, out);
    expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    expect(p.y).toBeGreaterThanOrEqual(-1e-9);
    expect(p.x + p.w).toBeLessThanOrEqual(1000 + 1e-9);
    expect(p.y + p.h).toBeLessThanOrEqual(1000 + 1e-9);
  });

  it("stops at the maximum", () => {
    expect(zoomView(W, H, DEFAULT_VIEW, 99).zoom).toBe(MAX_ZOOM);
  });
});
