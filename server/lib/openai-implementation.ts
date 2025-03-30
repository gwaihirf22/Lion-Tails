import OpenAI from 'openai';
import { StoryRequest, StoryResponse } from "@shared/schema";
import { getBiblicalEventStoryTemplate } from "../data/storyTemplates";
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { storage } from "../storage";
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { 
  generateIllustrationPrompt, 
  generateIllustration 
} from './openai-vision';

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

export async function generateStoryWithOpenAI(request: StoryRequest, userId: number = 1): Promise<StoryResponse> {
  const { childName, gender, animal, theme, biblicalEvent, heroOfFaith, useTimeTravel, characterId, storyType, customPrompt, useAnimal, biblePassage } = request;

  const storyTemplate = biblicalEvent && biblicalEvent !== 'none' ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
  const bibleVerse = getBibleVerseByTheme(theme && theme !== 'none' ? theme : 'faith');
  
  // Get user's API key and model using the provided userId
  const userApiKey = await storage.getUserOpenAIKey(userId);
  const userModel = await storage.getUserOpenAIModel(userId);
  
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

    // Handle the new useAnimal toggle
    // If useAnimal is false, we pass an empty string to ensure no animal is included
    const animalToUse = useAnimal ? (animal || "lion") : "";
    
    // Build the user prompt with the appropriate animal value based on useAnimal toggle
    const prompt = buildStoryPrompt(
      childName || "Child", 
      gender || "boy", 
      animalToUse, // Use the toggle-controlled animal value
      theme, 
      biblicalEvent, 
      storyTemplate, 
      useTimeTravel, 
      character, 
      storyType || "regular", 
      heroOfFaithName, 
      customPrompt,
      useAnimal, // Pass the useAnimal toggle value
      biblePassage // Pass the Bible passage
    );
    
    // System prompt that defines what kind of response we want
    const systemPrompt = `You are a traditional orthodox Christian children's bedtime story author and Bible teacher. Create wholesome, faith-based stories and Bible teachings with moral lessons suitable for young children. Include Christian themes and values that align with traditional, orthodox Christian theology.
    
Your content should:
1. Be at least 1000 words in length
2. Include clear moral lessons based on Christian values
3. Be appropriate for children ages 3-10
4. If the story type is a biblical narrative, focus entirely on biblical events and characters with historical accuracy
5. For regular stories, include the specified child's name, gender, animal, and theme when provided
6. If a biblical event is specified, incorporate it into the narrative
7. If a time traveling character is specified, include them as an important part of the story
8. Never include content from Mormon, Jehovah's Witness, or other non-orthodox Christian theologies
9. End with a message about God's love that connects to the Bible verse that will be added later
10. When a specific Bible passage is provided, create either:
   a. A detailed narrative retelling of the passage if it contains a story
   b. A clear, educational explanation of the passage's meaning if it's theological/teaching content
   c. Include at least 2 references to credible Christian sources (scholars, theologians, websites)

IMPORTANT STORYTELLING GUIDELINES:
- Be CREATIVE with your story openings. AVOID generic openings like "Once upon a time" or "In a quaint little village"
- Choose UNIQUE settings, time periods, and scenarios that fit the theme
- Create DISTINCTIVE characters with memorable personalities and traits
- Use VARIED sentence structures and vocabulary appropriate for children
- Include UNEXPECTED but age-appropriate plot developments
- For biblical narratives, maintain historical accuracy while using engaging storytelling techniques
- If a custom prompt is provided, incorporate those elements while ensuring the story remains appropriate for children
- NEVER use the same story structure repeatedly; each story should feel fresh and unique
- When creating content for a specific Bible passage, focus on making the theological content understandable to children while maintaining accuracy

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
        { role: "user", content: prompt.toString() }
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
      
      // If we can't parse as JSON, use default values based on story type
      let defaultImagePrompt = '';
      let defaultTitle = '';
      
      if (storyType === "biblical_narrative") {
        defaultImagePrompt = biblicalEvent ? 
          `A biblical scene depicting ${biblicalEvent} in historically accurate detail` : 
          `A historically accurate biblical scene`;
          
        defaultTitle = biblicalEvent ? 
          `The Story of ${biblicalEvent}` : 
          `Biblical Narrative`;
      } else {
        defaultImagePrompt = `A child named ${childName || "Child"} in a biblical setting`;
        // Only include animal if useAnimal is true and an animal is provided
        if (useAnimal && animal && animal !== 'none' && animal !== '') {
          defaultImagePrompt = `A child named ${childName || "Child"} with ${animal}s in a biblical setting`;
        }
        defaultTitle = `${childName || "Child"}'s Biblical Adventure`;
      }
      
      jsonContent = {
        title: defaultTitle,
        content: responseContent,
        imagePrompt: defaultImagePrompt
      };
    }
    
    // Get the image prompt with fallback
    let fallbackImagePrompt = '';
    
    if (biblePassage && biblePassage.trim() !== "" && biblePassage !== 'none') {
      fallbackImagePrompt = `A biblical scene depicting ${biblePassage} in historically accurate detail`;
    } else if (storyType === "biblical_narrative") {
      fallbackImagePrompt = biblicalEvent ? 
        `A biblical scene depicting ${biblicalEvent} in historically accurate detail` : 
        `A historically accurate biblical scene`;
    } else {
      fallbackImagePrompt = `A child named ${childName || "Child"} in a biblical setting`;
      // Only include animal if useAnimal is true and an animal is provided
      if (useAnimal && animal && animal !== 'none' && animal !== '') {
        fallbackImagePrompt = `A child named ${childName || "Child"} with ${animal}s in a biblical setting`;
      }
    }
    const imagePrompt = jsonContent.imagePrompt || fallbackImagePrompt;
    
    // Generate an image for the story only if the user is using their own API key
    // gpt-4o-mini doesn't support image generation, so we need to check if we're using a custom key
    let imageUrl = null;
    // We already retrieved the userApiKey earlier
    if (userApiKey) {
      try {
        imageUrl = await generateStoryImage(imagePrompt, userId);
      } catch (imageError) {
        console.error("Error generating story image:", imageError);
        // Continue without an image if there's an error
      }
    }
    
    // Prepare default title for different story types
    let defaultTitle = '';
    if (biblePassage && biblePassage.trim() !== "" && biblePassage !== 'none') {
      defaultTitle = `Understanding ${biblePassage}`;
    } else if (storyType === "biblical_narrative") {
      defaultTitle = biblicalEvent ? 
        `The Story of ${biblicalEvent}` : 
        `Biblical Narrative`;
    } else {
      defaultTitle = childName ? `${childName}'s Biblical Adventure` : `Biblical Adventure`;
    }
    
    // Return the story with the bible verse and image
    return {
      title: jsonContent.title || defaultTitle,
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
export async function generateStoryImage(imagePrompt: string, userId: number = 1): Promise<string | undefined> {
  try {
    // Get the user's API key using the provided userId
    const apiKey = await storage.getUserOpenAIKey(userId);
    
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
export async function analyzeImageWithOpenAI(imageBase64: string, userId: number = 1): Promise<string> {
  try {
    // Get the user's API key using the provided userId
    const apiKey = await storage.getUserOpenAIKey(userId);
    
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

function buildStoryPrompt(childName: string = "", gender: string = "boy", animal: string = "", theme: string = "", biblicalEvent?: string | undefined, storyTemplate?: string | null, useTimeTravel?: boolean, character?: any, storyType: string = "regular", heroOfFaith?: string | undefined, customPrompt?: string | undefined, useAnimal?: boolean, biblePassage?: string | undefined): string {
  let storyFormat = "bedtime story";
  
  // Determine story format based on type
  if (storyType === "poem") {
    storyFormat = "bedtime poem with rhyming verses";
  } else if (storyType === "moral") {
    storyFormat = "moral bedtime story with a clear ethical lesson";
  } else if (storyType === "biblical_narrative") {
    storyFormat = "biblical narrative";
  }

  let prompt = "";
  
  // Biblical narrative format - focus solely on the biblical event/characters
  if (storyType === "biblical_narrative") {
    prompt = `Write a traditional orthodox Christian ${storyFormat} based on biblical events and characters`;
    
    // Add biblical event if provided
    if (biblicalEvent && biblicalEvent !== 'none' && biblicalEvent !== '') {
      if (storyTemplate) {
        prompt += `, specifically about ${biblicalEvent}. Use this template as inspiration: ${storyTemplate}`;
      } else {
        prompt += `, specifically about ${biblicalEvent}`;
      }
    }
    
    prompt += `. This should be a faithful retelling of biblical events with historical accuracy while using engaging storytelling techniques. Do not include any modern-day children or fictional characters.`;
  }
  // Handle time travel mode differently - the character IS the main character
  else if (useTimeTravel && character) {
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
  } 
  // Regular mode - use the child's name and gender if provided
  else {
    prompt = `Write a traditional orthodox Christian ${storyFormat}`;
    
    // Only add child details if they were provided (for regular stories)
    if (childName && childName !== '') {
      prompt += ` for a ${gender} named ${childName}`;
      
      // Only include animal if useAnimal is true and animal is not 'none' or empty
      if (useAnimal !== false && animal && animal !== 'none' && animal !== '') {
        prompt += ` who loves ${animal}s`;
      }
    }
    
    prompt += `.`;
  }
  
  // Only include theme if it's not 'none' or empty (for all modes)
  if (theme && theme !== 'none' && theme !== '') {
    prompt += ` The story should teach about ${theme}.`;
  }

  // Add biblical event context (for non-biblical narrative modes)
  if (storyType !== "biblical_narrative" && biblicalEvent && biblicalEvent !== 'none' && biblicalEvent !== '') {
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
  } 
  // For regular mode (not biblical narrative) - make child the main character if provided
  else if (storyType !== "biblical_narrative" && childName && childName !== '') {
    prompt += ` The child should be the main character in the story`;
    if (useAnimal !== false && animal && animal !== 'none' && animal !== '') {
      prompt += ` and interact with ${animal}s`;
    }
    prompt += `.`;
  }

  prompt += ` The story should be approximately 1000 words and include a clear moral lesson at the end that relates to traditional Christian values.`;
  
  // Include Heroes of Faith if provided
  if (heroOfFaith && heroOfFaith !== 'none' && heroOfFaith !== '') {
    if (storyType === "biblical_narrative") {
      prompt += ` Focus on the historical Christian figure ${heroOfFaith}. Include accurate historical details about their life, ministry, and impact on Christianity.`;
    } else {
      prompt += ` Also, include the historical Christian figure ${heroOfFaith} in the story. They should make an appearance or be mentioned as part of the narrative, teaching about faith through their example or story.`;
    }
  }
  
  prompt += ` IMPORTANT: Ensure the story adheres ONLY to traditional orthodox Christian theology (Catholic, Orthodox, Protestant). Avoid ANY theological concepts from Mormon, Jehovah's Witness, or other non-traditional denominations. Focus on biblical teachings accepted in mainstream Christianity.`;

  // Add Bible passage if provided
  if (biblePassage && biblePassage.trim() !== "" && biblePassage !== 'none') {
    prompt += ` IMPORTANT: This request is specifically focused on the Bible passage "${biblePassage}". 
    
    Create a detailed explanation and narrative about this passage. If it's a narrative passage, create a story that faithfully retells the events with historical accuracy and engaging details. If it's not a narrative passage (like Psalms, Proverbs, or Epistles), provide educational and insightful information about its meaning, context, and the lessons it teaches.
    
    Include at least 2 references to credible Christian sources or commentaries about this passage. These should be from well-known Christian theologians, Bible scholars, or respected Christian websites. Format these as proper citations at the end of the content.
    
    Make sure to explain the spiritual and moral lessons from this passage in a way that's understandable to children. Regardless of whether it's a narrative or teaching passage, focus on making the biblical content engaging, accurate, and educational.`;
  }

  // Add the custom prompt if provided
  if (customPrompt && customPrompt.trim() !== "") {
    // Clean the prompt of any inappropriate content by adding a safety instruction
    prompt += ` Additionally, the user has requested the following to be included in the story (while maintaining age-appropriate content and Christian values): ${customPrompt.trim()}`;
    
    // Add strong filtering instruction to ensure content remains appropriate
    prompt += ` IMPORTANT: Filter any inappropriate content or themes from this custom request. ONLY include elements that are consistent with traditional Christian values and appropriate for young children. Completely ignore any requests for content that might be harmful, inappropriate, or contrary to wholesome Christian teachings.`;
  }

  return prompt;
}