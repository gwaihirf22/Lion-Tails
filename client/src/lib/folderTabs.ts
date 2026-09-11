/**
 * FOLDER TABS -- the one definition of the look.
 *
 * The default shadcn tab strip is a segmented control: a grey pill where only
 * the selected item has a surface, so the unselected ones read as plain text
 * and the strip does not read as tabs at all.
 *
 * Each trigger carries its own border and a rounded top, so an unselected tab
 * is still visibly a tab. The selected one takes the card's background, loses
 * its bottom border and is pulled down a pixel over the strip's own border,
 * which is what joins it to the surface below and makes it read as the front
 * folder. That surface has to be --card: the character sheet's panel is a
 * Card, and every page renders inside .content-container, which is --card
 * too -- so the same two strings hold in both places without a variant.
 *
 * A closed folder's colour and the open folder's top edge come from the
 * caller as literal `bg-tab-*` / `border-t-tab-*` classes -- written out in
 * full, never interpolated; see ci.yml on the colour picker that did nothing
 * for months. Three strings, exported, so the character sheet and My Stories
 * cannot drift apart.
 *
 * ONE ROW, ALWAYS. The strip used to wrap, and a wrapped folder strip cannot
 * work: the rule it overlaps is `border-b` on the LIST, drawn once, under the
 * last row. An active tab on any earlier row paints its card-coloured edge
 * against nothing and sits above a row of closed folders with the divider
 * still cutting it off -- which was the default state on a phone, because the
 * first tab is the default tab. Too narrow to fit is a scroll now.
 */
export const FOLDER_TAB_LIST =
  "h-auto w-max flex-nowrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pr-2";

/**
 * The wrapper the strip scrolls inside.
 *
 * The scroll MUST NOT be on the list. `overflow-x: auto` forces
 * `overflow-y: auto` rather than leaving it visible, which would clip the 1px
 * the active tab pulls itself down by -- the exact overhang that joins the
 * front folder to the panel. Two elements: the outer one scrolls, the inner
 * one keeps its border and its overhang intact.
 *
 * `w-max` on the list above is the other half: without an intrinsic width the
 * flex line would shrink to the scroller rather than overflow it, and
 * `flex-nowrap` would squash the labels instead of scrolling them.
 *
 * THE PADDING IS LOAD-BEARING, both of it. Because overflow-y is forced to
 * auto, anything outside the scroller's content box is cut off -- and the
 * character sheet's count badges sit 6px ABOVE their tab (`-top-1.5`) and 6px
 * to the right of it. So the vertical room moves here, out of the list's old
 * `pt-1`, and is 8px rather than 4; the horizontal room is `pr-2` on the list,
 * inside its own `w-max` width, so the last tab's badge has somewhere to be.
 * Remove either and a badge is shaved off on a narrow screen only.
 */
export const FOLDER_TAB_SCROLLER = "min-w-0 flex-1 overflow-x-auto pt-2";

export const FOLDER_TAB_TRIGGER =
  "relative z-10 shrink-0 -mb-px rounded-b-none rounded-t-md border border-t-2 border-border border-b-transparent px-3 py-1.5 text-foreground data-[state=active]:border-b-card data-[state=active]:bg-card data-[state=active]:shadow-none";
