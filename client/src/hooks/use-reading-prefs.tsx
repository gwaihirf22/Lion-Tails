import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, apiRequestAllowingErrors, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  readingPrefsSchema,
  READING_PREFS_DEFAULTS,
  READER_FONT_STEPS,
  type ReadingPrefs,
} from "@shared/schema";

/**
 * How the reader looks, per user, synced to the account.
 *
 * Shaped after use-parent-mode.tsx: a server-backed value wrapped in a React
 * context via TanStack Query, mounted once in App.tsx.
 */
type ReadingPrefsContextType = {
  prefs: ReadingPrefs;
  /** False when the server copy has not been reached (logged out, offline). */
  isSynced: boolean;
  setPalette: (v: ReadingPrefs["palette"]) => void;
  setFont: (v: ReadingPrefs["font"]) => void;
  setTypeset: (v: ReadingPrefs["typeset"]) => void;
  setFontStep: (v: number) => void;
  /** The px value the current step maps to, for display. */
  fontSizePx: number;
};

const ReadingPrefsContext = createContext<ReadingPrefsContextType | null>(null);

/**
 * The localStorage mirror is a CACHE of the server value, never a second
 * source of truth, and it is load-bearing rather than a nicety.
 *
 * Without it, every load paints Paper at 18px for the ~200ms the query takes
 * and then snaps to Night -- a white flash in a dark room, which is precisely
 * the eye-strain problem the palette exists to solve.
 *
 * With fonts in the mix it does a second, larger job: read synchronously in
 * initial state, it puts data-font on the article before first paint, so the
 * browser starts fetching the right woff2 in the first style pass rather than
 * after the query resolves. That is the difference between one swap and two.
 *
 * Keyed by user id so a shared family device does not hand one person's night
 * mode to another. The v1 suffix invalidates by KEY on a future shape change,
 * rather than by trying to parse whatever the old shape left behind.
 */
const mirrorKey = (userId: number | null) => `liontails.reader.prefs.v1:${userId ?? "anon"}`;

function readMirror(userId: number | null): Partial<ReadingPrefs> {
  try {
    const raw = localStorage.getItem(mirrorKey(userId));
    if (!raw) return {};
    // Validated, not cast: a value written by an older build can name a palette
    // this version does not have, and that must not reach the DOM as a
    // data-attribute nothing styles.
    const parsed = readingPrefsSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    // Private browsing, disabled storage, corrupt JSON. Defaults are fine.
    return {};
  }
}

function writeMirror(userId: number | null, prefs: ReadingPrefs) {
  try {
    localStorage.setItem(mirrorKey(userId), JSON.stringify(prefs));
  } catch {
    // Storage full or blocked. The server copy is the real one; carry on.
  }
}

export function ReadingPrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Synchronous initial state, so first paint is already correct. See above.
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => ({
    ...READING_PREFS_DEFAULTS,
    ...readMirror(userId),
  }));

  const { data: serverPrefs } = useQuery({
    queryKey: ["/api/settings/reading"],
    queryFn: async () => {
      // Allowing errors on purpose: 401 is a NORMAL state for a logged-out
      // visitor, and apiRequest throws on any non-2xx.
      const response = await apiRequestAllowingErrors("GET", "/api/settings/reading");
      if (!response.ok) return null;
      const parsed = readingPrefsSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : null;
    },
    staleTime: Infinity,
    enabled: Boolean(user),
  });

  // The server wins unconditionally once it answers. That is the rule that
  // keeps the mirror a cache rather than a competing store.
  useEffect(() => {
    if (!serverPrefs) return;
    setPrefs(serverPrefs);
    writeMirror(userId, serverPrefs);
  }, [serverPrefs, userId]);

  // Re-read the mirror when the signed-in user changes, so switching accounts
  // on a shared device does not inherit the previous reader's settings.
  useEffect(() => {
    setPrefs({ ...READING_PREFS_DEFAULTS, ...readMirror(userId) });
  }, [userId]);

  // The palette drives the WHOLE app, not just the reader: theme.css maps
  // these same four palettes onto the shadcn tokens every other component
  // consumes. Set on <html> so it is in place before anything paints.
  useEffect(() => {
    document.documentElement.dataset.palette = prefs.palette;
  }, [prefs.palette]);

  const save = useMutation({
    mutationFn: async (patch: Partial<ReadingPrefs>) => {
      const response = await apiRequest("POST", "/api/settings/reading", patch);
      // No `if (!response.ok)` here: apiRequest throws on non-2xx, so that
      // branch would be dead code. See queryClient.ts.
      return readingPrefsSchema.parse(await response.json());
    },
    onSuccess: (persisted) => {
      // What the server says is stored, not what we asked it to store.
      setPrefs(persisted);
      writeMirror(userId, persisted);
      queryClient.setQueryData(["/api/settings/reading"], persisted);
    },
    onError: (_error, _patch, context) => {
      // Roll back to the value from before the optimistic write.
      const previous = context as ReadingPrefs | undefined;
      if (previous) setPrefs(previous);
    },
    onMutate: (patch) => {
      const previous = prefs;
      // Optimistic: the control must feel instant, and a reading preference
      // failing to save is not worth a toast interrupting a bedtime story.
      const next = { ...prefs, ...patch };
      setPrefs(next);
      writeMirror(userId, next);
      return previous;
    },
  });

  const update = useCallback(
    (patch: Partial<ReadingPrefs>) => {
      if (!user) {
        // Logged out: the controls still work for this session, they just do
        // not persist anywhere but the mirror.
        setPrefs((p) => {
          const next = { ...p, ...patch };
          writeMirror(null, next);
          return next;
        });
        return;
      }
      save.mutate(patch);
    },
    [user, save],
  );

  const value = useMemo<ReadingPrefsContextType>(
    () => ({
      prefs,
      isSynced: Boolean(user) && serverPrefs != null,
      setPalette: (palette) => update({ palette }),
      setFont: (font) => update({ font }),
      setTypeset: (typeset) => update({ typeset }),
      setFontStep: (fontStep) =>
        update({ fontStep: Math.min(READER_FONT_STEPS.length - 1, Math.max(0, fontStep)) }),
      fontSizePx: READER_FONT_STEPS[prefs.fontStep] ?? READER_FONT_STEPS[2],
    }),
    [prefs, user, serverPrefs, update],
  );

  return <ReadingPrefsContext.Provider value={value}>{children}</ReadingPrefsContext.Provider>;
}

export function useReadingPrefs(): ReadingPrefsContextType {
  const ctx = useContext(ReadingPrefsContext);
  if (!ctx) {
    throw new Error("useReadingPrefs must be used within a ReadingPrefsProvider");
  }
  return ctx;
}
