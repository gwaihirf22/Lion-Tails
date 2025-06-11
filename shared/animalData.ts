// Comprehensive animal database for autocomplete search
export const animalDatabase = [
  // Domestic Animals
  "dog", "cat", "rabbit", "hamster", "guinea pig", "gerbil", "chinchilla", "ferret", 
  "rat", "mouse", "canary", "parakeet", "budgie", "cockatiel", "parrot", "goldfish", 
  "tropical fish", "betta fish", "turtle", "tortoise", "iguana", "gecko", "snake",
  
  // Farm Animals
  "horse", "pony", "cow", "bull", "calf", "pig", "piglet", "sheep", "lamb", "goat", 
  "kid", "chicken", "rooster", "hen", "chick", "duck", "duckling", "goose", "gosling", 
  "turkey", "donkey", "mule", "llama", "alpaca", "yak", "water buffalo", "ox", "oxen",
  
  // Wild Animals - African
  "lion", "lioness", "elephant", "baby elephant", "giraffe", "zebra", "rhinoceros", 
  "hippopotamus", "cheetah", "leopard", "jaguar", "hyena", "meerkat", "warthog", 
  "baboon", "mandrill", "chimpanzee", "gorilla", "orangutan", "wildebeest", "gazelle", 
  "antelope", "impala", "springbok", "kudu", "eland", "oryx", "dik-dik", "aardvark", 
  "pangolin", "caracal", "serval", "wild dog", "jackal", "fennec fox",
  
  // Wild Animals - North American
  "bear", "black bear", "grizzly bear", "polar bear", "wolf", "coyote", "fox", 
  "red fox", "arctic fox", "deer", "white-tailed deer", "mule deer", "elk", "moose", 
  "caribou", "reindeer", "bison", "buffalo", "mountain goat", "bighorn sheep", 
  "pronghorn", "raccoon", "opossum", "skunk", "porcupine", "beaver", "otter", 
  "mink", "weasel", "stoat", "ermine", "marten", "fisher", "wolverine", "badger", 
  "groundhog", "woodchuck", "prairie dog", "chipmunk", "squirrel", "flying squirrel",
  
  // Wild Animals - South American
  "jaguar", "puma", "mountain lion", "cougar", "ocelot", "margay", "jaguarundi", 
  "llama", "alpaca", "vicuna", "guanaco", "tapir", "capybara", "chinchilla", 
  "viscacha", "agouti", "paca", "coati", "kinkajou", "olingo", "tayra", "grison", 
  "giant anteater", "tamandua", "silky anteater", "three-toed sloth", "two-toed sloth", 
  "armadillo", "giant armadillo", "pink fairy armadillo",
  
  // Wild Animals - Asian
  "tiger", "snow leopard", "clouded leopard", "asian elephant", "panda", "giant panda", 
  "red panda", "sun bear", "asiatic black bear", "sloth bear", "orangutan", 
  "proboscis monkey", "macaque", "langur", "gibbon", "siamang", "tarsier", "loris", 
  "binturong", "civet", "mongoose", "pangolin", "malayan tapir", "rhinoceros", 
  "indian rhinoceros", "javan rhinoceros", "sumatran rhinoceros", "gaur", "banteng", 
  "water buffalo", "yak", "markhor", "ibex", "snow sheep", "saiga antelope",
  
  // Wild Animals - Australian
  "kangaroo", "wallaby", "wallaroo", "quokka", "koala", "wombat", "tasmanian devil", 
  "echidna", "platypus", "sugar glider", "flying fox", "fruit bat", "dingo", 
  "quoll", "bilby", "bandicoot", "possum", "glider", "cuscus", "numbat", "bettong",
  
  // Marine Animals
  "whale", "blue whale", "humpback whale", "sperm whale", "orca", "killer whale", 
  "beluga whale", "narwhal", "gray whale", "minke whale", "right whale", "bowhead whale", 
  "dolphin", "bottlenose dolphin", "spinner dolphin", "common dolphin", "porpoise", 
  "manatee", "dugong", "seal", "harbor seal", "gray seal", "leopard seal", 
  "elephant seal", "sea lion", "california sea lion", "steller sea lion", "fur seal", 
  "walrus", "sea otter", "shark", "great white shark", "tiger shark", "bull shark", 
  "hammerhead shark", "whale shark", "nurse shark", "mako shark", "thresher shark", 
  "ray", "manta ray", "stingray", "electric ray", "skate", "octopus", "giant octopus", 
  "squid", "giant squid", "cuttlefish", "nautilus", "jellyfish", "sea turtle", 
  "loggerhead turtle", "green turtle", "hawksbill turtle", "leatherback turtle", 
  "sea horse", "sea dragon", "starfish", "sea star", "sea urchin", "sea cucumber", 
  "anemone", "coral", "sponge", "crab", "lobster", "shrimp", "krill", "barnacle",
  
  // Birds - Raptors
  "eagle", "bald eagle", "golden eagle", "sea eagle", "harpy eagle", "hawk", 
  "red-tailed hawk", "cooper's hawk", "sharp-shinned hawk", "goshawk", "buzzard", 
  "falcon", "peregrine falcon", "kestrel", "merlin", "gyrfalcon", "osprey", 
  "kite", "owl", "great horned owl", "barn owl", "screech owl", "snowy owl", 
  "great gray owl", "barred owl", "spotted owl", "burrowing owl", "elf owl", 
  "vulture", "turkey vulture", "black vulture", "condor", "california condor",
  
  // Birds - Water Birds
  "duck", "mallard", "wood duck", "teal", "pintail", "canvasback", "redhead", 
  "ring-necked duck", "lesser scaup", "bufflehead", "goldeneye", "merganser", 
  "goose", "canada goose", "snow goose", "white-fronted goose", "brant", "swan", 
  "trumpeter swan", "tundra swan", "mute swan", "pelican", "brown pelican", 
  "white pelican", "cormorant", "anhinga", "frigatebird", "gannet", "booby", 
  "heron", "great blue heron", "great egret", "snowy egret", "green heron", 
  "black-crowned night heron", "bittern", "ibis", "spoonbill", "stork", "crane", 
  "sandhill crane", "whooping crane", "rail", "coot", "gallinule", "moorhen",
  
  // Birds - Songbirds
  "robin", "american robin", "bluebird", "cardinal", "blue jay", "crow", "raven", 
  "magpie", "chickadee", "titmouse", "nuthatch", "creeper", "wren", "mockingbird", 
  "thrasher", "catbird", "starling", "warbler", "yellow warbler", "blackbird", 
  "red-winged blackbird", "grackle", "cowbird", "oriole", "tanager", "grosbeak", 
  "bunting", "sparrow", "house sparrow", "song sparrow", "white-throated sparrow", 
  "finch", "goldfinch", "house finch", "purple finch", "siskin", "canary", 
  "crossbill", "redpoll", "junco", "towhee", "martin", "swallow", "swift", 
  "hummingbird", "ruby-throated hummingbird", "flycatcher", "kingbird", "phoebe", 
  "pewee", "vireo", "shrike", "kingfisher", "woodpecker", "pileated woodpecker", 
  "downy woodpecker", "hairy woodpecker", "red-headed woodpecker", "flicker", 
  "sapsucker", "dove", "mourning dove", "pigeon", "rock pigeon", "quail", 
  "bobwhite", "partridge", "grouse", "ptarmigan", "pheasant", "turkey", "wild turkey",
  
  // Birds - Tropical/Exotic
  "parrot", "macaw", "cockatoo", "parakeet", "lovebird", "conure", "amazon parrot", 
  "african gray", "cockatiel", "budgerigar", "lorikeet", "toucan", "hornbill", 
  "bird of paradise", "peacock", "peafowl", "guinea fowl", "flamingo", "penguin", 
  "emperor penguin", "king penguin", "adelie penguin", "chinstrap penguin", 
  "gentoo penguin", "macaroni penguin", "rockhopper penguin", "cassowary", "emu", 
  "ostrich", "rhea", "kiwi", "secretary bird", "shoebill", "hoatzin",
  
  // Reptiles
  "snake", "python", "boa", "anaconda", "cobra", "mamba", "viper", "rattlesnake", 
  "copperhead", "cottonmouth", "coral snake", "garter snake", "king snake", 
  "milk snake", "bull snake", "rat snake", "lizard", "iguana", "gecko", 
  "chameleon", "bearded dragon", "monitor lizard", "komodo dragon", "skink", 
  "anole", "fence lizard", "horned lizard", "gila monster", "turtle", "tortoise", 
  "box turtle", "painted turtle", "slider", "snapping turtle", "soft-shell turtle", 
  "crocodile", "alligator", "caiman", "gharial", "tuatara",
  
  // Amphibians
  "frog", "tree frog", "poison dart frog", "bullfrog", "spring peeper", "chorus frog", 
  "leopard frog", "wood frog", "toad", "american toad", "fowler's toad", "spadefoot toad", 
  "salamander", "newt", "mudpuppy", "hellbender", "siren", "amphiuma", "caecilian",
  
  // Insects and Arachnids
  "butterfly", "monarch butterfly", "swallowtail", "admiral", "fritillary", 
  "skipper", "moth", "sphinx moth", "luna moth", "cecropia moth", "bee", "honeybee", 
  "bumblebee", "carpenter bee", "leafcutter bee", "wasp", "yellow jacket", 
  "hornet", "paper wasp", "ant", "fire ant", "carpenter ant", "leafcutter ant", 
  "army ant", "termite", "beetle", "ladybug", "ground beetle", "dung beetle", 
  "firefly", "weevil", "fly", "house fly", "fruit fly", "horse fly", "deer fly", 
  "robber fly", "mosquito", "gnat", "midge", "dragonfly", "damselfly", "mayfly", 
  "stonefly", "caddisfly", "lacewing", "antlion", "cricket", "grasshopper", 
  "katydid", "cicada", "aphid", "scale insect", "thrips", "true bug", "stink bug", 
  "assassin bug", "bed bug", "water strider", "backswimmer", "water boatman", 
  "praying mantis", "stick insect", "walkingstick", "earwig", "silverfish", 
  "spider", "black widow", "brown recluse", "wolf spider", "jumping spider", 
  "orb weaver", "house spider", "tarantula", "scorpion", "tick", "mite", 
  "harvestman", "daddy longlegs", "centipede", "millipede", "pillbug", "sowbug",
  
  // Fish - Freshwater
  "bass", "largemouth bass", "smallmouth bass", "striped bass", "trout", "rainbow trout", 
  "brown trout", "brook trout", "cutthroat trout", "salmon", "chinook salmon", 
  "coho salmon", "sockeye salmon", "pink salmon", "chum salmon", "atlantic salmon", 
  "pike", "northern pike", "muskellunge", "pickerel", "walleye", "perch", 
  "yellow perch", "white perch", "sunfish", "bluegill", "pumpkinseed", "crappie", 
  "catfish", "channel catfish", "blue catfish", "flathead catfish", "bullhead", 
  "carp", "goldfish", "sucker", "redhorse", "buffalo fish", "gar", "bowfin", 
  "sturgeon", "paddlefish", "grayling", "whitefish", "cisco", "burbot", "eel", 
  "lamprey", "darter", "minnow", "chub", "dace", "shiner",
  
  // Fish - Saltwater
  "tuna", "bluefin tuna", "yellowfin tuna", "albacore", "skipjack", "marlin", 
  "blue marlin", "black marlin", "white marlin", "sailfish", "swordfish", 
  "mahi-mahi", "wahoo", "king mackerel", "spanish mackerel", "mackerel", 
  "bluefish", "striped bass", "sea bass", "grouper", "snapper", "red snapper", 
  "yellowtail snapper", "mutton snapper", "mangrove snapper", "grunt", "porgy", 
  "sea bream", "sheepshead", "drum", "red drum", "black drum", "croaker", 
  "weakfish", "spotted seatrout", "flounder", "summer flounder", "winter flounder", 
  "halibut", "sole", "turbot", "plaice", "dab", "cod", "haddock", "pollock", 
  "whiting", "hake", "lingcod", "rockfish", "sculpin", "wolf eel", "monkfish", 
  "john dory", "pompano", "permit", "jack", "amberjack", "crevalle jack", 
  "lookdown", "moonfish", "triggerfish", "filefish", "pufferfish", "boxfish", 
  "cowfish", "trunkfish", "surgeonfish", "tang", "angelfish", "butterflyfish", 
  "parrotfish", "wrasse", "damselfish", "clownfish", "anemonefish", "goby", 
  "blenny", "clinid", "gunnel", "prickleback", "ronquil", "greenling",
  
  // Biblical Animals
  "lamb", "sheep", "dove", "raven", "sparrow", "eagle", "vulture", "hawk", 
  "owl", "crane", "stork", "heron", "quail", "partridge", "peacock", "rooster", 
  "hen", "ox", "bull", "cow", "calf", "goat", "kid", "ram", "ewe", "camel", 
  "donkey", "ass", "colt", "horse", "mule", "lion", "bear", "wolf", "fox", 
  "jackal", "hyena", "leopard", "deer", "gazelle", "antelope", "wild ox", 
  "wild goat", "boar", "pig", "swine", "dog", "hound", "serpent", "viper", 
  "asp", "cobra", "adder", "python", "dragon", "leviathan", "behemoth", 
  "unicorn", "hart", "hind", "roe", "fallow deer", "chamois", "wild sheep", 
  "locust", "grasshopper", "cricket", "moth", "worm", "spider", "ant", 
  "bee", "wasp", "hornet", "fly", "gnat", "flea", "louse", "scorpion", 
  "lizard", "gecko", "chameleon", "snail", "conies", "badger", "whale", 
  "great fish", "leach", "horseleach", "frog", "fish", "fowl", "clean beast", 
  "unclean beast", "creeping thing", "beast of the field", "beast of the earth",
  
  // Mythological/Fantasy (for creative stories)
  "dragon", "unicorn", "pegasus", "phoenix", "griffin", "hippogriff", "sphinx", 
  "chimera", "hydra", "basilisk", "cockatrice", "wyvern", "manticore", "minotaur", 
  "centaur", "faun", "satyr", "nymph", "pixie", "fairy", "brownie", "gnome", 
  "dwarf", "elf", "troll", "ogre", "giant", "cyclops", "banshee", "kelpie", 
  "selkie", "mermaid", "siren", "kraken", "roc", "thunderbird", "wendigo"
];

// Function to search animals with fuzzy matching
export function searchAnimals(query: string, limit: number = 20): string[] {
  if (!query || query.length < 1) return [];
  
  const normalizedQuery = query.toLowerCase().trim();
  
  // Remove duplicates from database first
  const uniqueAnimals = [...new Set(animalDatabase)];
  
  // Exact matches first
  const exactMatches = uniqueAnimals.filter(animal => 
    animal.toLowerCase() === normalizedQuery
  );
  
  // Starts with matches
  const startsWithMatches = uniqueAnimals.filter(animal => 
    animal.toLowerCase().startsWith(normalizedQuery) && 
    !exactMatches.includes(animal)
  );
  
  // Contains matches
  const containsMatches = uniqueAnimals.filter(animal => 
    animal.toLowerCase().includes(normalizedQuery) && 
    !exactMatches.includes(animal) && 
    !startsWithMatches.includes(animal)
  );
  
  // Combine results and limit
  const results = [...exactMatches, ...startsWithMatches, ...containsMatches];
  return results.slice(0, limit);
}

// Function to check if a string is likely an animal name
export function isLikelyAnimal(input: string): boolean {
  if (!input || input.length < 2) return false;
  
  const normalizedInput = input.toLowerCase().trim();
  
  // Check if it's in our database
  if (animalDatabase.some(animal => animal.toLowerCase() === normalizedInput)) {
    return true;
  }
  
  // Check if it contains common animal-related words
  const animalWords = [
    'bird', 'fish', 'cat', 'dog', 'bear', 'deer', 'fox', 'wolf', 'snake', 
    'lizard', 'frog', 'butterfly', 'bee', 'ant', 'spider', 'whale', 'shark', 
    'turtle', 'eagle', 'hawk', 'owl', 'duck', 'goose', 'chicken', 'horse', 
    'cow', 'pig', 'sheep', 'goat', 'rabbit', 'mouse', 'rat', 'squirrel'
  ];
  
  return animalWords.some(word => normalizedInput.includes(word));
}

// Get random animals for suggestions
export function getRandomAnimals(count: number = 10): string[] {
  const shuffled = [...animalDatabase].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Get popular/common animals for initial suggestions
export function getPopularAnimals(): string[] {
  return [
    "dog", "cat", "horse", "rabbit", "fish", "bird", "turtle", "hamster",
    "lion", "elephant", "giraffe", "tiger", "bear", "wolf", "fox", "deer",
    "dolphin", "whale", "shark", "eagle", "owl", "butterfly", "bee",
    "lamb", "dove", "camel", "ox"
  ];
}