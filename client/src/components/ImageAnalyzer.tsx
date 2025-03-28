import { useState, useRef } from "react";
import { fileToBase64, analyzeImage } from "@/lib/openai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

export default function ImageAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Check file type
      if (!selectedFile.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file (JPEG, PNG, etc.)",
          variant: "destructive",
        });
        return;
      }
      
      // Check file size (max 4MB)
      if (selectedFile.size > 4 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Image must be less than 4MB",
          variant: "destructive",
        });
        return;
      }
      
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setAnalysis("");
    }
  };

  // Handle image analysis
  const handleAnalyze = async () => {
    if (!file) {
      toast({
        title: "No image selected",
        description: "Please select an image to analyze",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setProgress(10);
      
      // Convert file to base64
      const base64Image = await fileToBase64(file);
      setProgress(30);
      
      // Send to API for analysis
      const result = await analyzeImage(base64Image);
      setProgress(100);
      
      // Set analysis result
      setAnalysis(result);
    } catch (error) {
      console.error("Error analyzing image:", error);
      toast({
        title: "Analysis failed",
        description: "There was an error analyzing the image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset everything
  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setAnalysis("");
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-md">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-t-lg">
        <CardTitle className="text-2xl font-bold">Lion Tails Image Analyzer</CardTitle>
        <CardDescription>
          Upload an image to analyze it using AI and generate a description
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <div className="flex flex-col space-y-4">
          <label className="block text-sm font-medium">
            Select Image
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="mt-1 w-full"
              disabled={loading}
            />
          </label>

          {previewUrl && (
            <div className="relative rounded-lg overflow-hidden border border-secondary/20">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-64 object-contain bg-secondary/5"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                onClick={handleReset}
                disabled={loading}
              >
                Remove
              </Button>
            </div>
          )}

          <div className="flex flex-col space-y-2">
            <Button
              onClick={handleAnalyze}
              className="w-full bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white"
              disabled={!file || loading}
            >
              {loading ? "Analyzing..." : "Analyze Image"}
            </Button>

            {loading && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground text-center">
                  Processing image...
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>

          {analysis && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Image Analysis Result</h3>
                <Alert className="bg-secondary/10 border border-secondary/20">
                  <AlertTitle>AI Description</AlertTitle>
                  <AlertDescription>
                    <Textarea
                      value={analysis}
                      readOnly
                      className="mt-2 h-48 resize-none bg-background/50"
                    />
                  </AlertDescription>
                </Alert>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}