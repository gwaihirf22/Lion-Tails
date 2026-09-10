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
 * for months. Two strings, exported, so the character sheet and My Stories
 * cannot drift apart.
 */
export const FOLDER_TAB_LIST =
  "flex-1 h-auto flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pt-1";

export const FOLDER_TAB_TRIGGER =
  "relative z-10 -mb-px rounded-b-none rounded-t-md border border-t-2 border-border border-b-transparent px-3 py-1.5 text-foreground data-[state=active]:border-b-card data-[state=active]:bg-card data-[state=active]:shadow-none";
