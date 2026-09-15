/**
 * The four demo characters, in one place.
 *
 * `dev-seed.ts` puts them in the dev account so the app has something to click
 * through, and `capture-guide.ts` puts the same four in the guide's own
 * account so every shipped screenshot shows these people and nobody real.
 * Two copies of this list would be two sets of names in the artwork.
 */
export const DEMO_PEOPLE = [
  { name: "Mia",  gender: "girl", age: 8,  hair: "brown",  eyes: "blue",  favoriteColor: "purple", favoriteAnimal: "rabbit", hobby: "drawing",          personality: "curious" },
  { name: "Noah", gender: "boy",  age: 6,  hair: "black",  eyes: "brown", favoriteColor: "green",                            hobby: "building things",  personality: "patient" },
  { name: "Ruth", gender: "girl", age: 10, hair: "red",    eyes: "green", favoriteColor: "yellow",                           hobby: "climbing trees",   personality: "brave" },
  { name: "Sam",  gender: "boy",  age: 7,  hair: "blonde", eyes: "hazel", favoriteColor: "blue",                             hobby: "collecting rocks", personality: "thoughtful" },
] as const;

export const DEMO_NAMES: readonly string[] = DEMO_PEOPLE.map((p) => p.name);
