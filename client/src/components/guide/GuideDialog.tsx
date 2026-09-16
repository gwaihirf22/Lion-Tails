import { useRef, useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import FolderTabs from "@/components/FolderTabs";
import { GUIDE_TABS, type GuideTabId } from "@shared/guide";
import { useGuide, markGuideSeen } from "@/hooks/use-guide";
import { useAuth } from "@/hooks/use-auth";
import GuideTree from "./GuideTree";
import GuideSearch from "./GuideSearch";

/**
 * How to use Lion Tails: the vision, then a tree of what every control is for.
 *
 * ANCHORED, NOT CENTRED (`top-[4vh] translate-y-0`): it is tabbed, and a
 * centred dialog with an intrinsic height slides by half the delta whenever a
 * shorter tab opens -- the rule the character sheet's three dialogs already
 * follow.
 *
 * Mounted once, by GuideProvider, at the shell. See use-guide.tsx.
 */
const TAB_BLURB: Record<GuideTabId, string> = {
  start: "What this is for, and where things are.",
  create: "The two kinds of story, and every choice on the way down.",
  characters: "Who the stories are about, and how they keep their face.",
  reading: "Your library, reading a story, and making pictures for it.",
};

export default function GuideDialog() {
  const guide = useGuide();
  const { user } = useAuth();
  const card = useRef<HTMLDivElement | null>(null);
  // Held here because Escape is: see GuideSearch's props.
  const [query, setQuery] = useState("");
  if (!guide) return null;

  return (
    <Dialog
      open={guide.open}
      onOpenChange={(open) => {
        if (open) return;
        // A finished search is not something to come back to.
        setQuery("");
        guide.closeGuide();
      }}
    >
      {/* grid-cols-1 and min-w-0 are load-bearing. DialogContent is a grid,
          and a grid's implicit column is sized by its CONTENT -- the
          screenshots are 780px wide, so the dialog grew to 780px inside a
          390px phone and everything ran off the right-hand side. Measured in
          a browser: the tab strip's last tab sat past the screen edge. */}
      {/* data-guide-scroll: this element is the scroll container, and a search
          result has to scroll the item it opened into view without dragging the
          card sideways. GuideTree finds it through this. */}
      <DialogContent
        ref={card}
        data-guide-scroll
        className="top-[4vh] grid-cols-1 max-h-[92dvh] max-w-3xl translate-y-0 overflow-y-auto"
        // The search box is now the first tabbable thing in here, so Radix
        // would focus it -- and this dialog OPENS ITSELF once per account, on
        // a phone, where that means the keyboard covering the guide before
        // anybody has asked to search. The card takes focus instead; the box
        // is one tap or one Tab away. (PictureDialog does the same, for the
        // same reason.)
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          card.current?.focus();
        }}
        // ESCAPE CLEARS A SEARCH BEFORE IT CLOSES THE GUIDE. Radix hears the
        // key on the document in the CAPTURE phase, so nothing inside the
        // input can stop it -- preventing it here is the only way, and it is
        // the way Radix documents.
        onEscapeKeyDown={(event) => {
          if (!query) return;
          event.preventDefault();
          setQuery("");
        }}
      >
        <DialogTitle>How to use Lion Tails</DialogTitle>
        <DialogDescription>
          Every button, what it is for, and a picture of where it is. Tap anything to open it.
        </DialogDescription>

        {/* Search stands ABOVE the tabs and replaces them while it has a
            query: a result list beside four folder tabs reads as a fifth tab,
            and the tabs are a shape people learn. */}
        <GuideSearch query={query} onQueryChange={setQuery} onPick={(tab, node) => guide.openGuide(tab, node)}>
          <Tabs value={guide.tab} onValueChange={(v) => guide.setTab(v as GuideTabId)} className="w-full min-w-0">
            <FolderTabs tabs={GUIDE_TABS.map((t) => ({ value: t.id, label: t.label, tint: t.tint, edge: t.edge }))} />
            {GUIDE_TABS.map((t) => (
              <TabsContent key={t.id} value={t.id} className="min-w-0 space-y-3 pt-4">
                <p className="m-0 text-sm text-muted-foreground">{TAB_BLURB[t.id]}</p>
                {/* Mounted per tab, so only the open tab's screenshot is in the
                    DOM -- and the tree keeps its own open item per tab. */}
                {guide.tab === t.id && (
                  <GuideTree tab={t.id} openNode={guide.node} jump={guide.jump} />
                )}
              </TabsContent>
            ))}
          </Tabs>
        </GuideSearch>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void markGuideSeen(user?.id);
              guide.closeGuide();
            }}
          >
            Don't show this again
          </Button>
          <Button type="button" size="sm" onClick={guide.closeGuide}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
