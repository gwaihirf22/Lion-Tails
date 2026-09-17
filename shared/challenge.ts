/**
 * Proving a person is at the keyboard, before an account is made.
 *
 * ONE GATE, AND IT IS THE REAL ONE: a Cloudflare Turnstile token, checked by
 * the server against Cloudflare (server/lib/turnstile.ts). A new account is
 * signed in immediately and carries 50 story credits and 8 portraits on the
 * owner's OpenAI key -- about $1.40 a signup -- so this is the difference
 * between a form and a tap.
 *
 * THERE USED TO BE A QUESTION HERE: "Who is the Son of God? (hint: 5
 * letters)". Two lives, both worth remembering.
 *
 * First it was decoration. The form compared the answer to "jesus" IN THE
 * BROWSER and then deleted the field before sending, so the server had never
 * heard of it: `curl` with three fields minted accounts. Blake: *"It is just a
 * question asking who the son of God is. Not a true captcha."*
 *
 * Then, when Turnstile went in, the question was kept and checked on the
 * server too -- a second cheap filter, kept mostly because Blake wrote it. He
 * asked for it to go once Turnstile was live and verified, which retires that
 * reason: a fixed answer in a public bundle stops nothing determined, and it
 * is one more thing for a grandparent to fumble on a form whose real gate is
 * invisible. Nothing depended on it -- the Turnstile check fails closed, so the
 * question was never the last line.
 *
 * So: no question, and no answer to keep in step between the form and the
 * route. What is left is pure and shared, which is the property that stopped
 * the old one being checked in one place and not the other.
 */
import { z } from "zod";

/**
 * The field carrying the token. Named here because the client sets it and the
 * server reads it off the RAW body -- see the register handler for why it must
 * never reach the parsed object.
 */
export const TURNSTILE_FIELD = "turnstileToken";

/**
 * The rules for a username, an email and a password -- ONE definition.
 *
 * They lived in the browser only. `registerBodySchema` inherited
 * `z.string()` from drizzle-zod, so the API accepted `email: "a"` and a
 * one-character password; the strict versions sat in `registerUserSchema`,
 * which nothing imported. Both now read these.
 */
export const CREDENTIAL_RULES = {
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
} as const;
