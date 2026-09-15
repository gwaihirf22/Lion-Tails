import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  GUIDE_NODES,
  GUIDE_PLATES,
  GUIDE_SCENES,
  GUIDE_TABS,
  GUIDE_VERSION,
  guideMarkers,
  guideNodes,
  guideTree,
  nodesForPlate,
  platesForScene,
  shotNodes,
  NEEDS_LABEL,
  type GuideTabId,
} from "../shared/guide";
import { seenGuide, guideSeenValue, guideSeenKey } from "../client/src/lib/guideSeen";

const root = path.resolve(__dirname, "..");
const GUIDE_IMAGE_DIR = path.join(root, "public", "images", "guide");
/** Per plate, and for the directory. The invariant, not today's number. */
const MAX_PLATE_BYTES = 120 * 1024;
const MAX_TOTAL_BYTES = 1_600 * 1024;

describe("the guide's table", () => {
  it("has unique ids", () => {
    const ids = GUIDE_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const plates = GUIDE_PLATES.map((p) => p.id);
    expect(new Set(plates).size).toBe(plates.length);
    expect(new Set(GUIDE_SCENES).size).toBe(GUIDE_SCENES.length);
  });

  it("gives every tab exactly one root and something to say", () => {
    for (const tab of GUIDE_TABS) {
      const nodes = GUIDE_NODES.filter((n) => n.tab === tab.id);
      expect(nodes.length, tab.id).toBeGreaterThan(0);
      expect(nodes.filter((n) => n.parent === null).map((n) => n.id), tab.id).toHaveLength(1);
    }
    // Every node belongs to a tab that exists.
    const tabs = new Set(GUIDE_TABS.map((t) => t.id));
    for (const node of GUIDE_NODES) expect(tabs.has(node.tab), node.id).toBe(true);
  });

  it("builds a tree that holds every node exactly once", () => {
    const seen: string[] = [];
    for (const tab of GUIDE_TABS) for (const entry of guideNodes(tab.id)) seen.push(entry.node.id);
    expect(seen.sort()).toEqual(GUIDE_NODES.map((n) => n.id).sort());
    // A child in a different tab from its parent would have thrown by now.
    for (const tab of GUIDE_TABS) expect(guideTree(tab.id)).toHaveLength(1);
  });

  it("branches to unequal depths, which is the shape asked for", () => {
    const depths = guideNodes("create").map((e) => e.depth);
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(5);
    // A leaf near the top: not every branch runs deep.
    const leaves = guideNodes("create").filter((e) => e.children.length === 0);
    expect(Math.min(...leaves.map((l) => l.depth))).toBeLessThanOrEqual(2);
  });

  it("keeps quests as their own branch, under setting it somewhere real", () => {
    const quest = guideNodes("create").find((e) => e.node.id === "quest");
    expect(quest).toBeDefined();
    expect(quest!.children.length).toBeGreaterThanOrEqual(2);
    // Reachable only through "Set it somewhere real".
    const parents = (id: string): string[] => {
      const node = GUIDE_NODES.find((n) => n.id === id)!;
      return node.parent ? [node.parent, ...parents(node.parent)] : [];
    };
    expect(parents("quest")).toContain("somewhere-real");
  });

  it("says something, in sentences, short enough to read on a phone", () => {
    for (const node of GUIDE_NODES) {
      expect(node.title.trim(), node.id).not.toBe("");
      expect(node.why.trim().length, node.id).toBeGreaterThan(40);
      expect(node.why.trim().length, node.id).toBeLessThanOrEqual(340);
      expect(node.why.trim().endsWith("."), node.id).toBe(true);
      // Written for a parent, not a developer: no code words in the prose.
      expect(node.why, node.id).not.toMatch(/data-guide|localStorage|API key in code|undefined/);
    }
  });

  it("only claims a requirement it has words for", () => {
    for (const node of GUIDE_NODES) {
      if (node.needs) expect(NEEDS_LABEL[node.needs], node.id).toBeTruthy();
    }
  });

  it("groups plates by scene and nodes by plate", () => {
    for (const scene of GUIDE_SCENES) {
      // Every scene is worth building: it carries at least one plate.
      expect(platesForScene(scene).length, scene).toBeGreaterThan(0);
    }
    for (const plate of GUIDE_PLATES) {
      // Every plate is worth taking: at least one node shows it.
      expect(nodesForPlate(plate.id).length, plate.id).toBeGreaterThan(0);
      expect(GUIDE_SCENES).toContain(plate.scene);
    }
  });

  it("points every screenshot at a plate that exists", () => {
    const plates = new Set(GUIDE_PLATES.map((p) => p.id));
    for (const node of shotNodes()) {
      expect(plates.has(node.shot.plate), node.id).toBe(true);
      expect(node.shot.emphasise.trim(), node.id).not.toBe("");
    }
    // Most nodes are about a control, so most carry a shot. A handful are
    // about an idea (the shop and the lantern have no button).
    expect(shotNodes().length).toBeGreaterThan(GUIDE_NODES.length * 0.8);
  });
});

/**
 * THE STALENESS GATE.
 *
 * A screenshot cannot be checked by a test -- no test knows what the app looks
 * like today. What CAN be checked is that every control the guide points at
 * still exists and is unambiguous, which is the failure that actually misleads
 * a parent: a ring drawn over whatever moved into that place.
 */
describe("the guide points at controls that exist", () => {
  const sources: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) sources.push({ file: full, text: fs.readFileSync(full, "utf8") });
    }
  };
  walk(path.join(root, "client", "src"));

  /**
   * Every marker in an attribute position, counted per file.
   *
   * A `guide="x"` prop counts too: three shared components (FormSection,
   * FolderTabs, SourcePicker) take the marker as a prop and put it on their
   * own element, which is what lets one component serve two meanings -- the
   * source picker is "Where, or who?" on one tab and "What do you want to dig
   * into?" on the other.
   *
   * Two value forms, because one control needs the second: the role radios render
   * from a map over ROLE_OPTIONS, so their marker is chosen in an expression
   * (`data-guide={key === "travels" ? "quest" : …}`). Reading the literals out
   * of the braces keeps the "exactly once" rule honest without asking the app
   * to write the attribute twice. An INTERPOLATED marker (a template string)
   * has no literal to find and so fails this check -- which is the right
   * answer: Tailwind and this guide both need whole strings in the source.
   */
  const found = new Map<string, string[]>();
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/(?:data-)?guide=(?:"([^"]+)"|\{([^}]*)\})/g)) {
      const literals = m[1] ? [m[1]] : [...(m[2] ?? "").matchAll(/"([^"]+)"/g)].map((q) => q[1]);
      for (const marker of literals) found.set(marker, [...(found.get(marker) ?? []), file]);
    }
  }

  it("finds the markers at all, so this check cannot pass vacuously", () => {
    expect(found.size).toBeGreaterThanOrEqual(20);
  });

  it("marks each control the guide names exactly once", () => {
    for (const marker of guideMarkers()) {
      const hits = found.get(marker) ?? [];
      expect(hits.length, `data-guide="${marker}" (${hits.join(", ") || "not found"})`).toBe(1);
    }
  });

  it("has no marker in the app that the guide never uses", () => {
    const used = new Set(guideMarkers());
    for (const marker of found.keys()) expect(used.has(marker), `data-guide="${marker}" is unused`).toBe(true);
  });
});

describe("the guide's screenshots", () => {
  // Imported lazily: the manifest is generated, and a test file that cannot be
  // imported until the capture has run is a test file nobody can run.
  const manifest = () => import("../shared/guideShots");

  it("has an image for every plate, on disk, the size it says", async () => {
    const { GUIDE_PLATE_IMAGES } = await manifest();
    for (const plate of GUIDE_PLATES) {
      const image = GUIDE_PLATE_IMAGES[plate.id];
      expect(image, plate.id).toBeDefined();
      expect(image.file, plate.id).toMatch(/^\/public\/images\/guide\/[a-z0-9-]+\.webp$/);
      expect(fs.existsSync(path.join(root, image.file.replace(/^\//, ""))), image.file).toBe(true);
      expect(image.width, plate.id).toBeGreaterThan(0);
      expect(image.height, plate.id).toBeGreaterThan(0);
    }
  });

  it("keeps no orphan images", async () => {
    const { GUIDE_PLATE_IMAGES } = await manifest();
    const onDisk = fs.readdirSync(GUIDE_IMAGE_DIR).filter((f) => !f.startsWith("."));
    const wanted = GUIDE_PLATES.map((p) => path.basename(GUIDE_PLATE_IMAGES[p.id].file));
    expect(onDisk.sort()).toEqual(wanted.sort());
  });

  it("stays inside its weight budget", () => {
    let total = 0;
    for (const file of fs.readdirSync(GUIDE_IMAGE_DIR)) {
      const bytes = fs.statSync(path.join(GUIDE_IMAGE_DIR, file)).size;
      expect(bytes, file).toBeLessThanOrEqual(MAX_PLATE_BYTES);
      total += bytes;
    }
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });

  it("has a ring for every node that carries a screenshot, inside the picture", async () => {
    const { GUIDE_BOXES } = await manifest();
    const withShots = shotNodes().map((n) => n.id);
    expect(Object.keys(GUIDE_BOXES).sort()).toEqual([...withShots].sort());
    for (const [id, box] of Object.entries(GUIDE_BOXES)) {
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.y, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w, id).toBeLessThanOrEqual(1.001);
      expect(box.y + box.h, id).toBeLessThanOrEqual(1.001);
      expect(box.w, id).toBeGreaterThan(0.02);
      expect(box.h, id).toBeGreaterThan(0.005);
    }
  });
});

describe("showing the guide once", () => {
  it("counts an absent or unreadable mirror as not seen", () => {
    expect(seenGuide(null, GUIDE_VERSION)).toBe(false);
    expect(seenGuide("", GUIDE_VERSION)).toBe(false);
    expect(seenGuide("{not json", GUIDE_VERSION)).toBe(false);
    expect(seenGuide('{"version":"one"}', GUIDE_VERSION)).toBe(false);
  });

  it("is seen at this version and later, not at an older one", () => {
    expect(seenGuide(guideSeenValue(GUIDE_VERSION), GUIDE_VERSION)).toBe(true);
    expect(seenGuide(guideSeenValue(GUIDE_VERSION + 1), GUIDE_VERSION)).toBe(true);
    expect(seenGuide(guideSeenValue(GUIDE_VERSION - 1), GUIDE_VERSION)).toBe(false);
  });

  it("keys the mirror per user, the reading-prefs shape", () => {
    expect(guideSeenKey(7)).toBe("liontails.guide.seen.v1:7");
    expect(guideSeenKey(null)).toBe("liontails.guide.seen.v1:anon");
    expect(guideSeenKey(7)).not.toBe(guideSeenKey(8));
  });
});
