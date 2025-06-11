import { apiRequest } from "./queryClient";
import { StoryRequest, StoryResponse } from "@shared/schema";

// Function to generate a story with OpenAI
export async function generateStory(storyRequest: StoryRequest): Promise<StoryResponse> {
  try {
    // Log the story request being sent to the server
    console.log("=== CLIENT STORY REQUEST ===");
    console.log("Story Request:", storyRequest);
    console.log("============================");
    
    const response = await apiRequest('POST', '/api/generate-story', storyRequest);
    if (!response.ok) {
      throw new Error('Failed to generate story');
    }
    return await response.json();
  } catch (error) {
    console.error('Error generating story:', error);
    throw error;
  }
}

// Function to convert a file to base64 format
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      // Remove the prefix (e.g., "data:image/jpeg;base64,")
      const base64Content = base64String.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = (error) => reject(error);
  });
}

// Function to analyze an image with OpenAI
export async function analyzeImage(imageBase64: string): Promise<string> {
  try {
    // Log the image analysis request
    console.log("=== CLIENT IMAGE ANALYSIS REQUEST ===");
    console.log("Image Base64 Length:", imageBase64.length);
    console.log("======================================");
    
    const response = await apiRequest('POST', '/api/analyze-image', { image: imageBase64 });
    if (!response.ok) {
      throw new Error('Failed to analyze image');
    }
    const data = await response.json();
    return data.analysis;
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
}
