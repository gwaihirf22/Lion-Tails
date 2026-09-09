/**
 * What a character may BE, and what a child may pick to describe them.
 *
 * Two jobs, deliberately in one file:
 *
 *  1. It is the OPTION SOURCE for the character form.
 *  2. It is the VALIDATION SOURCE for the strict write path in routes.ts.
 *
 * One list, not two. A second copy of "what may a dragon's scales be" is how
 * this repo produced four schema sources and six model lists; the form offering
 * something the server rejects is the same failure wearing a friendlier face.
 *
 * CHILDREN SELECT; THEY DO NOT TYPE. Every descriptive field is drawn from
 * here. The only free-text fields on a character are the name and the notes
 * box. Parent Mode bypasses all of it through PUT /api/characters/:id/custom,
 * which is why nothing in this file needs an "other" escape hatch.
 *
 * The kind lists began as shared/animalData.ts -- the same curated animals the
 * favourite-animal autocomplete already used -- tagged by category. That list
 * serves type-ahead, where length is free; browsing 788 options is not, so the
 * form shows popularKinds(category) and reaches the rest through searchKinds().
 */

import { animalDatabase } from "./animalData";

/**
 * What sort of thing a character is.
 *
 * NEVER reaches a prompt. It selects vocabulary and the covering noun; the
 * story only ever sees `kind`, so a girl renders as "a girl" and not
 * "a human". Legacy rows have no category, and every consumer falls through to
 * the human default, which is what keeps the golden briefs byte-identical.
 */
export const CHARACTER_CATEGORIES = [
  "human", "mammal", "bird", "reptile", "amphibian",
  "fish", "insect", "creature", "mythical", "machine",
] as const;

export type CharacterCategory = (typeof CHARACTER_CATEGORIES)[number];

const HUMAN: readonly string[] = [
  "boy", "girl", "man", "woman", "grandmother", "grandfather", "baby",
];

const MAMMAL: readonly string[] = [
  "dog", "cat", "rabbit", "hamster", "guinea pig", "gerbil", "chinchilla", "ferret", "rat",
  "mouse", "horse", "pony", "cow", "bull", "calf", "pig", "piglet", "sheep", "lamb", "goat",
  "kid", "donkey", "mule", "llama", "alpaca", "yak", "water buffalo", "ox", "lion", "lioness",
  "elephant", "baby elephant", "giraffe", "zebra", "rhinoceros", "hippopotamus", "cheetah",
  "leopard", "jaguar", "hyena", "meerkat", "warthog", "baboon", "mandrill", "chimpanzee",
  "gorilla", "orangutan", "wildebeest", "gazelle", "antelope", "impala", "springbok", "kudu",
  "eland", "oryx", "dik-dik", "aardvark", "pangolin", "caracal", "serval", "wild dog",
  "jackal", "fennec fox", "bear", "black bear", "grizzly bear", "polar bear", "wolf", "coyote",
  "fox", "red fox", "arctic fox", "deer", "white-tailed deer", "mule deer", "elk", "moose",
  "caribou", "reindeer", "bison", "buffalo", "mountain goat", "bighorn sheep", "pronghorn",
  "raccoon", "opossum", "skunk", "porcupine", "beaver", "otter", "mink", "weasel", "stoat",
  "ermine", "marten", "fisher", "wolverine", "badger", "groundhog", "woodchuck", "prairie dog",
  "chipmunk", "squirrel", "flying squirrel", "puma", "mountain lion", "cougar", "ocelot",
  "margay", "jaguarundi", "vicuna", "guanaco", "tapir", "capybara", "viscacha", "agouti",
  "paca", "coati", "kinkajou", "olingo", "tayra", "grison", "giant anteater", "tamandua",
  "silky anteater", "three-toed sloth", "two-toed sloth", "armadillo", "giant armadillo",
  "pink fairy armadillo", "tiger", "snow leopard", "clouded leopard", "asian elephant",
  "panda", "giant panda", "red panda", "sun bear", "asiatic black bear", "sloth bear",
  "proboscis monkey", "macaque", "langur", "gibbon", "siamang", "tarsier", "loris",
  "binturong", "civet", "mongoose", "malayan tapir", "indian rhinoceros", "javan rhinoceros",
  "sumatran rhinoceros", "gaur", "banteng", "markhor", "ibex", "snow sheep", "saiga antelope",
  "kangaroo", "wallaby", "wallaroo", "quokka", "koala", "wombat", "tasmanian devil", "echidna",
  "platypus", "sugar glider", "flying fox", "fruit bat", "dingo", "quoll", "bilby",
  "bandicoot", "possum", "glider", "cuscus", "numbat", "bettong", "whale", "blue whale",
  "humpback whale", "sperm whale", "orca", "killer whale", "beluga whale", "narwhal",
  "gray whale", "minke whale", "right whale", "bowhead whale", "dolphin", "bottlenose dolphin",
  "spinner dolphin", "common dolphin", "porpoise", "manatee", "dugong", "seal", "harbor seal",
  "gray seal", "leopard seal", "elephant seal", "sea lion", "california sea lion",
  "steller sea lion", "fur seal", "walrus", "sea otter", "ram", "ewe", "camel", "ass", "colt",
  "wild ox", "wild goat", "boar", "swine", "hound", "hart", "hind", "roe", "fallow deer",
  "chamois", "wild sheep", "conies",
];

const BIRD: readonly string[] = [
  "canary", "parakeet", "budgie", "cockatiel", "parrot", "chicken", "rooster", "hen", "chick",
  "duck", "duckling", "goose", "gosling", "turkey", "eagle", "bald eagle", "golden eagle",
  "sea eagle", "harpy eagle", "hawk", "red-tailed hawk", "cooper's hawk", "sharp-shinned hawk",
  "goshawk", "buzzard", "falcon", "peregrine falcon", "kestrel", "merlin", "gyrfalcon",
  "osprey", "kite", "owl", "great horned owl", "barn owl", "screech owl", "snowy owl",
  "great gray owl", "barred owl", "spotted owl", "burrowing owl", "elf owl", "vulture",
  "turkey vulture", "black vulture", "condor", "california condor", "mallard", "wood duck",
  "teal", "pintail", "canvasback", "redhead", "ring-necked duck", "lesser scaup", "bufflehead",
  "goldeneye", "merganser", "canada goose", "snow goose", "white-fronted goose", "brant",
  "swan", "trumpeter swan", "tundra swan", "mute swan", "pelican", "brown pelican",
  "white pelican", "cormorant", "anhinga", "frigatebird", "gannet", "booby", "heron",
  "great blue heron", "great egret", "snowy egret", "green heron", "black-crowned night heron",
  "bittern", "ibis", "spoonbill", "stork", "crane", "sandhill crane", "whooping crane", "rail",
  "coot", "gallinule", "moorhen", "robin", "american robin", "bluebird", "cardinal",
  "blue jay", "crow", "raven", "magpie", "chickadee", "titmouse", "nuthatch", "creeper",
  "wren", "mockingbird", "thrasher", "catbird", "starling", "warbler", "yellow warbler",
  "blackbird", "red-winged blackbird", "grackle", "cowbird", "oriole", "tanager", "grosbeak",
  "bunting", "sparrow", "house sparrow", "song sparrow", "white-throated sparrow", "finch",
  "goldfinch", "house finch", "purple finch", "siskin", "crossbill", "redpoll", "junco",
  "towhee", "martin", "swallow", "swift", "hummingbird", "ruby-throated hummingbird",
  "flycatcher", "kingbird", "phoebe", "pewee", "vireo", "shrike", "kingfisher", "woodpecker",
  "pileated woodpecker", "downy woodpecker", "hairy woodpecker", "red-headed woodpecker",
  "flicker", "sapsucker", "dove", "mourning dove", "pigeon", "rock pigeon", "quail",
  "bobwhite", "partridge", "grouse", "ptarmigan", "pheasant", "wild turkey", "macaw",
  "cockatoo", "lovebird", "conure", "amazon parrot", "african gray", "budgerigar", "lorikeet",
  "toucan", "hornbill", "bird of paradise", "peacock", "peafowl", "guinea fowl", "flamingo",
  "penguin", "emperor penguin", "king penguin", "adelie penguin", "chinstrap penguin",
  "gentoo penguin", "macaroni penguin", "rockhopper penguin", "cassowary", "emu", "ostrich",
  "rhea", "kiwi", "secretary bird", "shoebill", "hoatzin", "fowl",
];

const REPTILE: readonly string[] = [
  "turtle", "tortoise", "iguana", "gecko", "snake", "sea turtle", "loggerhead turtle",
  "green turtle", "hawksbill turtle", "leatherback turtle", "python", "boa", "anaconda",
  "cobra", "mamba", "viper", "rattlesnake", "copperhead", "cottonmouth", "coral snake",
  "garter snake", "king snake", "milk snake", "bull snake", "rat snake", "lizard", "chameleon",
  "bearded dragon", "monitor lizard", "komodo dragon", "skink", "anole", "fence lizard",
  "horned lizard", "gila monster", "box turtle", "painted turtle", "slider", "snapping turtle",
  "soft-shell turtle", "crocodile", "alligator", "caiman", "gharial", "tuatara", "serpent",
  "asp", "adder",
];

const AMPHIBIAN: readonly string[] = [
  "frog", "tree frog", "poison dart frog", "bullfrog", "spring peeper", "chorus frog",
  "leopard frog", "wood frog", "toad", "american toad", "fowler's toad", "spadefoot toad",
  "salamander", "newt", "mudpuppy", "hellbender", "siren", "amphiuma", "caecilian",
];

const FISH: readonly string[] = [
  "goldfish", "tropical fish", "betta fish", "shark", "great white shark", "tiger shark",
  "bull shark", "hammerhead shark", "whale shark", "nurse shark", "mako shark",
  "thresher shark", "ray", "manta ray", "stingray", "electric ray", "skate", "sea horse",
  "sea dragon", "bass", "largemouth bass", "smallmouth bass", "striped bass", "trout",
  "rainbow trout", "brown trout", "brook trout", "cutthroat trout", "salmon", "chinook salmon",
  "coho salmon", "sockeye salmon", "pink salmon", "chum salmon", "atlantic salmon", "pike",
  "northern pike", "muskellunge", "pickerel", "walleye", "perch", "yellow perch",
  "white perch", "sunfish", "bluegill", "pumpkinseed", "crappie", "catfish", "channel catfish",
  "blue catfish", "flathead catfish", "bullhead", "carp", "sucker", "redhorse", "buffalo fish",
  "gar", "bowfin", "sturgeon", "paddlefish", "grayling", "whitefish", "cisco", "burbot", "eel",
  "lamprey", "darter", "minnow", "chub", "dace", "shiner", "tuna", "bluefin tuna",
  "yellowfin tuna", "albacore", "skipjack", "marlin", "blue marlin", "black marlin",
  "white marlin", "sailfish", "swordfish", "mahi-mahi", "wahoo", "king mackerel",
  "spanish mackerel", "mackerel", "bluefish", "sea bass", "grouper", "snapper", "red snapper",
  "yellowtail snapper", "mutton snapper", "mangrove snapper", "grunt", "porgy", "sea bream",
  "sheepshead", "drum", "red drum", "black drum", "croaker", "weakfish", "spotted seatrout",
  "flounder", "summer flounder", "winter flounder", "halibut", "sole", "turbot", "plaice",
  "dab", "cod", "haddock", "pollock", "whiting", "hake", "lingcod", "rockfish", "sculpin",
  "wolf eel", "monkfish", "john dory", "pompano", "permit", "jack", "amberjack",
  "crevalle jack", "lookdown", "moonfish", "triggerfish", "filefish", "pufferfish", "boxfish",
  "cowfish", "trunkfish", "surgeonfish", "tang", "angelfish", "butterflyfish", "parrotfish",
  "wrasse", "damselfish", "clownfish", "anemonefish", "goby", "blenny", "clinid", "gunnel",
  "prickleback", "ronquil", "greenling", "great fish", "fish",
];

const INSECT: readonly string[] = [
  "butterfly", "monarch butterfly", "swallowtail", "admiral", "fritillary", "skipper", "moth",
  "sphinx moth", "luna moth", "cecropia moth", "bee", "honeybee", "bumblebee", "carpenter bee",
  "leafcutter bee", "wasp", "yellow jacket", "hornet", "paper wasp", "ant", "fire ant",
  "carpenter ant", "leafcutter ant", "army ant", "termite", "beetle", "ladybug",
  "ground beetle", "dung beetle", "firefly", "weevil", "fly", "house fly", "fruit fly",
  "horse fly", "deer fly", "robber fly", "mosquito", "gnat", "midge", "dragonfly", "damselfly",
  "mayfly", "stonefly", "caddisfly", "lacewing", "antlion", "cricket", "grasshopper",
  "katydid", "cicada", "aphid", "scale insect", "thrips", "true bug", "stink bug",
  "assassin bug", "bed bug", "water strider", "backswimmer", "water boatman", "praying mantis",
  "stick insect", "walkingstick", "earwig", "silverfish", "spider", "black widow",
  "brown recluse", "wolf spider", "jumping spider", "orb weaver", "house spider", "tarantula",
  "scorpion", "tick", "mite", "harvestman", "daddy longlegs", "centipede", "millipede",
  "pillbug", "sowbug", "locust", "flea", "louse",
];

const CREATURE: readonly string[] = [
  "octopus", "giant octopus", "squid", "giant squid", "cuttlefish", "nautilus", "jellyfish",
  "starfish", "sea star", "sea urchin", "sea cucumber", "anemone", "coral", "sponge", "crab",
  "lobster", "shrimp", "krill", "barnacle", "worm", "snail", "leach", "horseleach",
];

const MYTHICAL: readonly string[] = [
  "dragon", "leviathan", "behemoth", "unicorn", "pegasus", "phoenix", "griffin", "hippogriff",
  "wyvern", "minotaur", "centaur", "pixie", "fairy", "brownie", "gnome", "dwarf", "elf",
  "troll", "ogre", "giant", "cyclops", "mermaid", "roc", "thunderbird",
];

const MACHINE: readonly string[] = [
  "robot", "android", "automaton", "clockwork toy", "toy robot",
];

/**
 * The words a child actually reaches for, which a taxonomy does not contain.
 *
 * shared/animalData.ts was written for an autocomplete, so it is thorough about
 * species and silent about everyday nouns: it has "proboscis monkey" but no
 * "monkey", "hippopotamus" but no "hippo", and no dinosaurs whatsoever. A
 * catalogue a seven-year-old browses needs the common word more than it needs
 * the Linnaean one.
 *
 * Kept separate from the generated lists so the provenance stays visible: above
 * is tagged animalData, below is hand-added.
 */
const EVERYDAY_MAMMAL = [
  "monkey", "puppy", "kitten", "bunny", "foal", "cub", "hippo", "rhino",
  "sloth", "hedgehog", "mole", "bat",
];
const EVERYDAY_REPTILE = [
  "dinosaur", "tyrannosaurus", "triceratops", "stegosaurus", "velociraptor",
  "brachiosaurus", "pterodactyl",
];
const EVERYDAY_INSECT = ["caterpillar"];

export const KINDS_BY_CATEGORY: Record<CharacterCategory, readonly string[]> = {
  human: HUMAN,
  mammal: [...MAMMAL, ...EVERYDAY_MAMMAL],
  bird: BIRD,
  reptile: [...REPTILE, ...EVERYDAY_REPTILE],
  amphibian: AMPHIBIAN,
  fish: FISH,
  insect: [...INSECT, ...EVERYDAY_INSECT],
  creature: CREATURE,
  mythical: MYTHICAL,
  machine: MACHINE,
};

/** kind -> category, built once. Later duplicates lose to earlier ones. */
const CATEGORY_OF = new Map<string, CharacterCategory>();
for (const [cat, kinds] of Object.entries(KINDS_BY_CATEGORY) as [CharacterCategory, readonly string[]][]) {
  for (const k of kinds) if (!CATEGORY_OF.has(k)) CATEGORY_OF.set(k, cat);
}

/**
 * The noun for whatever covers them: hair, fur, feathers, scales.
 *
 * The stored field is still `hair` whatever the answer here. Renaming it would
 * break every row written before this existed and would move the colour
 * sentence off "Mia has brown hair", which the golden fixture asserts.
 */
const COVERING_BY_CATEGORY: Record<CharacterCategory, string> = {
  human: "hair",
  mammal: "fur",
  bird: "feathers",
  reptile: "scales",
  amphibian: "skin",
  fish: "scales",
  insect: "shell",
  creature: "skin",
  mythical: "scales",
  machine: "plating",
};

/**
 * Where the category default is simply wrong.
 *
 * "mythical" is the only heterogeneous category -- a dragon has scales, a
 * unicorn does not -- so it is the only one with entries here. A per-kind map
 * beats splitting mythical into three categories that would each need their own
 * colour lists.
 */
const COVERING_BY_KIND: Record<string, string> = {
  unicorn: "coat", pegasus: "coat", centaur: "hair", minotaur: "fur",
  phoenix: "feathers", griffin: "feathers", hippogriff: "feathers",
  roc: "feathers", thunderbird: "feathers", mermaid: "hair",
  elf: "hair", dwarf: "hair", gnome: "hair", fairy: "hair", pixie: "hair",
  brownie: "hair", troll: "hair", ogre: "hair", giant: "hair",
};

/** Colour words for whatever covers them, per category. */
const COVERING_COLOURS: Record<CharacterCategory, readonly string[]> = {
  human: ["brown", "black", "blonde", "red", "auburn", "ginger", "white", "grey", "silver"],
  mammal: ["brown", "black", "white", "grey", "golden", "cream", "ginger", "chestnut", "spotted", "striped", "patched"],
  bird: ["brown", "black", "white", "grey", "blue", "green", "red", "yellow", "orange", "speckled", "iridescent"],
  reptile: ["green", "brown", "olive", "grey", "black", "yellow", "orange", "banded", "patterned"],
  amphibian: ["green", "brown", "yellow", "blue", "orange", "spotted", "mottled"],
  fish: ["silver", "gold", "blue", "green", "orange", "red", "striped", "speckled", "rainbow"],
  insect: ["black", "brown", "red", "green", "yellow", "blue", "iridescent", "spotted", "striped"],
  creature: ["pink", "grey", "orange", "purple", "red", "translucent", "speckled"],
  mythical: ["gold", "silver", "emerald", "crimson", "sapphire", "amethyst", "pearl", "bronze", "obsidian", "snow-white"],
  machine: ["steel", "silver", "copper", "brass", "white", "black", "red", "blue", "yellow", "rusted"],
};

/** Eye colours. Living things share a palette; made things get their own. */
const NATURAL_EYES = ["brown", "blue", "green", "hazel", "grey", "amber", "black", "gold"] as const;
const EYE_COLOURS: Record<CharacterCategory, readonly string[]> = {
  human: NATURAL_EYES, mammal: NATURAL_EYES, bird: NATURAL_EYES,
  reptile: NATURAL_EYES, amphibian: NATURAL_EYES, fish: NATURAL_EYES,
  insect: NATURAL_EYES, creature: NATURAL_EYES,
  mythical: ["gold", "silver", "emerald", "amber", "violet", "crimson", "starlight", "black"],
  machine: ["blue", "green", "red", "amber", "white", "violet"],
};

/** Shared across every category. A dragon may still like the colour pink. */
const FAVOURITE_COLOURS = [
  "red", "orange", "yellow", "green", "blue", "purple", "pink", "teal",
  "gold", "silver", "black", "white", "brown", "turquoise", "rainbow",
] as const;

const HOBBIES = [
  "reading", "drawing", "painting", "singing", "dancing", "music", "sport",
  "football", "swimming", "climbing", "running", "cooking", "baking",
  "gardening", "hiking", "camping", "fishing", "building", "inventing",
  "puzzles", "chess", "collecting", "writing", "photography", "astronomy",
  "birdwatching", "sewing", "woodwork", "juggling", "storytelling",
  // Phrasings a child reaches for, which the one-word list above did not
  // cover. scripts/dev-seed.ts had all three and was silently refused by the
  // strict route, which is how they were noticed.
  "building things", "climbing trees", "collecting rocks", "looking after animals",
  "making up songs", "exploring", "helping in the kitchen",
] as const;

const PERSONALITY = [
  "brave", "kind", "curious", "shy", "cheerful", "patient", "creative",
  "thoughtful", "joyful", "determined", "gentle", "adventurous", "loyal",
  "honest", "generous", "funny", "clever", "careful", "bold", "quiet",
  "stubborn", "forgiving", "hopeful", "humble", "protective",
] as const;

export type VocabField = "hair" | "eyes" | "favoriteColor" | "hobby" | "personality";

/** Every kind, flat, for search. */
const ALL_KINDS: readonly string[] = Object.values(KINDS_BY_CATEGORY).flat();

/** The category a kind belongs to, or undefined for a parent-authored one. */
export function categoryOf(kind?: string | null): CharacterCategory | undefined {
  if (!kind) return undefined;
  return CATEGORY_OF.get(kind.trim().toLowerCase());
}

/**
 * Whether a kind came from this catalogue.
 *
 * The strict write path refuses anything else. A parent may write whatever they
 * like through the custom route, so a stored kind that fails this is normal and
 * must never be treated as corrupt.
 */
export function isKnownKind(kind?: string | null): boolean {
  return categoryOf(kind) !== undefined;
}

/**
 * The noun for their covering. Defaults to "hair" so a row written before
 * categories existed renders exactly as it always has.
 */
export function coveringNoun(category?: CharacterCategory | null, kind?: string | null): string {
  const byKind = kind ? COVERING_BY_KIND[kind.trim().toLowerCase()] : undefined;
  if (byKind) return byKind;
  return category ? COVERING_BY_CATEGORY[category] : "hair";
}

/** The permitted values for one field, given what the character is. */
export function optionsFor(field: VocabField, category?: CharacterCategory | null): readonly string[] {
  const cat = category ?? "human";
  switch (field) {
    case "hair": return COVERING_COLOURS[cat];
    case "eyes": return EYE_COLOURS[cat];
    case "favoriteColor": return FAVOURITE_COLOURS;
    case "hobby": return HOBBIES;
    case "personality": return PERSONALITY;
  }
}

/** Every kind in one category, for browsing. */
export function kindsIn(category: CharacterCategory): readonly string[] {
  return KINDS_BY_CATEGORY[category];
}

/**
 * A short, hand-picked opening list per category.
 *
 * Browsing 228 mammals to find "dog" is worse than a text box, which is the
 * thing this catalogue exists to replace. These are what the form shows first;
 * searchKinds() reaches the other seven hundred.
 */
const POPULAR: Record<CharacterCategory, readonly string[]> = {
  human: ["boy", "girl", "man", "woman", "grandmother", "grandfather", "baby"],
  mammal: ["dog", "cat", "horse", "rabbit", "lion", "elephant", "bear", "fox", "wolf", "mouse", "monkey", "sheep"],
  bird: ["owl", "eagle", "robin", "dove", "penguin", "parrot", "duck", "chicken", "peacock", "swan"],
  reptile: ["dinosaur", "turtle", "tortoise", "snake", "gecko", "chameleon", "crocodile", "lizard"],
  amphibian: ["frog", "tree frog", "toad", "salamander", "newt"],
  fish: ["goldfish", "salmon", "trout", "clownfish", "shark", "angelfish", "sea horse"],
  insect: ["butterfly", "bee", "ladybug", "ant", "grasshopper", "dragonfly", "spider", "cricket"],
  creature: ["octopus", "crab", "starfish", "jellyfish", "snail", "lobster"],
  mythical: ["dragon", "unicorn", "griffin", "phoenix", "pegasus", "mermaid", "giant", "elf"],
  machine: ["robot", "android", "clockwork toy", "toy robot", "automaton"],
};

export function popularKinds(category: CharacterCategory): readonly string[] {
  return POPULAR[category];
}

/**
 * Type-ahead over every kind. Exact, then prefix, then substring -- the same
 * ordering searchAnimals() uses in shared/animalData.ts, so the two feel alike.
 */
export function searchKinds(query: string, limit = 20): string[] {
  const q = query?.toLowerCase().trim();
  if (!q) return [];
  const exact: string[] = [], prefix: string[] = [], contains: string[] = [];
  for (const k of ALL_KINDS) {
    if (k === q) exact.push(k);
    else if (k.startsWith(q)) prefix.push(k);
    else if (k.includes(q)) contains.push(k);
  }
  // Shortest first within a tier: "drag" should offer the dragon before the
  // dragonfly, and category order alone puts insects ahead of mythical.
  const byLength = (a: string, b: string) => a.length - b.length;
  prefix.sort(byLength);
  contains.sort(byLength);
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

/** The fields a child picks from a list rather than types. */
export const CONTROLLED_FIELDS: readonly VocabField[] = [
  "hair", "eyes", "favoriteColor", "hobby", "personality",
];

/** Every animal the favourite-animal box may hold, as a set. */
const ANIMALS = new Set(animalDatabase);

/**
 * What is wrong with a character write, from the catalogue's point of view.
 *
 * Takes the EFFECTIVE category rather than reading one off the patch: an edit
 * that changes only the eye colour does not resend what the character is, and
 * validating "amber" against the human list when the character is a robot would
 * reject a value the form legitimately offered.
 *
 * Only fields PRESENT in the patch are checked. A character a parent has
 * customised carries values that are deliberately off-list, and an ordinary
 * edit to some other field must not trip over them.
 */
export function vocabularyErrors(
  patch: Partial<Record<VocabField | "kind" | "favoriteAnimal" | "sex", unknown>>,
  category?: CharacterCategory | null,
): string[] {
  const errors: string[] = [];

  if (patch.kind !== undefined && !isKnownKind(String(patch.kind))) {
    errors.push(`"${String(patch.kind)}" is not one of the characters to choose from.`);
  }

  for (const field of CONTROLLED_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    const allowed = optionsFor(field, category);
    if (!allowed.includes(String(value))) {
      errors.push(`"${String(value)}" is not one of the choices for ${field}.`);
    }
  }

  if (patch.favoriteAnimal !== undefined && !ANIMALS.has(String(patch.favoriteAnimal))) {
    errors.push(`"${String(patch.favoriteAnimal)}" is not one of the animals to choose from.`);
  }

  // A living thing is a he or a she. Only a made thing is an it.
  if (patch.sex === "it" && category !== "machine") {
    errors.push("Only a machine can be an it.");
  }

  return errors;
}

/**
 * Names for the Random button.
 *
 * It used to offer fifteen boy names and fifteen girl names, all biblical, and
 * only appeared for a boy or a girl -- so the button was both repetitive and
 * absent from most of the catalogue. A dragon is not called Noah.
 *
 * Three pools rather than one: a person's name suits a person, and "Ember" or
 * "Cog" would read oddly on a child. Categories that are neither map to the
 * creature pool, which is deliberately the widest.
 */
const HUMAN_NAMES = [
  // Scripture
  "Noah", "Elijah", "Daniel", "Matthew", "David", "Joseph", "Benjamin", "Samuel",
  "John", "Isaac", "Jacob", "Joshua", "Luke", "Caleb", "Micah", "Silas", "Levi",
  "Asa", "Ezra", "Gideon", "Jonah", "Nathan", "Simon", "Titus", "Amos", "Boaz",
  "Eli", "Enoch", "Job", "Reuben", "Seth", "Solomon", "Stephen", "Timothy", "Tobias",
  "Sarah", "Hannah", "Ruth", "Esther", "Mary", "Naomi", "Rachel", "Deborah",
  "Elizabeth", "Anna", "Leah", "Abigail", "Rebecca", "Miriam", "Priscilla",
  "Tabitha", "Lydia", "Phoebe", "Damaris", "Eunice", "Keziah", "Salome", "Susanna",
  // Classic
  "Arthur", "Edmund", "Edward", "Felix", "George", "Henry", "Hugh", "Oliver",
  "Oscar", "Peter", "Philip", "Rupert", "Theodore", "Thomas", "Walter", "William",
  "Alice", "Beatrice", "Charlotte", "Clara", "Constance", "Eleanor", "Emily",
  "Florence", "Harriet", "Josephine", "Louisa", "Margaret", "Martha", "Rose",
  "Susannah", "Violet", "Winifred", "Agnes", "Cecily", "Dorothy", "Edith",
  // Modern
  "Aidan", "Archie", "Beau", "Cody", "Dexter", "Elliot", "Ethan", "Finn", "Gus",
  "Harvey", "Jasper", "Kai", "Leo", "Louie", "Max", "Milo", "Nico",
  "Otis", "Rory", "Sonny", "Toby", "Wesley", "Zach", "Arlo", "Bodhi",
  "Ada", "Amelia", "Aria", "Astrid", "Bonnie", "Daisy", "Eden", "Elsie",
  "Esme", "Freya", "Hazel", "Imogen", "Iris", "Ivy", "Juniper", "Lark", "Maeve",
  "Marlow", "Nell", "Nova", "Olive", "Opal", "Pearl", "Poppy", "Quinn", "Sadie",
  "Sage", "Tessa", "Thea", "Willa", "Wren", "Zara",
];

const CREATURE_NAMES = [
  // Fire, sky and stone -- suits dragons, griffins, big animals
  "Ember", "Cinder", "Ash", "Blaze", "Flint", "Basalt", "Boulder", "Granite",
  "Storm", "Thunder", "Gale", "Zephyr", "Cirrus", "Comet", "Nimbus", "Aurora",
  "Frost", "Glacier", "Snowdrop", "Icicle", "Midnight", "Dusk", "Twilight",
  "Shadow", "Echo", "Whisper", "Rumble", "Bramble", "Thistle", "Nettle",
  // Small and warm -- suits pets, birds, bugs
  "Pip", "Pippin", "Nibbles", "Scamp", "Scruffy", "Biscuit", "Muffin", "Pickle",
  "Peanut", "Pumpkin", "Marmalade", "Ginger", "Nutmeg", "Cinnamon", "Clover",
  "Buttercup", "Daisy", "Willow", "Hazel", "Juniper", "Fern", "Moss", "Acorn",
  "Chestnut", "Pebble", "Puddle", "Bubbles", "Doodle", "Waffles", "Noodle",
  // Bold and old -- suits horses, lions, mythical beasts
  "Valiant", "Bravery", "Banner", "Beacon", "Lantern", "Compass", "Anchor",
  "Rudder", "Mariner", "Wanderer", "Pilgrim", "Journey", "Quest", "Herald",
  "Sable", "Onyx", "Amber", "Jade", "Coral", "Ivory", "Copper", "Sterling",
  "Duke", "Baron", "Captain", "Marigold", "Saffron", "Indigo", "Cobalt", "Rusty",
];

const MACHINE_NAMES = [
  "Bolt", "Cog", "Sprocket", "Gizmo", "Widget", "Gadget", "Rivet", "Piston",
  "Circuit", "Pixel", "Byte", "Bit", "Chip", "Watt", "Volt", "Ampere", "Dynamo",
  "Turbine", "Spanner", "Ratchet", "Lever", "Pulley", "Clank", "Whirr", "Ticker",
  "Springs", "Gears", "Buttons", "Dial", "Beacon", "Lumen", "Tally", "Abacus",
  "Domino", "Marbles", "Wheels", "Tinker", "Patch", "Scrap", "Nuts",
];

/**
 * The pools themselves, for the test that asserts they hold no duplicates.
 *
 * A duplicate cannot be found by drawing: it does not change what CAN come
 * out, only how often, so it makes one name quietly twice as likely as its
 * neighbours. The only way to catch it is to look at the array, so the array
 * has to be reachable.
 */
export const NAME_POOLS = {
  human: HUMAN_NAMES,
  creature: CREATURE_NAMES,
  machine: MACHINE_NAMES,
} as const;

/**
 * A name that suits what they are.
 *
 * `avoid` is the name already in the box, so pressing the button twice cannot
 * hand back what it just gave -- which is what makes a random button feel
 * broken on a list this size.
 */
export function randomName(category?: CharacterCategory | null, avoid?: string): string {
  const pool =
    category === "human" || category === undefined || category === null
      ? HUMAN_NAMES
      : category === "machine"
        ? MACHINE_NAMES
        : CREATURE_NAMES;
  const choices = avoid ? pool.filter((n) => n !== avoid) : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}
