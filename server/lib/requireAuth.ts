/**
 * Route-level authorisation.
 *
 * These existed once in server/lib/middleware.ts and were deleted as dead code,
 * correctly -- they were applied to zero routes. But "unused" and "unnecessary"
 * are not the same thing: the evidence that the abstraction was *needed* was the
 * 29 copy-pasted `if (!req.user || !req.isAuthenticated())` blocks inside the
 * handlers, which is exactly the pattern that let eight write routes ship with
 * no check at all. POST/PUT/DELETE on /api/heroes, /api/hero-stories and
 * /api/songs were reachable anonymously from the public internet; a DELETE with
 * no session reached the handler and was stopped only by a non-existent id.
 *
 * The point of putting authorisation in the route signature rather than the
 * handler body is that a missing guard becomes visible at the registration site,
 * where every route is listed together, instead of being invisible inside one
 * handler among fifty-five.
 *
 * Deliberately applied per-route rather than with app.use(): /api/health must
 * stay reachable without a session (CI's smoke test asserts a 200 with no
 * cookie), and a global guard would put ordering between these and that route.
 */
import type { NextFunction, Request, Response } from "express";

/** Any logged-in user. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

/**
 * Administrators only.
 *
 * Used for writes to shared reference data -- Heroes of Faith, songs, and the
 * hero-story curation routes. These are seeded content, not user content: the
 * client only ever reads them, and the user-facing paths that legitimately
 * create hero_stories rows (POST /api/story/save and
 * POST /api/stories/:id/associate-hero) are separate routes with their own
 * checks. So restricting these to admin costs a normal user nothing.
 *
 * Returns 401 when unauthenticated and 403 when authenticated-but-not-admin, so
 * the two cases stay distinguishable in logs.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!(req.user as { isAdmin?: boolean }).isAdmin) {
    return res
      .status(403)
      .json({ message: "This action requires an administrator account" });
  }
  next();
}
