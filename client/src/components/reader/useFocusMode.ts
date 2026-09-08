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
/** Ignore pointer movement briefly after arming, so the cursor still resting
 *  where the Focus button was does not instantly undo the press. */
const SETTLE_MS = 600;
const MOVE_THRESHOLD_PX = 4;

export function useFocusMode(): FocusMode {
  const [armed, setArmed] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const armedAt = useRef(0);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFade = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
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
        armedAt.current = Date.now();
        lastPoint.current = null;
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
      if (timer.current) clearTimeout(timer.current);
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      if (Date.now() - armedAt.current < SETTLE_MS) return;
      const prev = lastPoint.current;
      lastPoint.current = { x: e.clientX, y: e.clientY };
      // A real movement, not a one-pixel jitter or a scroll-induced event.
      if (prev && Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) < MOVE_THRESHOLD_PX) {
        return;
      }
      reveal();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        disarm();
        return;
      }
      reveal();
    };
    const onPointerDown = () => reveal();
    const onFocusIn = () => reveal();

    // NOTE what is deliberately absent: scroll and touchmove. Scrolling IS
    // reading, and flashing the bar back on every wheel tick would defeat the
    // entire feature.
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focusin", onFocusIn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed, reveal, disarm]);

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
