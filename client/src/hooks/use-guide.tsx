import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, apiRequestAllowingErrors, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { GUIDE_VERSION, type GuideNodeId, type GuideTabId } from "@shared/guide";
import { readGuideSeen, writeGuideSeen } from "@/lib/guideSeen";
import GuideDialog from "@/components/guide/GuideDialog";

/**
 * Who may open the guide, and when it opens itself.
 *
 * A CONTEXT RATHER THAN LOCAL STATE, because the Settings panel has to open it
 * and the panel is itself the body of the header's own dialog. The guide is
 * mounted HERE, at the shell, so it is never a child of another dialog --
 * Settings closes itself as the guide opens, which on a 390px phone is the
 * difference between a readable page and two stacked modals.
 *
 * ONCE PER ACCOUNT, not once per browser: Blake asked for that, so the truth
 * is `user_settings.guide_seen_at` and this only mirrors it in localStorage to
 * stop the dialog flashing open while the query is in flight. It is stamped
 * when the guide OPENS -- somebody who closes it immediately has seen it.
 */
type GuideState = {
  open: boolean;
  openGuide: (tab?: GuideTabId, node?: GuideNodeId) => void;
  closeGuide: () => void;
  /** Where to land, and what to have open, when it is shown. */
  tab: GuideTabId;
  setTab: (tab: GuideTabId) => void;
  node?: GuideNodeId;
  /**
   * Bumped every time a node is ASKED FOR, and that is the whole point: the
   * same search, run twice, has to open and scroll to the item twice. `node`
   * alone cannot say "again" -- it is the same value, so nothing downstream
   * would notice.
   */
  jump: number;
};

const GuideContext = createContext<GuideState | null>(null);

/**
 * Only ever offered once per page load, whatever storage says.
 *
 * A browser with site data blocked reads the mirror as "not seen" every time,
 * and the server write can fail too. Without this, every navigation would
 * re-open it -- the one failure mode that would make a parent hate this
 * feature.
 */
let offeredThisLoad = false;

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuideTabId>("start");
  const [node, setNode] = useState<GuideNodeId | undefined>(undefined);
  const [jump, setJump] = useState(0);

  const seen = useQuery<{ seenAt: string | null }>({
    queryKey: ["/api/settings/guide"],
    enabled: Boolean(user),
  });

  const stamp = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/settings/guide", { seen: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/guide"] }),
  });

  const openGuide = useCallback(
    (nextTab?: GuideTabId, nextNode?: GuideNodeId) => {
      if (nextTab) setTab(nextTab);
      setNode(nextNode);
      if (nextNode) setJump((n) => n + 1);
      setOpen(true);
      // Opening it is having seen it, on the account and in this browser.
      writeGuideSeen(user?.id, GUIDE_VERSION);
      if (user && !seen.data?.seenAt) stamp.mutate();
    },
    // stamp is a fresh object each render; the fact this depends on is the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, seen.data?.seenAt],
  );

  const closeGuide = useCallback(() => setOpen(false), []);

  /**
   * The one place it opens itself: a signed-in account that has never seen it,
   * on the page where a story is written. Never over the reader or a shared
   * story, where somebody is mid-sentence.
   */
  useEffect(() => {
    if (offeredThisLoad || authLoading || !user) return;
    if (location !== "/generate-story") return;
    if (seen.isLoading) return;
    if (seen.data?.seenAt || readGuideSeen(user.id, GUIDE_VERSION)) return;
    offeredThisLoad = true;
    openGuide("start");
  }, [authLoading, user, location, seen.isLoading, seen.data?.seenAt, openGuide]);

  const value = useMemo(
    () => ({ open, openGuide, closeGuide, tab, setTab, node, jump }),
    [open, openGuide, closeGuide, tab, node, jump],
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideDialog />
    </GuideContext.Provider>
  );
}

/**
 * Safe outside the provider: the button renders nothing rather than crashing
 * a page. `/s/:token` is public and has no provider above it.
 */
export function useGuide(): GuideState | null {
  return useContext(GuideContext);
}

/** For the "don't show this again" footer, which stamps without opening. */
export async function markGuideSeen(userId: number | null | undefined): Promise<void> {
  writeGuideSeen(userId, GUIDE_VERSION);
  await apiRequestAllowingErrors("POST", "/api/settings/guide", { seen: true }).catch(() => undefined);
}
