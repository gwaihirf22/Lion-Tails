import { useEffect, useRef, useState } from "react";
import { loadTurnstile, type TurnstileApi } from "@/lib/turnstile";

/**
 * The "you are a person" check on the signup and reset forms.
 *
 * Invisible for nearly everyone: Cloudflare decides, and where it cannot it
 * shows a checkbox. The token it hands back is what the SERVER checks — see
 * server/lib/turnstile.ts, which is the half that was missing for the old
 * question.
 *
 * A TOKEN IS SINGLE-USE AND LASTS FIVE MINUTES, which is less than the time it
 * takes to fill a form with a child on your knee. So an expiry hands back an
 * empty string rather than leaving a stale one in the form: the submit button
 * is gated on having a token, so the form goes back to waiting and the widget
 * offers a fresh one. Sending the stale one would have been a refusal the
 * parent could not explain.
 */
export default function TurnstileGate({
  siteKey,
  onToken,
  action,
}: {
  siteKey: string;
  /** A token, or "" when there is no longer a usable one. */
  onToken: (token: string) => void;
  /** Which form this was: Cloudflare shows it in its own analytics. */
  action?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const api = useRef<TurnstileApi | undefined>(undefined);
  // Kept in a ref so a new callback identity cannot re-render the widget and
  // throw away a token the parent has already been given.
  const hand = useRef(onToken);
  hand.current = onToken;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;

    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !box.current) return;
        api.current = loaded;
        widgetId = loaded.render(box.current, {
          sitekey: siteKey,
          callback: (token) => hand.current(token),
          "expired-callback": () => hand.current(""),
          "error-callback": () => {
            hand.current("");
            setFailed(true);
          },
          theme: "auto",
          ...(action ? { action } : {}),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      hand.current("");
      if (widgetId && api.current) {
        try {
          api.current.remove(widgetId);
        } catch {
          // Removing a widget the script has already torn down is not a
          // problem worth a console error on an unmount.
        }
      }
    };
  }, [siteKey, action]);

  return (
    <div className="space-y-2">
      <div ref={box} />
      {failed && (
        <p className="m-0 text-sm text-destructive">
          We could not load the check that says you are a person. Reload the page and try again.
        </p>
      )}
    </div>
  );
}
