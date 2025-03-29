import React, { useState } from 'react';
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
import { HeroOfFaith, HeroStory } from '@shared/schema';
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
  BookOpen
} from 'lucide-react';
import { Link } from 'wouter';

export default function HeroesOfFaith() {
  const { toast } = useToast();
  const [selectedHero, setSelectedHero] = useState<HeroOfFaith | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  // Query to fetch all heroes
  const { data: heroes, isLoading, error } = useQuery({
    queryKey: ['/api/heroes'],
    queryFn: getQueryFn<HeroOfFaith[]>({ on401: 'returnNull' })
  });

  // Query to fetch stories for a specific hero when one is selected
  const { data: heroStories, isLoading: isLoadingStories } = useQuery({
    queryKey: ['/api/heroes', selectedHero?.id, 'stories'],
    queryFn: selectedHero ? 
      getQueryFn<HeroStory[]>({ on401: 'returnNull' }) : 
      () => Promise.resolve([]),
    enabled: !!selectedHero,
  });

  // Function to open hero details dialog
  const openHeroDetails = (hero: HeroOfFaith) => {
    setSelectedHero(hero);
    setOpenDialog(true);
  };

  // Function to generate a random color for hero avatars
  const getRandomColor = (heroName: string): string => {
    const colors = [
      'bg-red-100', 'bg-blue-100', 'bg-green-100', 'bg-yellow-100', 
      'bg-purple-100', 'bg-pink-100', 'bg-indigo-100', 'bg-orange-100'
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
        <p className="text-red-500">Failed to load Heroes of Faith. Please try again.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {heroes?.map(hero => (
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
                    <CardDescription>{hero.timePeriod}</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm line-clamp-3 mb-2">{hero.description}</p>
              <Badge variant="outline" className="text-xs">{hero.birthYear || ''} - {hero.deathYear || ''}</Badge>
            </CardContent>
            <CardFooter className="pt-1 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openHeroDetails(hero)}>
                Learn More
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => {
                  localStorage.setItem('selectedHeroOfFaith', hero.id);
                  window.location.href = "/";
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
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Lived:</span> 
                  <span>{selectedHero.birthYear || '?'} - {selectedHero.deathYear || '?'}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <p className="font-semibold">Biography</p>
                      <p>{selectedHero.description}</p>
                    </div>
                  </div>
                </div>

                {selectedHero.keyEvents && selectedHero.keyEvents.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2">Key Life Events</h3>
                    <div className="space-y-2">
                      {selectedHero.keyEvents.map((event, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <Badge className="mt-0.5">{event.year}</Badge>
                          <p>{event.description}</p>
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
                      localStorage.setItem('selectedHeroOfFaith', selectedHero.id);
                      window.location.href = "/";
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
                                  {story.isFeatured && <Star className="h-4 w-4 text-yellow-500 mr-2" />}
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
                            localStorage.setItem('selectedHeroOfFaith', selectedHero.id);
                            window.location.href = "/";
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