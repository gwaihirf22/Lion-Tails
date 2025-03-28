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
  
  if (!key) {
    console.error("No OpenAI API key available");
    throw new Error("OpenAI API key not found");
  }
  
  console.log("Using OpenAI client with API key:", key ? "API key is set" : "No API key available");
  return new OpenAI({ apiKey: key });
}

export async function generateStoryWithOpenAI(request: StoryRequest): Promise<StoryResponse> {
  const { childName, gender, animal, theme, biblicalEvent, heroOfFaith, useTimeTravel, characterId, storyType } = request;

  const storyTemplate = biblicalEvent && biblicalEvent !== 'none' ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
  const bibleVerse = getBibleVerseByTheme(theme && theme !== 'none' ? theme : 'faith');
  
  // Get user's API key and model upfront
  const userApiKey = await storage.getUserOpenAIKey();
  const userModel = await storage.getUserOpenAIModel();
  
  // Get character information if time travel is enabled
  let character = undefined;
  if (useTimeTravel && characterId) {
    character = await storage.getCharacterById(characterId);
  }
  
  // Get hero of faith information if one is selected
  let heroOfFaithName = undefined;
  if (heroOfFaith && heroOfFaith !== 'none') {
    const heroOfFaithObject = await storage.getHeroOfFaithById(heroOfFaith);
    if (heroOfFaithObject) {
      heroOfFaithName = heroOfFaithObject.name;
    }
  }

  try {
    // Check if we have any API key to use (user's or environment)
    if (!userApiKey && !process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not found");
      throw new Error("OpenAI API key not found");
    }

    const prompt = buildStoryPrompt(childName || "Child", gender || "boy", animal || "lion", theme, biblicalEvent, storyTemplate, useTimeTravel, character, storyType || "regular", heroOfFaithName);
    
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
    
    // Use a model with broader availability (gpt-3.5-turbo) to avoid permission issues
    // We'll use the user's model if provided, otherwise fall back to gpt-3.5-turbo
    // Using a more widely available model to ensure compatibility
    const model = userModel || "gpt-3.5-turbo";
    console.log("Using OpenAI model:", model);
    
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
      let defaultImagePrompt = `A child named ${childName} in a biblical setting`;
      if (animal && animal !== 'none' && animal !== '') {
        defaultImagePrompt = `A child named ${childName} with ${animal}s in a biblical setting`;
      }
      
      jsonContent = {
        title: `${childName}'s Biblical Adventure`,
        content: responseContent,
        imagePrompt: defaultImagePrompt
      };
    }
    
    // Get the image prompt
    let fallbackImagePrompt = `A child named ${childName} in a biblical setting`;
    if (animal && animal !== 'none' && animal !== '') {
      fallbackImagePrompt = `A child named ${childName} with ${animal}s in a biblical setting`;
    }
    const imagePrompt = jsonContent.imagePrompt || fallbackImagePrompt;
    
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

// Function to analyze an image with OpenAI Vision API
export async function analyzeImageWithOpenAI(imageBase64: string): Promise<string> {
  try {
    // Get the user's API key (if they provided one)
    const apiKey = await storage.getUserOpenAIKey();
    
    // Check if we have any API key to use (user's or environment)
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not found for image analysis");
      throw new Error("OpenAI API key not found");
    }

    // Call OpenAI API with a fresh client using the appropriate API key
    const openaiClient = getOpenAIClient(apiKey || undefined);
    
    // System prompt that defines what kind of analysis we want
    const systemPrompt = `You are a helpful Christian children's content analyzer. 
    Analyze the provided image and describe it in detail, focusing on:
    1. What's happening in the image
    2. Who appears to be in the image
    3. The setting and atmosphere
    4. Any potential biblical or Christian themes present
    5. How this image might connect to Biblical stories or principles
    6. How this image could be used in a children's Bible story
    
    Keep your description child-friendly and appropriate for young readers. Aim for 3-4 paragraphs of analysis.`;
    
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: [
            { type: "text", text: "Please analyze this image in detail:" },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });
    
    // Extract the response content
    const analysisText = response.choices[0].message.content || 'Could not analyze the image.';
    return analysisText;
    
  } catch (error) {
    console.error("Error analyzing image with OpenAI:", error);
    throw error;
  }
}

function buildStoryPrompt(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent?: string | undefined, storyTemplate?: string | null, useTimeTravel?: boolean, character?: any, storyType: string = "regular", heroOfFaith?: string | undefined): string {
  let storyFormat = "bedtime story";
  if (storyType === "poem") {
    storyFormat = "bedtime poem with rhyming verses";
  } else if (storyType === "moral") {
    storyFormat = "moral bedtime story with a clear ethical lesson";
  }

  let prompt = "";
  
  // Handle time travel mode differently - the character IS the main character
  if (useTimeTravel && character) {
    prompt = `Write a traditional orthodox Christian ${storyFormat} featuring ${character.name}, who is a ${character.gender === 'boy' ? 'boy' : 'girl'} of ${character.age} years old, as a time traveler`;
    
    // Add character traits if available
    if (character.traits && character.traits.length > 0) {
      prompt += ` with these traits: ${character.traits.join(', ')}`;
    }
    
    // Only include animal if provided in character profile
    if (character.favoriteAnimal && character.favoriteAnimal !== 'none' && character.favoriteAnimal !== '') {
      prompt += ` who loves ${character.favoriteAnimal}s`;
    }
    
    prompt += `.`;
  } else {
    // Regular mode - use the child's name and gender
    prompt = `Write a traditional orthodox Christian ${storyFormat} for a ${gender} named ${childName}`;
    
    // Only include animal if it's not 'none'
    if (animal && animal !== 'none' && animal !== '') {
      prompt += ` who loves ${animal}s`;
    }
    
    prompt += `.`;
  }
  
  // Only include theme if it's not 'none' (for both modes)
  if (theme && theme !== 'none' && theme !== '') {
    prompt += ` The story should teach about ${theme}.`;
  }

  // Add biblical event context (for both modes)
  if (biblicalEvent && biblicalEvent !== 'none' && biblicalEvent !== '') {
    if (storyTemplate) {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}. Use this template as inspiration: ${storyTemplate}`;
    } else {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}.`;
    }
  }

  // Add time travel details if in time travel mode
  if (useTimeTravel && character) {
    prompt += ` IMPORTANT: This story should feature time travel! ${character.name} travels back in time to witness or participate in the biblical event mentioned.`;
    prompt += ` The time traveling character should be the main protagonist in the story, with no other modern-day children present.`;
  } else {
    // Regular mode - make child the main character
    prompt += ` The child should be the main character in the story`;
    if (animal && animal !== 'none' && animal !== '') {
      prompt += ` and interact with ${animal}s`;
    }
    prompt += `.`;
  }

  prompt += ` The story should be approximately 1000 words and include a clear moral lesson at the end that relates to traditional Christian values.`;
  
  // Include Heroes of Faith if provided
  if (heroOfFaith && heroOfFaith !== 'none' && heroOfFaith !== '') {
    prompt += ` Also, include the historical Christian figure ${heroOfFaith} in the story. They should make an appearance or be mentioned as part of the narrative, teaching the child about faith through their example or story.`;
  }
  
  prompt += ` IMPORTANT: Ensure the story adheres ONLY to traditional orthodox Christian theology (Catholic, Orthodox, Protestant). Avoid ANY theological concepts from Mormon, Jehovah's Witness, or other non-traditional denominations. Focus on biblical teachings accepted in mainstream Christianity.`;

  return prompt;
}