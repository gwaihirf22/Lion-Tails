/**
 * A password the server invents, because there is nobody to email one to.
 *
 * An admin creating an account cannot be asked for a password: whatever they
 * type is a password they chose for somebody else, it travels through a chat
 * message, and it is almost always short. So the server mints one, shows it
 * once, and never accepts one from the request at all -- which is the point.
 * There is no "weak password an admin set" path because there is no path.
 *
 * FOUR WORDS, not base32. The passphrase is going to be read aloud or typed
 * from a phone, and "harbour-lantern-copper-seven" survives that where
 * "k7Rm9qXz" does not. Four words from this list plus two digits is about 54
 * bits, which is far beyond anything that matters against a login form with a
 * rate limit in front of it.
 *
 * PURE, and it takes its randomness rather than reaching for it: the server
 * hands it crypto.randomBytes, and the tests hand it a counter. A module that
 * called Math.random() itself is exactly the bug this repo already had once,
 * where password-reset tokens were minted from a non-cryptographic generator.
 */

/**
 * Short, common, unambiguous words. No homophones (their/there), nothing that
 * reads oddly beside a child's account, and nothing that a hurried reader
 * would mis-hear over the phone.
 */
export const PASSPHRASE_WORDS = [
  "amber", "anchor", "apple", "arrow", "autumn", "badger", "basket", "beacon",
  "bramble", "bridge", "bucket", "candle", "canvas", "cedar", "chimney", "cider",
  "clover", "compass", "copper", "cottage", "crayon", "dagger", "daisy", "donkey",
  "dragon", "eagle", "ember", "falcon", "feather", "fiddle", "forest", "garden",
  "granite", "harbour", "harvest", "hazel", "hollow", "honey", "island", "ivory",
  "jacket", "kettle", "lantern", "ledger", "lemon", "lighthouse", "linen", "marble",
  "meadow", "mitten", "monkey", "mountain", "nutmeg", "orchard", "otter", "parcel",
  "pebble", "pepper", "pewter", "pillow", "pocket", "puffin", "quarry", "rabbit",
  "raven", "ribbon", "river", "saddle", "sailor", "satchel", "shadow", "shepherd",
  "silver", "sparrow", "spindle", "stable", "sturgeon", "sunrise", "thimble", "thistle",
  "thunder", "timber", "tinder", "trumpet", "tunnel", "turnip", "velvet", "village",
  "walnut", "wander", "wheat", "whistle", "willow", "window", "winter", "wombat",
] as const;

export const PASSPHRASE_WORD_COUNT = 4;

/**
 * A source of random integers below a bound. The server passes one built on
 * crypto.randomBytes; a test passes a counter.
 */
export type RandomBelow = (bound: number) => number;

export function makePassphrase(randomBelow: RandomBelow): string {
  const words: string[] = [];
  for (let i = 0; i < PASSPHRASE_WORD_COUNT; i++) {
    words.push(PASSPHRASE_WORDS[randomBelow(PASSPHRASE_WORDS.length)]);
  }
  // Two digits, so it satisfies any "must contain a number" rule a future
  // password policy adds without the words having to change.
  const digits = String(randomBelow(90) + 10);
  return `${words.join("-")}-${digits}`;
}

/** Roughly how much guessing this is worth, for the doc comment to stay true. */
export function passphraseBits(): number {
  return Math.log2(PASSPHRASE_WORDS.length) * PASSPHRASE_WORD_COUNT + Math.log2(90);
}
