import type { ReactNode, Ref } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * FOLDER TABS -- the one tab strip, and the template for the next one.
 *
 * The default shadcn tab strip is a segmented control: a grey pill where only
 * the selected item has a surface, so the unselected ones read as plain text
 * and the strip does not read as tabs at all. Here each trigger carries its
 * own border and a rounded top, so a closed folder is still visibly a tab;
 * the open one takes the card's background, loses its bottom border and is
 * pulled down a pixel over the strip's own border, which is what joins it to
 * the surface below. That surface has to be --card: the character sheet's
 * panel is a Card, and every page renders inside .content-container, which
 * is --card too -- so one component serves both without a variant.
 *
 * EVERY TAB IS ALWAYS ON SCREEN. That is the rule the layout is built
 * around, and it is why there are two layouts:
 *
 *   - Under `md` the list is a GRID, two equal columns, as many rows as it
 *     takes. Seven tabs are four rows; four are two. Nothing scrolls and
 *     nothing is hidden behind an arrow. The strip used to be one row that
 *     scrolled sideways, and on a phone that showed three tabs of seven --
 *     to someone who does not know the app, the other four did not exist.
 *     The cost is the join: the list's `border-b` is drawn once, under the
 *     LAST row, so only a tab on that row can meet the panel. A tab on an
 *     earlier row still reads as the open one -- card-coloured, its own
 *     top edge, no bottom line -- it just does not touch the panel. That
 *     trade was made on purpose; the alternative was hiding tabs.
 *   - From `md` up it is ONE ROW at its own width, inside a wrapper that
 *     scrolls if the row ever outgrows the card. The join is exact there.
 *
 * The scroll is on the WRAPPER, never the list: `overflow-x: auto` forces
 * `overflow-y` to auto as well, which would clip the 1px the open tab pulls
 * itself down by. And the wrapper's `pt-2` is load-bearing: a count bubble
 * sits 6px ABOVE its tab, and on the one-row layout anything outside the
 * scroller's box is cut off. The list's `pr-2` is the same room to the right.
 * On the grid the wrapper does not clip (no overflow), so a bubble on the
 * right-hand column overhangs into the card's padding and is fine.
 *
 * A tab's colour and its top edge come from the caller as LITERAL
 * `bg-tab-*` / `border-t-tab-*` classes -- written out in full, never
 * interpolated; see ci.yml on the colour picker that did nothing for months,
 * and tests/theme.test.ts, which reads every such literal in client/src.
 *
 * Heroes of Faith keeps its own four-icon strip: four tabs that each have an
 * icon fit one row at any width, and it never had this problem. Anything
 * with more tabs than that, or with text-only tabs, uses this.
 */
export type FolderTab = {
  value: string;
  label: ReactNode;
  /** The closed folder's colour: a literal `bg-tab-*` class. */
  tint: string;
  /** The open folder's top edge: the matching literal `border-t-tab-*`. */
  edge: string;
  /**
   * Something that sits ON the tab -- a count bubble. The trigger is
   * `relative`, so an `absolute -right-1.5 -top-1.5` child lands on its
   * corner; the caller owns what it looks like and what it says.
   */
  badge?: ReactNode;
};

const LIST =
  "grid h-auto w-full grid-cols-2 items-end gap-x-1 gap-y-2 rounded-none border-b border-border bg-transparent p-0 md:flex md:w-max md:flex-nowrap md:justify-start md:gap-1 md:pr-2";

const SCROLLER = "min-w-0 flex-1 pt-2 md:overflow-x-auto";

const TRIGGER =
  "relative z-10 shrink-0 -mb-px rounded-b-none rounded-t-md border border-t-2 border-border border-b-transparent px-3 py-1.5 text-foreground data-[state=active]:border-b-card data-[state=active]:bg-card data-[state=active]:shadow-none";

/**
 * The strip. Renders inside a Radix <Tabs>; the caller keeps the value and
 * the panels, exactly as with a bare TabsList.
 */
export default function FolderTabs({
  tabs,
  stripRef,
}: {
  tabs: readonly FolderTab[];
  /** The scrolling wrapper, for a caller that needs to bring a tab into view on the one-row layout. */
  stripRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className={SCROLLER} ref={stripRef}>
      <TabsList className={LIST}>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className={cn(TRIGGER, t.tint, t.edge)}>
            {t.label}
            {t.badge}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
