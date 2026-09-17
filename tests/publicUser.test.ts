import { describe, it, expect } from "vitest";
import { publicUser, type User } from "../shared/schema";

/**
 * WHAT THE OUTSIDE MAY SEE OF AN ACCOUNT.
 *
 * Three routes used to answer with `const { password, ...rest } = user` -- a
 * list of what to HIDE. Everything added to the table since was published by
 * default, including reset_password_token, which is a credential: anyone who
 * could read their own /api/auth/me could read the token that resets their
 * password, and a future column joins them silently.
 *
 * publicUser picks instead, so a new column is private until somebody names
 * it. This test is the reason that stays true.
 */
const full: User = {
  id: 7,
  username: "someone",
  email: "someone@example.com",
  password: "scrypthash.salt",
  firstName: "Some",
  lastName: "One",
  isVerified: true,
  isAdmin: false,
  verificationToken: "verify-me",
  resetPasswordToken: "reset-me",
  resetPasswordExpires: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  lastLoginAt: new Date("2026-01-03"),
  signupIp: "203.0.113.7",
};

describe("publicUser", () => {
  it("never carries a credential", () => {
    const out = publicUser(full) as Record<string, unknown>;
    for (const secret of ["password", "resetPasswordToken", "resetPasswordExpires", "verificationToken"]) {
      expect(out, secret).not.toHaveProperty(secret);
    }
  });

  it("keeps the sign-up address to the admin view", () => {
    // It is the one address this app stores. The owner may see it on the
    // accounts page; it has no business in the payload every signed-in
    // browser holds.
    expect(publicUser(full)).not.toHaveProperty("signupIp");
  });

  it("carries what a signed-in person needs", () => {
    expect(publicUser(full)).toEqual({
      id: 7,
      username: "someone",
      email: "someone@example.com",
      firstName: "Some",
      lastName: "One",
      isAdmin: false,
      isVerified: true,
      createdAt: full.createdAt,
      lastLoginAt: full.lastLoginAt,
    });
  });

  it("is a pick, so a new column is private until it is named", () => {
    // Guards the shape itself: if someone switches this back to a spread,
    // this key arrives and the test says so.
    const withNewColumn = { ...full, somethingAddedLater: "secret" } as unknown as User;
    expect(publicUser(withNewColumn)).not.toHaveProperty("somethingAddedLater");
  });
});
