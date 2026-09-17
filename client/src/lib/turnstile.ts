/**
 * Loading Cloudflare's widget script, once.
 *
 * THE FIRST THIRD-PARTY SCRIPT THIS APP HAS EVER LOADED. Everything else in
 * `client/` is bundled; `index.html` has exactly one `<script>` and it is the
 * app's own entry. That is worth knowing before adding another: this one comes
 * from the company already proxying the domain, it is loaded ON DEMAND (only
 * when the signup form asks for it, never on a story page), and there is no
 * CSP anywhere in the app or in SWAG to amend.
 *
 * `render: "explicit"` rather than Cloudflare's automatic scan: the form is a
 * React tree that mounts and unmounts, and an implicit scan would race it.
 */
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__turnstileReady";
const SCRIPT_ID = "cf-turnstile";

export type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      action?: string;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileReady?: () => void;
  }
}

let loading: Promise<TurnstileApi> | undefined;

/**
 * The api object, once the script says it is ready.
 *
 * Cached as a PROMISE, so two mounted widgets (or a remount) share one script
 * tag and one wait. Rejects rather than hanging for ever if the script cannot
 * be fetched -- the caller turns that into "we could not check just now",
 * which is the same fail-closed answer the server gives.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    window.__turnstileReady = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded without an api"));
    };
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      // Let a later attempt try again: a blocked or flaky first load should
      // not poison the page for as long as it stays open.
      loading = undefined;
      script.remove();
      reject(new Error("Turnstile script could not be loaded"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
