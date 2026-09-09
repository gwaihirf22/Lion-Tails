import { describe, it, expect } from "vitest";
import { registerBodySchema } from "../server/auth";

// POST /api/auth/register is unauthenticated, and its handler used to spread
// ...req.body straight into storage.createUser(). Drizzle's .values() copies
// whichever keys the object happens to carry rather than the table's columns,
// so a request could name any column on `users` -- including is_admin. That was
// verified against a local in-memory instance: registering with
// {"isAdmin": true} returned a 201 with "isAdmin": true.
//
// These tests pin the schema that closes it. They are deliberately about the
// schema rather than the route, because the schema is the whole defence: if
// somebody re-picks isAdmin into it, or swaps it for insertUserSchema, the hole
// reopens silently and nothing else in the suite would notice.
describe("registerBodySchema", () => {
  const valid = {
    username: "someone",
    email: "someone@example.invalid",
    password: "correct-horse-battery",
  };

  it("accepts an ordinary registration", () => {
    const parsed = registerBodySchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("strips isAdmin instead of honouring it", () => {
    const parsed = registerBodySchema.safeParse({ ...valid, isAdmin: true });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("isAdmin");
  });

  it("strips isVerified, so email verification cannot be self-granted", () => {
    const parsed = registerBodySchema.safeParse({ ...valid, isVerified: true });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("isVerified");
  });

  it("strips verificationToken, so a known token cannot be planted", () => {
    const parsed = registerBodySchema.safeParse({
      ...valid,
      verificationToken: "attacker-chosen",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("verificationToken");
  });

  it("drops unknown keys rather than passing them through to the insert", () => {
    const parsed = registerBodySchema.safeParse({
      ...valid,
      resetPasswordToken: "nope",
      id: 999,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("resetPasswordToken");
    expect(parsed.success && parsed.data).not.toHaveProperty("id");
  });

  it("keeps the fields registration legitimately needs", () => {
    const parsed = registerBodySchema.safeParse({
      ...valid,
      firstName: "Some",
      lastName: "One",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toMatchObject({
      username: "someone",
      email: "someone@example.invalid",
      firstName: "Some",
      lastName: "One",
    });
  });

  it("still rejects a body missing required fields", () => {
    expect(registerBodySchema.safeParse({ username: "someone" }).success).toBe(false);
  });
});
