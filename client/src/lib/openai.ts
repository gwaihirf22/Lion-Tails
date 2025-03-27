import { apiRequest } from "./queryClient";
import { StoryRequest, StoryResponse } from "@shared/schema";

// Function to generate a story with OpenAI
export async function generateStory(storyRequest: StoryRequest): Promise<StoryResponse> {
  try {
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
