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
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { HeroOfFaith } from '@shared/schema';
import { Loader2, Info, Quote, Book, Calendar } from 'lucide-react';

export default function HeroesOfFaith() {
  const { toast } = useToast();
  const [selectedHero, setSelectedHero] = useState<HeroOfFaith | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  // Query to fetch all heroes
  const { data: heroes, isLoading, error } = useQuery({
    queryKey: ['/api/heroes'],
    queryFn: getQueryFn<HeroOfFaith[]>({ on401: 'returnNull' })
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
            <CardFooter className="pt-1">
              <Button variant="outline" size="sm" onClick={() => openHeroDetails(hero)}>
                Learn More
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Hero Detail Dialog */}
      {selectedHero && (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="sm:max-w-[625px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                {selectedHero.name}
              </DialogTitle>
              <DialogDescription>
                {selectedHero.timePeriod}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="contribution">Contribution</TabsTrigger>
                <TabsTrigger value="inspiration">Inspiration</TabsTrigger>
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
                </div>
              </TabsContent>
              
              <TabsContent value="inspiration" className="space-y-4">
                {selectedHero.bibleVerse && (
                  <div className="bg-primary/10 p-4 rounded-md">
                    <div className="flex items-start gap-2">
                      <Book className="h-5 w-5 text-primary mt-1" />
                      <div>
                        <p className="font-semibold">Bible Verse</p>
                        <p className="italic">"{selectedHero.bibleVerse.text}"</p>
                        <p className="text-right text-sm font-medium">— {selectedHero.bibleVerse.reference}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-2">Tell a Story About This Hero</h3>
                  <p className="text-sm">
                    Create a personalized bedtime story featuring {selectedHero.name} by selecting them in the 
                    story generator on the home page, under "Hero of Faith".
                  </p>
                  <Button 
                    className="mt-2" 
                    onClick={() => {
                      setOpenDialog(false);
                      window.location.href = "/";
                    }}
                  >
                    Create a Story
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}