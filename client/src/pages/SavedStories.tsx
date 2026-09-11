import { useMemo, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useStoryJobs, describeJob } from "@/hooks/use-story-jobs";
import { useUniverses } from "@/hooks/use-universes";
import { useStories } from "@/hooks/use-stories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FOLDER_TAB_LIST, FOLDER_TAB_SCROLLER, FOLDER_TAB_TRIGGER } from "@/lib/folderTabs";
import { STORY_FOLDERS, storyFolder } from "@/lib/storyFolders";
import StoryCard from "@/components/StoryCard";
import { useChipSources } from "@/lib/useChipSources";
import { storyChips } from "@/lib/storyChips";
import UniverseSummaryCard from "@/components/UniverseSummaryCard";

/**
 * The library: four folders, every story as one card, every universe as one
 * card that opens its own page.
 *
 * Universes used to render here in full -- summary, editor, canon, world
 * memory, story list, delete -- on every tab, and the page was mostly
 * universe. Their stories rendered as bare titles inside them. Now every
 * folder that lists stories lists them FLAT, the same card each, with a
 * chip for the universe a story is in; the Universes folder is one compact
 * card per universe; and the universe's own page (/universes/:id) holds the
 * rest behind sections that open when asked.
 */
export default function SavedStories() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("all");
  const { jobs, cancel, dismiss, dismissed } = useStoryJobs();
  const { universes } = useUniverses();
  const chipSources = useChipSources();
  const { builtIn, stories, isLoading, isError, refetch, toggleFavorite, deleteStory } =
    useStories();

  // In-flight jobs, plus failures the user has not dismissed.
  const visibleJobs = jobs.filter(
    (j) =>
      !dismissed.includes(j.job_id) &&
      (j.status === "queued" || j.status === "running" || j.status === "failed"),
  );

  // Derived from the stories the library can see, never universe.storyCount:
  // the server counts every row, the library hides expired ones.
  const countByUniverse = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stories) {
      if (s.universeId) m.set(s.universeId, (m.get(s.universeId) ?? 0) + 1);
    }
    return m;
  }, [stories]);

  const universeName = (universeId?: string) =>
    universeId ? universes.find((u) => u.universeId === universeId)?.name : undefined;

  const busyUniverse = (universeId: string) =>
    jobs.some(
      (j) =>
        j.kind === "summary" &&
        j.universe_id === universeId &&
        (j.status === "queued" || j.status === "running"),
    );

  const folder = storyFolder(activeTab);
  // One predicate for the count on the tab and the cards under it.
  const listed = folder.filter ? stories.filter(folder.filter) : [];
  const pinned = folder.value === "timekeeper" ? builtIn : [];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* flex-wrap and a real gap, so the buttons drop to their own line
          rather than squeezing the heading into a column. Bedtime Songs is
          gone: Music is in the nav on every page, and the shortcut was the
          odd-sized one out. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 text-2xl md:text-3xl font-heading font-bold text-secondary">
          Your Saved Stories
        </h2>
        <Button onClick={() => navigate("/generate-story")}>Create New Story</Button>
      </div>

      {/* Jobs in flight and jobs that failed, above the library.
          A failed generation used to be invisible here -- the client either
          showed a canned error story as a success or lost the failure entirely
          when the user navigated away. Now the reason is on the page with a
          retry, per Blake's decision to make failures visible. */}
      {visibleJobs.length > 0 && (
        <div className="mb-6 space-y-3">
          {visibleJobs.map((job) => (
            <Card
              key={job.job_id}
              className={
                job.status === "failed"
                  ? "bg-destructive/5 border-destructive/30 rounded-xl"
                  : "bg-card rounded-xl"
              }
            >
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {job.status === "queued" || job.status === "running" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium">
                      {job.status === "failed"
                        ? "This story could not be written"
                        : describeJob(job)}
                    </p>
                    {job.status === "failed" && job.failure_message && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {job.failure_message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.model}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {(job.status === "queued" || job.status === "running") && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(job.job_id)}>
                      Cancel
                    </Button>
                  )}
                  {job.status === "failed" && (
                    <Button variant="ghost" size="sm" onClick={() => dismiss(job.job_id)}>
                      Dismiss
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card className="mb-4 bg-destructive/5 border-destructive/30 rounded-xl">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <p className="text-sm">Your stories could not be loaded.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* A brand-new account has no stories and one built-in; the folders
          render regardless, so the one story it was given is reachable. */}
      {stories.length === 0 && visibleJobs.length === 0 && !isError && (
        <Card className="mb-4 bg-card rounded-2xl shadow-lg">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-medium text-foreground mb-4">No Stories Yet</h3>
            <p className="text-muted-foreground mb-6">You haven't created any stories yet. Create your first personalized story now!</p>
            <Button onClick={() => navigate("/generate-story")}>Create Your First Story</Button>
          </CardContent>
        </Card>
      )}

      {/* Above the strip, not below: the open folder joins the surface
          directly beneath the strip, so nothing may sit between them. */}
      <Card className="mb-4 bg-card rounded-lg">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Note:</span> Stories are kept for a year. Favorite stories are kept for good.
          </p>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className={FOLDER_TAB_SCROLLER}>
          <TabsList className={FOLDER_TAB_LIST}>
            {STORY_FOLDERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className={cn(FOLDER_TAB_TRIGGER, f.tint, f.edge)}>
                {/* Slot for the lantern on the Timekeeper folder: an
                    <img className="mr-2 h-4 w-4"> before the label. */}
                {f.label} ({f.filter ? stories.filter(f.filter).length : universes.length})
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="pt-4">
          {folder.value === "universes" ? (
            <div className="grid gap-4">
              {universes.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-muted-foreground">
                    No universes yet. One is made for you when you continue a story.
                  </p>
                </Card>
              ) : (
                universes.map((u) => (
                  <UniverseSummaryCard
                    key={u.universeId}
                    universe={u}
                    storyCount={countByUniverse.get(u.universeId) ?? 0}
                    busy={busyUniverse(u.universeId)}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {pinned.map((s) => (
                <StoryCard key={s.id} story={s} onToggleFavorite={() => {}} onDelete={() => {}} />
              ))}
              {listed.length === 0 && pinned.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-muted-foreground">No stories in this folder.</p>
                </Card>
              ) : listed.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-muted-foreground">
                    No quests yet. Send a character on one from Create Story.
                  </p>
                </Card>
              ) : (
                listed.map((s) => (
                  <StoryCard
                    key={s.id}
                    story={s}
                    chips={storyChips(s, chipSources)}
                    universeName={universeName(s.universeId)}
                    onToggleFavorite={(id, isFavorite) => toggleFavorite.mutate({ id, isFavorite })}
                    onDelete={(id) => deleteStory.mutate(id)}
                  />
                ))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
