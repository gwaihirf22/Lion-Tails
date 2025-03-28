import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Import sample images from assets
import lionTailsImage from "@assets/Lion tails.jpg";
import appIconImage from "@assets/image.jpg";

export default function ImageAnalysis() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Reset analysis when new image is selected
      setAnalysis(null);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!selectedImage && !imagePreview) {
      toast({
        title: "Error",
        description: "Please select an image first",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      if (selectedImage) {
        // Handle file upload case
        const reader = new FileReader();
        reader.readAsDataURL(selectedImage);
        
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await sendImageForAnalysis(base64Data);
        };
      } else if (imagePreview) {
        // Handle sample image case
        // Convert the image src to base64
        const response = await fetch(imagePreview);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await sendImageForAnalysis(base64Data);
        };
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: "Error",
        description: "Failed to analyze image. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const sendImageForAnalysis = async (base64Data: string) => {
    try {
      const response = await apiRequest(
        'POST', 
        '/api/analyze-image', 
        { imageBase64: base64Data }
      );
      
      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (error) {
      console.error('Error sending image for analysis:', error);
      toast({
        title: "Error",
        description: "Failed to analyze image. Please check if an API key is available.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectSampleImage = (imageSrc: string) => {
    setSelectedImage(null);
    setImagePreview(imageSrc);
    setAnalysis(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-heading font-bold mb-6">Biblical Image Analysis</h1>
      <p className="text-lg mb-6 content-container p-4 rounded-lg">
        Upload or select an image to analyze with AI. Learn how images can connect to biblical themes and stories.
        This feature requires an OpenAI API key in the Settings page.
      </p>
      
      <Tabs defaultValue="upload" className="mb-8">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="upload" className="flex-1">Upload Your Own Image</TabsTrigger>
          <TabsTrigger value="samples" className="flex-1">Try Sample Images</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="content-container rounded-lg shadow-md p-6">
          <h2 className="text-xl font-heading font-semibold mb-4">Upload an Image to Analyze</h2>
          
          <div className="mb-6">
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <label
              htmlFor="image-upload"
              className="block w-full cursor-pointer bg-white/70 border border-gray-300 rounded-lg p-6 text-center hover:bg-white/90 transition duration-200"
            >
              {imagePreview && !selectedImage ? (
                <div className="flex flex-col items-center">
                  <img 
                    src={imagePreview} 
                    alt="Selected preview" 
                    className="max-h-64 max-w-full object-contain mb-4" 
                  />
                  <span className="text-gray-500">Click to upload a different image</span>
                </div>
              ) : selectedImage ? (
                <div className="flex flex-col items-center">
                  <img 
                    src={imagePreview} 
                    alt="Selected preview" 
                    className="max-h-64 max-w-full object-contain mb-4" 
                  />
                  <span className="text-gray-500">Click to change image</span>
                </div>
              ) : (
                <div className="py-8">
                  <div className="text-4xl mb-2">📷</div>
                  <p className="text-gray-500">Click to select an image from your device</p>
                </div>
              )}
            </label>
          </div>
        </TabsContent>
        
        <TabsContent value="samples" className="content-container rounded-lg shadow-md p-6">
          <h2 className="text-xl font-heading font-semibold mb-4">Sample Images</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card 
              className={`cursor-pointer hover:scale-105 transition-transform ${imagePreview === lionTailsImage ? 'ring-2 ring-primary' : ''}`}
              onClick={() => selectSampleImage(lionTailsImage)}
            >
              <CardContent className="p-4">
                <img 
                  src={lionTailsImage} 
                  alt="Child with lion" 
                  className="h-48 w-full object-cover rounded-t-lg" 
                />
                <p className="text-center mt-2 font-semibold">Child Reading with Lion</p>
              </CardContent>
            </Card>
            
            <Card 
              className={`cursor-pointer hover:scale-105 transition-transform ${imagePreview === appIconImage ? 'ring-2 ring-primary' : ''}`}
              onClick={() => selectSampleImage(appIconImage)}
            >
              <CardContent className="p-4">
                <img 
                  src={appIconImage} 
                  alt="Lion with book" 
                  className="h-48 w-full object-cover rounded-t-lg" 
                />
                <p className="text-center mt-2 font-semibold">Lion with Book</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      
      <div className="content-container rounded-lg shadow-md p-6 mb-8">
        <Button
          onClick={handleAnalyzeImage}
          disabled={(!selectedImage && !imagePreview) || loading}
          className="w-full bg-primary hover:bg-primary/90 text-lg py-6"
        >
          {loading ? "Analyzing..." : "Analyze Image"}
        </Button>
        
        {imagePreview && (
          <p className="text-center mt-4 text-sm text-gray-600">
            Note: This analysis uses OpenAI's GPT-4o model. You need to provide your own API key in the Settings page.
          </p>
        )}
      </div>
      
      {analysis && (
        <div className="content-container rounded-lg shadow-md p-6">
          <h2 className="text-xl font-heading font-semibold mb-4">Biblical Analysis Results</h2>
          
          {imagePreview && (
            <div className="flex justify-center mb-6">
              <img 
                src={imagePreview} 
                alt="Analyzed image" 
                className="max-h-64 object-contain rounded-lg" 
              />
            </div>
          )}
          
          <div className="bg-white/70 backdrop-blur-sm rounded-lg p-6 shadow-sm">
            <p className="whitespace-pre-line text-lg">{analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}