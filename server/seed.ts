import { databaseReady } from "./db";
import { storage } from "./storage";
import { heroesOfFaithData, heroesWithoutBiography } from "./data/heroes";
import { log } from "./static";

/**
 * Seeds reference data that the app expects to exist. See docs/decisions.md §3.
 *
 * This used to be a fire-and-forget async IIFE inside registerRoutes, which
 * raced database initialisation and reliably lost: getAllHeroesOfFaith() hit
 * the isDatabaseAvailable() guard, returned an empty array as a *fallback*,
 * the seeder concluded the table was empty, and then every createHeroOfFaith()
 * hit the same guard and returned a discarded in-memory instance. Fifteen
 * writes to nowhere, on every boot.
 *
 * It only ever appeared to work because an early boot happened to win the race
 * and populate the table. Against a fresh database it would have failed
 * permanently and silently, while /api/heroes still served the in-memory copy
 * for the life of the process -- so the endpoint would have lied.
 *
 * Seeding reference data is a boot-sequence concern, not a route-registration
 * one, so it lives here and is awaited before the server starts listening.
 */
export async function seedReferenceData(): Promise<void> {
  const ready = await databaseReady;

  if (!ready) {
    log(
      "Skipping reference data seeding: no database. Heroes of Faith will be served from memory for this process only.",
      "seed",
    );
    return;
  }

  try {
    // No "already seeded, skip" check any more. That guard is why adding a
    // hero to the data file did nothing on a database that already had rows --
    // production sat at the original fifteen and would have stayed there
    // however many people were written. Seeding is an UPSERT against a stable
    // slug now, so it is safe to run on every boot and it actually delivers
    // changes.
    const before = await storage.getAllHeroesOfFaith();
    log(`Syncing ${heroesOfFaithData.length} Heroes of Faith (${before.length} present)...`, "seed");

    let created = 0;
    for (const hero of heroesOfFaithData) {
      try {
        await storage.upsertHeroOfFaith(hero);
        created++;
      } catch (err) {
        console.error(`Failed to write hero: ${hero.name}`, err);
      }
    }

    // Retire the old uuid-keyed rows for people the data file now owns under a
    // slug. Matched by NAME rather than "anything unrecognised", because an
    // admin can add a hero through the API and that one must survive.
    try {
      const superseded = await storage.findSupersededHeroes(
        heroesOfFaithData.map((h) => h.id),
        heroesOfFaithData.map((h) => h.name),
      );
      for (const id of superseded) {
        await storage.deleteHeroOfFaith(id);
      }
      if (superseded.length > 0) {
        log(`Removed ${superseded.length} superseded hero rows (old random ids)`, "seed");
      }
    } catch (err) {
      console.error("Could not retire superseded hero rows:", err);
    }

    if (heroesWithoutBiography.length > 0) {
      log(
        `${heroesWithoutBiography.length} heroes still have no full profile: ` +
          heroesWithoutBiography.join(", "),
        "seed",
      );
    }

    // Read back rather than trusting the writes: the whole point of this
    // rewrite is that the storage layer can silently accept writes that go
    // nowhere.
    const after = await storage.getAllHeroesOfFaith();
    if (after.length === 0) {
      console.error(
        `SEEDING FAILED: created ${created} heroes but the table is still empty. ` +
          "Heroes of Faith will not persist.",
      );
    } else {
      log(`Seeded Heroes of Faith: ${after.length} rows`, "seed");
    }
  } catch (error) {
    console.error("Error seeding Heroes of Faith data:", error);
  }
}
