import type { Request, Response } from "express";
import type { SavedStory } from "@shared/schema";
import { QUEST_PROLOGUE } from "../data/questPrologue";

/**
 * Stories the app ships with.
 *
 * They are CONSTANTS, not rows: in every library, owned by nobody, revised by
 * editing a file. This module is the only place that knows which ids those
 * are, so a route asks it rather than comparing against a literal.
 *
 * Every mutating story route refuses them here, in one function, for the same
 * reason requireAuth is applied in the route signature: a guard that is
 * visible where the routes are listed is one that a new route is seen to be
 * missing. Reading routes never need to know -- there is no row for a built-in
 * story, so storage answers "not found" and the route falls through to us.
 */
const BUILT_IN: readonly (SavedStory & { builtIn: true })[] = [QUEST_PROLOGUE];

export function isBuiltInStoryId(id: string): boolean {
  return BUILT_IN.some((s) => s.id === id);
}

export function builtInStoryById(id: string): (SavedStory & { builtIn: true }) | undefined {
  return BUILT_IN.find((s) => s.id === id);
}

/** The library as the user sees it: what the app ships with, then theirs. */
export function withBuiltInStories<T extends SavedStory>(stories: T[]): Array<T | SavedStory> {
  return [...BUILT_IN, ...stories];
}

/**
 * Answer a request to change or remove a built-in story, and say whether it
 * did. 403, not 404: the story exists and the user can see it, which is
 * exactly why the message has to say what it is rather than "not found".
 */
export function refuseBuiltIn(req: Request, res: Response): boolean {
  if (!isBuiltInStoryId(req.params.id)) return false;
  res.status(403).json({
    message:
      "This story is part of Lion Tails and is in every library. It cannot be changed or removed.",
  });
  return true;
}
