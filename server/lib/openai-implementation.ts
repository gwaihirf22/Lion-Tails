import OpenAI from 'openai';
import { StoryRequest, StoryResponse } from "@shared/schema";
import { getBiblicalEventStoryTemplate } from "../data/storyTemplates";
import { getBibleVerseByTheme } from "../data/bibleVerses";

// Initialize OpenAI API client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateStoryWithOpenAI(request: StoryRequest): Promise<StoryResponse> {
  const { childName, gender, animal, theme, biblicalEvent } = request;

  const storyTemplate = biblicalEvent ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
  const bibleVerse = getBibleVerseByTheme(theme);

  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not found");
      throw new Error("OpenAI API key not found");
    }

    const prompt = buildStoryPrompt(childName, gender, animal, theme, biblicalEvent, storyTemplate);
    
    // System prompt that defines what kind of response we want
    const systemPrompt = `You are a traditional orthodox Christian children's bedtime story author. Create wholesome, faith-based stories with moral lessons suitable for young children. Include Christian themes and values that align with traditional, orthodox Christian theology.
    
Your stories should:
1. Be at least 1000 words in length
2. Include clear moral lessons based on Christian values
3. Be appropriate for children ages 3-10
4. Include the specified child's name, gender, animal, and theme
5. If a biblical event is specified, incorporate it into the narrative
6. Never include content from Mormon, Jehovah's Witness, or other non-orthodox Christian theologies
7. End with a message about God's love that connects to the Bible verse that will be added later

Format your response as valid JSON with the following structure:
    {
      "title": "Story title",
      "content": "The full story content with proper paragraphs",
      "imagePrompt": "A short description for an illustration of a key scene in the biblical style"
    }`;
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
    
    // Return the story with the bible verse
    return {
      title: jsonContent.title || `${childName}'s Biblical Adventure`,
      content: jsonContent.content || responseContent,
      bibleVerse: bibleVerse,
      imagePrompt: jsonContent.imagePrompt || `A child named ${childName} with ${animal}s in a biblical setting`
    };
  } catch (error) {
    console.error("Error generating story with OpenAI:", error);
    throw error;
  }
}

function buildStoryPrompt(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent: string | undefined, storyTemplate: string | null): string {
  let prompt = `Write a traditional orthodox Christian bedtime story for a ${gender} named ${childName} who loves ${animal}s. The story should teach about ${theme}.`;

  if (biblicalEvent && biblicalEvent !== 'none') {
    if (storyTemplate) {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}. Use this template as inspiration: ${storyTemplate}`;
    } else {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}.`;
    }
  }

  prompt += ` The child should be the main character in the story and interact with ${animal}s. The story should be approximately 1000 words and include a clear moral lesson at the end that relates to traditional Christian values.`;
  
  prompt += ` IMPORTANT: Ensure the story adheres ONLY to traditional orthodox Christian theology (Catholic, Orthodox, Protestant). Avoid ANY theological concepts from Mormon, Jehovah's Witness, or other non-traditional denominations. Focus on biblical teachings accepted in mainstream Christianity.`;

  return prompt;
}