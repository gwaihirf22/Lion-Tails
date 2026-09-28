import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The last line under every page.
 *
 * Without one, a throw during render unmounts the whole tree and the app is
 * a blank screen with nothing to click -- which is exactly what the Heroes
 * page did when two hooks sat below an early return (eslint.config.js tells
 * that story; the Rules of Hooks lint is the FIRST line against it, and this
 * is the last). A parent at bedtime gets a sentence and a button rather than
 * a white rectangle.
 *
 * A class, because React only offers error boundaries as class components.
 * App.tsx keys it on the location so navigating away clears the error; a
 * boundary that stayed broken after the reader moved on would be a second
 * bug on top of the first.
 *
 * The card uses the design tokens only (the CI colour gate applies here as
 * everywhere), so it reads in all four palettes.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is the only log a browser has; the message is what a
    // parent would paste into a report.
    console.error("[render error]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex justify-center py-12" role="alert">
        <Card className="mx-4 w-full max-w-md">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <h1 className="text-xl font-semibold text-foreground">Something went wrong on this page</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Nothing you did caused it, and nothing is lost: your stories and characters are
                  kept on the server. Reloading usually puts it right.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => window.location.reload()}>
                Reload the page
              </Button>
              <Button type="button" variant="outline" onClick={() => window.location.assign("/")}>
                Go to the home page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
