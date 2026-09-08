/**
 * Check every Hero of Faith against Wikipedia and Wikidata.
 *
 * These profiles are written from knowledge, and knowledge is exactly the
 * thing this project has repeatedly caught being confidently wrong -- a Noah
 * story invented a wife named Miriam, and a model recited scripture that read
 * correctly and was not. The same discipline applies to the dates in a
 * children's history: check them against a source rather than trusting that
 * they look right.
 *
 * For each hero with a `wikipedia` article title this:
 *   - confirms the article exists (a typo'd title is a dead "read more" link)
 *   - reads birth and death dates from WIKIDATA, which stores them as
 *     structured values rather than prose
 *   - compares them with the years written in the profile
 *
 * Approximate dates are expected and are not failures: "c. 296" against a
 * Wikidata value of 296 agrees. A mismatch of one year on a pre-modern figure
 * is reported as a WARNING rather than an error, because the sources
 * themselves disagree that finely and Wikidata picks one.
 *
 *   npx tsx scripts/verify-heroes.ts            # check everything
 *   npx tsx scripts/verify-heroes.ts augustine  # check one
 */
import { heroesOfFaithData } from "../server/data/heroes";

type Check = { hero: string; level: "ok" | "warn" | "fail"; note: string };

const WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const WIKIDATA =
  "https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&props=claims&format=json&titles=";
/** Full plain-text article, for checking the dates in the timeline. */
const WIKI_EXTRACT =
  "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=";

/** Pull a four-digit year out of "c. 296", "1703-1758", "+1703-10-05T00:00:00Z". */
function year(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\b(\d{1,4})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** The last year in a range like "1703-1758". */
function endYear(text: string | undefined): number | null {
  if (!text) return null;
  const all = [...text.matchAll(/\b(\d{1,4})\b/g)].map((m) => parseInt(m[1], 10));
  return all.length > 1 ? all[all.length - 1] : null;
}

const approximate = (text: string | undefined) => Boolean(text && /c\.|circa|\?/i.test(text));

/**
 * Fetch with backoff, distinguishing "no such article" from "slow down".
 *
 * The first run reported fifteen missing articles including Martin Luther and
 * C. S. Lewis. They were all throttled requests -- a 429 and a 404 both simply
 * failed, and the script reported the wrong one. A check that reports failures
 * it cannot distinguish is not a check.
 */
async function getJson(url: string): Promise<{ ok: true; body: any } | { ok: false; missing: boolean }> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "LionTails-hero-verification/1.0 (educational content check)" },
      });
      if (res.status === 404) return { ok: false, missing: true };
      if (res.ok) return { ok: true, body: await res.json() };
      // 429 or 5xx: back off and try again.
      await new Promise((r) => setTimeout(r, attempt * 1500));
    } catch {
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  return { ok: false, missing: false };
}

async function checkHero(hero: (typeof heroesOfFaithData)[number]): Promise<Check[]> {
  const out: Check[] = [];
  const title = (hero as { wikipedia?: string }).wikipedia;

  if (!title) {
    out.push({ hero: hero.name, level: "warn", note: "no wikipedia title set" });
    return out;
  }

  const summaryRes = await getJson(WIKI_SUMMARY + encodeURIComponent(title));
  if (!summaryRes.ok) {
    out.push({
      hero: hero.name,
      level: summaryRes.missing ? "fail" : "warn",
      note: summaryRes.missing
        ? `wikipedia article not found: "${title}"`
        : `could not reach wikipedia for "${title}" (throttled or offline)`,
    });
    return out;
  }
  const summary = summaryRes.body;
  // A disambiguation page means the title is ambiguous and the link is useless.
  if (summary.type?.includes("disambiguation")) {
    out.push({ hero: hero.name, level: "fail", note: `"${title}" is a disambiguation page` });
    return out;
  }

  const dataRes = await getJson(WIKIDATA + encodeURIComponent(title));
  const data = dataRes.ok ? dataRes.body : null;
  const entity = data?.entities ? (Object.values(data.entities)[0] as any) : null;
  const claims = entity?.claims;
  const wdBorn = year(claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time);
  const wdDied = year(claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time);

  const ourBorn = year(hero.birthYear) ?? year(hero.timePeriod);
  const ourDied = year(hero.deathYear) ?? endYear(hero.timePeriod);
  const fuzzy = approximate(hero.birthYear) || approximate(hero.deathYear) || approximate(hero.timePeriod);

  // Wikipedia states years in its own one-line description, e.g.
  // "American Christian missionary (1927-1956)". Parsed as a second, genuinely
  // independent opinion -- Wikidata is a different database maintained by
  // different people, and they do disagree.
  const descYears = [...String(summary.description ?? "").matchAll(/\b(\d{3,4})\b/g)].map((m) =>
    parseInt(m[1], 10),
  );
  const wpBorn = descYears[0] ?? null;
  const wpDied = descYears[1] ?? null;

  const compare = (
    label: string,
    ours: number | null,
    wikidata: number | null,
    wikipedia: number | null,
  ) => {
    if (ours === null) return;
    const sources = [wikidata, wikipedia].filter((v): v is number => v !== null);
    if (sources.length === 0) return;
    if (sources.some((v) => v === ours)) return; // at least one source agrees

    const closest = sources.reduce((a, b) => (Math.abs(b - ours) < Math.abs(a - ours) ? b : a));
    const diff = Math.abs(closest - ours);
    const shown = `Wikidata ${wikidata ?? "-"}, Wikipedia ${wikipedia ?? "-"}`;

    if (wikidata !== null && wikipedia !== null && wikidata !== wikipedia) {
      // The sources disagree with each other, so they cannot convict.
      out.push({
        hero: hero.name,
        level: "warn",
        note: `${label}: sources disagree (${shown}); profile says ${ours}`,
      });
      return;
    }
    out.push({
      hero: hero.name,
      level: diff <= 2 && fuzzy ? "warn" : "fail",
      note: `${label}: profile says ${ours}, ${shown}`,
    });
  };
  compare("born", ourBorn, wdBorn, wpBorn);
  compare("died", ourDied, wdDied, wpDied);

  // ---- key events -------------------------------------------------------
  // Birth and death dates are the easy half. A timeline is where an invented
  // date hides most comfortably, because it looks like research. This does not
  // prove an event happened -- it checks that the YEAR appears somewhere in
  // the article, which catches a date pulled out of the air without pretending
  // to be a full fact-check.
  if (hero.keyEvents && hero.keyEvents.length > 0) {
    const extractRes = await getJson(WIKI_EXTRACT + encodeURIComponent(title));
    const pages = extractRes.ok ? extractRes.body?.query?.pages : null;
    const article: string = pages
      ? String((Object.values(pages)[0] as any)?.extract ?? "")
      : "";

    if (article.length > 500) {
      const unconfirmed = hero.keyEvents.filter((e) => {
        const years = [...String(e.year).matchAll(/\b(\d{3,4})\b/g)].map((m) => m[1]);
        if (years.length === 0) return false;
        // A range like "356-362" passes if EITHER endpoint is in the article.
        return !years.some((y) => article.includes(y));
      });
      if (unconfirmed.length > 0) {
        out.push({
          hero: hero.name,
          level: "warn",
          note:
            `${unconfirmed.length}/${hero.keyEvents.length} event years not found in the article: ` +
            unconfirmed.map((e) => e.year).join(", "),
        });
      }
    }
  }

  if (out.length === 0) {
    out.push({
      hero: hero.name,
      level: "ok",
      note: `${wdBorn ?? wpBorn ?? "?"}-${wdDied ?? wpDied ?? "?"} confirmed · ${summary.description ?? ""}`.trim(),
    });
  }
  return out;
}

async function main() {
  const only = process.argv[2];
  const heroes = only
    ? heroesOfFaithData.filter((h) => h.id === only || h.name.toLowerCase().includes(only.toLowerCase()))
    : heroesOfFaithData;

  if (heroes.length === 0) {
    console.error(`No hero matched "${only}"`);
    process.exit(1);
  }

  const results: Check[] = [];
  for (const hero of heroes) {
    results.push(...(await checkHero(hero)));
    // Courtesy to a free API that nobody is paying for, and the difference
    // between a clean run and fifteen false failures.
    await new Promise((r) => setTimeout(r, 1100));
  }

  const icon = { ok: "  ok  ", warn: " WARN ", fail: " FAIL " } as const;
  for (const r of results) {
    console.log(`${icon[r.level]} ${r.hero.padEnd(24)} ${r.note}`);
  }

  const fails = results.filter((r) => r.level === "fail").length;
  const warns = results.filter((r) => r.level === "warn").length;
  console.log(
    `\n${heroes.length} heroes checked — ${results.filter((r) => r.level === "ok").length} clean, ${warns} warnings, ${fails} failures`,
  );
  process.exit(fails > 0 ? 1 : 0);
}

void main();
