import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import StoryDisplay from "@/components/StoryDisplay";
import { StoryResponse, StoryRequest } from "@shared/schema";
import type { EditLogEntry } from "@shared/editLog";
import { storyImagesOf, type StoryPicture } from "@shared/schema";
import { apiRequestAllowingErrors, queryClient } from "@/lib/queryClient";
import { UNSEEN_STORIES_KEY } from "@/lib/unseenStories";

export default function Story() {
  const [location, navigate] = useLocation();
  const [storyData, setStoryData] = useState<StoryResponse | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [storyType, setStoryType] = useState<StoryRequest["storyType"] | undefined>();
  // A story the app ships with. Nothing about it can be changed, so nothing
  // that changes a story is offered -- including "Continue this story", which
  // would create a universe named after the NEW story with no memory of this
  // one. The per-user quest universe is what will make continuing it mean
  // something; until then the button would promise what it cannot do.
  const [builtIn, setBuiltIn] = useState(false);
  // Both are on the payload and used to be discarded with the rest of the row.
  const [universeId, setUniverseId] = useState<string | null>(null);
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  // Every picture this story has had. Through storyImagesOf, so a story
  // illustrated before galleries existed still shows the one it has.
  const [images, setImages] = useState<StoryPicture[]>([]);

  useEffect(() => {
    // Scroll to the top of the page when component mounts
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get("id");
    const dataParam = urlParams.get("data");

    if (!idParam && !dataParam) {
      navigate("/");
      return;
    }
    if (idParam) setStoryId(idParam);

    // Fetch by id rather than reading the story out of the query string.
    // The old links serialised the ENTIRE story into the URL -- including
    // debugData, which holds every prompt and every raw model reply -- so
    // opening a story put all of it in the address bar, in history, and in any
    // proxy log along the way.
    //
    // dataParam is still honoured so links already in someone browser history
    // keep working, but nothing produces them any more.
    const load = async () => {
      if (idParam) {
        try {
          // Non-throwing: a story that is not found is a normal case here,
          // and we fall back rather than surfacing an error.
          const response = await apiRequestAllowingErrors("GET", `/api/stories/${idParam}`);
          if (response.ok) {
            const saved = await response.json();
            const s = saved.story ?? saved;
            setStoryData(s);
            setBuiltIn(Boolean(saved.builtIn));
            setUniverseId(saved.universeId ?? null);
            setEditLog(saved.editLog ?? []);
            setImages(storyImagesOf(saved));
            /**
             * They are looking at it, so the nav bubble should stop saying so.
             *
             * Fired here rather than on mount: this is the point at which a
             * real row came back, so a broken id or a story belonging to
             * somebody else never clears anything. Not awaited and never
             * surfaced -- a bubble that fails to clear must not interrupt
             * somebody reading.
             */
            if (saved.seenAt === null) {
              void apiRequestAllowingErrors("POST", `/api/stories/${idParam}/seen`)
                .then(() => queryClient.invalidateQueries({ queryKey: UNSEEN_STORIES_KEY }))
                .catch(() => {});
            }
            // s.storyType is set on stories generated after this shipped;
            // saved.request.storyType is present on every row that already
            // exists, which is why no backfill is needed. The parser's own
            // shape heuristic is the third fallback, for a ?data= link.
            setStoryType(s.storyType ?? saved.request?.storyType);
            return;
          }
        } catch (error) {
          console.error("Failed to load story:", error);
        }
      }
      if (dataParam) {
        try {
          setStoryData(JSON.parse(decodeURIComponent(dataParam)));
          return;
        } catch (error) {
          console.error("Failed to parse story data:", error);
        }
      }
      navigate("/");
    };
    void load();
  }, [navigate]);

  if (!storyData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-secondary"></div>
      </div>
    );
  }

  return (
    <div>
      {/* The buttons are direct children of the wrapping row. They used to sit
          in a space-x-3 div, and space-x-* only works on one line -- it puts a
          left margin on every child but the first, so a wrapped row got a
          stray indent. Bedtime Songs is gone; Music is in the nav. */}
      <div className="reader-chrome mx-auto mb-2 flex w-full max-w-3xl flex-wrap justify-end gap-2 px-3 pt-3">
        {/* Continuing is what creates a universe: the parent adopts one if it
          has none, so the user never has to set one up first. */}
        {storyId && !builtIn && (
          <Button onClick={() => navigate(`/generate-story?continues=${storyId}`)}>
            Continue this story
          </Button>
        )}
        {/* A story in a universe offers the universe, not a blank page:
            Continue carries this story's cast and outline forward; Add
            starts a fresh one written against the world's memory. */}
        {storyId && !builtIn && universeId ? (
          <Button variant="outline" onClick={() => navigate(`/generate-story?universe=${universeId}`)}>
            Add to this Universe
          </Button>
        ) : (
          <Button variant="outline" onClick={() => navigate("/generate-story")}>
            Create New Story
          </Button>
        )}
      </div>
      
      <StoryDisplay
        story={storyData}
        storyId={storyId || undefined}
        storyType={storyType}
        builtIn={builtIn}
        editLog={editLog}
        images={images}
        // The page owns the list, because two places change it: the picker in
        // the reading surface and the gallery strip in the extras. One piece
        // of state, or the strip and the text disagree about what exists.
        onPictures={setImages}
        onEdited={(next) => {
          setStoryData({ ...storyData, title: next.title, content: next.content });
          setEditLog(next.editLog);
        }}
      />
    </div>
  );
}
