import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { storage } from "../storage";

// Promisify fs functions
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Create OpenAI client with the user's API key
async function getOpenAIClient(userId: number) {
  // Get the user's API key
  const apiKey = await storage.getUserOpenAIKey(userId);
  
  // If no API key is found, throw an error
  if (!apiKey) {
    throw new Error("OpenAI API key is required for image analysis. Please add your API key in Settings.");
  }
  
  // Create a new client with the user's API key
  return new OpenAI({ apiKey });
}

/**
 * Analyze an image and generate a description
 */
export async function analyzeImage(base64Image: string, userId: number): Promise<string> {
  try {
    const openai = await getOpenAIClient(userId);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing images with a focus on biblical and Christian themes. Identify biblical references, symbols, theological elements, and potential connections to Biblical stories or principles. Be thorough but concise."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this image and highlight any biblical themes, symbols, or connections to Christian theology that you observe. Organize your response into sections for clarity."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 1000,
    });

    return response.choices[0].message.content || "No analysis could be generated for this image.";
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

/**
 * Generate a story based on an image
 */
export async function generateStoryFromImage(
  base64Image: string, 
  childName: string, 
  gender: string, 
  theme: string,
  userId: number
): Promise<{ title: string; content: string }> {
  try {
    const openai = await getOpenAIClient(userId);
    
    // First, analyze the image to understand what's in it
    const imageAnalysis = await analyzeImage(base64Image, userId);
    
    // Then, generate a story based on the image analysis
    const storyResponse = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a master storyteller specializing in Christian children's stories. 
          Create an engaging, faith-based story that incorporates biblical values and lessons.
          Your story should be at least 1000 words long, be appropriate for young children,
          and include a clear moral tied to Christian values.
          The story should feature a child named ${childName} who is a ${gender}.
          The theme of the story should be centered around "${theme}".
          End the story with a reflection on faith and learning.
          Include a title for the story.
          Based on the given image analysis, create a story that incorporates elements from the image.`
        },
        {
          role: "user",
          content: `Here is an analysis of an image: "${imageAnalysis}"\n\nPlease create a Christian children's story based on this image, featuring a ${gender} named ${childName} and centered on the theme of "${theme}". Make the story at least 1000 words long and end with a clear moral lesson and Bible reference. Format your response with the title at the top followed by the story content.`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    });

    const storyContent = JSON.parse(storyResponse.choices[0].message.content);
    
    return {
      title: storyContent.title || "A Story From An Image",
      content: storyContent.content || storyContent.story || "Once upon a time..."
    };
  } catch (error) {
    console.error("Error generating story from image:", error);
    throw new Error(`Failed to generate story from image: ${error.message}`);
  }
}

/**
 * Generate an illustration prompt based on a story
 */
export async function generateIllustrationPrompt(storyContent: string, userId: number): Promise<string> {
  try {
    const openai = await getOpenAIClient(userId);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert at generating prompts for Christian children's book illustrations. Create a detailed, vivid prompt that a text-to-image model can use to create an appropriate illustration for a children's story."
        },
        {
          role: "user",
          content: `Given this children's story excerpt, create a prompt for DALL-E to generate an appropriate, child-friendly illustration. Focus on the most visually interesting scene:\n\n${storyContent}`
        }
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "A Christian children's story illustration, colorful, gentle style";
  } catch (error) {
    console.error("Error generating illustration prompt:", error);
    throw new Error(`Failed to generate illustration prompt: ${error.message}`);
  }
}

/**
 * Generate an illustration for a story using DALL-E
 */
export async function generateIllustration(prompt: string, userId: number): Promise<string | null> {
  try {
    const openai = await getOpenAIClient(userId);
    
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `${prompt} Ensure this is appropriate for children, with a gentle, colorful style reminiscent of Christian children's books.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    return response.data[0].url || null;
  } catch (error) {
    console.error("Error generating illustration:", error);
    throw new Error(`Failed to generate illustration: ${error.message}`);
  }
}

/**
 * Read an image file and convert it to base64
 */
export function imageFileToBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data.toString('base64'));
    });
  });
}

/**
 * Load an image from the attached_assets directory
 */
export async function loadAttachedImage(filename: string): Promise<string | null> {
  try {
    // Build the full path to the image
    const imagePath = path.join(process.cwd(), 'attached_assets', filename);
    
    // Check if the file exists
    await stat(imagePath);
    
    // Read the file and convert to base64
    const imageBuffer = await readFile(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    console.error(`Error loading attached image ${filename}:`, error);
    return null;
  }
}