import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GUIDE_TABS, type GuideNodeId, type GuideTabId } from "@shared/guide";
import { searchGuide } from "@shared/guideSearch";

/**
 * "Where is the thing that lets me…" — the other way people use the guide.
 *
 * Blake: search *"should basically just bring the user to the right location
 * for a feature that they are looking for."* So this box answers with ITEMS
 * and then gets out of the way: picking one takes you to that item in its own
 * tab, opened, with its screenshot. It never restates the guide's words, which
 * would be a second copy of the content to keep true.
 *
 * The shape is the house pattern for a search (HeroPicker, SourcePicker): a
 * `Search` icon over an `Input`, then plain buttons. The keys come from
 * `AnimalAutocomplete`, the one keyboard list in this app: Down and Up move,
 * Enter opens, Escape clears. With the box empty, Escape belongs to the dialog
 * and closes it, which is what a reader expects of a box they never typed in.
 */
const LIMIT = 8;
/** Read off the table, never restated: the tabs own their names and tints. */
const TAB_LABEL = Object.fromEntries(GUIDE_TABS.map((t) => [t.id, t.label])) as Record<GuideTabId, string>;
const TAB_TINT = Object.fromEntries(GUIDE_TABS.map((t) => [t.id, t.tint])) as Record<GuideTabId, string>;

export default function GuideSearch({
  query,
  onQueryChange,
  onPick,
  children,
}: {
  /**
   * Held by the DIALOG, not here, and that is not tidiness.
   *
   * Radix listens for Escape on the document with `capture: true`, so it runs
   * before anything in this input and `stopPropagation` cannot reach it --
   * measured: a search for something the guide does not have, then Escape,
   * closed the whole guide. The supported way out is `onEscapeKeyDown` on
   * DialogContent, and that lives up there, so the query has to as well.
   */
  query: string;
  onQueryChange: (query: string) => void;
  /** Take me there: the tab to show, and the item to open on it. */
  onPick: (tab: GuideTabId, node: GuideNodeId) => void;
  /** The tabs and the tree, shown whenever nothing is being searched for. */
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(0);
  const setQuery = onQueryChange;
  const searching = query.trim().length > 0;
  const hits = useMemo(() => (searching ? searchGuide(query, LIMIT) : []), [query, searching]);

  const pick = (at: number) => {
    const hit = hits[at];
    if (!hit) return;
    // Cleared, so the reader lands in the tree rather than back in a list they
    // have finished with.
    setQuery("");
    setFocused(0);
    onPick(hit.tab, hit.node.id as GuideNodeId);
  };

  return (
    <>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          data-guide="guide-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocused(0);
          }}
          onKeyDown={(e) => {
            // Escape is the dialog's (see the props): Radix hears it first,
            // whatever this does.
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setFocused((at) => (at + 1) % hits.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setFocused((at) => (at - 1 + hits.length) % hits.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(focused);
            }
          }}
          className="h-9 pl-8 pr-9"
          placeholder="Find a feature — pictures, series, credits…"
          aria-label="Search the guide"
        />
        {searching && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            aria-label="Clear the search"
            onClick={() => {
              setQuery("");
              setFocused(0);
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {!searching ? (
        children
      ) : hits.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-muted-foreground">
          Nothing matches that. Try a plainer word — pictures, series, credits.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-1 p-0">
          {hits.map((hit, at) => (
            <li key={hit.node.id}>
              <button
                type="button"
                onClick={() => pick(at)}
                onMouseEnter={() => setFocused(at)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-left",
                  "hover:border-primary/50",
                  at === focused && "border-primary/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{hit.node.title}</span>
                  {/* Where it lives, so a reader knows where they are about to
                      be taken -- and recognises the place next time. The TAB is
                      the chip beside it, so naming it here as well only ate the
                      end of the path, which is the half that says which item
                      this is under. */}
                  <span className="block truncate text-xs text-muted-foreground">
                    {hit.path.join(" › ")}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground",
                    TAB_TINT[hit.tab],
                  )}
                >
                  {TAB_LABEL[hit.tab]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
