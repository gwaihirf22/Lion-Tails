import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadTurnstile, type TurnstileApi } from "@/lib/turnstile";

/**
 * The "you are a person" check on the signup form.
 *
 * Invisible for nearly everyone: Cloudflare decides, and where it cannot it
 * shows a checkbox. The token it hands back is what the SERVER checks -- see
 * server/lib/turnstile.ts, which is the half that was missing for the old
 * question.
 *
 * THE CHALLENGE RUNS WHEN THE FORM IS SUBMITTED, NOT WHEN THE PAGE LOADS.
 * `execution: "execute"` renders a widget that waits to be asked, and
 * `execute()` asks it. Two reasons, and the second is the stronger one:
 *
 * - **A token is single-use and lasts about five minutes**, which is less than
 *   the time it takes to fill a form with a child on your knee. Minted on page
 *   load, a parent who stops halfway submits an expired token and is told to
 *   tick a box again for no visible reason (`timeout-or-duplicate` from
 *   siteverify). Minted at submit, that case cannot happen.
 * - **Cloudflare's dashboard warned that siteverify was not being called.** It
 *   was -- the logs carry its own error codes -- but a token was being issued
 *   for every visit to /auth while only a submitted one is ever validated, and
 *   issued-far-exceeding-validated reads exactly like a missing check.
 *
 * The cost is that a checkbox, where one is needed at all, now appears AFTER
 * the button is pressed. `before-interactive-callback` is what lets the form
 * say so rather than looking stuck.
 */
export type TurnstileHandle = {
  /**
   * Runs the challenge and resolves with a fresh single-use token.
   *
   * Rejects with a sentence fit to show a parent: the caller has nothing to
   * add and nothing else to do with it.
   */
  execute: () => Promise<string>;
};

/**
 * How long to wait when NOBODY IS BEING ASKED ANYTHING. A blocked or broken
 * widget must not leave the button saying "Checking..." for ever.
 */
const SILENT_WAIT_MS = 20_000;

/**
 * And how long once a checkbox is on screen, where the wait is a person
 * reading it. The deadline is EXTENDED rather than cancelled: Cloudflare's own
 * `timeout-callback` should get there first and says it better, but if it never
 * comes, a spinning button with no explanation is the one outcome this must not
 * have. Longer than Cloudflare's challenge timeout on purpose, so this is a
 * backstop and not the thing a parent normally hits.
 */
const INTERACTIVE_WAIT_MS = 180_000;

const CANNOT_CHECK =
  "We could not check that you are a person just now. Please try again in a moment.";

const TurnstileGate = forwardRef<
  TurnstileHandle,
  {
    siteKey: string;
    /** Which form this was: Cloudflare shows it in its own analytics. */
    action?: string;
  }
>(function TurnstileGate({ siteKey, action }, ref) {
  const box = useRef<HTMLDivElement | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * The rendered widget, as a promise.
   *
   * `execute()` can be called before the script has loaded -- somebody who
   * types quickly on a slow connection -- so it awaits this rather than
   * checking a ref and giving up.
   */
  const widget = useRef<Promise<{ api: TurnstileApi; id: string }> | undefined>(undefined);

  /** The `execute()` call currently waiting on a callback, if any. */
  const waiting = useRef<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null>(null);

  const settle = (outcome: { token: string } | { error: string }) => {
    const pending = waiting.current;
    if (!pending) return;
    waiting.current = null;
    if (pending.timer) clearTimeout(pending.timer);
    setInteractive(false);
    if ("token" in outcome) pending.resolve(outcome.token);
    else pending.reject(new Error(outcome.error));
  };

  useEffect(() => {
    let cancelled = false;
    let rendered: { api: TurnstileApi; id: string } | undefined;

    widget.current = loadTurnstile().then((api) => {
      if (cancelled || !box.current) throw new Error("Turnstile widget unmounted");
      const id = api.render(box.current, {
        sitekey: siteKey,
        execution: "execute",
        // Nothing is drawn unless Cloudflare wants a checkbox, so the form has
        // no empty space where an invisible widget would sit.
        appearance: "interaction-only",
        callback: (token) => settle({ token }),
        "expired-callback": () => settle({ error: CANNOT_CHECK }),
        "error-callback": () => settle({ error: CANNOT_CHECK }),
        "timeout-callback": () =>
          settle({ error: "That check timed out. Please press the button again." }),
        "unsupported-callback": () =>
          settle({
            error:
              "This browser cannot run the check that says you are a person. Please try a different browser.",
          }),
        "before-interactive-callback": () => {
          const pending = waiting.current;
          if (pending) {
            if (pending.timer) clearTimeout(pending.timer);
            pending.timer = setTimeout(
              () => settle({ error: "That check timed out. Please press the button again." }),
              INTERACTIVE_WAIT_MS,
            );
          }
          setInteractive(true);
        },
        "after-interactive-callback": () => setInteractive(false),
        theme: "auto",
        ...(action ? { action } : {}),
      });
      rendered = { api, id };
      return rendered;
    });

    // Nothing awaits the promise until a submit, so an unhandled rejection
    // would otherwise reach the console before anyone asks.
    widget.current.catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      settle({ error: CANNOT_CHECK });
      if (rendered) {
        try {
          rendered.api.remove(rendered.id);
        } catch {
          // Removing a widget the script has already torn down is not a
          // problem worth a console error on an unmount.
        }
      }
    };
  }, [siteKey, action]);

  useImperativeHandle(
    ref,
    () => ({
      execute: async () => {
        let ready: { api: TurnstileApi; id: string };
        try {
          ready = await (widget.current ?? Promise.reject(new Error("not mounted")));
        } catch {
          setFailed(true);
          throw new Error(CANNOT_CHECK);
        }

        // A token is single-use, so a second submit -- after a username clash,
        // say -- needs the widget back at its starting point before it can run
        // again. Harmless on the first press.
        try {
          ready.api.reset(ready.id);
        } catch {
          // A widget that will not reset is one `execute` is about to complain
          // about in a way the parent can act on.
        }

        return await new Promise<string>((resolve, reject) => {
          waiting.current = {
            resolve,
            reject,
            timer: setTimeout(() => settle({ error: CANNOT_CHECK }), SILENT_WAIT_MS),
          };
          try {
            ready.api.execute(ready.id, action ? { action } : undefined);
          } catch {
            settle({ error: CANNOT_CHECK });
          }
        });
      },
    }),
    [action],
  );

  return (
    <div className="space-y-2">
      <div ref={box} />
      {interactive && (
        <p className="m-0 text-sm text-muted-foreground">
          Please tick the box above to show you are a person, and your account will be created.
        </p>
      )}
      {failed && (
        <p className="m-0 text-sm text-destructive">
          We could not load the check that says you are a person. Reload the page and try again.
        </p>
      )}
    </div>
  );
});

export default TurnstileGate;
