import { useEffect } from "react";
import { Helmet } from "react-helmet";
import ImageAnalyzer from "@/components/ImageAnalyzer";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ImageAnalysis() {
  const { toast } = useToast();

  // Check if OpenAI API key is set up
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const response = await apiRequest('GET', '/api/settings/openai-key-status');
        if (!response.ok) {
          throw new Error('Failed to check API key status');
        }
        
        const { hasKey } = await response.json();
        if (!hasKey) {
          toast({
            title: "API Key Required",
            description: "The image analysis feature requires an OpenAI API key. Please set one up in the Settings page.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error checking API key:', error);
      }
    };

    checkApiKey();
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>Image Analysis - Lion Tails</title>
        <meta name="description" content="Analyze images using AI vision in Lion Tails" />
      </Helmet>
      
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2 text-primary">Image Analysis</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Upload and analyze images related to Biblical stories or Christian themes. 
            Our AI will provide child-friendly descriptions that can be used in your stories.
          </p>
        </header>
        
        <div className="max-w-4xl mx-auto">
          <ImageAnalyzer />
        </div>
      </div>
    </>
  );
}