/**
 * Put a usable account and a small cast into the dev database.
 *
 * Idempotent: run it as often as you like. It exists so that `dev-stack.sh up`
 * gives you something you can immediately click through -- a login, characters
 * in the picker, and therefore a story you can generate -- rather than an empty
 * app that needs ten minutes of setup before it can show you anything.
 *
 * Registers through the HTTP API rather than writing the users row directly,
 * because the password hash belongs to server/auth.ts and duplicating it here
 * would be a second definition of how a password is stored.
 *
 *   DATABASE_URL=... npx tsx scripts/dev-seed.ts
 */
const BASE = process.env.DEV_BASE ?? "http://127.0.0.1:5250";
const USER = "blake";
const PASS = "LionTails-Dev-6a0cff";

const PEOPLE = [
  { name: "Mia",  gender: "girl", age: 8,  hair: "brown", eyes: "blue",  favoriteColor: "purple", favoriteAnimal: "rabbit", hobby: "drawing",           personality: "curious" },
  { name: "Noah", gender: "boy",  age: 6,  hair: "black", eyes: "brown", favoriteColor: "green",                            hobby: "building things",   personality: "patient" },
  { name: "Ruth", gender: "girl", age: 10, hair: "red",   eyes: "green", favoriteColor: "yellow",                           hobby: "climbing trees",    personality: "brave" },
  { name: "Sam",  gender: "boy",  age: 7,  hair: "blonde", eyes: "hazel", favoriteColor: "blue",                            hobby: "collecting rocks",  personality: "thoughtful" },
];

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`dev-seed: nothing answering at ${BASE}. Start the app first.`);
    process.exit(0); // not a failure of the stack script
  }

  // 400 here means the account already exists, which is the normal case.
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, email: "blake@example.invalid", password: PASS }),
  }).catch(() => undefined);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    console.error("dev-seed: could not log in. If the password was changed, run 'reset'.");
    process.exit(0);
  }

  const existing: Array<{ name: string }> = await (
    await fetch(`${BASE}/api/characters`, { headers: { cookie } })
  ).json();
  const have = new Set(existing.map((c) => c.name));

  let added = 0;
  const refused: string[] = [];
  for (const p of PEOPLE) {
    if (have.has(p.name)) continue;
    const r = await fetch(`${BASE}/api/characters`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(p),
    });
    if (r.ok) {
      added++;
      continue;
    }
    // SAY SO. This used to be `if (r.ok) added++;` with no else, so when the
    // character vocabulary landed and three of the four fixtures stopped
    // validating, `reset && up` brought the dev box up with one character
    // instead of four and printed a cheerful count. A seeder that cannot fail
    // out loud is a seeder that quietly stops seeding.
    const body = await r.json().catch(() => ({}));
    refused.push(`${p.name}: ${r.status} ${(body as { message?: string }).message ?? ""}`.trim());
  }

  console.log(`dev-seed: ${USER} / ${PASS}`);
  console.log(`dev-seed: ${existing.length + added} characters (${added} added)`);
  if (refused.length) {
    console.error(`dev-seed: ${refused.length} REFUSED by the API:`);
    for (const r of refused) console.error(`  - ${r}`);
    console.error("dev-seed: the fixtures and shared/characterVocab.ts disagree.");
    process.exitCode = 1;
  }
}

void main();
