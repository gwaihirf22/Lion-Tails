import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Image as ImageIcon, BookOpen, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function ImageAnalysisPage() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [story, setStory] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to auth page if user is not logged in
  if (!user) {
    setLocation("/auth");
    return null;
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      
      // Create a preview URL for the image
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Clear previous analysis and story
      setAnalysis("");
      setStory(null);
    }
  };

  const handleAnalyzeClick = async () => {
    if (!selectedImage) {
      toast({
        title: "No image selected",
        description: "Please select an image to analyze.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    
    try {
      // Convert the image to a base64 string
      const reader = new FileReader();
      reader.readAsDataURL(selectedImage);
      
      reader.onloadend = async () => {
        // Extract the base64 data part (remove the data:image/jpeg;base64, prefix)
        const base64String = (reader.result as string).split(',')[1];
        
        // Send the base64 string to the API
        const response = await apiRequest("POST", "/api/analyze-image", { imageBase64: base64String });
        const data = await response.json();
        
        // Set the analysis text
        setAnalysis(data.analysis);
      };
    } catch (error) {
      console.error("Error analyzing image:", error);
      toast({
        title: "Analysis failed",
        description: "There was an error analyzing your image. Please check if you have added your OpenAI API key in Settings.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateStoryClick = async () => {
    if (!selectedImage) {
      toast({
        title: "No image selected",
        description: "Please select an image to generate a story.",
        variant: "destructive",
      });
      return;
    }

    // Show prompt for child's name and other details
    const childName = prompt("Enter the child's name:");
    if (!childName) return;

    const gender = prompt("Enter the child's gender (boy/girl):");
    if (!gender || (gender !== "boy" && gender !== "girl")) {
      toast({
        title: "Invalid gender",
        description: "Please enter either 'boy' or 'girl'.",
        variant: "destructive",
      });
      return;
    }

    const theme = prompt("Enter a theme for the story (e.g., kindness, faith, courage):");

    setIsGeneratingStory(true);
    
    try {
      // Convert the image to a base64 string
      const reader = new FileReader();
      reader.readAsDataURL(selectedImage);
      
      reader.onloadend = async () => {
        // Extract the base64 data part (remove the data:image/jpeg;base64, prefix)
        const base64String = (reader.result as string).split(',')[1];
        
        // Send the base64 string to the API with story details
        const response = await apiRequest("POST", "/api/generate-story-from-image", { 
          imageBase64: base64String,
          childName,
          gender,
          theme: theme || "faith"
        });
        const storyData = await response.json();
        
        // Set the story data
        setStory(storyData);
      };
    } catch (error) {
      console.error("Error generating story:", error);
      toast({
        title: "Story generation failed",
        description: "There was an error generating your story. Please check if you have added your OpenAI API key in Settings.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleSaveStory = () => {
    if (!story) return;
    
    setLocation("/saved-stories");
    toast({
      title: "Story saved",
      description: "Your story has been saved and will appear in your stories list.",
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Bible Story Image Analysis</h1>
          <p className="text-gray-600 mb-8">
            Upload an image to analyze its biblical themes or generate a story based on the image.
          </p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Upload an Image</CardTitle>
            <CardDescription>Select a Bible-themed image to analyze</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-primary/20 rounded-lg p-12 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              {imagePreview ? (
                <div className="w-full flex flex-col items-center">
                  <img src={imagePreview} alt="Preview" className="max-h-64 mb-4 rounded-md shadow-md" />
                  <p className="text-center text-gray-500">Click to change image</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-gray-500">
                  <ImageIcon size={48} className="mb-2" />
                  <p>Click to select an image</p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
            </div>

            <div className="flex flex-wrap gap-4 justify-center">
              <Button 
                onClick={handleAnalyzeClick} 
                disabled={!selectedImage || isAnalyzing}
                className="flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Analyze Image
                  </>
                )}
              </Button>
              
              <Button 
                onClick={handleGenerateStoryClick} 
                disabled={!selectedImage || isGeneratingStory}
                className="flex items-center gap-2"
                variant="secondary"
              >
                {isGeneratingStory ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Story...
                  </>
                ) : (
                  <>
                    <BookOpen className="h-4 w-4" />
                    Generate Story
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {analysis && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Image Analysis</CardTitle>
              <CardDescription>Biblical themes and elements found in your image</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={analysis} 
                readOnly 
                className="w-full h-64 resize-none" 
              />
            </CardContent>
          </Card>
        )}

        {story && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{story.title}</CardTitle>
              <CardDescription>Generated story based on your image</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-96 overflow-y-auto border rounded-md p-4">
                <div className="whitespace-pre-wrap">{story.content}</div>
                
                {story.bibleVerse && (
                  <div className="mt-4 p-4 bg-secondary/10 rounded-md italic">
                    "{story.bibleVerse.text}" - {story.bibleVerse.reference}
                  </div>
                )}
              </div>
              
              <div className="flex justify-end">
                <Button onClick={handleSaveStory} className="flex items-center gap-2">
                  Save Story
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}