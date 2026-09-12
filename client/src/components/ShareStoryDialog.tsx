import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Link2, Loader2, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ParentModeToggle from "@/components/ParentModeToggle";
import { useParentMode } from "@/hooks/use-parent-mode";
import { useToast } from "@/hooks/use-toast";
import { apiRequestAllowingErrors, queryClient } from "@/lib/queryClient";
import { sharePathFor } from "@shared/sharedStory";
import type { SavedStory } from "@shared/schema";

/**
 * Share a story by link, or stop.
 *
 * Blake: "a share story option which would create a link that would allow a
 * person to view the story without having an account."
 *
 * Three states, and the asymmetry between them is the design:
 *
 * 1. NOT SHARED, NO PARENT MODE -- says what sharing does and offers Parent
 *    Mode. The button is not hidden from a child; it asks for a grown-up.
 *    (The server enforces this with requireParentMode; this is the courtesy.)
 * 2. NOT SHARED, PARENT MODE -- says plainly who will be able to read it,
 *    including the names in it, and how long the link lasts. Create.
 * 3. SHARED -- the link, the phone's own share sheet, copy, and STOP, which
 *    needs nothing: making something private again is never gated.
 *
 * CONTROLLED, and it renders no trigger of its own. Two places open it -- the
 * reader's action row and a card in My Stories -- and the second one cannot
 * use a trigger that lives in here: StoryCard navigates on click, so its
 * dialog has to be a SIBLING of the card while its button sits inside it.
 * One dialog, two buttons, rather than a copy of this per place.
 */
export function ShareStoryDialog({
  storyId,
  title,
  open,
  onOpenChange,
}: {
  storyId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmStop, setConfirmStop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isActive: parentMode } = useParentMode();
  const { toast } = useToast();

  const shareKey = [`/api/stories/${storyId}/share`];
  const { data, isLoading } = useQuery<{ token: string | null }>({
    queryKey: shareKey,
    enabled: open,
  });
  const token = data?.token ?? null;
  const url = token ? `${window.location.origin}${sharePathFor(token)}` : "";

  // The same key StoryExtras reads, so this is normally already cached.
  const { data: saved } = useQuery<SavedStory>({
    queryKey: [`/api/stories/${storyId}`],
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequestAllowingErrors("POST", `/api/stories/${storyId}/share`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "The link could not be made.");
      return body as { token: string };
    },
    onSuccess: (body) => queryClient.setQueryData(shareKey, body),
    onError: (e: Error) =>
      toast({ title: "No link made", description: e.message, variant: "destructive" }),
  });

  const stop = useMutation({
    mutationFn: async () => {
      const res = await apiRequestAllowingErrors("DELETE", `/api/stories/${storyId}/share`);
      if (!res.ok) throw new Error("Sharing could not be stopped. Please try again.");
    },
    onSuccess: () => {
      setConfirmStop(false);
      queryClient.setQueryData(shareKey, { token: null });
      toast({ title: "No longer shared", description: "The link has stopped working." });
    },
    onError: (e: Error) =>
      toast({ title: "Still shared", description: e.message, variant: "destructive" }),
  });

  /**
   * Copy, with a fallback that works off https.
   *
   * navigator.clipboard exists only in a secure context. Production is https;
   * the dev server is plain http on the LAN, where it is undefined -- so the
   * old execCommand path is kept rather than a Copy button that does nothing.
   */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
    }
    toast({ title: "Link copied" });
  };

  // The phone's own share sheet -- Messages, WhatsApp, Mail -- where there is
  // one. Desktop browsers mostly have none, and get Copy alone.
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: `"${title}" — a story from Lion Tails`, url });
    } catch {
      // Dismissing the sheet rejects too; that is not an error to report.
    }
  };

  const keptUntil =
    saved && !saved.isFavorite && saved.expiresAt
      ? new Date(saved.expiresAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setConfirmStop(false);
      }}
    >
      <DialogContent className="top-[4vh] max-h-[92dvh] max-w-md translate-y-0 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share this story</DialogTitle>
          <DialogDescription>
            A link anyone can open to read &ldquo;{title}&rdquo; — no account needed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : token ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                readOnly
                value={url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {canNativeShare && (
                <Button type="button" size="sm" onClick={nativeShare}>
                  <Share2 className="mr-1 h-4 w-4" aria-hidden="true" /> Share…
                </Button>
              )}
              <Button type="button" size="sm" variant={canNativeShare ? "outline" : "default"} onClick={copy}>
                <Copy className="mr-1 h-4 w-4" aria-hidden="true" /> Copy link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can read the story, including the names in it.
              {keptUntil && ` It works until ${keptUntil}, when the story is due to be cleared — favourite it to keep it for good.`}
            </p>

            {/* Stopping is never gated, and asks once. */}
            <div className="border-t pt-3">
              {confirmStop ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    Stop sharing? The link stops working straight away. If you share
                    again later, it will be a new link.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setConfirmStop(false)}>
                      Keep sharing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={stop.isPending}
                      onClick={() => stop.mutate()}
                    >
                      {stop.isPending ? "Stopping…" : "Stop sharing"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" size="sm" variant="ghost" className="px-0 text-destructive" onClick={() => setConfirmStop(true)}>
                  Stop sharing
                </Button>
              )}
            </div>
          </div>
        ) : parentMode ? (
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Anyone you send the link to can read this story, without an account.</li>
              <li>They will see the names in it. Nothing else about you or your characters is shared.</li>
              <li>You can stop sharing at any time, and the link stops working straight away.</li>
              {keptUntil && (
                <li>
                  The link lasts as long as the story, which is kept until {keptUntil}.
                  Favourite it to keep both for good.
                </li>
              )}
            </ul>
            <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Create link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Making a link needs a grown-up. Turn on Parent Mode, then come back here.
            </p>
            <ParentModeToggle />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ShareStoryDialog;
