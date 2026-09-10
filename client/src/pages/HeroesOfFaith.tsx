import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { HeroOfFaith, HeroStory, SavedStory } from '@shared/schema';
import { 
  Loader2, 
  Info, 
  Quote, 
  Book, 
  Calendar, 
  Link2, 
  FileText, 
  ExternalLink, 
  Star,
  History,
  ListTodo,
  BookOpen,
  Search,
} from 'lucide-react';
import { Link } from 'wouter';
import { Input } from "@/components/ui/input";
import {
  groupLabel,
  livedLabel,
  HERO_GROUPS,
  BIBLE_GROUPS,
  HERO_COLLECTIONS,
  HERO_COLLECTION_LABELS,

  type HeroCollection,
} from "@shared/schema";

/**
 * Hand a hero over to the story generator.
 *
 * Three buttons on this page did this, in three identical copies of the same
 * two lines. The key is read once on the other side, by the tabs component,
 * which takes it and opens the historical tab -- see StoryGeneratorTabs.
 *
 * localStorage rather than a query parameter because the navigation is a full
 * page load, and this predates it; worth revisiting, but not while the read
 * side is being fixed.
 */
function tellStoryAbout(heroId: string) {
  localStorage.setItem("selectedHeroOfFaith", heroId);
  window.location.href = "/generate-story";
}

export default function HeroesOfFaith() {
  const { toast } = useToast();
  
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  const [collection, setCollection] = useState<HeroCollection>("historical");
  const [query, setQuery] = useState("");
  // A plain string: the value comes from whichever collection is in view,
  // so it cannot be typed as one collection's era union.
  const [group, setGroup] = useState<string>("all");
  const [selectedHero, setSelectedHero] = useState<HeroOfFaith | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  // Query to fetch all heroes
  const { data: heroes, isLoading, error } = useQuery({
    queryKey: ['/api/heroes'],
    queryFn: getQueryFn<HeroOfFaith[]>({ on401: 'returnNull' })
  });

  // Query to fetch stories for a specific hero when one is selected
  const { data: heroStoriesData, isLoading: isLoadingStories } = useQuery({
    queryKey: ['/api/heroes', selectedHero?.id, 'stories'],
    queryFn: selectedHero ? 
      getQueryFn<{heroStories: HeroStory[], userStories: SavedStory[]}>({ on401: 'returnNull' }) : 
      () => Promise.resolve({heroStories: [], userStories: []}),
    enabled: !!selectedHero,
  });
  
  // Combine both types of stories for display
  const heroStories = useMemo(() => {
    if (!heroStoriesData) return [];
    const { heroStories = [], userStories = [] } = heroStoriesData;
    
    // Convert any user stories to the HeroStory format for display
    const convertedUserStories: HeroStory[] = userStories.map(story => ({
      id: story.id,
      heroId: selectedHero?.id || "",
      title: story.story.title,
      content: story.story.content,
      isHistoricallyAccurate: story.searchMetadata?.tags?.includes("historical") || false,
      // StoryResponse.bibleVerse is optional but HeroStory requires it, so a
      // saved story without one gets a placeholder rather than rendering
      // `undefined.reference`.
      bibleVerse: story.story.bibleVerse ?? { text: "", reference: "" },
      isFeatured: story.isFavorite || false,
      createdAt: story.createdAt,
      createdBy: undefined,
      sources: [{ title: "User Generated Story" }]
    }));
    
    // Combine and sort by creation date (newest first)
    return [...heroStories, ...convertedUserStories].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [heroStoriesData, selectedHero]);

  // Function to open hero details dialog
  const openHeroDetails = (hero: HeroOfFaith) => {
    setSelectedHero(hero);
    setOpenDialog(true);
  };

  // Function to generate a random color for hero avatars
  const getRandomColor = (heroName: string): string => {
    const colors = [
      'bg-destructive/10', 'bg-muted', 'bg-success-surface', 'bg-warning-surface', 
      'bg-muted', 'bg-muted', 'bg-muted', 'bg-warning-surface'
    ];
    const index = Math.abs(heroName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    return colors[index];
  };

  // Function to get hero initials for avatar fallback
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Searching the whole profile, not just the name. Someone looking for
  // "martyr" or "translated the Bible" is asking a real question, and a filter
  // that only matches names cannot answer it. The list is small enough to hold
  // in memory, so this is instant and needs no round trip.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (heroes ?? []).filter((h: HeroOfFaith) => {
      if ((h.collection ?? "historical") !== collection) return false;
      if (group !== "all" && h.group !== group) return false;
      if (!q) return true;
      const haystack = [
        h.name,
        h.description,
        h.contribution,
        h.biography ?? "",
        h.place ?? "",
        h.timePeriod,
        h.famousQuote ?? "",
        ...(h.tags ?? []),
        ...(h.keyEvents ?? []).map((e) => `${e.year} ${e.description}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [heroes, query, group, collection]);

  // Only offer an era chip if somebody in that era actually exists, so the
  // filter never returns an empty list for a group nobody has written yet.
  const availableGroups = useMemo(() => {
    const order: readonly string[] = collection === "biblical" ? BIBLE_GROUPS : HERO_GROUPS;
    return order.filter((g) =>
      (heroes ?? []).some(
        (h: HeroOfFaith) => (h.collection ?? "historical") === collection && h.group === g,
      ),
    );
  }, [heroes, collection]);

  const countIn = (c: HeroCollection) =>
    (heroes ?? []).filter((h: HeroOfFaith) => (h.collection ?? "historical") === c).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading Heroes of Faith...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-destructive">Failed to load Heroes of Faith. Please try again.</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Heroes of Faith</h1>
        <p className="text-muted-foreground max-w-3xl mx-auto">
          Explore the lives and legacies of remarkable Christians throughout history who demonstrated 
          extraordinary faith and made significant contributions to Christianity and society.
        </p>
      </div>

      <div className="mx-auto mb-6 max-w-3xl space-y-3">
        {/* Two lists, not one. People in Scripture and people from church
            history are different kinds of subject, and putting them in a
            single alphabetical run would quietly suggest otherwise. */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
          {HERO_COLLECTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCollection(c);
                // An era from the other collection would match nothing.
                setGroup("all");
              }}
              aria-pressed={collection === c}
              className={`rounded-md px-3 py-2 text-sm transition ${
                collection === c
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "hover:bg-muted"
              }`}
            >
              {HERO_COLLECTION_LABELS[c]}
              <span className="ml-2 opacity-70">{countIn(c)}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, place, era, or anything in their story"
            className="pl-9"
            aria-label="Search Heroes of Faith"
          />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            variant={group === "all" ? "default" : "outline"}
            onClick={() => setGroup("all")}
          >
            All
          </Button>
          {availableGroups.map((g) => (
            <Button
              key={g}
              size="sm"
              variant={group === g ? "default" : "outline"}
              onClick={() => setGroup(g)}
            >
              {groupLabel(g)}
            </Button>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {filtered.length} of {countIn(collection)}
          {query && ` matching "${query}"`}
        </p>
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          Nobody matches that yet. Try a different word, or clear the filters.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(hero => (
          <Card key={hero.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-12 w-12 border">
                    <AvatarImage src={hero.imageUrl} alt={hero.name} />
                    <AvatarFallback>{getInitials(hero.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-xl">{hero.name}</CardTitle>
                    <CardDescription>
                      {hero.timePeriod}
                      {hero.group ? ` · ${groupLabel(hero.group)}` : ""}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm line-clamp-3 mb-2">{hero.description}</p>
              {livedLabel(hero) && (
                <Badge variant="outline" className="text-xs">{livedLabel(hero)}</Badge>
              )}
            </CardContent>
            <CardFooter className="pt-1 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openHeroDetails(hero)}>
                Learn More
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => {
                  tellStoryAbout(hero.id);
                }}
              >
                Create Story
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Hero Detail Dialog */}
      {selectedHero && (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                {selectedHero.name}
              </DialogTitle>
              <DialogDescription>
                {selectedHero.timePeriod}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">
                  <Info className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Overview</span>
                </TabsTrigger>
                <TabsTrigger value="contribution">
                  <History className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Contribution</span>
                </TabsTrigger>
                <TabsTrigger value="sources">
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Sources</span>
                </TabsTrigger>
                <TabsTrigger value="stories">
                  <BookOpen className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Stories</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="flex justify-center my-4">
                  {selectedHero.imageUrl ? (
                    <img 
                      src={selectedHero.imageUrl} 
                      alt={selectedHero.name}
                      className="rounded-md max-h-48 object-contain"
                    />
                  ) : (
                    <div className={`flex items-center justify-center rounded-md w-48 h-48 ${getRandomColor(selectedHero.name)}`}>
                      <span className="text-4xl font-bold">{getInitials(selectedHero.name)}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Lived:</span>
                  <span>{livedLabel(selectedHero) || "Not datable"}</span>
                  {selectedHero.group && (
                    <Badge variant="outline">{groupLabel(selectedHero.group)}</Badge>
                  )}
                  {selectedHero.place && <Badge variant="outline">{selectedHero.place}</Badge>}
                </div>

                {/* Nobody knows when Abraham was born, and a bare "c. 2000 BC"
                    on a children's page reads as a fact. Say once, plainly,
                    that these are estimates -- and only where they are. */}
                {selectedHero.collection === "biblical" && livedLabel(selectedHero) && (
                  <p className="text-xs text-muted-foreground">
                    Dates for people in Scripture are scholarly estimates, not settled facts. The
                    events below are located by chapter and verse instead.
                  </p>
                )}

                {selectedHero.wikipedia && (
                  <a
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(
                      selectedHero.wikipedia.replace(/ /g, "_"),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Read more on Wikipedia
                  </a>
                )}
                
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-primary mt-1 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold mb-2">Biography</p>
                      {/* The biography is written with blank lines between
                          paragraphs. Rendered as one block it becomes a wall
                          of text, which is the thing this content exists to
                          avoid. Falls back to the one-line description for the
                          heroes whose full profile is not written yet. */}
                      {(selectedHero.biography ?? selectedHero.description)
                        .split(/\n\n+/)
                        .map((para, i) => (
                          <p key={i} className="mb-3 leading-relaxed">
                            {para}
                          </p>
                        ))}
                    </div>
                  </div>
                </div>

                {selectedHero.complications && (
                  <div
                    className="rounded-lg border p-4"
                    style={{ borderColor: "hsl(var(--warning))" }}
                  >
                    <p className="font-semibold mb-1 text-warning">Worth knowing</p>
                    {/* Not hidden behind a tab. Several of these people held
                        positions their own tradition later repudiated, and a
                        history that files that away where nobody looks is not
                        being honest, it is being tidy. */}
                    <p className="text-sm leading-relaxed">{selectedHero.complications}</p>
                  </div>
                )}

                {selectedHero.keyEvents && selectedHero.keyEvents.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2">Key Life Events</h3>
                    <div className="space-y-2">
                      {selectedHero.keyEvents.map((event, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <Badge className="mt-0.5 shrink-0">{event.year}</Badge>
                          <div className="min-w-0">
                            <p>{event.description}</p>
                            {event.dateNote && (
                              <p className="text-xs text-muted-foreground mt-0.5">{event.dateNote}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="contribution" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Historical Impact</h3>
                    <p>{selectedHero.contribution}</p>
                  </div>
                  
                  <Separator />
                  
                  {selectedHero.famousQuote && (
                    <div className="flex items-start gap-2">
                      <Quote className="h-5 w-5 text-primary mt-1" />
                      <div>
                        <p className="font-semibold">Famous Quote</p>
                        <p className="italic">"{selectedHero.famousQuote}"</p>
                      </div>
                    </div>
                  )}

                  {selectedHero.bibleVerse && (
                    <div className="bg-primary/10 p-4 rounded-md mt-4">
                      <div className="flex items-start gap-2">
                        <Book className="h-5 w-5 text-primary mt-1" />
                        <div>
                          <p className="font-semibold">Bible Verse Associated with Their Life</p>
                          <p className="italic">"{selectedHero.bibleVerse.text}"</p>
                          <p className="text-right text-sm font-medium">— {selectedHero.bibleVerse.reference}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="sources" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Historical Sources & Further Reading</h3>
                  
                  {selectedHero.sources && selectedHero.sources.length > 0 ? (
                    <div className="space-y-4">
                      {selectedHero.sources.map((source, index) => (
                        <Card key={index}>
                          <CardHeader className="py-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-base">{source.title}</CardTitle>
                                {source.author && (
                                  <CardDescription>by {source.author}</CardDescription>
                                )}
                              </div>
                              <Badge>{source.type}</Badge>
                            </div>
                          </CardHeader>
                          
                          {(source.description || source.url) && (
                            <CardContent className="py-2">
                              {source.description && <p className="text-sm mb-2">{source.description}</p>}
                              {source.url && (
                                <a 
                                  href={source.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-primary flex items-center text-sm hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Visit Source
                                </a>
                              )}
                            </CardContent>
                          )}
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No sources have been added for this hero yet.</p>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="stories" className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Stories About {selectedHero.name}</h3>
                  <Button 
                    onClick={() => {
                      tellStoryAbout(selectedHero.id);
                    }}
                  >
                    Create New Story
                  </Button>
                </div>

                {isLoadingStories ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Loading stories...</span>
                  </div>
                ) : (
                  <>
                    {heroStories && heroStories.length > 0 ? (
                      <div className="space-y-4">
                        {heroStories.map(story => (
                          <Card key={story.id} className={story.isFeatured ? "border-primary/50" : ""}>
                            <CardHeader className="py-3">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center">
                                  {story.isFeatured && <Star className="h-4 w-4 text-warning mr-2" />}
                                  {story.title}
                                </CardTitle>
                                <Badge variant={story.isHistoricallyAccurate ? "outline" : "secondary"}>
                                  {story.isHistoricallyAccurate ? "Historical" : "Fictional"}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="py-2">
                              <p className="text-sm line-clamp-2">{story?.content ? story.content.substring(0, 150) + '...' : 'No content available'}</p>
                            </CardContent>
                            <CardFooter className="pt-0 pb-3">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  // Here we'd navigate to a story view page
                                  toast({
                                    title: "Coming Soon",
                                    description: "The full story view will be available soon.",
                                  });
                                }}
                              >
                                Read Full Story
                              </Button>
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center p-8 border rounded-md">
                        <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h4 className="text-lg font-medium mb-2">No Stories Yet</h4>
                        <p className="text-muted-foreground mb-4">
                          Be the first to create a story about {selectedHero.name} and their incredible faith journey.
                        </p>
                        <Button
                          onClick={() => {
                            tellStoryAbout(selectedHero.id);
                          }}
                        >
                          Create First Story
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}