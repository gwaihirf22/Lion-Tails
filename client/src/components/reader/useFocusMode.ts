import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Focus mode: fade everything but the story.
 *
 * Two pieces of state, kept separate on purpose:
 *   armed         the user pressed Focus. TRANSIENT, never persisted.
 *   chromeVisible is the chrome currently faded in.
 *
 * `armed` is never persisted because persisting it is how you trap someone:
 * they reload, the chrome is already invisible, and they have no memory of
 * asking for that.
 *
 * WHAT BRINGS THE CHROME BACK, AND WHY IT IS SO NARROW
 *
 * The first version revealed on any pointer movement and any tap. That defeats
 * the feature. Reading with a hand resting on a trackpad, or a finger anywhere
 * near a touchscreen, meant the bar flickered back constantly -- the fade was
 * technically working and the experience was of chrome that would not go away.
 *
 * So there are exactly two deliberate gestures, one per input type:
 *
 *   mouse   move into the top strip, where the bar already is. Reaching for a
 *           control is the gesture; drifting across the page is not.
 *   touch   scroll UP. The standard mobile idiom -- down is reading onward, up
 *           is going back, and going back is when you want the controls. A tap
 *           does nothing, because a tap is how you turn a page.
 *
 * Plus the two that are not negotiable: Escape leaves focus mode entirely, and
 * focusin reveals, because keyboard focus must never land on invisible chrome.
 */
export type FocusMode = {
  armed: boolean;
  chromeVisible: boolean;
  /** True while the chrome should be faded out. */
  hidden: boolean;
  toggle: () => void;
  disarm: () => void;
};

const REARM_AFTER_MS = 3000;
/**
 * How tall the mouse-reveal strip is, in px from the top of the viewport.
 * Generous on purpose: the target is "reaching for the toolbar", and a strip
 * only as tall as the bar itself makes that a precision task.
 */
const HOVER_ZONE_PX = 80;
/**
 * A scroll-up has to be deliberate. Momentum, rubber-banding at the top of the
 * document and a one-pixel correction after a tap all produce small upward
 * deltas, and each of them would otherwise pop the bar mid-sentence.
 */
const SCROLL_UP_THRESHOLD_PX = 40;

/**
 * Should a pointer event bring the chrome back?
 *
 * Pulled out as a pure function because it encodes the whole complaint that
 * prompted the rewrite -- "focus mode should not be interrupted by a mouse
 * movement or a touch on the screen" -- and a rule that specific should be
 * written down as a test rather than re-derived from event handlers later.
 */
export function pointerReveals(e: {
  pointerType: string;
  clientY: number;
}, opts: { needsExit: boolean }): boolean {
  if (e.pointerType !== "mouse") return false;
  if (e.clientY > HOVER_ZONE_PX) return false;
  return !opts.needsExit;
}

/**
 * Fold one scroll event into the running upward total.
 *
 * Returns the new run and whether it has crossed into a deliberate scroll-up.
 * Any downward movement resets it, so "down a bit, up a bit, down a bit" while
 * reading never accumulates into a reveal.
 */
export function foldScroll(
  run: number,
  delta: number,
): { run: number; reveals: boolean } {
  if (delta >= 0) return { run: 0, reveals: false };
  const next = run + -delta;
  if (next >= SCROLL_UP_THRESHOLD_PX) return { run: 0, reveals: true };
  return { run: next, reveals: false };
}

export function useFocusMode(): FocusMode {
  const [armed, setArmed] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  /**
   * The pointer is inside the top strip right now.
   *
   * Needed because a motionless pointer fires no events: without it, resting
   * the cursor on the toolbar would let the 3s timer fade the bar out from
   * under the hand that is reaching for it.
   */
  const inZone = useRef(false);
  /**
   * The Focus button IS in the top strip, so the cursor is sitting in the
   * reveal zone the instant focus mode is armed. Requiring the pointer to
   * leave the zone once is exact, where a settle timer was a guess.
   */
  const needsExit = useRef(false);
  const lastScrollY = useRef(0);
  /** Accumulated upward scroll, reset by any downward movement. */
  const upwardRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const scheduleFade = useCallback(() => {
    clearTimer();
    // Never fade out from under a pointer that is still on the toolbar.
    if (inZone.current) return;
    timer.current = setTimeout(() => setChromeVisible(false), REARM_AFTER_MS);
  }, []);

  const reveal = useCallback(() => {
    setChromeVisible(true);
    scheduleFade();
  }, [scheduleFade]);

  const toggle = useCallback(() => {
    setArmed((was) => {
      const next = !was;
      if (next) {
        needsExit.current = true;
        inZone.current = false;
        upwardRun.current = 0;
        lastScrollY.current = window.scrollY;
        setChromeVisible(false);
      } else {
        setChromeVisible(true);
      }
      return next;
    });
  }, []);

  const disarm = useCallback(() => {
    setArmed(false);
    setChromeVisible(true);
  }, []);

  useEffect(() => {
    if (!armed) {
      clearTimer();
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      // Mouse only. A touch drag produces pointermove too, and a finger
      // travelling past the top of the screen is not a request for the bar.
      if (e.pointerType !== "mouse") return;

      const nowInZone = e.clientY <= HOVER_ZONE_PX;
      const wasInZone = inZone.current;
      inZone.current = nowInZone;

      if (!nowInZone) {
        // Leaving the strip is what re-arms the reveal after toggling.
        needsExit.current = false;
        if (wasInZone) scheduleFade();
        return;
      }
      if (!pointerReveals(e, { needsExit: needsExit.current })) return;
      clearTimer();
      setChromeVisible(true);
    };

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;

      // Scrolling DOWN is reading onward and is explicitly not a reveal --
      // flashing the bar on every wheel tick is what this replaced.
      const folded = foldScroll(upwardRun.current, delta);
      upwardRun.current = folded.run;
      if (folded.reveals) reveal();
    };

    const onKey = (e: KeyboardEvent) => {
      // Escape leaves focus mode altogether. Other keys do nothing: arrow and
      // space are how a keyboard user scrolls, and revealing on those would be
      // the pointermove bug again in another input device.
      if (e.key === "Escape") disarm();
    };

    // Not optional. If focus moves into chrome that is at opacity 0, a keyboard
    // user is interacting with something they cannot see.
    const onFocusIn = () => reveal();

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focusin", onFocusIn);
      clearTimer();
    };
  }, [armed, reveal, disarm, scheduleFade]);

  const hidden = armed && !chromeVisible;

  // The body attribute is how the header, the footer and the extras all fade
  // from one place, without threading a prop through every one of them.
  useEffect(() => {
    if (hidden) document.body.dataset.readerFocus = "1";
    else delete document.body.dataset.readerFocus;
    return () => {
      delete document.body.dataset.readerFocus;
    };
  }, [hidden]);

  return { armed, chromeVisible, hidden, toggle, disarm };
}
