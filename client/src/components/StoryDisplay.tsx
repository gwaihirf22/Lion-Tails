import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoryResponse, HeroOfFaith, SavedStory } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookPage } from "@/components/BookPage";
import { Star, Printer, Download, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Import Lion Tails image
import lionTailsImage from "@/assets/illustrations/lion-tails.jpg";

interface StoryDisplayProps {
  story: StoryResponse;
  storyId?: string;
}

// Function to get the story image
const getStoryImage = (): string => {
  // Always use Lion Tails image
  return lionTailsImage;
};

// Calculate how many words fit on a page (approximately 300-400 words per page)
const WORDS_PER_PAGE = 350;

export default function StoryDisplay({ story, storyId }: StoryDisplayProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showExpiryAlert, setShowExpiryAlert] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollMode, setScrollMode] = useState(true);
  const [selectedHeroId, setSelectedHeroId] = useState<string>('');
  const storyContentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Fetch Heroes of Faith for the dropdown
  const { data: heroes = [] } = useQuery<HeroOfFaith[]>({
    queryKey: ['/api/heroes-of-faith'],
    enabled: !!storyId // Only fetch if we have a storyId
  });

  // Split story into pages
  const [storyPages, setStoryPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  // Process the story content into pages when the story changes
  useEffect(() => {
    if (story?.content) {
      const words = story.content.split(/\s+/);
      const pages = [];
      let currentPageWords = [];
      
      for (let i = 0; i < words.length; i++) {
        currentPageWords.push(words[i]);
        
        // When we reach the word limit or end of content, create a new page
        if (currentPageWords.length >= WORDS_PER_PAGE || i === words.length - 1) {
          pages.push(currentPageWords.join(' '));
          currentPageWords = [];
        }
      }
      
      setStoryPages(pages);
      setTotalPages(Math.max(1, pages.length));
    }
  }, [story]);

  // Check if story is favorited when storyId changes
  useEffect(() => {
    const checkFavoriteStatus = async () => {
      if (!storyId) return;
      
      try {
        const response = await apiRequest('GET', `/api/stories/${storyId}`);
        if (response.ok) {
          const storyData = await response.json();
          setIsFavorite(storyData.isFavorite);
        }
      } catch (error) {
        console.error('Error checking favorite status:', error);
      }
    };
    
    checkFavoriteStatus();
  }, [storyId]);

  const handlePrint = () => {
    setIsPrinting(true);
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const storyHTML = storyContentRef.current?.innerHTML;
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${story.title}</title>
          <style>
            body {
              font-family: 'Georgia', serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1 {
              text-align: center;
              color: #7268da;
              margin-bottom: 30px;
            }
            .verse {
              margin-top: 40px;
              padding: 15px;
              background-color: #f5f5f5;
              border-radius: 8px;
              font-style: italic;
              text-align: center;
            }
            .reference {
              font-weight: bold;
              margin-top: 10px;
            }
            p {
              margin-bottom: 16px;
            }
          </style>
        </head>
        <body>
          <h1>${story.title}</h1>
          <div>${story.content.replace(/\n/g, '<br>')}</div>
          ${story.bibleVerse ? `<div class="verse">
            <p>${story.bibleVerse!.text}</p>
            <p class="reference">— ${story.bibleVerse!.reference}</p>
          </div>` : ''}
        </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.print();
      printWindow.onafterprint = () => {
        printWindow.close();
        setIsPrinting(false);
      };
    } else {
      setIsPrinting(false);
    }
  };

  const handleSave = () => {
    const element = document.createElement('a');
    const formattedStory = `
      ${story.title}
      
      ${story.content}
      
      ${story.bibleVerse ? `"${story.bibleVerse!.text}"
      — ${story.bibleVerse!.reference}` : ''}
    `;
    
    const file = new Blob([formattedStory], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${story.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  
  // Toggle favorite status
  const handleToggleFavorite = async () => {
    if (!storyId) return;
    
    try {
      setIsLoading(true);
      const newFavoriteStatus = !isFavorite;
      
      const response = await apiRequest('PUT', `/api/stories/${storyId}/favorite`, {
        isFavorite: newFavoriteStatus
      });
      
      if (response.ok) {
        setIsFavorite(newFavoriteStatus);
        toast({
          title: newFavoriteStatus ? "Story Favorited" : "Removed from Favorites",
          description: newFavoriteStatus 
            ? "This story will be saved permanently."
            : "This story will be automatically deleted after one year if not favorited again.",
        });
      }
    } catch (error) {
      console.error('Error toggling favorite status:', error);
      toast({
        title: "Error",
        description: "Failed to update favorite status.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation between pages
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      // Scroll to top of the page when navigating
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      // Scroll to top of the page when navigating
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Associate story with hero mutation
  const associateWithHeroMutation = useMutation({
    mutationFn: async (heroId: string) => {
      if (!storyId) throw new Error("Story ID is required");
      const response = await apiRequest('POST', `/api/stories/${storyId}/associate-hero`, { heroId });
      if (!response.ok) {
        throw new Error("Failed to associate story with hero");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Story Associated",
        description: "This story has been successfully associated with the selected Hero of Faith.",
      });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/stories/${storyId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to associate story with hero",
        variant: "destructive",
      });
    }
  });
  
  // Handle hero selection and association
  const handleAssociateWithHero = (heroId: string) => {
    if (!heroId) return;
    
    setSelectedHeroId(heroId);
    associateWithHeroMutation.mutate(heroId);
  };
  
  // Fetch the saved story to check if it has an associated hero
  useEffect(() => {
    const fetchSavedStory = async () => {
      if (!storyId) return;
      
      try {
        const response = await apiRequest('GET', `/api/stories/${storyId}`);
        if (response.ok) {
          const savedStory = await response.json();
          // If the saved story has a heroId, set it as selected
          if (savedStory.heroId) {
            setSelectedHeroId(savedStory.heroId);
          }
        }
      } catch (error) {
        console.error('Error fetching saved story:', error);
      }
    };
    
    fetchSavedStory();
  }, [storyId]);
  
  // Check if we should show the Bible verse (on the last page only)
  const showBibleVerse = currentPage === totalPages;
  
  // Set the current page's content
  const currentPageContent = storyPages[currentPage - 1] || '';

  return (
    <div className="space-y-4">
      {/* Expiry Alert */}
      {showExpiryAlert && storyId && (
        <Alert className="mb-4 bg-blue-50 border border-blue-100">
          <AlertDescription className="flex items-center justify-between">
            <div>
              <span className="text-sm">
                Stories are automatically saved for one year. {isFavorite 
                  ? "This story is favorited and will be kept indefinitely." 
                  : "Favorite this story to keep it indefinitely."}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 rounded-full" 
              onClick={() => setShowExpiryAlert(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Action Buttons */}
      <div className="flex justify-end space-x-2 mb-4">
        {storyId && (
          <Button 
            onClick={handleToggleFavorite} 
            disabled={isLoading}
            variant="outline" 
            size="sm"
            className={`${isFavorite 
              ? "bg-yellow-100 text-yellow-600 hover:bg-yellow-200" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"} rounded-lg transition duration-200`}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className="h-4 w-4 mr-2" fill={isFavorite ? "currentColor" : "none"} />
            {isFavorite ? "Favorited" : "Favorite"}
          </Button>
        )}
        <Button 
          onClick={handlePrint} 
          disabled={isPrinting}
          variant="outline" 
          size="sm"
          className="bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition duration-200"
          title="Print Story"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button 
          onClick={handleSave} 
          variant="outline" 
          size="sm"
          className="bg-secondary/20 hover:bg-secondary/30 text-secondary rounded-lg transition duration-200"
          title="Save Story"
        >
          <Download className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>

      {/* Hidden div with full content for printing */}
      <div ref={storyContentRef} className="hidden">
        <h4 className="text-xl font-bold mb-5 text-center">{story.title}</h4>
        <div dangerouslySetInnerHTML={{ __html: story.content.replace(/\n/g, '<br>') }} />
        {story.bibleVerse && (
          <div className="mt-6 p-4 bg-secondary/20 rounded-lg text-center italic">
            <p className="text-textDark">{story.bibleVerse.text}</p>
            <p className="font-semibold mt-2">— {story.bibleVerse.reference}</p>
          </div>
        )}
        {story.applicationQuestions && story.applicationQuestions.length > 0 && (
          <div className="mt-6">
            <h4 className="text-lg font-bold mb-3">Think About It:</h4>
            <ol className="space-y-2">
              {story.applicationQuestions.map((question, index) => (
                <li key={index} className="flex items-start">
                  <span className="font-semibold mr-2">{index + 1}.</span>
                  <span>{question}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      
      {/* Book Page Component */}
      <BookPage
        title={story.title}
        content={scrollMode ? story.content : currentPageContent}
        verseText={scrollMode || showBibleVerse ? story.bibleVerse?.text : undefined}
        verseReference={scrollMode || showBibleVerse ? story.bibleVerse?.reference : undefined}
        onNextPage={goToNextPage}
        onPrevPage={goToPrevPage}
        hasNextPage={currentPage < totalPages}
        hasPrevPage={currentPage > 1}
        currentPage={currentPage}
        totalPages={totalPages}
        scrollMode={scrollMode}
        onScrollModeChange={(mode) => setScrollMode(mode)}
      />

      {/* Application Questions Section */}
      {story.applicationQuestions && story.applicationQuestions.length > 0 && (
        <div className="mt-8 p-6 bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl shadow-sm">
          <h3 className="text-xl font-bold mb-4 text-blue-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9,9h6v6H9V9z"/>
              <path d="M9 1v6m6-6v6"/>
            </svg>
            Think About It
          </h3>
          <p className="text-blue-700 mb-4 text-sm">
            Here are some questions to help you think about how this story applies to your own life:
          </p>
          <div className="space-y-3">
            {story.applicationQuestions.map((question, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-white/60 rounded-lg border border-blue-100">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </div>
                <p className="text-blue-800 font-medium">
                  {typeof question === 'string' ? question : (question as any).question}
                </p>
              </div>
            ))}
          </div>
          {story.moralOutcome === 'consequences' && (
            <div className="mt-4 p-3 bg-amber-100 border border-amber-200 rounded-lg">
              <p className="text-amber-800 text-sm font-medium">
                💭 Take some time to think about these questions - sometimes the best lessons come from thinking about what we would do differently.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Image Display on First Page */}
      {currentPage === 1 && (
        <div className="mt-4 flex justify-center">
          <img 
            src={story.imageUrl || getStoryImage()}
            alt="Story illustration" 
            className="rounded-lg shadow-md max-w-full h-auto" 
            style={{ maxHeight: '300px', objectFit: 'contain' }}
          />
        </div>
      )}
      
      {/* Hero of Faith Association Section */}
      {storyId && heroes.length > 0 && (
        <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-lg">
          <h4 className="text-lg font-semibold mb-3 flex items-center text-amber-800">
            <UserPlus className="h-5 w-5 mr-2" />
            Associate with a Hero of Faith
          </h4>
          <p className="text-sm text-amber-700 mb-4">
            Connect this story to a Hero of Faith to help organize your stories and find related content.
          </p>
          
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="hero-select" className="text-amber-800">Select a Hero of Faith</Label>
              <Select 
                value={selectedHeroId} 
                onValueChange={handleAssociateWithHero}
                disabled={associateWithHeroMutation.isPending}
              >
                <SelectTrigger className="w-full bg-white border-amber-200">
                  <SelectValue placeholder="Choose a Hero of Faith" />
                </SelectTrigger>
                <SelectContent>
                  {heroes.map(hero => (
                    <SelectItem key={hero.id} value={hero.id}>
                      {hero.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedHeroId && (
                <p className="text-xs text-green-600 mt-1">
                  {associateWithHeroMutation.isPending 
                    ? "Associating story..." 
                    : "Story is associated with a Hero of Faith"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
