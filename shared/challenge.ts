/**
 * Proving a person is at the keyboard, before an account is made.
 *
 * WHAT WAS HERE BEFORE. The signup form asked "Who is the Son of God?",
 * compared the answer to "jesus" IN THE BROWSER, and then deleted the field
 * before sending the request -- `const { confirmPassword, challenge,
 * ...registerData } = values`. The server had never heard of it. Blake, on
 * being asked: *"It is just a question asking who the son of God is. Not a
 * true captcha."* It was less than that: an attacker did not have to answer
 * it, read it, or know it existed.
 *
 * WHY IT MATTERS MORE THAN SPAM. A new account is signed in immediately and
 * carries two free pools on the owner's OpenAI key -- 50 story credits and 8
 * portraits -- about $1.40 a signup and ~$0.20 a month after that. Registration
 * was one unthrottled POST with three fields.
 *
 * SO THERE ARE TWO GATES NOW, and only one of them is real:
 *  - Turnstile, checked against Cloudflare by the server (server/lib/turnstile.ts);
 *  - this question, checked by the server as well. It is a fixed answer in a
 *    public bundle, so it stops nothing determined -- it is kept because Blake
 *    wrote it, it suits the app, and it costs a lazy script one more field.
 *    Do not mistake it for the defence.
 *
 * Everything here is pure and shared, so the form and the route cannot drift
 * apart -- which is exactly how the old one came to be checked in one place
 * and not the other.
 */
import { z } from "zod";

export const CHALLENGE_QUESTION = "Who is the Son of God?";
export const CHALLENGE_HINT = "hint: 5 letters";

/**
 * What counts as right.
 *
 * "Christ" is a true answer to the question and is NOT accepted, because the
 * hint says five letters and the form has always meant one word. Said out loud
 * here so the next person does not read the narrow list as an oversight.
 */
const ANSWERS = ["jesus"];

/** Lower case, trimmed, and inner runs of space collapsed. */
export function normaliseAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export function answersChallenge(answer: string | undefined): boolean {
  if (typeof answer !== "string") return false;
  return ANSWERS.includes(normaliseAnswer(answer));
}

/** What a wrong answer is told, in both places that can refuse it. */
export const CHALLENGE_WRONG = "That is not the answer we were looking for.";

/**
 * The fields carrying the two gates. Named here because the client sets them
 * and the server reads them off the RAW body -- see the register handler for
 * why they must never reach the parsed object.
 */
export const CHALLENGE_FIELD = "challenge";
export const TURNSTILE_FIELD = "turnstileToken";

/**
 * The rules for a username, an email and a password -- ONE definition.
 *
 * They lived in the browser only. `registerBodySchema` inherited
 * `z.string()` from drizzle-zod for all three, so the API accepted
 * `email: "a"` and a one-character password; the strict versions sat in
 * `registerUserSchema`, which nothing imported. Both now read these.
 */
export const CREDENTIAL_RULES = {
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
} as const;
