import { useCallback, useEffect, useState } from "react";
// The server refuses more; the bar says so before it is sent, from the same
// number rather than one that looks like it.
import { MAX_PASSAGE_CHARS } from "@shared/schema";

/**
 * Choosing the part of a story to draw.
 *
 * THE SELECTION IS CAPTURED AS IT CHANGES, NEVER READ AT CLICK TIME. Tapping
 * a button collapses the selection on the way to the handler -- on iOS before
 * it, on desktop it depends on where the button is -- so a picker that calls
 * getSelection() inside onClick works on the machine it was written on and
 * nowhere else. This listens to `selectionchange` and keeps the last usable
 * one.
 *
 * NO GESTURE OF OUR OWN. The platform's own text selection does the choosing:
 * long-press and drag the handles on a phone, click and drag on a desktop.
 * useFocusMode's rule is that a tap is how you turn a page, and
 * tests/focusMode.test.ts holds it -- a reader that reacted to touches of its
 * own would be fighting the thing doing the selecting.
 */
export type PickedPassage = {
  /** What was highlighted. Becomes the anchor's quote and the model's moment. */
  text: string;
  /** Which block it starts in. The anchor's fallback, never its first answer. */
  blockIndex: number;
};

export function usePassagePicker(opts: {
  /** Anything at or past this is an appendix, and may not be drawn. */
  bodyBlocks: number;
}) {
  const [picking, setPicking] = useState(false);
  const [passage, setPassage] = useState<PickedPassage | null>(null);
  /** Set when the highlight is real but unusable, so the bar can say why. */
  const [refused, setRefused] = useState<string | null>(null);

  const { bodyBlocks } = opts;

  useEffect(() => {
    if (!picking) return;

    const onSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString() ?? "";
      // A collapsed selection is a caret, and a caret is what you get between
      // dragging and tapping. Leave the last real passage alone.
      if (!selection || selection.isCollapsed || !text.trim()) return;

      const node = selection.getRangeAt(0).startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const block = el?.closest("[data-block]");

      // Outside the story: the toolbar, the questions, the picture captions.
      if (!block || !block.closest(".reader-body")) return;

      const blockIndex = Number(block.getAttribute("data-block"));
      if (!Number.isInteger(blockIndex)) return;

      // The disclaimer and Digging deeper are appended by the server and are
      // not the story. A picture of "About this story: Caleb really lived" is
      // not a thing anyone wants.
      if (blockIndex >= bodyBlocks) {
        setPassage(null);
        setRefused("That part is a note from the app, not the story. Choose a part of the story itself.");
        return;
      }

      if (text.trim().length > MAX_PASSAGE_CHARS) {
        setPassage(null);
        setRefused("That is more than one moment. Choose a shorter part — a paragraph or two.");
        return;
      }

      setRefused(null);
      setPassage({ text: text.trim(), blockIndex });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    // A selection made BEFORE the button was pressed still counts.
    onSelectionChange();
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [picking, bodyBlocks]);

  const start = useCallback(() => {
    setPassage(null);
    setRefused(null);
    setPicking(true);
  }, []);

  const cancel = useCallback(() => {
    setPicking(false);
    setPassage(null);
    setRefused(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return { picking, passage, refused, start, cancel };
}
