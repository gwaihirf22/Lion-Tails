import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
    if (!selectedImage) {
      toast({
        title: "Error",
        description: "Please select an image first",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const reader = new FileReader();
      reader.readAsDataURL(selectedImage);
      
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        const response = await apiRequest(
          'POST', 
          '/api/analyze-image', 
          { imageBase64: base64Data }
        );
        
        const data = await response.json();
        setAnalysis(data.analysis);
      };
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: "Error",
        description: "Failed to analyze image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-heading font-bold mb-6">Image Analysis</h1>
      
      <div className="content-container rounded-lg shadow-md p-6 mb-8">
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
            className="block w-full cursor-pointer bg-white border border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition duration-200"
          >
            {imagePreview ? (
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
                <p className="text-gray-500">Click to select an image</p>
              </div>
            )}
          </label>
        </div>
        
        <Button
          onClick={handleAnalyzeImage}
          disabled={!selectedImage || loading}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {loading ? "Analyzing..." : "Analyze Image"}
        </Button>
      </div>
      
      {analysis && (
        <div className="content-container rounded-lg shadow-md p-6">
          <h2 className="text-xl font-heading font-semibold mb-4">Analysis Results</h2>
          <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4">
            <p className="whitespace-pre-line">{analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}