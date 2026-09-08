import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Printer, Download } from "lucide-react";
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
}

export default function StoryDisplay({ story, storyId, storyType }: StoryDisplayProps) {
  const [isFavorite, setIsFavorite] = useState(false);
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
          Focus mode on. Press Escape to exit.
        </span>
      )}

      <div className="reader-chrome mx-auto flex w-full max-w-3xl items-center gap-1 px-3">
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
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Save
        </Button>
      </div>

      {showExpiryAlert && storyId && !isFavorite && (
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

      <ReadingSurface title={story.title} doc={doc} />

      <StoryExtras story={story} storyId={storyId} doc={doc} focusHidden={focus.hidden} />
    </div>
  );
}
