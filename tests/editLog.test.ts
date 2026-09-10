import { describe, it, expect } from "vitest";
import { lastEditedAt, type EditLogEntry } from "../shared/editLog";

describe("lastEditedAt", () => {
  it("is undefined for nothing edited", () => {
    expect(lastEditedAt(undefined)).toBeUndefined();
    expect(lastEditedAt(null)).toBeUndefined();
    expect(lastEditedAt([])).toBeUndefined();
  });

  it("returns the latest entry whatever the order", () => {
    const log: EditLogEntry[] = [
      { at: "2026-09-03T10:00:00.000Z", by: "parent", changed: ["title"] },
      { at: "2026-09-10T10:00:00.000Z", by: "parent", changed: ["content"] },
      { at: "2026-09-05T10:00:00.000Z", by: "parent", changed: ["title", "content"] },
    ];
    expect(lastEditedAt(log)).toBe("2026-09-10T10:00:00.000Z");
  });
});
