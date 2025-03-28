import OpenAI from 'openai';
import { StoryRequest, StoryResponse } from "@shared/schema";
import { getBiblicalEventStoryTemplate } from "../data/storyTemplates";
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { storage } from "../storage";
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';

// Function to get an OpenAI client with the current API key
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
function getOpenAIClient(apiKey?: string | null) {
  // Use the provided key if available, otherwise use the system key
  const key = apiKey || process.env.OPENAI_API_KEY;
  return new OpenAI({ apiKey: key });
}

export async function generateStoryWithOpenAI(request: StoryRequest): Promise<StoryResponse> {
  const { childName, gender, animal, theme, biblicalEvent, useTimeTravel, characterId, storyType } = request;

  const storyTemplate = biblicalEvent ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
  const bibleVerse = getBibleVerseByTheme(theme);
  
  // Get user's API key and model upfront
  const userApiKey = await storage.getUserOpenAIKey();
  const userModel = await storage.getUserOpenAIModel();
  
  // Get character information if time travel is enabled
  let character = undefined;
  if (useTimeTravel && characterId) {
    character = await storage.getCharacterById(characterId);
  }

  try {
    // Check if we have any API key to use (user's or environment)
    if (!userApiKey && !process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not found");
      throw new Error("OpenAI API key not found");
    }

    const prompt = buildStoryPrompt(childName || "Child", gender || "boy", animal || "lion", theme, biblicalEvent, storyTemplate, useTimeTravel, character, storyType || "regular");
    
    // System prompt that defines what kind of response we want
    const systemPrompt = `You are a traditional orthodox Christian children's bedtime story author. Create wholesome, faith-based stories with moral lessons suitable for young children. Include Christian themes and values that align with traditional, orthodox Christian theology.
    
Your stories should:
1. Be at least 1000 words in length
2. Include clear moral lessons based on Christian values
3. Be appropriate for children ages 3-10
4. Include the specified child's name, gender, animal, and theme
5. If a biblical event is specified, incorporate it into the narrative
6. If a time traveling character is specified, include them as an important part of the story
7. Never include content from Mormon, Jehovah's Witness, or other non-orthodox Christian theologies
8. End with a message about God's love that connects to the Bible verse that will be added later

Format your response as valid JSON with the following structure:
    {
      "title": "Story title",
      "content": "The full story content with proper paragraphs",
      "imagePrompt": "A short description for an illustration of a key scene in the biblical style"
    }`;
    
    // Using gpt-4o-mini since original gpt-4o is not available
    // We already retrieved userModel earlier
    const model = userModel || "gpt-4o-mini";
    
    // Call OpenAI API with a fresh client using the appropriate API key
    const openaiClient = getOpenAIClient(userApiKey || undefined);
    const response = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3500
    });
    
    // Extract the response content
    const responseContent = response.choices[0].message.content || '';
    
    // Parse the JSON response
    let jsonContent;
    try {
      jsonContent = JSON.parse(responseContent);
    } catch (parseError) {
      console.error("Error parsing OpenAI response as JSON:", parseError);
      console.log("Raw response:", responseContent);
      
      // If we can't parse as JSON, use default values
      jsonContent = {
        title: `${childName}'s Biblical Adventure`,
        content: responseContent,
        imagePrompt: `A child named ${childName} with ${animal}s in a biblical setting`
      };
    }
    
    // Get the image prompt
    const imagePrompt = jsonContent.imagePrompt || `A child named ${childName} with ${animal}s in a biblical setting`;
    
    // Generate an image for the story only if the user is using their own API key
    // gpt-4o-mini doesn't support image generation, so we need to check if we're using a custom key
    let imageUrl = null;
    // We already retrieved the userApiKey earlier
    if (userApiKey) {
      try {
        imageUrl = await generateStoryImage(imagePrompt);
      } catch (imageError) {
        console.error("Error generating story image:", imageError);
        // Continue without an image if there's an error
      }
    }
    
    // Return the story with the bible verse and image
    return {
      title: jsonContent.title || `${childName}'s Biblical Adventure`,
      content: jsonContent.content || responseContent,
      bibleVerse: bibleVerse,
      imagePrompt: imagePrompt,
      imageUrl: imageUrl || undefined
    };
  } catch (error) {
    console.error("Error generating story with OpenAI:", error);
    throw error;
  }
}

// Function to generate an image for a story using DALL-E
export async function generateStoryImage(imagePrompt: string): Promise<string | undefined> {
  try {
    // Get the user's API key (if they provided one)
    const apiKey = await storage.getUserOpenAIKey();
    
    // Check if we have any API key to use (user's or environment)
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not found for image generation");
      return undefined;
    }

    // Make sure the images directory exists
    const imagesDir = path.join(process.cwd(), 'public', 'images', 'stories');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Create a filename for the new image
    const filename = `story_${uuidv4()}.png`;
    const filepath = path.join(imagesDir, filename);
    
    // Append biblical art style to the prompt
    const enhancedPrompt = `${imagePrompt}. Render in a beautiful, child-friendly biblical illustration style with soft colors.`;
    
    // Call DALL-E API to generate the image with user's key if available
    // Convert null to undefined if needed
    const openaiClient = getOpenAIClient(apiKey || undefined);
    const response = await openaiClient.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    // Download the image
    if (response.data[0]?.url) {
      await downloadImage(response.data[0].url, filepath);
      return `/public/images/stories/${filename}`;
    } else {
      console.error("No image URL returned from OpenAI");
      return undefined;
    }
  } catch (error) {
    console.error("Error generating image with DALL-E:", error);
    return undefined;
  }
}

// Helper function to download an image from a URL and save it to disk
function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function buildStoryPrompt(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent?: string | undefined, storyTemplate?: string | null, useTimeTravel?: boolean, character?: any, storyType: string = "regular"): string {
  let storyFormat = "bedtime story";
  if (storyType === "poem") {
    storyFormat = "bedtime poem with rhyming verses";
  } else if (storyType === "moral") {
    storyFormat = "moral bedtime story with a clear ethical lesson";
  }

  let prompt = `Write a traditional orthodox Christian ${storyFormat} for a ${gender} named ${childName} who loves ${animal}s. The story should teach about ${theme}.`;

  if (biblicalEvent && biblicalEvent !== 'none') {
    if (storyTemplate) {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}. Use this template as inspiration: ${storyTemplate}`;
    } else {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}.`;
    }
  }

  // Add time travel character if provided
  if (useTimeTravel && character) {
    prompt += ` IMPORTANT: This story should feature time travel! Include a character named ${character.name}, who is a ${character.gender === 'boy' ? 'boy' : 'girl'} of ${character.age} years old, as a time traveler who goes back in time to witness or participate in the biblical event.`;
    
    if (character.traits && character.traits.length > 0) {
      prompt += ` This character has the following traits: ${character.traits.join(', ')}.`;
    }
    
    prompt += ` The time traveling character should interact with the main child character (${childName}) in the story, creating a fun adventure where they both learn important lessons about faith.`;
  } else {
    prompt += ` The child should be the main character in the story and interact with ${animal}s.`;
  }

  prompt += ` The story should be approximately 1000 words and include a clear moral lesson at the end that relates to traditional Christian values.`;
  
  prompt += ` IMPORTANT: Ensure the story adheres ONLY to traditional orthodox Christian theology (Catholic, Orthodox, Protestant). Avoid ANY theological concepts from Mormon, Jehovah's Witness, or other non-traditional denominations. Focus on biblical teachings accepted in mainstream Christianity.`;

  return prompt;
}