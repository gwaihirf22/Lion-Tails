/**
 * Take the guide's screenshots. DEV ONLY, run by hand, never in CI.
 *
 *   . /root/.claude/tools/env.sh      # playwright-core + sharp live there
 *   ./scripts/dev-stack.sh up
 *   npx tsx scripts/capture-guide.ts [--only reader-bar,library]
 *
 * WHY NOT IN CI: it needs a running app and a browser, like
 * `scripts/verify-heroes.ts` needs the network. A gate that fails for reasons
 * unrelated to the change is a gate people learn to ignore.
 *
 * WHAT IT WRITES: `public/images/guide/<plate>.webp`, and `shared/guideShots.ts`
 * -- each plate's size and, for every node, the box of the control to ring, as
 * FRACTIONS of that plate. The app draws the ring from those fractions, so a
 * re-run never needs anything redrawn.
 *
 * WHY MARKERS AND NOT TEXT SELECTORS: the guide's table names a `data-guide`
 * marker per control (shared/guide.ts). Labels here are rewritten constantly;
 * a text selector would quietly ring the wrong thing months later.
 *
 * PRIVACY. These images ship in the repo and in the public image, so:
 *  - it refuses to run against anything but the local dev stack;
 *  - it uses its OWN account (guide-demo) holding only the four demo people,
 *    and touches nobody else's data. Logging into the shared dev account
 *    instead would put whatever characters somebody was testing with into the
 *    Characters plate, and the only way to satisfy the check would be to
 *    delete their work;
 *  - it ABORTS if that account holds a character outside the demo set.
 * The Settings plates frame the cards the guide points at, never the API key.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import {
  GUIDE_PLATES,
  GUIDE_SCENES,
  guidePlate,
  nodesForPlate,
  platesForScene,
  type GuidePlate,
  type GuidePlateId,
  type GuideSceneId,
} from "../shared/guide";
import { guideDemoStory, GUIDE_DEMO_TITLE } from "./guideDemoStory";
import { DEMO_PEOPLE, DEMO_NAMES } from "./demoPeople";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(ROOT, "public", "images", "guide");
const MANIFEST = path.join(ROOT, "shared", "guideShots.ts");

/** The guide's own account: its cast and its library ARE the artwork. */
const GUIDE_USER = "guide-demo";
const GUIDE_PASSWORD = "LionTails-Guide-4b71c2";
const VIEWPORT = { width: 390, height: 844 };
/** 2x for crisp small type; the webp is then 780px wide. */
const SCALE = 2;
const PLATE_WARN_BYTES = 90 * 1024;
const PLATE_FAIL_BYTES = 120 * 1024;

type Box = { x: number; y: number; w: number; h: number };
type PlateImage = { file: string; width: number; height: number; capturedAt: string };

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const base = option("--base") ?? "http://127.0.0.1:5250";
const only = option("--only")?.split(",").map((s) => s.trim()).filter(Boolean);

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * A local app, never production. These screenshots ship, so the host is an
 * allow-list and production's own port is refused outright -- a typo must not
 * be able to photograph a real family's library.
 *
 * Any local port, because the app under test is not always the one dev-stack
 * started: a branch is often run beside it on a port of its own.
 */
function checkBase() {
  const url = new URL(base);
  const localHosts = ["127.0.0.1", "localhost", "192.168.1.9"];
  if (!localHosts.includes(url.hostname)) {
    die(`--base must be a local app, not ${base}. These screenshots ship.`);
  }
  if (url.port === "3003") die("Port 3003 is production. Refusing.");
  if (process.env.NODE_ENV === "production") die("NODE_ENV=production. Refusing.");
}

async function api(pathname: string, init?: RequestInit & { cookie?: string }) {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.cookie ? { Cookie: init.cookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

async function main() {
  checkBase();

  // CommonJS packages, so the interop shape differs by loader: named export
  // when Node's lexer finds it, otherwise on `default`.
  const playwright = await importOrDie<any>("playwright-core");
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) die("playwright-core loaded but has no chromium.");
  const sharpModule = await importOrDie<any>("sharp");
  const sharp = (sharpModule.default ?? sharpModule) as typeof import("sharp");

  const health = await api("/api/health").catch(() => undefined);
  if (!health?.ok) die(`No app at ${base}. Run ./scripts/dev-stack.sh up first.`);

  // ---- the guide's own account, created if it is not there yet -------------
  // A 400 means it already exists, which is the normal case.
  await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: GUIDE_USER, email: "guide@example.invalid", password: GUIDE_PASSWORD }),
  }).catch(() => undefined);

  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: GUIDE_USER, password: GUIDE_PASSWORD }),
  });
  if (!login.ok) die(`Could not log in as ${GUIDE_USER}.`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) die("No session cookie from the login.");
  const me = await (await api("/api/auth/me", { cookie })).json();
  if (me?.username !== GUIDE_USER) die(`Logged in as ${me?.username}, not ${GUIDE_USER}. Refusing.`);

  // ---- the four demo people, and nobody else ------------------------------
  let characters: { id: string; name: string }[] = await (
    await api("/api/characters", { cookie })
  ).json();
  for (const person of DEMO_PEOPLE) {
    if (characters.some((c) => c.name === person.name)) continue;
    const made = await api("/api/characters", { method: "POST", cookie, body: JSON.stringify(person) });
    if (!made.ok) die(`Could not create ${person.name}: ${made.status} ${await made.text()}`);
  }
  characters = await (await api("/api/characters", { cookie })).json();
  const strangers = characters.map((c) => c.name).filter((n) => !DEMO_NAMES.includes(n));
  if (strangers.length) {
    die(
      `${GUIDE_USER} holds characters outside the demo set: ${strangers.join(", ")}.\n` +
        `  These screenshots ship, so they may only ever show ${DEMO_NAMES.join(", ")}.`,
    );
  }
  const mia = characters.find((c) => c.name === "Mia");
  if (!mia) die("No character called Mia in the guide account.");

  // ---- pictures: "Make a picture" is hidden when they are turned off -------
  // It is no longer an entitlement question -- anyone may draw, at a price --
  // but a demo account with pictures off would still photograph a reader with
  // no picture button and ring nothing.
  const models = await (await api("/api/settings/models", { cookie })).json();
  if (models?.pictures?.tier === "none") {
    die(
      `${GUIDE_USER} has pictures turned off, so the reader would have no "Make a picture"\n` +
        "  button and its ring would land on nothing. Choose a picture quality in Settings.",
    );
  }
  if (!models?.pictures?.free) {
    die(
      `${GUIDE_USER} is charged for pictures, so the buttons in these screenshots would\n` +
        "  carry a price that is true of nobody else. Make it an admin and run again:\n" +
        `  ./scripts/dev-stack.sh admin ${GUIDE_USER}`,
    );
  }

  // ---- Parent Mode on for the run (the prompt editor, Edit, Grown-ups) ------
  const unlock = await api("/api/auth/verify-password", {
    method: "POST",
    cookie,
    body: JSON.stringify({ password: GUIDE_PASSWORD, keep: true }),
  });
  if (!unlock.ok) die("Could not turn Parent Mode on.");

  // ---- a real saved story, written by hand, no model call ------------------
  const stories: { id: string; story: { title: string } }[] = await (
    await api("/api/stories", { cookie })
  ).json();
  let demoId = stories.find((s) => s.story?.title === GUIDE_DEMO_TITLE)?.id;
  // Reused between runs; see the note where it is saved.
  if (!demoId) {
    const saved = await api("/api/story/save", {
      method: "POST",
      cookie,
      body: JSON.stringify(guideDemoStory(mia.id)),
    });
    if (!saved.ok) die(`Could not save the demo story: ${saved.status} ${await saved.text()}`);
    demoId = (await saved.json())?.id;
  }
  if (!demoId) die("The demo story saved but returned no id.");

  // ---- the browser ---------------------------------------------------------
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    // The app follows the reader palette; Paper is the default and the one
    // every new account sees.
    colorScheme: "light",
  });
  await context.addCookies([
    {
      name: cookie.split("=")[0],
      value: cookie.split("=").slice(1).join("="),
      url: base,
    },
  ]);
  const page = await context.newPage();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const images: Record<string, PlateImage> = {};
  const boxes: Record<string, Box> = {};
  const report: { plate: string; kb: number; nodes: number }[] = [];

  const go = async (pathname: string) => {
    await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await closeGuideIfOpen(page);
  };
  const marker = (name: string) => page.locator(`[data-guide="${name}"]`).first();
  const tapMarker = async (name: string) => {
    await marker(name).click();
    await page.waitForTimeout(250);
  };

  /**
   * One builder per scene, and the Record is total over GUIDE_SCENES -- a
   * scene in the table with no builder here is a compile error, which is the
   * point of naming scenes rather than writing steps into the table.
   */
  const SCENES: Record<GuideSceneId, () => Promise<void>> = {
    "create-top": async () => {
      await go("/generate-story");
    },
    "origin-blank": async () => {
      await go("/generate-story");
      await marker("cast").scrollIntoViewIfNeeded();
    },
    "origin-two-characters": async () => {
      await go("/generate-story");
      await tapMarker("cast");
      await page.getByRole("button", { name: /^Mia/ }).first().click();
      await page.getByRole("button", { name: /^Noah/ }).first().click();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    },
    "origin-with-character": async () => {
      await go("/generate-story");
      await tapMarker("cast");
      await page.getByRole("button", { name: /^Mia/ }).first().click();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    },
    "origin-series": async () => {
      await go("/generate-story");
      // The cliffhanger box only exists once the series box is ticked.
      await page.getByLabel(/I might write more stories in this world/).click();
      await page.waitForTimeout(250);
    },
    "origin-somewhere-real": async () => {
      await go("/generate-story");
      await tapMarker("cast");
      await page.getByRole("button", { name: /^Mia/ }).first().click();
      await page.keyboard.press("Escape");
      await tapMarker("somewhere-real");
      await tapMarker("source");
      // A fixed choice, so the plate is the same picture every run.
      await page.getByPlaceholder(/Search, or type a reference/).fill("Corrie");
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /Corrie/ }).first().click();
      await page.waitForTimeout(400);
    },
    "origin-tail": async () => {
      await SCENES["origin-with-character"]();
      await marker("story-length").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
    "historical-chosen": async () => {
      await go("/generate-story");
      await tapMarker("historical-tab");
      await tapMarker("dig-into");
      await page.getByPlaceholder(/Search, or type a reference/).fill("Corrie");
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /Corrie/ }).first().click();
      await page.waitForTimeout(400);
    },
    "characters-list": async () => {
      await go("/characters");
    },
    "character-basics": async () => {
      await go("/characters");
      await marker("character-card").click();
      await page.waitForTimeout(400);
    },
    "character-appearance": async () => {
      await SCENES["character-basics"]();
      await page.getByRole("tab", { name: "Appearance" }).click();
      await page.waitForTimeout(300);
    },
    "character-stats": async () => {
      await SCENES["character-basics"]();
      await page.getByRole("tab", { name: "Attributes/Skills" }).click();
      await page.waitForTimeout(300);
    },
    "character-grown-ups": async () => {
      await SCENES["character-basics"]();
      await page.getByRole("tab", { name: "Grown-ups" }).click();
      await page.waitForTimeout(300);
    },
    library: async () => {
      await go("/saved-stories");
    },
    reader: async () => {
      await go(`/story?id=${demoId}`);
      await page.waitForTimeout(400);
    },
    "reader-picking": async () => {
      await go(`/story?id=${demoId}`);
      await tapMarker("make-a-picture");
      // Highlight a sentence, so the bar shows what it looks like in use.
      await page.evaluate(() => {
        const p = document.querySelector("article p");
        if (!p) return;
        const range = document.createRange();
        range.selectNodeContents(p);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        p.dispatchEvent(new Event("mouseup", { bubbles: true }));
        document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      });
      await page.waitForTimeout(400);
    },
    "reader-extras": async () => {
      await go(`/story?id=${demoId}`);
      await marker("extras").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    },
    settings: async () => {
      await go("/settings");
    },
    "mobile-menu": async () => {
      await go("/generate-story");
      await page.getByRole("button", { name: /Open menu/ }).click();
      await page.waitForTimeout(300);
    },
  };

  const wanted: GuidePlate[] = (only ? GUIDE_PLATES.filter((p) => only.includes(p.id)) : GUIDE_PLATES).map(
    (p) => guidePlate(p.id as GuidePlateId),
  );
  const scenes = GUIDE_SCENES.filter((scene) => wanted.some((p) => p.scene === scene));

  for (const scene of scenes) {
    console.log(`\nscene ${scene}`);
    await SCENES[scene]();
    for (const plate of platesForScene(scene)) {
      if (!wanted.some((p) => p.id === plate.id)) continue;

      // The frame: the marked element, or the viewport centred on a marker.
      let clip: { x: number; y: number; width: number; height: number } | undefined;
      if (plate.frame) {
        const frame = marker(plate.frame);
        await frame.waitFor({ state: "visible", timeout: 15_000 });
        clip = (await frame.boundingBox()) ?? undefined;
        if (!clip) die(`${plate.id}: [data-guide="${plate.frame}"] has no box on screen.`);
      } else if (plate.around) {
        const target = marker(plate.around);
        await target.waitFor({ state: "visible", timeout: 15_000 });
        await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(250);
      }

      const shot = await page.screenshot(clip ? { clip } : undefined);
      const meta = await sharp(shot).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      const origin = clip ?? { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height };

      // Every ring on this plate, as fractions of the picture.
      for (const node of nodesForPlate(plate.id as GuidePlateId)) {
        const target = marker(node.shot!.emphasise);
        const box = await target.boundingBox();
        if (!box) die(`${node.id}: [data-guide="${node.shot!.emphasise}"] is not on screen for ${plate.id}.`);
        const ring = {
          x: round((box.x - origin.x) / origin.width),
          y: round((box.y - origin.y) / origin.height),
          w: round(box.width / origin.width),
          h: round(box.height / origin.height),
        };
        // A ring outside its plate is a plate framed on the wrong thing, and it
        // must fail here rather than render over the wrong control.
        if (ring.x < 0 || ring.y < 0 || ring.x + ring.w > 1.02 || ring.y + ring.h > 1.02) {
          die(
            `${node.id}: its control is outside the ${plate.id} plate ` +
              `(${JSON.stringify(ring)}). Give that node its own plate, or frame a bigger section.`,
          );
        }
        if (ring.w <= 0.02 || ring.h <= 0.005) die(`${node.id}: its control has no size on screen.`);
        boxes[node.id] = ring;
      }

      // webp, with one retry at lower quality before the hard ceiling.
      const file = path.join(OUT_DIR, `${plate.id}.webp`);
      let bytes = await writeWebp(sharp, shot, file, 78);
      if (bytes > PLATE_WARN_BYTES) bytes = await writeWebp(sharp, shot, file, 66);
      if (bytes > PLATE_FAIL_BYTES) die(`${plate.id}: ${kb(bytes)}KB is over the budget.`);

      images[plate.id] = {
        file: `/public/images/guide/${plate.id}.webp`,
        width,
        height,
        capturedAt: new Date().toISOString(),
      };
      report.push({ plate: plate.id, kb: kb(bytes), nodes: nodesForPlate(plate.id as GuidePlateId).length });
      console.log(`  ${plate.id}: ${width}x${height}, ${kb(bytes)}KB`);
    }
  }

  await browser.close();

  // The demo story is LEFT in place: it lives in the guide's own account, so
  // it is in nobody's way, and the next run reuses it instead of writing a
  // second copy.

  writeManifest(images, boxes);

  console.log("\n  plate                 KB   nodes");
  for (const row of report.sort((a, b) => a.plate.localeCompare(b.plate))) {
    console.log(`  ${row.plate.padEnd(20)} ${String(row.kb).padStart(4)}  ${row.nodes}`);
  }
  console.log(`\n  ${report.length} plate(s), ${Object.keys(boxes).length} ring(s). Manifest written.\n`);
}

/** Merged, so `--only` re-takes some plates without dropping the rest. */
function writeManifest(images: Record<string, PlateImage>, boxes: Record<string, Box>) {
  const existing = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, "utf8") : "";
  const keep = (name: string): Record<string, unknown> => {
    const match = existing.match(new RegExp(`export const ${name}[^=]*= (\\{[\\s\\S]*?\\n\\};)`));
    if (!match) return {};
    try {
      return JSON.parse(match[1].replace(/;$/, "").replace(/(\w+):/g, '"$1":').replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return {};
    }
  };
  const mergedImages = { ...keep("GUIDE_PLATE_IMAGES"), ...images };
  const mergedBoxes = { ...keep("GUIDE_BOXES"), ...boxes };
  const sorted = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

  const header = fs.readFileSync(MANIFEST, "utf8").split("export const GUIDE_PLATE_IMAGES")[0];
  fs.writeFileSync(
    MANIFEST,
    `${header}export const GUIDE_PLATE_IMAGES: Partial<Record<GuidePlateId, GuidePlateImage>> = ${JSON.stringify(
      sorted(mergedImages),
      null,
      2,
    )};\n\nexport const GUIDE_BOXES: Partial<Record<GuideShotNodeId, GuideBox>> = ${JSON.stringify(
      sorted(mergedBoxes),
      null,
      2,
    )};\n`,
  );
}

async function writeWebp(
  sharp: typeof import("sharp"),
  buffer: Buffer,
  file: string,
  quality: number,
): Promise<number> {
  await sharp(buffer).webp({ quality }).toFile(file);
  return fs.statSync(file).size;
}

/** The guide opens itself on /generate-story for an account that has not seen it. */
async function closeGuideIfOpen(page: import("playwright-core").Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "How to use Lion Tails" });
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Close" }).first().click();
    await page.waitForTimeout(200);
  }
}

/**
 * Import a BORROWED module: playwright-core and sharp are not dependencies of
 * this app and must not become ones (CLAUDE.md's rule for occasional image
 * work). They live in the operator's tools directory, named by NODE_PATH --
 * which ESM ignores, so the file has to be resolved by hand and imported by
 * URL. A plain `import(name)` is tried first, for a machine that does have
 * them installed.
 */
async function importOrDie<T>(name: string): Promise<T> {
  try {
    return (await import(name)) as T;
  } catch {
    // fall through to the borrowed copies
  }
  for (const dir of (process.env.NODE_PATH ?? "").split(":").filter(Boolean)) {
    try {
      const resolve = createRequire(path.join(dir, "resolve-from-here.cjs"));
      const file = resolve.resolve(name);
      return (await import(pathToFileURL(file).href)) as T;
    } catch {
      // try the next directory
    }
  }
  return die(
    `${name} is not available. It is borrowed, not a dependency of this app:\n` +
      "  . /root/.claude/tools/env.sh",
  );
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const kb = (bytes: number) => Math.round(bytes / 1024);

main().catch((error) => die(String(error?.stack ?? error)));
