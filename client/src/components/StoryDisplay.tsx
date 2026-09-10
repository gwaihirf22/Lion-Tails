import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Printer, Download, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useParentMode } from "@/hooks/use-parent-mode";
import { apiRequestAllowingErrors, queryClient } from "@/lib/queryClient";
import { splitAppendices } from "@shared/storyAppendices";
import { EDITED_BY_PARENT, lastEditedAt, type EditLogEntry } from "@shared/editLog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useReadingPrefs } from "@/hooks/use-reading-prefs";
import type { StoryRequest, StoryResponse } from "@shared/schema";
import { parseStoryContent, storyToPrintHtml } from "@/lib/storyContent";
import ReaderBar from "@/components/reader/ReaderBar";
import ReadingSurface from "@/components/reader/ReadingSurface";
import StoryExtras from "@/components/reader/StoryExtras";
import { useFocusMode } from "@/components/reader/useFocusMode";

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
  /** The page holds the story; a saved edit hands the new text back to it. */
  onEdited?: (next: { title: string; content: string; editLog: EditLogEntry[] }) => void;
}

export default function StoryDisplay({ story, storyId, storyType, builtIn, editLog, onEdited }: StoryDisplayProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  /**
   * A parent editing the title and text, in place.
   *
   * Gated on a saved row, not built-in, and Parent Mode ON -- which also
   * hides it on the ?data= path and the just-generated view, neither of
   * which has a row to PATCH. The Textarea holds the BODY only: the "About
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
  const canEdit = Boolean(storyId) && !builtIn && parentMode;
  const [busy, setBusy] = useState(false);
  const [showExpiryAlert, setShowExpiryAlert] = useState(true);
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

  const handlePrint = useCallback(() => {
    const w = window.open("", "_blank");
    if (!w) return;
    // Built from the PARSED document, with every text node escaped. This
    // replaces two separate `story.content.replace(/\n/g, '<br>')` calls that
    // wrote raw model output into the DOM -- one of them into a document that
    // was then handed to the printer.
    const body = storyToPrintHtml(doc, story.title, story.bibleVerse);
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
  }, [doc, story.title, story.bibleVerse]);

  const handleDownload = useCallback(() => {
    const text = [
      story.title,
      "",
      story.content,
      story.bibleVerse ? `\n"${story.bibleVerse.text}"\n— ${story.bibleVerse.reference}` : "",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `${story.title.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [story]);

  const startEdit = () => {
    setDraftTitle(story.title);
    setDraftBody(splitAppendices(story.content ?? "").body.trimEnd());
    setEditing(true);
  };

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
      toast({
        title: body.code === "parent_mode_required" ? "Parent Mode needed" : "Could not save",
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
    toast({ title: "Story saved", description: "Readers will see it was edited by a parent." });
  };

  const editedAt = lastEditedAt(editLog);
  const editedNote = editedAt
    ? `${EDITED_BY_PARENT} · ${new Date(editedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
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
      <ReaderBar focusArmed={focus.armed} onToggleFocus={focus.toggle} />

      {focus.armed && (
        <span className="sr-only" aria-live="polite">
          Focus mode on. Move the pointer to the top of the screen, or scroll up, to
          show the toolbar. Press Escape to exit.
        </span>
      )}

      <div className="reader-chrome mx-auto flex w-full max-w-3xl items-center gap-1 px-3">
        {!builtIn && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2 text-xs"
            disabled={busy || !storyId}
            onClick={handleToggleFavorite}
            aria-pressed={isFavorite}
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} aria-hidden="true" />
            {isFavorite ? "Favourited" : "Favourite"}
          </Button>
        )}
        {canEdit && !editing && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Save
        </Button>
      </div>

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
        <div className="reader-chrome mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
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
            The note about this story and any answers below it stay as they are.
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
        <ReadingSurface title={story.title} doc={doc} note={editedNote} />
      )}

      <StoryExtras story={story} storyId={storyId} doc={doc} focusHidden={focus.hidden} builtIn={builtIn} />
    </div>
  );
}
