import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useStoryJobs, describeJob } from "@/hooks/use-story-jobs";
import { useUniverses } from "@/hooks/use-universes";
import UniverseCard from "@/components/UniverseCard";
import { useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { SavedStory } from "@shared/schema";
import { QUEST_SERIES_TITLE, isTimekeeperStory } from "@shared/quests";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

export default function SavedStories() {
  const [, navigate] = useLocation();
  const [stories, setStories] = useState<SavedStory[]>([]);
  // What the app ships with, kept apart from the user's own: it is pinned
  // above the tabs, never counted, and has no favourite or delete. Unassigned
  // stories render LAST, after the universes, so a list position would bury
  // the one story every library begins with.
  const [builtIn, setBuiltIn] = useState<SavedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();
  const { jobs, lastCompletedAt, cancel, dismiss, dismissed } = useStoryJobs();
  const {
    universes,
    makeSummary,
    editSummary,
    addCanon,
    removeCanon,
    remove: removeUniverse,
    moveStory,
  } = useUniverses();

  // In-flight jobs, plus failures the user has not dismissed.
  const visibleJobs = jobs.filter(
    (j) =>
      !dismissed.includes(j.job_id) &&
      (j.status === "queued" || j.status === "running" || j.status === "failed"),
  );

  // Fetch all stories
  useEffect(() => {
    // Scroll to the top of the page when component mounts
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    const fetchStories = async () => {
      try {
        setLoading(true);
        const response = await apiRequest('GET', '/api/stories');
        const data: SavedStory[] = await response.json();
        setBuiltIn(data.filter((s) => s.builtIn));
        setStories(data.filter((s) => !s.builtIn));
      } catch (error) {
        console.error('Error fetching stories:', error);
        toast({
          title: "Error",
          description: "Failed to load your stories. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStories();
    // lastCompletedAt changes when any job reaches a terminal state, so a story
    // finished in another tab -- or while this page was open -- appears without
    // a manual refresh. One dependency; deliberately not a TanStack Query
    // rewrite, which is a worthwhile refactor and not needed here.
  }, [toast, lastCompletedAt]);

  // Handle toggling favorite
  const handleToggleFavorite = async (id: string, isFavorite: boolean) => {
    try {
      const response = await apiRequest('PUT', `/api/stories/${id}/favorite`, { isFavorite });
      
      if (response.ok) {
        const updatedStory = await response.json();
        
        setStories(prevStories => 
          prevStories.map(story => 
            story.id === id ? updatedStory : story
          )
        );
        
        toast({
          title: isFavorite ? "Story Favorited" : "Removed from Favorites",
          description: isFavorite 
            ? "This story will be saved permanently." 
            : "This story will be automatically deleted after one year if not favorited again.",
        });
      }
    } catch (error) {
      console.error('Error updating favorite status:', error);
      toast({
        title: "Error",
        description: "Failed to update favorite status. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle story deletion
  const handleDeleteStory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this story? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiRequest('DELETE', `/api/stories/${id}`);
      
      if (response.ok) {
        setStories(prevStories => prevStories.filter(story => story.id !== id));
        
        toast({
          title: "Story Deleted",
          description: "The story has been successfully deleted.",
        });
      }
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: "Error",
        description: "Failed to delete the story. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Whole-card click. Modified clicks are left alone so the browser's own
  // open-in-new-tab / new-window behaviour on the title link is not doubled up
  // by a navigation here -- wouter's Link bails out before its onClick on those
  // same modifiers, so nothing else stops the event reaching this handler.
  const handleCardClick = (
    e: React.MouseEvent,
    story: SavedStory,
  ) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button !== 0) return;
    handleViewStory(story);
  };

  // View a specific story
  const handleViewStory = (story: SavedStory) => {
    // Id only. This used to serialise the whole story -- prompts and raw
    // model replies included -- into the address bar on every click.
    navigate(`/story?id=${story.id}`);
  };

  // Filter stories based on active tab. A switch WITH a default: this was a
  // chained ternary whose last arm was "temporary", so a tab it had not heard
  // of silently showed the temporary list.
  const filteredStories = (() => {
    switch (activeTab) {
      case "timekeeper": return stories.filter(isTimekeeperStory);
      case "favorites": return stories.filter((story) => story.isFavorite);
      case "temporary": return stories.filter((story) => !story.isFavorite);
      default: return stories;
    }
  })();

  // Grouped by universe, with Unassigned last. Every existing story starts
  // unassigned, so that group is the normal case rather than an edge case.
  const byUniverse = new Map<string, typeof filteredStories>();
  const unassigned: typeof filteredStories = [];
  for (const story of filteredStories) {
    const uid = (story as { universeId?: string }).universeId;
    if (!uid) { unassigned.push(story); continue; }
    if (!byUniverse.has(uid)) byUniverse.set(uid, []);
    byUniverse.get(uid)!.push(story);
  }

  // A running summary job, per universe, so the card can show progress and
  // disable its button from the same fact the server used.
  const summaryJobFor = (universeId: string) =>
    jobs.find(
      (j) =>
        j.kind === "summary" &&
        j.universe_id === universeId &&
        (j.status === "queued" || j.status === "running"),
    );

  const handleMakeSummary = async (universeId: string, force = false) => {
    const r = await makeSummary(universeId, force);
    if (!r.ok) {
      toast({
        title: r.code === "parent_mode_required" ? "Parent Mode needed" : "Could not start",
        description: r.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Writing the summary",
      description:
        r.droppedCount > 0
          ? `Reading the ${r.coveredCount} most recent stories in full; ${r.droppedCount} earlier ones are covered by the previous summary.`
          : `Reading ${r.coveredCount} ${r.coveredCount === 1 ? "story" : "stories"}.`,
    });
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-3xl font-heading font-bold text-secondary">Your Saved Stories</h2>
        <div>
          <Button onClick={() => navigate("/generate-story")} className="mr-2">
            Create New Story
          </Button>
          <Button variant="outline" onClick={() => navigate("/music")}>
            Bedtime Songs
          </Button>
        </div>
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

      {stories.length === 0 && visibleJobs.length === 0 && (
        <Card className="bg-card rounded-2xl shadow-lg">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-medium text-foreground mb-4">No Stories Yet</h3>
            <p className="text-muted-foreground mb-6">You haven't created any stories yet. Create your first personalized story now!</p>
            <Button onClick={() => navigate("/generate-story")}>Create Your First Story</Button>
          </CardContent>
        </Card>
      )}

      {(
        <>
          <Card className="mb-4 bg-card rounded-lg">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold">Note:</span> Stories are automatically saved for one year. Favorite stories are kept indefinitely.
              </p>
            </CardContent>
          </Card>

          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Stories ({stories.length})</TabsTrigger>
              {/* Slot for the lantern: an <img className="mr-2 h-4 w-4"> before
                  the label, when the file is in the repo. */}
              <TabsTrigger value="timekeeper">
                Timekeeper ({stories.filter(isTimekeeperStory).length})
              </TabsTrigger>
              <TabsTrigger value="favorites">Favorites ({stories.filter(s => s.isFavorite).length})</TabsTrigger>
              <TabsTrigger value="temporary">Temporary ({stories.filter(s => !s.isFavorite).length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab}>
              {/* What the app ships with, pinned first in the series' own tab.
                  Never counted, no favourite, no delete. */}
              {activeTab === "timekeeper" &&
                builtIn.map((s) => (
                  <Card
                    key={s.id}
                    className="mb-6 bg-card overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer"
                    onClick={() => navigate(`/story?id=${s.id}`)}
                  >
                    <CardContent className="p-5">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {QUEST_SERIES_TITLE}
                      </p>
                      <h3 className="text-xl font-bold text-primary mb-1">
                        <Link
                          href={`/story?id=${s.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {s.story.title}
                        </Link>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Where every library begins. It is always here.
                      </p>
                    </CardContent>
                  </Card>
                ))}

              {universes.map((u) => {
                const inThis = byUniverse.get(u.universeId) ?? [];
                // On a filtered tab a universe with nothing in it is noise --
                // and on the Timekeeper tab it was every universe, each saying
                // "No stories in this universe yet". All still lists them all.
                if (activeTab !== "all" && inThis.length === 0) return null;
                const busy = Boolean(summaryJobFor(u.universeId));
                return (
                  <UniverseCard
                    key={u.universeId}
                    universe={u}
                    storyCount={inThis.length}
                    busy={busy}
                    onMakeSummary={(force) => handleMakeSummary(u.universeId, force)}
                    onEditSummary={(text) => editSummary(u.universeId, text)}
                    onAddCanon={(text) => addCanon(u.universeId, text)}
                    onRemoveCanon={(id) => removeCanon(u.universeId, id)}
                    onDelete={() => removeUniverse(u.universeId)}
                  >
                    <div className="space-y-2">
                      {inThis.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No stories in this universe yet.
                        </p>
                      )}
                      {inThis.map((st) => (
                        <div key={st.id} className="flex items-center justify-between gap-2 text-sm">
                          <Link
                            href={`/story?id=${st.id}`}
                            className="text-left flex-1 hover:underline"
                          >
                            {st.story.title}
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => moveStory(st.id, null)}
                          >
                            remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </UniverseCard>
                );
              })}

              {universes.length > 0 && unassigned.length > 0 && (
                <h3 className="text-lg font-heading font-bold text-secondary mt-6 mb-2">
                  Not in a universe
                </h3>
              )}

              <div className="grid gap-4">
                {filteredStories.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-muted-foreground">
                      {activeTab === "timekeeper"
                        ? "No quests yet. Send a character on one from Create Story."
                        : "No stories in this category."}
                    </p>
                  </Card>
                ) : (
                  unassigned.map((savedStory) => (
                    <Card
                      key={savedStory.id}
                      className="bg-card overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer"
                      onClick={(e) => handleCardClick(e, savedStory)}
                    >
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-primary mb-1 line-clamp-1">
                              <Link
                                href={`/story?id=${savedStory.id}`}
                                className="hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {savedStory.story.title}
                              </Link>
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground">
                                Created {formatDistanceToNow(new Date(savedStory.createdAt))} ago
                              </span>
                              {savedStory.isFavorite ? (
                                <Badge variant="secondary" className="bg-warning-surface text-warning hover:bg-warning-surface">
                                  Favorite
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Temporary
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className={savedStory.isFavorite ? "text-warning hover:text-warning" : "text-muted-foreground hover:text-warning"}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(savedStory.id, !savedStory.isFavorite);
                              }}
                              title={savedStory.isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              {savedStory.isFavorite ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              )}
                            </Button>
                            <Button 
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStory(savedStory.id);
                              }}
                              title="Delete story"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </Button>
                          </div>
                        </div>
                        
                        <Separator className="my-3" />
                        
                        <div className="flex flex-col md:flex-row justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-1">Story details:</div>
                            <div className="flex flex-wrap gap-2">
                              {savedStory.request.childName && (
                                <Badge variant="outline" className="bg-primary/10">
                                  {savedStory.request.childName}
                                </Badge>
                              )}
                              {/* Guarded, for the same reason as the animal
                                  badge below: this was `gender === 'boy' ? 'Boy'
                                  : 'Girl'`, so every story that never had a
                                  gender -- every retelling, and every story told
                                  about a saved character -- was labelled "Girl". */}
                              {savedStory.request.gender && (
                                <Badge variant="outline" className="bg-primary/10">
                                  {savedStory.request.gender === 'boy' ? 'Boy' : 'Girl'}
                                </Badge>
                              )}
                              {/* Guarded: the form wrote the literal string
                                  "none" to mean no animal, so this rendered a
                                  badge reading "none" on most saved stories. */}
                              {savedStory.request.animal &&
                                !["none", "n/a"].includes(savedStory.request.animal.trim().toLowerCase()) && (
                                  <Badge variant="outline" className="bg-primary/10">
                                    {savedStory.request.animal}
                                  </Badge>
                                )}
                              <Badge variant="outline" className="bg-primary/10">
                                {savedStory.request.theme}
                              </Badge>
                            </div>
                          </div>
                          
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewStory(savedStory);
                            }}
                          >
                            Read Story
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}