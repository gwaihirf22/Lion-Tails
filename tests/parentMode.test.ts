import { describe, it, expect } from "vitest";
import { PARENT_MODE_WINDOW_MS, parentModeActive } from "../shared/parentMode";

describe("parentModeActive", () => {
  const now = 1_000_000;

  it("is off for no session and for a session with neither field", () => {
    expect(parentModeActive(undefined, now)).toBe(false);
    expect(parentModeActive({}, now)).toBe(false);
  });

  it("is on inside the window and off at and after its end", () => {
    expect(parentModeActive({ parentModeExpiry: now + PARENT_MODE_WINDOW_MS }, now)).toBe(true);
    expect(parentModeActive({ parentModeExpiry: now }, now)).toBe(false);
    expect(parentModeActive({ parentModeExpiry: now - 1 }, now)).toBe(false);
  });

  it("indefinite wins, even over a stale expiry left behind", () => {
    expect(parentModeActive({ parentModeIndefinite: true }, now)).toBe(true);
    expect(parentModeActive({ parentModeIndefinite: true, parentModeExpiry: now - 1 }, now)).toBe(true);
    expect(parentModeActive({ parentModeIndefinite: false, parentModeExpiry: now - 1 }, now)).toBe(false);
  });
});
