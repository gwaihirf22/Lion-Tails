/**
 * A new share token.
 *
 * 16 bytes from the operating system's CSPRNG -- 128 bits, the same strength
 * as a session id -- as base64url, which is always 22 characters and safe in a
 * url without escaping. SHARE_TOKEN_PATTERN in shared/sharedStory.ts is the
 * shape this must match; the test asserts they agree.
 *
 * The token is the entire capability: whoever holds the link reads the story.
 * So it is never derived from anything (not the story id, not a hash of it)
 * and never reused -- stopping a share and sharing again mints a new one, so a
 * link that was stopped stays stopped.
 */
import { randomBytes } from "crypto";

export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}
