import { StoryRequest, StoryResponse } from "@shared/schema";
import { getBiblicalEventStoryTemplate } from "../data/storyTemplates";
import { getBibleVerseByTheme } from "../data/bibleVerses";
import { generateStoryWithOpenAI } from "./openai-implementation";
import { storage } from "../storage";

// Constants for our subscription model
const FREE_STORY_INITIAL_QUOTA = 50;
const FREE_STORY_MONTHLY_QUOTA = 10;
const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Function to check if user can generate a story with the free tier
async function canGenerateStoryWithFreeTier(userId: number = 1): Promise<boolean> {
  // Default to user ID 1 if not authenticated
  const count = await storage.getStoryGenerationCount(userId);
  const lastResetDate = await storage.getLastResetDate(userId);
  
  // If user has generated less than the initial quota, they can generate a story
  if (count < FREE_STORY_INITIAL_QUOTA) {
    return true;
  }
  
  // If it's been a month since the last reset, reset the counter
  // and give the user their monthly quota
  if (lastResetDate) {
    const now = new Date();
    const timeSinceLastReset = now.getTime() - lastResetDate.getTime();
    
    if (timeSinceLastReset >= MONTH_IN_MS) {
      // It's been a month, so reset the counter
      await storage.resetStoryGenerationCount(userId);
      return true;
    }
    
    // Check if user has monthly quota available
    const monthlyQuotaUsed = count - FREE_STORY_INITIAL_QUOTA;
    const currentMonthNumber = Math.floor(timeSinceLastReset / MONTH_IN_MS) + 1;
    const totalMonthlyQuota = FREE_STORY_MONTHLY_QUOTA * currentMonthNumber;
    
    return monthlyQuotaUsed < totalMonthlyQuota;
  }
  
  // If no reset date has been set, set it now and allow the generation
  await storage.setLastResetDate(userId, new Date());
  return true;
}

// Main story generation function
export async function generateStory(request: StoryRequest, userId: number = 1): Promise<StoryResponse> {
  const { childName, gender, animal, useAnimal, theme, biblicalEvent, useTimeTravel, characterId, storyType, heroOfFaith } = request;
  
  try {
    // Get the user's OpenAI key if they've provided one
    const userApiKey = await storage.getUserOpenAIKey(userId);
    
    // Check if user can generate a story with free tier if they don't have their own API key
    if (!userApiKey) {
      const canGenerate = await canGenerateStoryWithFreeTier(userId);
      
      if (!canGenerate) {
        return {
          title: "Story Generation Limit Reached",
          content: "You've reached your free story generation limit. Please provide your own OpenAI API key in Settings to continue generating stories, or wait until next month when your free quota refreshes.",
          bibleVerse: {
            text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.",
            reference: "Philippians 4:19"
          },
          imageUrl: undefined
        };
      }
      
      // Increment the counter for free tier
      await storage.incrementStoryGenerationCount(userId);
    }
    
    // Get a story template if there's a biblical event
    const storyTemplate = biblicalEvent ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
    
    // Get a bible verse related to the theme
    const bibleVerse = getBibleVerseByTheme(theme);
    
    // For time travel stories, we need to handle them differently
    if (useTimeTravel && characterId) {
      // Get bible verse related to the theme
      // Use the OpenAI implementation to generate a story
      const generatedStory = await generateStoryWithOpenAI(request, userId);
      
      // Add the bible verse to the response
      return {
        ...generatedStory,
        bibleVerse
      };
    }
    
    // For regular stories when no API key is available (neither user nor environment)
    if (!userApiKey && !process.env.OPENAI_API_KEY) {
      // Handle edge case where childName is undefined
      const safeChildName = childName || "Child";
      const safeGender = gender || "boy";
      
      // Use default animal and theme if they are not provided
      // Apply useAnimal toggle - set empty string if useAnimal is false
      const safeAnimal = useAnimal === false ? "" : (animal || "lamb");
      const safeTheme = theme || "faith";
      
      // Get hero of faith information if one is selected
      let heroOfFaithName = undefined;
      if (heroOfFaith && heroOfFaith !== 'none') {
        const heroOfFaithObject = await storage.getHeroOfFaithById(heroOfFaith);
        if (heroOfFaithObject) {
          heroOfFaithName = heroOfFaithObject.name;
        }
      }
      
      console.log("No API key available, using demo story");
      return getDemoStory(safeChildName, safeGender, safeAnimal, safeTheme, biblicalEvent, bibleVerse, heroOfFaithName, useAnimal);
    }
    
    // Use the OpenAI implementation to generate a story with userId for API key access
    const generatedStory = await generateStoryWithOpenAI(request, userId);
    
    // Add the bible verse to the response
    return {
      ...generatedStory,
      bibleVerse
    };
  } catch (error) {
    console.error("Error generating story:", error);
    
    // Return a friendly error message
    return {
      title: "Story Generation Error",
      content: "There was a problem generating your story. Please try again or check your API key settings.",
      bibleVerse: {
        text: "Trust in the LORD with all your heart and lean not on your own understanding.",
        reference: "Proverbs 3:5"
      },
      imageUrl: undefined
    };
  }
}

// Function to build prompt for story generation
function buildStoryPrompt(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent: string | undefined, storyTemplate: string | null, useTimeTravel?: boolean, characterId?: string, heroOfFaith?: string, useAnimal?: boolean): string {
  // Normalize "none" values
  const animalToUse = animal === "none" ? "lamb" : animal || "lamb";
  const themeToUse = theme === "none" ? "faith" : theme || "faith";
  const biblicalEventToUse = biblicalEvent === "none" ? undefined : biblicalEvent;
  
  let promptText = `Create a Christian bedtime story for a ${gender} named ${childName}`;
  
  // Only include animal in the prompt if useAnimal is true (or undefined/not provided)
  if (useAnimal !== false && animal && animal !== "none") {
    promptText += ` about a ${animal}`;
  }
  
  if (theme && theme !== "none") {
    promptText += ` with a theme of "${theme}"`;
  }
  
  if (biblicalEventToUse) {
    promptText += ` based on the biblical event "${biblicalEventToUse}"`;
    if (storyTemplate) {
      promptText += `. Use this story template as a guide: ${storyTemplate}`;
    }
  }
  
  if (heroOfFaith && heroOfFaith !== "none") {
    promptText += `. Also include the historical Christian figure "${heroOfFaith}" as part of the story, teaching the child about faith through their example.`;
  }
  
  promptText += `. The story should be at least 1000 words, child-friendly, include moral lessons, and end with a Bible verse related to ${themeToUse}. Title the story appropriately.

Use this format for your response:
Title: [Story Title]
Content: [Full story content]

The story should be engaging, descriptive, and have a clear beginning, middle, and end. It should include dialogue and be written at a level that a child can understand but also enjoy. The tone should be warm, reassuring, and convey Christian values.`;
  
  return promptText;
}

// Function to provide a demo story when not using OpenAI
function getDemoStory(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent: string | undefined, bibleVerse: { text: string, reference: string }, heroOfFaith?: string, useAnimal: boolean = true): StoryResponse {
  // Normalize "none" values  
  // Use the animal if provided and not "none"
  const animalToUse = animal === "none" ? "lamb" : animal || "lamb";
  
  // Use the theme if provided and not "none"
  const themeToUse = theme === "none" ? "faith" : theme || "faith";
  
  // Handle biblicalEvent
  const biblicalEventToUse = biblicalEvent === "none" ? undefined : biblicalEvent;

  // Set default title and content
  let title = `${childName}'s Wonderful ${themeToUse.charAt(0).toUpperCase() + themeToUse.slice(1)} Adventure`;
  
  // Create different story content based on the useAnimal toggle
  let content = `Once upon a time in a cozy little house at the edge of a sleepy town, there lived a child named ${childName}. `;
  
  // Only add animal references if useAnimal is true and an animal is provided
  if (useAnimal && animalToUse) {
    content += `${childName} had a special love for ${animalToUse}s and could spend hours watching them, drawing pictures of them, and reading stories about them. `;
  }
  
  content += `Every night before bed, ${childName}'s parents would read Bible stories, and ${childName} would drift off to sleep imagining what it would be like to be part of those amazing adventures.

"Mommy," ${childName} would ask, "do you think Noah was scared when God told him to build such a big boat?"

${gender === 'boy' ? 'His' : 'Her'} mother smiled gently. "I'm sure Noah felt afraid sometimes, just like we all do. But Noah trusted God, and that's what made him brave."

That night, after ${gender === 'boy' ? 'his' : 'her'} mother tucked ${gender === 'boy' ? 'him' : 'her'} into bed and kissed ${gender === 'boy' ? 'him' : 'her'} goodnight, ${childName} drifted off to sleep. In ${gender === 'boy' ? 'his' : 'her'} dreams, ${gender === 'boy' ? 'he' : 'she'} found ${gender === 'boy' ? 'himself' : 'herself'} standing in a vast field, where a kind-looking man with a long beard was measuring wood for a massive structure.

"Hello there, young one," the man said when he noticed ${childName}. "I'm Noah. Would you like to help me build God's ark?"

${childName}'s eyes widened with wonder. "Really? I can help you?"

Noah nodded with a warm smile. "God has given us a big job to do. When people are afraid, it helps to have friends working alongside us."

${childName} was eager to help. Together with Noah and his family, ${childName} learned how to measure wood, hammer nails, and seal the ark with pitch to keep the water out. The work was hard, but ${childName} felt proud to be helping with God's special plan.

"Noah," ${childName} asked one day as they worked side by side, "why aren't other people helping us build the ark?"

Noah's face grew sad. "I've tried to tell them about God's plan to send rain, but they don't believe me. They've never seen rain before, so they think I'm being silly."

"That must make you feel lonely," ${childName} said.

"Sometimes," Noah admitted. "But I know God is with me, and now I have you to help me too."

As the days passed, ${childName} noticed people from the nearby village coming to point and laugh at Noah's big boat sitting on dry land. Some of them said unkind things and called Noah foolish.

"Why do they make fun of us?" ${childName} asked, feeling hurt by their words.

"Sometimes people are afraid of things they don't understand," Noah explained. "Instead of trying to learn, they mock what seems strange to them. But we must keep doing what God has asked, even when others don't understand."

${childName} thought about this. "Like when my friends laughed at me for sharing my toys with the new kid at school?"

"Exactly like that," Noah said. "You showed ${themeToUse} even when it wasn't popular. That takes real courage."

Finally, after many days of hard work, the ark was complete. Noah began gathering the animals, just as God had instructed. ${childName} was amazed to see animals of every kind coming in pairs—tall giraffes, powerful elephants, tiny mice${useAnimal && animalToUse ? `, and beautiful ${animalToUse}s too` : ""}.

${useAnimal && animalToUse ? `
"Look, Noah!" ${childName} exclaimed, pointing to a pair of ${animalToUse}s approaching the ark. "Those are my favorites!"

Noah smiled. "Would you like to help guide them to their special place on the ark?"

${childName} nodded eagerly and gently led the ${animalToUse}s up the ramp and into the ark. The animals seemed to trust ${childName}, following quietly to their designated area where fresh hay and water awaited them.` : `
"Look at all the animals, Noah!" ${childName} exclaimed with wonder. "There are so many!"

Noah smiled. "God is bringing them to us, two by two. Would you like to help guide some of them to their places on the ark?"

${childName} nodded eagerly and helped Noah organize the animals, showing them to their designated areas where fresh hay and water awaited them.`}

Once all the animals were safely aboard, Noah turned to ${childName} with a serious expression. "God has told me that the rain will start today. It's time for us to enter the ark."

Just as Noah's family and ${childName} settled inside, the first raindrops began to fall. Soon, the gentle patter turned into a heavy downpour. Water rose around the ark, lifting it off the ground.

${childName} felt a flutter of fear in ${gender === 'boy' ? 'his' : 'her'} stomach. "Noah, what if the ark leaks? What if we drift forever? What if—"

Noah placed a reassuring hand on ${childName}'s shoulder. "It's okay to feel afraid. But remember, God promised to keep us safe, and God always keeps His promises."

For forty days and forty nights, the rain continued. ${childName} helped Noah and his family feed the animals and keep the ark clean. ${useAnimal && animalToUse ? `The ${animalToUse}s became ${childName}'s special friends, and they would nuzzle ${childName}'s hand whenever they came near.` : `Many of the animals became familiar with ${childName}, and some would even approach when ${gender === 'boy' ? 'he' : 'she'} came to feed them.`}

One day, the rain stopped. The ark came to rest on a mountaintop, but water still covered the earth. Noah sent out a raven, and then a dove, to look for dry land, but the dove returned with nothing.

"We need to be patient," Noah told ${childName}, who was eager to see land again. "God's timing is perfect, even when waiting is hard."

After seven more days, Noah sent the dove out again. This time, it returned with a fresh olive leaf in its beak. ${childName} jumped with joy! "Land! There must be dry land!"

"Yes," Noah agreed with a smile. "Soon we will start anew on clean earth."

When the waters finally receded, God told Noah it was safe to leave the ark. As ${childName} stepped onto solid ground for the first time in many weeks, a beautiful sight appeared in the sky—a vibrant rainbow arching from one end of the horizon to the other.

"What is that?" ${childName} gasped.

"That is God's promise," Noah explained. "God promises never to flood the whole earth again. Whenever you see a rainbow, remember that God keeps His promises."

${childName} looked at the colorful arc in the sky and felt a warm sense of peace. "Just like God kept us safe on the ark."

"That's right," Noah said. "And God will always be with you, guiding you and keeping you safe, even when you face scary situations."

As ${childName} helped release the animals back into the world, ${useAnimal && animalToUse ? `the ${animalToUse}s paused beside ${childName} as if to say thank you before bounding off to explore their new home.` : `the animals scattered in all directions, eager to explore their new home.`}

When ${childName} awoke the next morning, the dream felt so real that they hurried to tell their mother all about helping Noah ${useAnimal && animalToUse ? `and the special ${animalToUse}s` : `and all the amazing animals`} on the ark.

Mother listened with a smile. "What a wonderful dream! And what did you learn from your adventure?"

${childName} thought for a moment. "I learned that being brave doesn't mean not feeling scared. It means trusting God even when we are scared. And I learned about ${themeToUse}—how important it is to keep doing the right thing even when others don't understand."

"Those are beautiful lessons," Mother said, giving ${childName} a hug. "And just like God was with Noah through the flood, God is always with you too."

${heroOfFaith ? `
"You know," Mother added thoughtfully, "your story reminds me of ${heroOfFaith}, who also showed great faith in difficult times. Would you like me to tell you about ${heroOfFaith} tomorrow night?"

${childName} nodded eagerly. "Yes, please! I want to learn about all the heroes of faith!"

"That's wonderful," Mother smiled. "There are so many amazing examples of faithful people throughout history that we can learn from."
` : ''}

That night, as ${childName} gazed out the window before bed, a spring shower began to fall. And there, arching across the evening sky, was a beautiful rainbow—God's promise shining bright. ${childName} smiled, remembering the brave journey and the important lessons learned aboard Noah's Ark.`;
  
  // Add Bible verse to the output
  const bibleVerseText = bibleVerse ? `\n\n"${bibleVerse.text}" - ${bibleVerse.reference}` : "";
  
  // Return the complete story response object
  return {
    title,
    content: content + bibleVerseText,
    bibleVerse,
    imageUrl: undefined // This will be generated separately if needed
  };
}