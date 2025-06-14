import OpenAI from "openai";
import { StoryRequest, StoryResponse } from "@shared/schema";
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { storage } from "../storage";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { v4 as uuidv4 } from "uuid";

// Function to get an OpenAI client with the current API key
function getOpenAIClient(apiKey?: string | null) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("No OpenAI API key available");
    throw new Error("OpenAI API key not found");
  }
  console.log(
    "Using OpenAI client with API key:",
    key ? "API key is set" : "No API key available",
  );
  return new OpenAI({ apiKey: key });
}

// Helper function to get word count from length setting
function getWordCountFromLength(length: string): number {
  // Reading time is ~140 words per minute for children.
  switch (length) {
    case "very-short":
      return 500; // ~3 minutes
    case "short":
      return 1000; // ~6 minutes
    case "medium":
      return 1500; // ~11 minutes
    case "long":
      return 2500; // ~18 minutes
    case "extended":
      return 3500; // ~25 minutes
    default:
      return 1500;
  }
}

// Helper function to count words in text
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

// =========================================================================
// HELPER FUNCTIONS (DEFINED BEFORE THEY ARE USED)
// =========================================================================

// <<< NEW HELPER for Short Stories (Single API Call) >>>
async function generateShortStorySingleCall(
  client: OpenAI,
  request: StoryRequest,
  wordCount: number,
  debugData: any[],
  customPrompts?: { systemPrompt: string; userPrompt: string }
): Promise<{
  title: string;
  content: string;
  applicationQuestions: string[];
  imagePrompt: string;
}> {
  const { childName, gender, animal, useAnimal, theme, readingLevel, biblicalEvent, heroOfFaith, characterId, characterDetails, useCustomPrompts, customSystemPrompt, customUserPrompt } = request;

  // Get character details if a character is selected
  let selectedCharacter = null;
  if (characterId) {
    try {
      const characters = await storage.getAllCharacters();
      selectedCharacter = characters.find(char => char.id === characterId);
    } catch (error) {
      console.log("Could not fetch character details:", error);
    }
  }

  // Use selected character details if available, otherwise use form data or characterDetails
  const finalName = selectedCharacter?.name || childName || "A child";
  const finalGender = selectedCharacter?.gender || gender || "child";
  const finalAge = selectedCharacter?.age || characterDetails?.age;
  const finalAnimal = selectedCharacter?.favoriteAnimal || characterDetails?.favoriteAnimal || (useAnimal !== false ? animal : "");

  // Check if custom prompts should be used
  const finalPrompts = (request.useCustomPrompts && request.customSystemPrompt && request.customUserPrompt) || customPrompts ? {
    systemPrompt: customPrompts?.systemPrompt || request.customSystemPrompt || `You are a Christian children's storyteller who writes concise, self-contained short stories with a clear moral.`,
    userPrompt: customPrompts?.userPrompt || request.customUserPrompt || `Please create a complete, faith-based children's story.`
  } : null;

  const systemPrompt = finalPrompts?.systemPrompt || `You are a Christian children's storyteller who writes concise, self-contained short stories with a clear moral.`;
  
  const userPrompt = finalPrompts?.userPrompt || `
    Please create a complete, faith-based children's story.

    Character Details:
    - Main Character: ${finalName} (${finalGender}${finalAge ? `, ${finalAge} years old` : ""})
    ${finalAnimal && finalAnimal !== "none" ? `- Favorite Animal: ${finalAnimal}` : ""}
    - Theme: ${theme || "Faith and kindness"}
    - Reading Level: ${readingLevel || "early-elementary"}
    ${biblicalEvent ? `- Biblical Event: ${biblicalEvent}` : ""}
    ${heroOfFaith ? `- Hero of Faith: ${heroOfFaith}` : ""}

    CRITICAL INSTRUCTION: The entire story's content MUST be approximately ${wordCount} words long.

    Respond with a single, valid JSON object with the following structure:
    {
      "title": "A creative story title",
      "content": "The full story text, approximately ${wordCount} words.",
      "applicationQuestions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"],
      "imagePrompt": "A short description for an illustrator for a key scene."
    }
  `;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 2048, // Ample room for a short story + JSON
  });

  const responseContent = response.choices[0].message.content || "";
  debugData.push({
    step: "generateShortStorySingleCall",
    systemPrompt: systemPrompt,
    userPrompt: userPrompt,
    prompt: userPrompt,
    response: responseContent,
    wordCount: countWords(JSON.parse(responseContent).content || ""),
    model: "gpt-4o",
    targetWordCount: wordCount,
    maxTokens: 2048,
    timestamp: new Date().toISOString()
  });

  return JSON.parse(responseContent);
}

// HELPER for Long Stories (Outline Generation)
async function generateStoryOutline(
  client: OpenAI,
  request: StoryRequest,
  wordCount: number,
  debugData: any[],
): Promise<string[]> {
  const { childName, gender, animal, useAnimal, theme, biblicalEvent, heroOfFaith, characterId, characterDetails } = request;
  
  // Get character details if a character is selected
  let selectedCharacter = null;
  if (characterId) {
    try {
      const characters = await storage.getAllCharacters();
      selectedCharacter = characters.find(char => char.id === characterId);
    } catch (error) {
      console.log("Could not fetch character details:", error);
    }
  }

  // Use selected character details if available, otherwise use form data or characterDetails
  const finalName = selectedCharacter?.name || childName || "A child";
  const finalGender = selectedCharacter?.gender || gender || "child";
  const finalAge = selectedCharacter?.age || characterDetails?.age;
  const finalAnimal = selectedCharacter?.favoriteAnimal || characterDetails?.favoriteAnimal || (useAnimal !== false ? animal : "");

  // <<< FIXED: Using the simple, direct calculation you suggested.
  const numberOfChapters = Math.ceil(wordCount / 500);

  const systemPrompt = `You are a master Christian children's storyteller. Your task is to create a detailed plan for a story.`;
  const userPrompt = `
    Please create a chapter-by-chapter outline for a Christian children's story.
    The final story should be approximately ${wordCount} words long.

    Character Details:
    - Main Character: ${finalName} (${finalGender}${finalAge ? `, ${finalAge} years old` : ""})
    ${finalAnimal && finalAnimal !== "none" ? `- Favorite Animal: ${finalAnimal}` : ""}
    - Theme: ${theme || "Faith and kindness"}
    ${biblicalEvent ? `- Biblical Event: ${biblicalEvent}` : ""}
    ${heroOfFaith ? `- Hero of Faith: ${heroOfFaith}` : ""}

    Instructions:
    Create a detailed outline with EXACTLY ${numberOfChapters} parts. Each part must be a distinct scene or chapter that builds the story around the main character.

    Respond with ONLY a valid JSON object in the format: { "outline": ["Chapter 1...", "Chapter 2...", ...] }
  `;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 2048,
  });

  const responseContent = response.choices[0].message.content || "";
  debugData.push({
    step: "generateOutline",
    prompt: userPrompt,
    response: responseContent,
  });
  return JSON.parse(responseContent).outline;
}

// HELPER for Long Stories (Chapter Generation)
async function generateStoryChapter(
  client: OpenAI,
  request: StoryRequest,
  chapterOutline: string,
  storySoFar: string,
  debugData: any[],
): Promise<string> {
  const { readingLevel, storyLength } = request;
  const totalWordCount = getWordCountFromLength(storyLength || "medium");
  const numberOfChapters = Math.max(3, Math.ceil(totalWordCount / 500));
  const wordCountPerChapter = totalWordCount / numberOfChapters;

  const systemPrompt = `You are a talented Christian children's story author. Continue writing a story based on the context provided. Focus ONLY on writing the current part of the story. Do NOT summarize or add titles/questions.`;
  const userPrompt = `
      Here is the story so far:
      ---
      ${storySoFar || "This is the very first chapter."}
      ---

      Now, write the next part of the story based on this instruction: "${chapterOutline}"

      CRITICAL INSTRUCTION: Write a detailed chapter of AT LEAST ${Math.round(wordCountPerChapter)} words.
    `;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });

  const chapterContent = response.choices[0].message.content || "";
  debugData.push({
    step: `generateChapter: ${chapterOutline.substring(0, 30)}...`,
    prompt: userPrompt,
    wordCount: countWords(chapterContent),
  });
  return chapterContent;
}

// HELPER for Long Stories (Final Details)
async function finalizeStoryDetails(
  client: OpenAI,
  fullStory: string,
  debugData: any[],
): Promise<{
  title: string;
  applicationQuestions: string[];
  imagePrompt: string;
}> {
  const systemPrompt = `You are a helpful assistant. Based on the provided story, generate a title, 5 application questions, and an image prompt.`;
  const userPrompt = `
    Here is the complete children's story:
    ---
    ${fullStory}
    ---

    Respond with ONLY a valid JSON object: { "title": "...", "applicationQuestions": ["...", "...", "..."], "imagePrompt": "..." }
  `;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.6,
    max_tokens: 2048,
  });

  const responseContent = response.choices[0].message.content || "";
  debugData.push({ step: "finalizeStory" });
  return JSON.parse(responseContent);
}

// =========================================================================
// MAIN ORCHESTRATOR FUNCTION (NOW WITH HYBRID LOGIC)
// =========================================================================
export async function generateStoryWithOpenAI(
  request: StoryRequest,
  userId: number = 1,
  customPrompts?: { systemPrompt: string; userPrompt: string }
): Promise<StoryResponse & { debugData?: any[] }> {
  const { storyLength, theme, useCustomPrompts, customSystemPrompt, customUserPrompt } = request;

  const userApiKey = await storage.getUserOpenAIKey(userId);
  const openaiClient = getOpenAIClient(userApiKey || undefined);
  const targetWordCount = getWordCountFromLength(storyLength || "medium");
  const debugData: any[] = [];
  const moralOutcomes: Array<
    "positive" | "learning" | "consequences" | "creative"
  > = ["positive", "learning", "consequences", "creative"];
  const moralOutcome = moralOutcomes[Math.floor(Math.random() * 4)];

  console.log(`Starting story generation. Target: ${targetWordCount} words.`);

  try {
    let finalDetails: {
      title: string;
      content: string;
      applicationQuestions: string[];
      imagePrompt: string;
    };

    // <<< HYBRID LOGIC >>>
    // Use the right tool for the job based on length
    if (targetWordCount < 1000) {
      // --- SINGLE-CALL METHOD FOR SHORT STORIES ---
      console.log("Using single-call method for short story.");
      const shortStoryResult = await generateShortStorySingleCall(
        openaiClient,
        request,
        targetWordCount,
        debugData,
        customPrompts,
      );
      finalDetails = {
        title: shortStoryResult.title,
        content: shortStoryResult.content,
        applicationQuestions: shortStoryResult.applicationQuestions,
        imagePrompt: shortStoryResult.imagePrompt,
      };
    } else {
      // --- MULTI-STEP METHOD FOR LONG STORIES ---
      console.log("Using multi-step method for long story.");

      // Step 1: Outline
      const outline = await generateStoryOutline(
        openaiClient,
        request,
        targetWordCount,
        debugData,
      );
      if (!outline || outline.length === 0)
        throw new Error("Failed to generate a valid story outline.");

      // Step 2: Chapters
      let fullStoryContent = "";
      for (let i = 0; i < outline.length; i++) {
        console.log(` - Generating part ${i + 1}/${outline.length}...`);
        const chapterContent = await generateStoryChapter(
          openaiClient,
          request,
          outline[i],
          fullStoryContent,
          debugData,
        );
        fullStoryContent += (fullStoryContent ? "\n\n" : "") + chapterContent;
        console.log(
          ` - Part ${i + 1} added. Word count: ${countWords(fullStoryContent)}`,
        );
      }

      // Step 3: Final Details
      const finalizedParts = await finalizeStoryDetails(
        openaiClient,
        fullStoryContent,
        debugData,
      );
      finalDetails = {
        title: finalizedParts.title,
        content: fullStoryContent,
        applicationQuestions: finalizedParts.applicationQuestions,
        imagePrompt: finalizedParts.imagePrompt,
      };
    }

    // --- COMMON FINAL STEPS FOR ALL STORIES ---
    console.log("Assembling final response and generating image...");
    let imageUrl: string | undefined = undefined;
    if (userApiKey) {
      try {
        imageUrl = await generateStoryImage(finalDetails.imagePrompt, userId);
      } catch (imageError) {
        console.error("Error generating story image:", imageError);
      }
    }

    if (!finalDetails.content.includes("For Further Learning")) {
      finalDetails.content +=
        "\n\n**For Further Learning:**\n\n- **BibleGateway.com** - Read Bible stories.\n- **GotQuestions.org** - Find answers about faith.";
    }

    const bibleVerse = getBibleVerseByTheme(
      theme && theme !== "none" ? theme : "faith",
    );

    return {
      title: finalDetails.title,
      content: finalDetails.content,
      moralOutcome: moralOutcome,
      bibleVerse: moralOutcome === "consequences" ? undefined : bibleVerse,
      applicationQuestions: finalDetails.applicationQuestions,
      imagePrompt: finalDetails.imagePrompt,
      imageUrl: imageUrl,
      debugData: debugData,
    };
  } catch (error) {
    console.error("Error in orchestrated story generation process:", error);
    if (error instanceof Error) {
      (error as any).debugData = debugData;
    }
    throw error;
  }
}

// =========================================================================
// OTHER EXPORTED FUNCTIONS (Image Generation, etc.)
// =========================================================================

export async function generateStoryImage(
  imagePrompt: string,
  userId: number = 1,
): Promise<string | undefined> {
  // ... this function remains the same ...
  try {
    const apiKey = await storage.getUserOpenAIKey(userId);
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      return undefined;
    }
    const imagesDir = path.join(process.cwd(), "public", "images", "stories");
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const filename = `story_${uuidv4()}.png`;
    const filepath = path.join(imagesDir, filename);
    const enhancedPrompt = `${imagePrompt}. Render in a beautiful, child-friendly biblical illustration style with soft colors.`;
    const openaiClient = getOpenAIClient(apiKey || undefined);
    const response = await openaiClient.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
    });
    if (response.data[0]?.url) {
      await downloadImage(response.data[0].url, filepath);
      return `/public/images/stories/${filename}`;
    }
    return undefined;
  } catch (error) {
    console.error("Error generating image with DALL-E:", error);
    return undefined;
  }
}

function downloadImage(url: string, filepath: string): Promise<void> {
  // ... this function remains the same ...
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(`Failed to download image: ${response.statusCode}`),
          );
        }
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", (err) => {
          fs.unlink(filepath, () => {});
          reject(err);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

export async function analyzeImageWithOpenAI(
  imageBase64: string,
  userId: number = 1,
): Promise<string> {
  // ... this function remains the same ...
  try {
    const apiKey = await storage.getUserOpenAIKey(userId);
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not found");
    }
    const openaiClient = getOpenAIClient(apiKey || undefined);
    const systemPrompt = `You are a helpful Christian children's content analyzer...`; // Truncated
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please analyze this image:" },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });
    return (
      response.choices[0].message.content || "Could not analyze the image."
    );
  } catch (error) {
    console.error("Error analyzing image with OpenAI:", error);
    throw error;
  }
}
