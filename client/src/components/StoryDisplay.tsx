import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoryResponse } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StoryDisplayProps {
  story: StoryResponse;
  storyId?: string;
}

export default function StoryDisplay({ story, storyId }: StoryDisplayProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showExpiryAlert, setShowExpiryAlert] = useState(true);
  const storyContentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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
          <div class="verse">
            <p>${story.bibleVerse.text}</p>
            <p class="reference">— ${story.bibleVerse.reference}</p>
          </div>
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
      
      "${story.bibleVerse.text}"
      — ${story.bibleVerse.reference}
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

  const paragraphs = story.content.split('\n').filter(para => para.trim() !== '');

  return (
    <Card className="bg-white/95 rounded-2xl shadow-xl">
      <CardContent className="p-6">
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
        
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-heading font-bold text-textDark">Your Bedtime Story</h3>
          <div className="flex space-x-2">
            {storyId && (
              <Button 
                onClick={handleToggleFavorite} 
                disabled={isLoading}
                variant="outline" 
                size="sm"
                className={`p-2 ${isFavorite 
                  ? "bg-yellow-100 text-yellow-600 hover:bg-yellow-200" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"} rounded-lg transition duration-200`}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" width="24" height="24" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </Button>
            )}
            <Button 
              onClick={handlePrint} 
              disabled={isPrinting}
              variant="outline" 
              size="sm"
              className="p-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition duration-200"
              title="Print Story"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect width="12" height="8" x="6" y="14" />
              </svg>
            </Button>
            <Button 
              onClick={handleSave} 
              variant="outline" 
              size="sm"
              className="p-2 bg-secondary/20 hover:bg-secondary/30 text-secondary rounded-lg transition duration-200"
              title="Save Story"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
            </Button>
          </div>
        </div>
        
        <div 
          ref={storyContentRef} 
          className="overflow-y-auto rounded-xl p-5 bg-[#FFFCF2] max-h-[70vh] scrollbar-thin scrollbar-thumb-secondary scrollbar-track-white font-serif"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#BDB2FF #fff'
          }}
        >
          <h4 className="text-xl font-bold mb-5 text-center">{story.title}</h4>
          
          {story.imagePrompt && (
            <div className="flex justify-center mb-8">
              <img 
                src={`https://images.unsplash.com/photo-1620336655052-b57986f5a26a?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80`} 
                alt="Story illustration" 
                className="rounded-lg shadow-md max-w-full h-auto" 
              />
            </div>
          )}
          
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="mb-3 leading-relaxed">{paragraph}</p>
          ))}
          
          <div className="mt-6 p-4 bg-secondary/20 rounded-lg text-center italic">
            <p className="text-textDark">{story.bibleVerse.text}</p>
            <p className="font-semibold mt-2">— {story.bibleVerse.reference}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
