import { requestPicture } from "@/lib/pictureRequest";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Star, Printer, Download, Pencil, ImagePlus, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useParentMode } from "@/hooks/use-parent-mode";
import { apiRequestAllowingErrors, queryClient } from "@/lib/queryClient";
import { splitAppendices } from "@shared/storyAppendices";
import { EDITED_LABEL, lastEditedAt, type EditLogEntry } from "@shared/editLog";
import ParentModeUnlockDialog from "@/components/ParentModeUnlockDialog";
import { ShareStoryDialog } from "@/components/ShareStoryDialog";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useReadingPrefs } from "@/hooks/use-reading-prefs";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { StoryRequest, StoryResponse, StoryPicture, StoryUsage } from "@shared/schema";
import { pictureOffer, type PictureSettings } from "@/lib/pictureSettings";
import { parseStoryContent, storyToPrintHtml } from "@/lib/storyContent";
import { AI_NOTE, AI_NOTE_TITLE } from "@shared/aiNote";
import type { Resource } from "@shared/furtherReading";
import ReaderBar from "@/components/reader/ReaderBar";
import ReadingSurface from "@/components/reader/ReadingSurface";
import StoryExtras from "@/components/reader/StoryExtras";
import { useFocusMode } from "@/components/reader/useFocusMode";
import { usePassagePicker } from "@/components/reader/usePassagePicker";
import PictureLightbox from "@/components/reader/PictureLightbox";

interface StoryDisplayProps {
  story: StoryResponse;
  storyId?: string;
  /**
   * What kind of thing the content is. Needed because a poem's line breaks are
   * single "\n" and prose paragraphs are "\n\n"; rendering one as the other
   * destroys it, and StoryResponse carried no way to tell them apart.
   */
  storyType?: StoryRequest["storyType"];
  /** Ships with the app: no favourite, no expiry, nothing to change. */
  builtIn?: boolean;
  /** What a parent changed by hand, for the line under the title. */
  editLog?: EditLogEntry[];
  /** Every picture this story has had; the chosen one is story.imageUrl. */
  images?: StoryPicture[];
  /** A picture was drawn or removed: the page re-reads the row. */
  onPictures?: (images: StoryPicture[]) => void;
  /** The page holds the story; a saved edit hands the new text back to it. */
  onEdited?: (next: { title: string; content: string; editLog: EditLogEntry[] }) => void;
  /**
   * Read through a share link, by someone who may have no account. With no
   * storyId almost every owner control already hides itself (the old ?data=
   * path); this hides the rest -- Favourite, and Share itself.
   */
  shared?: boolean;
  /** Derived by the server; see StoryExtras. */
  furtherReading?: Resource[];
}

export default function StoryDisplay({ story, storyId, storyType, builtIn, editLog, images, onEdited, onPictures, shared, furtherReading }: StoryDisplayProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  /**
   * Editing the title and text, in place.
   *
   * OFFERED on every story you own -- a saved row, not built-in, not a share
   * link -- whether Parent Mode is on or not. Stories are a first draft to
   * change, and a button that only exists after a trip to Settings told
   * nobody that. With Parent Mode off, Edit asks for the password right here
   * and then opens the editor; the PATCH still carries requireParentMode, so a
   * child on a shared device can read and not change. No storyId also hides it
   * on the ?data= path and the just-generated view, neither of which has a row
   * to PATCH. The Textarea holds the BODY only: the "About
   * this story" note and the "Digging deeper" answers live inside content,
   * and the server re-attaches them on save, so they cannot be edited away.
   * Only the reading surface is swapped; the bar and the extras stay
   * mounted so focus mode and the palette do not reset.
   */
  const { isActive: parentMode } = useParentMode();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = Boolean(storyId) && !builtIn && !shared;
  // What to do once the password is accepted: open the editor, or retry a
  // save whose Parent Mode lapsed mid-edit (the draft is kept either way).
  const [unlockThen, setUnlockThen] = useState<"edit" | "save" | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExpiryAlert, setShowExpiryAlert] = useState(true);
  // The share dialog is controlled from here now, because StoryCard opens the
  // same dialog from a button it has to own itself. See ShareStoryDialog.
  const [shareOpen, setShareOpen] = useState(false);
  const { toast } = useToast();
  const focus = useFocusMode();
  const { prefs } = useReadingPrefs();

  // The palette has to reach <body> as well as the article, or the page behind
  // the text stays white and Night is a dark rectangle on a bright ground.
  useEffect(() => {
    document.body.dataset.readerPage = "1";
    document.body.dataset.palette = prefs.palette;
    return () => {
      delete document.body.dataset.readerPage;
      delete document.body.dataset.palette;
    };
  }, [prefs.palette]);

  const isVerse = storyType === "poem" || story.storyType === "poem";

  // Parsed once here and shared by the surface, the extras and the print path.
  // Passing `verse` explicitly when we know it; the parser falls back to its
  // own shape heuristic when we do not, which is the case for a ?data= link.
  const doc = useMemo(
    () => parseStoryContent(story.content, isVerse ? { verse: true } : undefined),
    [story.content, isVerse],
  );

  /**
   * How many blocks are the STORY, as opposed to what the server appended.
   *
   * A second parse, of the body alone, rather than a change to the parser:
   * splitAppendices already knows where the disclaimer starts, and parsing
   * what it returns is the cheapest honest way to learn how many blocks come
   * before it. Memoised on the same key as the document itself.
   */
  const bodyBlocks = useMemo(
    () =>
      parseStoryContent(
        splitAppendices(story.content ?? "").body,
        isVerse ? { verse: true } : undefined,
      ).blocks.length,
    [story.content, isVerse],
  );

  const picker = usePassagePicker({ bodyBlocks });

  /**
   * How tall the reader bar ACTUALLY is, for the picking bar to stick below.
   *
   * It was a constant -- `top-12`, 48px, one row of buttons -- and on a phone
   * the bar wraps to two rows, about 100px, and sits in a higher layer. So the
   * picking bar stuck underneath it with its top half hidden: the quote cut
   * off mid-line and "Draw this" clipped (Blake, on an iPhone). Measured, it is
   * right at every width, text size and orientation.
   *
   * 48 until the first measurement, which is the old value, so nothing renders
   * differently for the frame before it arrives. A callback ref in state, not
   * useRef, so the observer attaches when the element exists rather than when
   * an effect happens to run.
   *
   * offsetHeight, which is unaffected by focus mode: that FADES the bar and
   * keeps its space ("fade, never collapse"), so the picking bar stays put
   * under an invisible bar rather than jumping up when the toolbar hides.
   */
  const [readerBar, setReaderBar] = useState<HTMLDivElement | null>(null);
  const [readerBarHeight, setReaderBarHeight] = useState(48);
  useEffect(() => {
    if (!readerBar) return;
    const measure = () => setReaderBarHeight(readerBar.offsetHeight || 48);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(readerBar);
    return () => ro.disconnect();
  }, [readerBar]);
  const [lightbox, setLightbox] = useState<StoryPicture | null>(null);

  // What a picture costs this account, and which model draws it. Derived by
  // the server from the same helpers it charges with, so a control is never
  // offered for something the server will refuse.
  const { data: modelInfo } = useQuery<{ pictures?: PictureSettings }>({
    queryKey: ["/api/settings/models"],
    enabled: Boolean(storyId) && !builtIn,
  });
  // The balance, so a button can say "3 credits, and you have 1" rather than
  // sending a request that will be refused.
  const { data: usage } = useQuery<StoryUsage>({
    queryKey: ["/api/story/usage"],
    enabled: Boolean(storyId) && !builtIn,
  });
  const offer = pictureOffer(modelInfo?.pictures, usage?.remaining);

  /**
   * Draw the highlighted passage.
   *
   * The same route the end-of-story picture uses -- one gate, one cap, one
   * gallery -- with a passage on it. The server writes the anchor; the client
   * never invents one.
   */
  /**
   * Whether there is anything to offer. Every condition the server enforces,
   * plus editing -- the reading surface is unmounted while a parent edits, so
   * there is no text to highlight.
   */
  const canPicture = Boolean(offer.offered && offer.affordable && !builtIn && storyId && !editing);

  const drawPassage = useMutation({
    // Through requestPicture: a picture takes minutes, the proxy gives up at
    // 100 seconds, and the server finishes anyway -- see pictureRequest.ts.
    mutationFn: async (passage: { text: string; blockIndex: number }) =>
      requestPicture(storyId!, { passage }, {
        onStillDrawing: () =>
          toast({
            title: "Still drawing…",
            description: "Pictures can take a few minutes. It will appear in the story when it is ready. Please don't press again.",
          }),
      }),
    onSuccess: (data) => {
      onPictures?.(data.images ?? []);
      queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      picker.cancel();
      toast({ title: "Picture added", description: "It is in the story, and in the gallery." });
    },
    onError: (error) => {
      toast({
        title: "Could not make a picture",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePrint = useCallback(() => {
    const w = window.open("", "_blank");
    if (!w) return;
    // Built from the PARSED document, with every text node escaped. This
    // replaces two separate `story.content.replace(/\n/g, '<br>')` calls that
    // wrote raw model output into the DOM -- one of them into a document that
    // was then handed to the printer.
    const body = storyToPrintHtml(doc, story.title, story.bibleVerse, {
      aiNote: !builtIn,
      furtherReading,
    });
    w.document.write(
      `<!DOCTYPE html><html><head><title></title><style>` +
        `body{font-family:Georgia,serif;line-height:1.6;color:#222;max-width:34em;margin:0 auto;padding:2rem}` +
        `h1{text-align:center;margin-bottom:2rem}` +
        `.verse{display:block}.scene-break{text-align:center}` +
        `blockquote{border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:1rem 0;font-style:italic;text-align:center}` +
        `cite{display:block;margin-top:.5rem;font-style:normal;font-size:.9em}` +
        `</style></head><body>${body}</body></html>`,
    );
    // The title is set as TEXT rather than interpolated into the markup above,
    // because a story title is model output too.
    w.document.title = story.title;
    w.document.close();
    w.print();
    w.onafterprint = () => w.close();
  }, [doc, story.title, story.bibleVerse, builtIn, furtherReading]);

  const handleDownload = useCallback(() => {
    const text = [
      story.title,
      "",
      story.content,
      story.bibleVerse ? `\n"${story.bibleVerse.text}"\n— ${story.bibleVerse.reference}` : "",
      builtIn ? "" : `\n${AI_NOTE_TITLE} ${AI_NOTE}`,
      furtherReading?.length
        ? `\nFurther reading:\n${furtherReading.map((r) => `- ${r.label}${r.url ? ` <${r.url}>` : ""}`).join("\n")}`
        : "",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `${story.title.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [story, builtIn, furtherReading]);

  const openEditor = () => {
    setDraftTitle(story.title);
    setDraftBody(splitAppendices(story.content ?? "").body.trimEnd());
    setEditing(true);
  };

  const startEdit = () => {
    if (parentMode) openEditor();
    else setUnlockThen("edit");
  };

  // The invitation at the end of the story opens the editor too, and the
  // editor replaces the text at the top: bring it into view.
  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [editing]);

  const saveEdit = async () => {
    if (!storyId) return;
    setSaving(true);
    const r = await apiRequestAllowingErrors("PATCH", `/api/stories/${storyId}`, {
      title: draftTitle,
      content: draftBody,
    });
    const body = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      if (body.code === "parent_mode_required") {
        setUnlockThen("save");
        return;
      }
      toast({
        title: "Could not save",
        description: body.message || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    onEdited?.({ title: body.story.title, content: body.story.content, editLog: body.editLog ?? [] });
    // The page holds the story; StoryExtras and the library read the query.
    queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    setEditing(false);
    toast({ title: "Story saved", description: "Your changes are in. The story is marked as edited." });
  };

  const editedAt = lastEditedAt(editLog);
  const editedNote = editedAt
    ? `${EDITED_LABEL} · ${new Date(editedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : undefined;

  const handleToggleFavorite = useCallback(async () => {
    if (!storyId) return;
    const next = !isFavorite;
    try {
      setBusy(true);
      // apiRequest throws on non-2xx, so reaching the next line means it worked.
      await apiRequest("PUT", `/api/stories/${storyId}/favorite`, { isFavorite: next });
      setIsFavorite(next);
      toast({
        title: next ? "Saved to favourites" : "Removed from favourites",
        description: next
          ? "This story will be kept permanently."
          : "This story will be removed after a year unless you favourite it again.",
      });
    } catch {
      toast({
        title: "Could not update",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [storyId, isFavorite, toast]);

  return (
    <div style={{ background: "var(--reader-bg)", color: "var(--reader-fg)" }}>
      {/* The picture control is in the bar because the bar comes with you
          down the page, and choosing a passage means scrolling to it. Passed
          as a prop rather than reached for: canIllustrate and the story's id
          are known here, and the bar has no business asking. */}
      <ReaderBar
        focusArmed={focus.armed}
        onToggleFocus={focus.toggle}
        picking={picker.picking}
        barRef={setReaderBar}
        onTogglePicture={
          canPicture ? (picker.picking ? picker.cancel : picker.start) : undefined
        }
        picturePrice={offer.price}
        pictureNote={offer.reason}
      />

      {focus.armed && (
        <span className="sr-only" aria-live="polite">
          Focus mode on. Move the pointer to the top of the screen, or scroll up, to
          show the toolbar. Press Escape to exit.
        </span>
      )}

      {/* flex-wrap: Share made this five buttons, which do not fit one line on
          a phone once Edit is showing too. */}
      <div
        data-guide="reader-actions"
        className="reader-chrome mx-auto flex w-full max-w-3xl flex-wrap items-center gap-1 px-3"
      >
        {!builtIn && !shared && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2 text-xs"
            disabled={busy || !storyId}
            onClick={handleToggleFavorite}
            aria-pressed={isFavorite}
            data-guide="favourite"
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} aria-hidden="true" />
            {isFavorite ? "Favourited" : "Favourite"}
          </Button>
        )}
        {canEdit && !editing && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={startEdit} data-guide="edit-story">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
          </Button>
        )}
        {/* A built-in story CAN be shared -- its link is permanent and the
            same for everyone. `shared` still excludes it: this is already the
            shared page, and offering to share it from there is a loop. */}
        {storyId && !shared && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={() => setShareOpen(true)} data-guide="share">
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={handlePrint} data-guide="print">
          <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Save
        </Button>
      </div>

      {/*
        THE PICKING BAR. Sticky, because choosing a passage means scrolling
        through the story, and a confirm button that scrolls away with the
        toolbar is one you have to hunt for with a highlight already made --
        and any tap that misses it clears the selection.

        NOT .reader-chrome: focus mode fades that to nothing, and a reader who
        armed focus mode mid-highlight would lose the bar and the only way to
        cancel with it.
      */}
      {picker.picking && (
        <div
          data-guide="reader-picking"
          className="sticky z-20 mx-auto mt-2 w-full max-w-3xl rounded-md border px-3 py-2"
          style={{
            top: readerBarHeight,
            borderColor: "var(--reader-border)",
            background: "var(--reader-surface)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm">
              {picker.refused ? (
                <span className="text-destructive">{picker.refused}</span>
              ) : picker.passage ? (
                <>
                  <span className="opacity-70">Draw this: </span>
                  <span className="italic">
                    &ldquo;{picker.passage.text.slice(0, 90)}
                    {picker.passage.text.length > 90 ? "…" : ""}&rdquo;
                  </span>
                </>
              ) : (
                "Highlight the part of the story you want a picture of."
              )}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                className="h-8 gap-1 px-3 text-xs"
                disabled={!picker.passage || drawPassage.isPending}
                onClick={() => picker.passage && drawPassage.mutate(picker.passage)}
                data-guide="picking"
              >
                {drawPassage.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Painting…
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Draw this
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label="Stop choosing a passage"
                onClick={picker.cancel}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {storyId && !shared && (
        <ShareStoryDialog
          storyId={storyId}
          title={story.title}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      {showExpiryAlert && storyId && !isFavorite && !builtIn && (
        <Alert
          className="reader-chrome mx-auto mt-2 w-full max-w-3xl"
          style={{ borderColor: "var(--reader-border)", background: "var(--reader-surface)" }}
        >
          <AlertDescription className="flex items-center justify-between gap-3 text-sm">
            <span>Stories are kept for a year. Favourite this one to keep it for good.</span>
            <button className="shrink-0 underline" onClick={() => setShowExpiryAlert(false)}>
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {editing ? (
        <div ref={editorRef} className="reader-chrome mx-auto w-full max-w-3xl scroll-mt-24 space-y-3 px-3 py-4">
          <Input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            aria-label="Title"
            className="text-lg font-semibold"
          />
          <Textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            aria-label="Story text"
            className="min-h-[60vh] text-base leading-relaxed"
          />
          <p className="text-xs" style={{ color: "var(--reader-muted)" }}>
            Change anything you like. The note about this story and any answers below it stay as they are.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={saving || !draftTitle.trim() || !draftBody.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <ReadingSurface
          title={story.title}
          doc={doc}
          note={editedNote}
          pictures={images}
          bodyBlocks={bodyBlocks}
          onOpenPicture={setLightbox}
        />
      )}

      <PictureLightbox picture={lightbox} onClose={() => setLightbox(null)} />

      <StoryExtras
        story={story}
        storyId={storyId}
        doc={doc}
        focusHidden={focus.hidden}
        builtIn={builtIn}
        images={images}
        onPictures={onPictures}
        furtherReading={furtherReading}
        onEdit={canEdit && !editing ? startEdit : undefined}
        onOpenPicture={setLightbox}
      />

      {canEdit && (
        <ParentModeUnlockDialog
          open={unlockThen !== null}
          onOpenChange={(open) => {
            if (!open) setUnlockThen(null);
          }}
          reason={
            unlockThen === "save"
              ? "Parent Mode turned off while you were editing. Your changes are still here."
              : "Editing asks for your password, so a child on this device can read without changing anything."
          }
          onUnlocked={() => {
            const then = unlockThen;
            setUnlockThen(null);
            if (then === "save") void saveEdit();
            else openEditor();
          }}
        />
      )}
    </div>
  );
}
