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

export async function generateStoryWithOpenAI(request: StoryRequest, userId: number = 1, customPrompts?: { systemPrompt?: string; userPrompt?: string }): Promise<StoryResponse> {
  const { childName, gender, animal, theme, biblicalEvent, heroOfFaith, useTimeTravel, characterId, storyType, customPrompt, useAnimal, biblePassage, readingLevel, storyLength } = request;

  // Determine moral outcome type (25% each)
  const moralOutcomes: Array<"positive" | "learning" | "consequences" | "creative"> = ["positive", "learning", "consequences", "creative"];
  const moralOutcome = moralOutcomes[Math.floor(Math.random() * 4)];

  const storyTemplate = biblicalEvent && biblicalEvent !== 'none' ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
  const bibleVerse = getBibleVerseByTheme(theme && theme !== 'none' ? theme : 'faith');
  
  // Get user's API key and model using the provided userId
  const userApiKey = await storage.getUserOpenAIKey(userId);
  const userModel = await storage.getUserOpenAIModel(userId);
  
  // Get character information if characterId is provided
  let character = undefined;
  if (characterId) {
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

    // Override with character data if a character is selected
    let nameToUse = childName || "Child";
    let genderToUse = gender || "boy";
    let animalToUse = useAnimal ? (animal || "lion") : "";
    
    if (character) {
      nameToUse = character.name;
      genderToUse = character.gender;
      if (character.favoriteAnimal && character.favoriteAnimal !== "none") {
        animalToUse = character.favoriteAnimal;
      }
    } else {
      // Handle the new useAnimal toggle only when no character is selected
      // If useAnimal is false, we pass an empty string to ensure no animal is included
      animalToUse = useAnimal ? (animal || "lion") : "";
    }
    
    // Build the user prompt with character data or form data
    const prompt = buildStoryPrompt(
      nameToUse, 
      genderToUse, 
      animalToUse,
      theme, 
      biblicalEvent, 
      storyTemplate, 
      useTimeTravel, 
      character, 
      storyType || "regular", 
      heroOfFaithName, 
      customPrompt,
      useAnimal, // Pass the useAnimal toggle value
      biblePassage, // Pass the Bible passage
      readingLevel || "early-elementary", // Pass the reading level
      storyLength || "medium" // Pass the story length
    );
    
    // Build moral outcome specific instructions
    const moralOutcomeInstructions = {
      positive: "Create a story where the main character demonstrates good choices throughout and experiences positive outcomes. Show how following Christian values leads to blessing and joy.",
      learning: "Create a story where the main character makes a significant mistake or poor choice early in the story, realizes their error, feels genuine remorse, and takes action to make things right. Show the process of learning from mistakes, asking forgiveness, and growing in character.",
      consequences: "Create a story where the main character makes poor choices and experiences realistic consequences. DO NOT resolve the conflict - end the story with the character facing the results of their actions. Conclude with thoughtful questions that help readers reflect on what could have been done differently.",
      creative: "You have complete creative freedom for this story. Focus on unique, engaging storytelling while maintaining Christian values. Be innovative with plot, setting, and character development."
    };

    // Use custom system prompt if provided via Parent Mode, otherwise use default
    const systemPrompt = customPrompts?.systemPrompt || `You are a traditional orthodox Christian children's bedtime story author and Bible teacher. Create wholesome, faith-based stories and Bible teachings with moral lessons suitable for young children. Include Christian themes and values that align with traditional, orthodox Christian theology.

MORAL OUTCOME FOR THIS STORY: ${moralOutcome.toUpperCase()}
${moralOutcomeInstructions[moralOutcome]}

Your content should:
1. Be the appropriate length as specified in the prompt
2. Include clear moral lessons based on Christian values  
3. Be appropriate for the reading level specified in the prompt (ages 3-14)
4. If the story type is a biblical narrative, focus entirely on biblical events and characters with historical accuracy
5. For regular stories, include the specified child's name, gender, animal, and theme when provided
6. If a biblical event is specified, incorporate it into the narrative
7. If a time traveling character is specified, include them as an important part of the story
8. Never include content from Mormon, Jehovah's Witness, or other non-orthodox Christian theologies
9. For "positive" and "learning" outcomes: End with a message about God's love that connects to a Bible verse
10. For "consequences" outcome: End with 2-3 thoughtful questions instead of a Bible verse
11. When a specific Bible passage is provided, create either:
   a. A detailed narrative retelling of the passage if it contains a story
   b. A clear, educational explanation of the passage's meaning if it's theological/teaching content
12. ALWAYS end ALL stories with a "Further Learning" section with 2-3 credible Christian websites
13. ALWAYS include exactly 5 application questions at the end that help children apply the story's lessons to their own lives

IMPORTANT STORYTELLING GUIDELINES:
- Be CREATIVE with your story openings. AVOID generic openings like "Once upon a time" or "In a quaint little village"
- Choose UNIQUE settings, time periods, and scenarios that fit the theme
- Create DISTINCTIVE characters with memorable personalities and traits
- Use VARIED sentence structures and vocabulary appropriate for children
- Include UNEXPECTED but age-appropriate plot developments
- For biblical narratives, maintain historical accuracy while using engaging storytelling techniques
- NEVER use the same story structure repeatedly; each story should feel fresh and unique
- Make stories feel natural and conversational, not overly formal or scripted
- When creating content for a specific Bible passage, focus on making the theological content understandable to children while maintaining accuracy
- Ensure the Further Learning websites are specifically relevant to the story's central themes or biblical characters

Format your response as valid JSON with the following structure:
    {
      "title": "Story title",
      "content": "The full story content with proper paragraphs",
      "moralOutcome": "${moralOutcome}",
      "bibleVerse": ${moralOutcome === 'consequences' ? 'null' : '{"text": "Bible verse text", "reference": "Book Chapter:Verse"}'},
      "applicationQuestions": ["Question 1 about applying the lesson", "Question 2", "Question 3", "Question 4", "Question 5"],
      "imagePrompt": "A short description for an illustration of a key scene in the biblical style"
    }`;
    
    // Use the best available model based on length requirements
    // For longer stories, we need a model with higher token capacity
    // We'll prioritize the user's chosen model, but ensure we choose a model capable of longer output
    let model = userModel || "gpt-4o-mini";
    
    // Increase model capabilities if longer story is requested
    if (storyLength === "long" || storyLength === "extended") {
      model = userModel || "gpt-4o"; // Use the most capable model for longer stories
    }
    
    console.log("Using OpenAI model:", model);
    
    // Calculate appropriate max_tokens based on story length
    let maxTokens = 3500; // Default for "medium" length
    
    // Adjust token count based on story length
    switch(storyLength) {
      case "very-short":
        maxTokens = 2000;
        break;
      case "short":
        maxTokens = 3000;
        break;
      case "medium":
        maxTokens = 4000;
        break;
      case "long":
        maxTokens = 6000;
        break;
      case "extended":
        maxTokens = 8000;
        break;
      default:
        maxTokens = 4000; // Default to medium if unspecified
    }
    
    // Call OpenAI API with a fresh client using the appropriate API key
    const openaiClient = getOpenAIClient(userApiKey || undefined);
    
    // Log the request being sent to OpenAI
    console.log("\n=== OPENAI REQUEST ===");
    console.log("Model:", model);
    console.log("Max Tokens:", maxTokens);
    console.log("System Prompt:", systemPrompt);
    console.log("User Prompt:", prompt.toString());
    console.log("=====================\n");
    
    // Use custom user prompt if provided via Parent Mode, otherwise use generated prompt
    const userPrompt = customPrompts?.userPrompt || prompt.toString();
    
    const response = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: maxTokens
    });
    
    // Extract the response content
    const responseContent = response.choices[0].message.content || '';
    
    // Log the response from OpenAI
    console.log("\n=== OPENAI RESPONSE ===");
    console.log("Raw Response:", responseContent);
    console.log("Usage:", response.usage);
    console.log("======================\n");
    
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
        moralOutcome: moralOutcome,
        bibleVerse: moralOutcome === 'consequences' ? null : { text: bibleVerse.text, reference: bibleVerse.reference },
        applicationQuestions: [
          "What would you do in a similar situation?",
          "How can you apply this lesson in your daily life?",
          "What does this story teach us about God's love?",
          "How can you share this lesson with others?",
          "What Bible verses come to mind when you think about this story?"
        ],
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
    
    // Check if the content includes "For Further Learning:" section
    let finalContent = jsonContent.content || responseContent;
    
    // If "For Further Learning:" section is missing, add it
    if (!finalContent.includes("For Further Learning:") && !finalContent.includes("For Further Learning")) {
      // Add default further learning section based on story type
      let furtherLearningSection = "\n\n**For Further Learning:**\n\n";
      
      if (biblePassage && biblePassage.trim() !== "" && biblePassage !== 'none') {
        furtherLearningSection += `- **BibleGateway.com** - Read ${biblePassage} in multiple translations and access study notes about this passage.\n`;
        furtherLearningSection += `- **BibleStudyTools.com** - Find commentary and historical context for ${biblePassage}.\n`;
        furtherLearningSection += `- **GotQuestions.org** - Find answers to common questions about the themes in ${biblePassage}.`;
      } else if (storyType === "biblical_narrative") {
        if (biblicalEvent && biblicalEvent !== 'none' && biblicalEvent !== '') {
          furtherLearningSection += `- **BibleProject.com** - Watch animated videos explaining the biblical narrative of ${biblicalEvent}.\n`;
          furtherLearningSection += `- **BibleGateway.com** - Read the full biblical account of ${biblicalEvent} in multiple translations.\n`;
          furtherLearningSection += `- **Biblehub.com** - Access commentaries and historical context about ${biblicalEvent}.`;
        } else {
          furtherLearningSection += `- **BibleProject.com** - Watch animated videos explaining biblical narratives and themes.\n`;
          furtherLearningSection += `- **BibleGateway.com** - Read the full biblical accounts in multiple translations.\n`;
          furtherLearningSection += `- **Christianity.com** - Learn more about biblical stories and their historical contexts.`;
        }
      } else if (heroOfFaith && heroOfFaith !== 'none' && heroOfFaith !== '') {
        furtherLearningSection += `- **Christianity.com** - Learn more about the life and impact of ${heroOfFaith}.\n`;
        furtherLearningSection += `- **Crosswalk.com** - Explore articles about ${heroOfFaith} and other heroes of the faith.\n`;
        furtherLearningSection += `- **TheGospelCoalition.org** - Find resources about how ${heroOfFaith}'s example applies to Christian living today.`;
      } else {
        // General Christian themes
        furtherLearningSection += `- **BibleGateway.com** - Read Bible stories and passages in child-friendly translations.\n`;
        furtherLearningSection += `- **GotQuestions.org** - Find answers to questions about Christian faith in simple language.\n`;
        furtherLearningSection += `- **BibleProject.com** - Watch animated videos that explain biblical concepts for all ages.`;
      }
      
      finalContent += furtherLearningSection;
    }
    
    // Return the story with all required fields
    return {
      title: jsonContent.title || defaultTitle,
      content: finalContent,
      moralOutcome: moralOutcome,
      bibleVerse: moralOutcome === 'consequences' ? undefined : bibleVerse,
      applicationQuestions: jsonContent.applicationQuestions || [
        "What would you do in a similar situation?",
        "How can you apply this lesson in your daily life?",
        "What does this story teach us about God's love?",
        "How can you share this lesson with others?",
        "What Bible verses come to mind when you think about this story?"
      ],
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
    
    // Log the image generation request
    console.log("\n=== DALL-E REQUEST ===");
    console.log("Enhanced Prompt:", enhancedPrompt);
    console.log("Model: dall-e-3");
    console.log("======================\n");
    
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
    
    // Log the image analysis request
    console.log("\n=== IMAGE ANALYSIS REQUEST ===");
    console.log("User ID:", userId);
    console.log("Image Base64 Length:", imageBase64.length);
    console.log("===============================\n");
    
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
    
    // Log the image analysis response
    console.log("\n=== IMAGE ANALYSIS RESPONSE ===");
    console.log("Analysis:", analysisText);
    console.log("Usage:", response.usage);
    console.log("===============================\n");
    
    return analysisText;
    
  } catch (error) {
    console.error("Error analyzing image with OpenAI:", error);
    throw error;
  }
}

function buildStoryPrompt(childName: string = "", gender: string = "boy", animal: string = "", theme: string = "", biblicalEvent?: string | undefined, storyTemplate?: string | null, useTimeTravel?: boolean, character?: any, storyType: string = "regular", heroOfFaith?: string | undefined, customPrompt?: string | undefined, useAnimal?: boolean, biblePassage?: string | undefined, readingLevel: string = "early-elementary", storyLength: string = "medium"): string {
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

  // Adjust word count based on story length
  let wordCount = "1000";
  if (storyLength === "very-short") {
    wordCount = "300 to 500";
  } else if (storyLength === "short") {
    wordCount = "600 to 900";
  } else if (storyLength === "medium") {
    wordCount = "1000 to 1200";
  } else if (storyLength === "long") {
    wordCount = "1500 to 2000";
  } else if (storyLength === "extended") {
    wordCount = "2500 to 3000";
  }
  
  // Adjust reading level based on the selected level
  let readingLevelText = "";
  if (readingLevel === "preschool") {
    readingLevelText = "using very simple vocabulary suitable for ages 3-5. Use short sentences and basic concepts.";
  } else if (readingLevel === "kindergarten") {
    readingLevelText = "using simple vocabulary suitable for ages 5-6. Use relatively short sentences and straightforward concepts.";
  } else if (readingLevel === "early-elementary") {
    readingLevelText = "using vocabulary suitable for ages 6-8. Balance simple and more complex sentences.";
  } else if (readingLevel === "late-elementary") {
    readingLevelText = "using moderately advanced vocabulary suitable for ages 9-11. Include more complex sentence structures and concepts.";
  } else if (readingLevel === "middle-school") {
    readingLevelText = "using more advanced vocabulary suitable for ages 12-14. Include complex sentence structures and deeper concepts.";
  }
  
  prompt += ` The story should be approximately ${wordCount} words ${readingLevelText} Include a clear moral lesson at the end that relates to traditional Christian values.`;
  
  // Include Heroes of Faith if provided
  if (heroOfFaith && heroOfFaith !== 'none' && heroOfFaith !== '') {
    if (storyType === "biblical_narrative") {
      prompt += ` Focus on the historical Christian figure ${heroOfFaith}. Include accurate historical details about their life, ministry, and impact on Christianity.`;
    } else {
      prompt += ` Also, include the historical Christian figure ${heroOfFaith} in the story. They should make an appearance or be mentioned as part of the narrative, teaching about faith through their example or story.`;
    }
  }
  
  prompt += ` IMPORTANT: Ensure the story adheres ONLY to traditional orthodox Christian theology (Catholic, Orthodox, Protestant). Avoid ANY theological concepts from Mormon, Jehovah's Witness, or other non-traditional denominations. Focus on biblical teachings accepted in mainstream Christianity.
  
  REMEMBER: End ALL stories with a "For Further Learning:" section that lists 2-3 credible Christian websites where parents and children can learn more about the specific biblical concepts, characters, or themes in this story. Include brief descriptions of what they'll find on each site relevant to THIS specific story's content.`;

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

  // Add story length specification
  let lengthDescription;
  switch(storyLength) {
    case "very-short":
      lengthDescription = "very short (about 2-3 minutes reading time, 500-750 words)";
      break;
    case "short":
      lengthDescription = "short (about 4-5 minutes reading time, 750-1000 words)";
      break;
    case "medium":
      lengthDescription = "medium length (about 8-10 minutes reading time, 1500-2000 words)";
      break;
    case "long":
      lengthDescription = "long (about 15-20 minutes reading time, 2500-3500 words)";
      break;
    case "extended":
      lengthDescription = "very long (about 25-30 minutes reading time, 4000-5000 words)";
      break;
    default:
      lengthDescription = "medium length (about 8-10 minutes reading time, 1500-2000 words)";
  }
  
  prompt += ` Make sure to create a ${lengthDescription} story that will deeply engage the child while teaching important biblical principles.`;
  
  return prompt;
}