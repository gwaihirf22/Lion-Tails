import { DeepseekAPI } from '@deepseek/api';
import { StoryRequest, StoryResponse } from "@shared/schema";
import { getDemoStory } from "./demoStories";
import { getBiblicalEventStoryTemplate } from "../data/storyTemplates";
import { getBibleVerseByTheme } from "../data/bibleVerses";

const deepseek = new DeepseekAPI(process.env.DEEPSEEK_API_KEY);

export async function generateStory(request: StoryRequest): Promise<StoryResponse> {
  const { childName, gender, animal, theme, biblicalEvent } = request;

  const storyTemplate = biblicalEvent ? getBiblicalEventStoryTemplate(biblicalEvent) : null;
  const bibleVerse = getBibleVerseByTheme(theme);

  try {
    if (process.env.DEEPSEEK_API_KEY === undefined || process.env.DEEPSEEK_API_KEY === "demo-key") {
      return getDemoStory(childName, gender, animal, theme, biblicalEvent, bibleVerse);
    }

    const prompt = buildStoryPrompt(childName, gender, animal, theme, biblicalEvent, storyTemplate);

    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { 
          role: "system", 
          content: `You are a Christian children's bedtime story author. Create wholesome, faith-based stories with moral lessons suitable for young children. Include Christian themes and values.

          The story should be approximately 1000 words long. The child should learn a moral lesson that aligns with Biblical teachings.

          Format your response as valid JSON with the following structure:
          {
            "title": "Story title",
            "content": "The full story content with proper paragraphs",
            "imagePrompt": "A short description for an illustration of a key scene"
          }`
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const messageContent = response.choices[0].message.content || '{}';
    const jsonContent = JSON.parse(messageContent);

    return {
      title: jsonContent.title,
      content: jsonContent.content,
      bibleVerse: bibleVerse,
      imagePrompt: jsonContent.imagePrompt
    };
  } catch (error) {
    console.error("Error generating story with Deepseek:", error);
    return getDemoStory(childName, gender, animal, theme, biblicalEvent, bibleVerse);
  }
}

function buildStoryPrompt(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent: string | undefined, storyTemplate: string | null): string {
  let prompt = `Write a Christian bedtime story for a ${gender} named ${childName} who loves ${animal}s. The story should teach about ${theme}.`;

  if (biblicalEvent && biblicalEvent !== 'none') {
    if (storyTemplate) {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}. Use this template as inspiration: ${storyTemplate}`;
    } else {
      prompt += ` The story should be based on the biblical story of ${biblicalEvent}.`;
    }
  }

  prompt += ` The child should be the main character in the story and interact with ${animal}s. The story should be approximately 1000 words and include a clear moral lesson at the end that relates to Christian values.`;

  return prompt;
}

// Common Christian chord progressions (for demo mode)
const commonChordProgressions = [
  ['G', 'D', 'Em', 'C'],
  ['C', 'G', 'Am', 'F'],
  ['D', 'A', 'Bm', 'G'],
  ['E', 'B', 'C#m', 'A'],
  ['F', 'C', 'Dm', 'Bb'],
];

// Common guitar chords with fingering information
const commonChords = {
  'G': {
    name: 'G',
    fingering: {
      string1: 3, // 3rd fret on high E
      string2: 0, // open B
      string3: 0, // open G
      string4: 0, // open D
      string5: 2, // 2nd fret on A
      string6: 3, // 3rd fret on low E
    }
  },
  'C': {
    name: 'C',
    fingering: {
      string1: 0, // open high E
      string2: 1, // 1st fret on B
      string3: 0, // open G
      string4: 2, // 2nd fret on D
      string5: 3, // 3rd fret on A
      string6: -1, // don't play low E
    }
  },
  'D': {
    name: 'D',
    fingering: {
      string1: 2, // 2nd fret on high E
      string2: 3, // 3rd fret on B
      string3: 2, // 2nd fret on G
      string4: 0, // open D
      string5: -1, // don't play A
      string6: -1, // don't play low E
    }
  },
  'A': {
    name: 'A',
    fingering: {
      string1: 0, // open high E
      string2: 2, // 2nd fret on B
      string3: 2, // 2nd fret on G
      string4: 2, // 2nd fret on D
      string5: 0, // open A
      string6: -1, // don't play low E
    }
  },
  'E': {
    name: 'E',
    fingering: {
      string1: 0, // open high E
      string2: 0, // open B
      string3: 1, // 1st fret on G
      string4: 2, // 2nd fret on D
      string5: 2, // 2nd fret on A
      string6: 0, // open low E
    }
  },
  'F': {
    name: 'F',
    fingering: {
      string1: 1, // 1st fret on high E
      string2: 1, // 1st fret on B
      string3: 2, // 2nd fret on G
      string4: 3, // 3rd fret on D
      string5: 3, // 3rd fret on A
      string6: 1, // 1st fret on low E (barre)
    },
    barres: [{ fromString: 1, toString: 6, fret: 1 }]
  },
  'Am': {
    name: 'Am',
    fingering: {
      string1: 0, // open high E
      string2: 1, // 1st fret on B
      string3: 2, // 2nd fret on G
      string4: 2, // 2nd fret on D
      string5: 0, // open A
      string6: -1, // don't play low E
    }
  },
  'Em': {
    name: 'Em',
    fingering: {
      string1: 0, // open high E
      string2: 0, // open B
      string3: 0, // open G
      string4: 2, // 2nd fret on D
      string5: 2, // 2nd fret on A
      string6: 0, // open low E
    }
  },
  'Dm': {
    name: 'Dm',
    fingering: {
      string1: 1, // 1st fret on high E
      string2: 3, // 3rd fret on B
      string3: 2, // 2nd fret on G
      string4: 0, // open D
      string5: -1, // don't play A
      string6: -1, // don't play low E
    }
  },
  'Bm': {
    name: 'Bm',
    fingering: {
      string1: 2, // 2nd fret on high E
      string2: 3, // 3rd fret on B
      string3: 4, // 4th fret on G
      string4: 4, // 4th fret on D
      string5: 2, // 2nd fret on A
      string6: -1, // don't play low E
    }
  },
  'C#m': {
    name: 'C#m',
    fingering: {
      string1: 4, // 4th fret on high E
      string2: 5, // 5th fret on B
      string3: 6, // 6th fret on G
      string4: 6, // 6th fret on D
      string5: 4, // 4th fret on A
      string6: -1, // don't play low E
    }
  },
  'Bb': {
    name: 'Bb',
    fingering: {
      string1: 1, // 1st fret on high E
      string2: 3, // 3rd fret on B
      string3: 3, // 3rd fret on G
      string4: 3, // 3rd fret on D
      string5: 1, // 1st fret on A
      string6: -1, // don't play low E
    }
  }
};

function getDemoStory(childName: string, gender: string = "boy", animal: string, theme: string, biblicalEvent: string | undefined, bibleVerse: { text: string, reference: string }): StoryResponse {
  let title;
  let content;

  if (biblicalEvent === "none") {
    biblicalEvent = undefined;
  }

  if (biblicalEvent === "noahs-ark") {
    title = `${childName}'s Brave Journey on Noah's Ark`;
    content = `Once upon a time, there was a little child named ${childName} who loved ${animal}s more than anything in the world. Every night before bed, ${childName}'s mother would tell stories from the Bible, and ${childName}'s favorite was always the story of Noah's Ark.

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

"Exactly like that," Noah said. "You showed ${theme} even when it wasn't popular. That takes real courage."

Finally, after many days of hard work, the ark was complete. Noah began gathering the animals, just as God had instructed. ${childName} was amazed to see animals of every kind coming in pairs—tall giraffes, powerful elephants, tiny mice, and beautiful ${animal}s too.

"Look, Noah!" ${childName} exclaimed, pointing to a pair of ${animal}s approaching the ark. "Those are my favorites!"

Noah smiled. "Would you like to help guide them to their special place on the ark?"

${childName} nodded eagerly and gently led the ${animal}s up the ramp and into the ark. The animals seemed to trust ${childName}, following quietly to their designated area where fresh hay and water awaited them.

Once all the animals were safely aboard, Noah turned to ${childName} with a serious expression. "God has told me that the rain will start today. It's time for us to enter the ark."

Just as Noah's family and ${childName} settled inside, the first raindrops began to fall. Soon, the gentle patter turned into a heavy downpour. Water rose around the ark, lifting it off the ground.

${childName} felt a flutter of fear in their stomach. "Noah, what if the ark leaks? What if we drift forever? What if—"

Noah placed a reassuring hand on ${childName}'s shoulder. "It's okay to feel afraid. But remember, God promised to keep us safe, and God always keeps His promises."

For forty days and forty nights, the rain continued. ${childName} helped Noah and his family feed the animals and keep the ark clean. The ${animal}s became ${childName}'s special friends, and they would nuzzle ${childName}'s hand whenever they came near.

One day, the rain stopped. The ark came to rest on a mountaintop, but water still covered the earth. Noah sent out a raven, and then a dove, to look for dry land, but the dove returned with nothing.

"We need to be patient," Noah told ${childName}, who was eager to see land again. "God's timing is perfect, even when waiting is hard."

After seven more days, Noah sent the dove out again. This time, it returned with a fresh olive leaf in its beak. ${childName} jumped with joy! "Land! There must be dry land!"

"Yes," Noah agreed with a smile. "Soon we will start anew on clean earth."

When the waters finally receded, God told Noah it was safe to leave the ark. As ${childName} stepped onto solid ground for the first time in many weeks, a beautiful sight appeared in the sky—a vibrant rainbow arching from one end of the horizon to the other.

"What is that?" ${childName} gasped.

"That is God's promise," Noah explained. "God promises never to flood the whole earth again. Whenever you see a rainbow, remember that God keeps His promises."

${childName} looked at the colorful arc in the sky and felt a warm sense of peace. "Just like God kept us safe on the ark."

"That's right," Noah said. "And God will always be with you, guiding you and keeping you safe, even when you face scary situations."

As ${childName} helped release the animals back into the world, the ${animal}s paused beside ${childName} as if to say thank you before bounding off to explore their new home.

When ${childName} awoke the next morning, the dream felt so real that they hurried to tell their mother all about helping Noah and the special ${animal}s on the ark.

Mother listened with a smile. "What a wonderful dream! And what did you learn from your adventure?"

${childName} thought for a moment. "I learned that being brave doesn't mean not feeling scared. It means trusting God even when we are scared. And I learned about ${theme}—how important it is to keep doing the right thing even when others don't understand."

"Those are beautiful lessons," Mother said, giving ${childName} a hug. "And just like God was with Noah through the flood, God is always with you too."

That night, as ${childName} gazed out the window before bed, a spring shower began to fall. And there, arching across the evening sky, was a beautiful rainbow—God's promise shining bright. ${childName} smiled, remembering the brave journey and the important lessons learned aboard Noah's Ark.`;
  } else if (biblicalEvent === "david-goliath") {
    title = `${childName}'s Courage Against Giants`;
    content = `Once upon a time, there was a child named ${childName} who loved ${animal}s and always tried to be ${theme === 'courage' ? 'brave' : 'kind'} just like the heroes in the Bible.

"Mommy," ${childName} asked one night, "was David scared when he faced Goliath?"

"I think he probably was," ${childName}'s mother replied. "But David knew God was with him, and that gave him the courage to face his fears."

That night, ${childName} dreamed of meeting young David in the fields of Bethlehem. In the dream, ${childName} was walking through beautiful green meadows when they noticed a young shepherd boy playing a harp under an olive tree. Nearby, several sheep and one very special ${animal} grazed peacefully.

"Hello there," the boy called out with a friendly wave. "I'm David. Who are you?"

"I'm ${childName}," they replied, approaching the shepherd boy. "That's a beautiful song you're playing."

David smiled. "Thank you. I make up songs to praise God while I watch my father's sheep." He patted the ground beside him. "Would you like to sit with me for a while? I could use some company out here."

${childName} sat down, admiring David's harp and the gentle way the ${animal} rested near him. "Are you ever scared out here all alone?"

"Sometimes," David admitted. "Once a lion tried to take one of my lambs, and another time a bear came. But God helped me protect my sheep from them."

Just then, a messenger arrived, breathless and anxious. "David! Your brothers need more food at the army camp. Your father wants you to take provisions to them right away!"

David quickly gathered his things. "Would you like to come with me, ${childName}? I could use help carrying these supplies."

${childName} agreed eagerly, and together they journeyed to the Israelite camp. When they arrived, ${childName} was shocked to see all the soldiers hiding in their tents, looking frightened.

"What's happening?" ${childName} asked one of David's brothers. "Why is everyone so afraid?"

"It's Goliath," the brother explained with a trembling voice. "He's a Philistine giant—over nine feet tall! Every day he comes out and challenges us to send one man to fight him. The winner's army will claim victory. But he's so big... no one dares to face him."

Just then, a thunderous voice boomed across the valley. ${childName} peeked out from the camp and saw an enormous man in bronze armor, carrying weapons that seemed as heavy as ${childName} was!

"Who will fight me?" Goliath shouted mockingly. "Are all Israelites cowards who hide behind their king?"

${childName} felt a shiver of fear run down their spine. But beside them, David's expression changed from curiosity to determination.

"How dare he speak that way about God's army!" David said. "I will fight him."

The soldiers nearby laughed. "You? You're just a boy!"

But David stood firm. "The same God who helped me defeat the lion and the bear will help me defeat this Philistine."

Despite everyone's doubts, David convinced King Saul to let him fight. The king tried to give David his own armor, but it was too big and heavy.

"I can't move in this," David explained, taking it off. "I will go as I am, with God as my shield."

As David went to a nearby stream to select five smooth stones for his sling, ${childName} followed.

"Aren't you scared?" ${childName} asked, watching David carefully choose each stone.

"Yes," David admitted, "but being brave doesn't mean having no fear. It means trusting God even when you're afraid."

David noticed ${childName} looking uncertain. "What makes you afraid, ${childName}?"

${childName} thought for a moment. "At school, there's a bigger kid who says mean things to me and my friends. Sometimes I'm too scared to stand up to him."

David nodded understandingly. "That sounds like a personal Goliath. We all have giants in our lives—problems that seem too big for us to handle alone."

"How do you find the courage?" ${childName} asked.

"I remember that I don't face my giants alone. God is with me, giving me strength." David held up one of his stones. "This stone seems small against Goliath's armor, but with God's help, it will be enough."

${childName} helped David collect the remaining stones, each one a reminder that sometimes the smallest tools could accomplish the biggest miracles when God was involved.

As they walked toward the battlefield, David's ${animal} friend followed, staying close to ${childName} as if to offer comfort.

The Israelite soldiers made a path for David as he approached the valley where Goliath waited. ${childName} and the ${animal} watched from a safe distance.

When Goliath saw young David approaching with only a shepherd's staff and a sling, he roared with laughter. "Am I a dog that you come at me with sticks? Come here, and I'll feed your flesh to the birds and wild animals!"

${childName} trembled, but David stood tall. "You come against me with sword and spear and javelin, but I come against you in the name of the Lord Almighty, the God of the armies of Israel, whom you have defied."

David took one stone from his pouch, placed it in his sling, and began to spin it over his head. The stone flew through the air with incredible speed and struck Goliath in the center of his forehead. The giant swayed for a moment, then fell face-down on the ground.

The Philistine army fled in terror, while the Israelites cheered and rushed forward. ${childName} ran to David's side, amazed by what they had just witnessed.

"You did it! You really did it!" ${childName} exclaimed.

David shook his head humbly. "God did it. I was just willing to trust Him and take a stand."

Later, as ${childName} and David sat together on a hillside, watching the sunset with the ${animal} resting nearby, David turned to ${childName} with a kind smile.

"Remember, ${childName}, whenever you face your own giants—whether they're bullies at school, difficult tasks that seem too hard, or fears that keep you awake at night—you can be brave like we were today. Not because you're stronger or bigger, but because God is with you."

${childName} nodded thoughtfully, petting the gentle ${animal}. "I'll remember. And I'll try to show ${theme} even when I'm afraid."

"That," David said, "is true courage."

When ${childName} woke up the next morning, the dream felt so real that they could almost feel the smooth stones in their pocket. That day at school, when they saw their friend being teased by the playground bully, ${childName} remembered David's words and found the courage to kindly but firmly ask the bully to stop. To ${childName}'s surprise, the bully looked embarrassed and walked away.

That night, ${childName}'s mother noticed something different about her child.

"You seem different today," she said. "Did something special happen?"

${childName} smiled. "I met David in my dream, and he taught me that I can face giants with God's help. Today, I found the courage to stand up to a bully, just like David stood up to Goliath."

${childName}'s mother hugged them tight. "That's wonderful! Remember, having ${theme} isn't about never feeling afraid—it's about doing what's right even when you are afraid, knowing that God is always with you."

And so, with the wisdom from David's story in their heart, ${childName} learned that even the smallest person can make a big difference when they trust in God.`;
  } else {
    title = `${childName}'s Adventure with the Faithful ${animal}`;
    content = `Once upon a time in a cozy little house at the edge of a sleepy town, there lived a child named ${childName}. ${childName} had a special love for ${animal}s and could spend hours watching them, drawing pictures of them, and reading stories about them. Every night before bed, ${childName}'s parents would read Bible stories, and ${childName} would drift off to sleep imagining what it would be like to be part of those amazing adventures.

One particularly starry evening, after a bedtime story about ${theme}, ${childName} snuggled under the warm covers and whispered a prayer: "Dear God, help me to understand more about ${theme} and how I can show it in my life." With those words still on their lips, ${childName} drifted off to sleep.

That night, a most extraordinary dream began to unfold. ${childName} found themselves standing in a beautiful meadow bathed in golden sunlight. The grass swayed gently in the breeze, and wildflowers dotted the landscape with bursts of color. But what caught ${childName}'s attention was a magnificent ${animal} standing nearby, its eyes seeming to shine with unusual intelligence and kindness.

"Hello, ${childName}," the ${animal} said, its voice gentle and warm. "My name is Faith, and I've been sent to go on a special journey with you—a journey to learn about ${theme}."

${childName}'s eyes widened with wonder. "You can talk! And... you know my name!"

Faith the ${animal} nodded. "In this dream world, many things are possible. God has heard your prayer about understanding ${theme} better, and I'm here to help you explore what it truly means."

"Where are we going?" ${childName} asked, excitement building.

"We're going to visit three places," Faith explained. "Each place will teach us something important about ${theme}. Are you ready for an adventure?"

${childName} nodded eagerly, and together they set off across the meadow. As they walked, Faith explained that ${theme} was one of God's most treasured gifts to His children, and learning to embrace it would bring ${childName} closer to understanding God's love.

After walking for what seemed like both a moment and an eternity, they came upon a small village. Children played in the dusty streets, laughing and running, while adults went about their daily work. But ${childName} noticed one child sitting alone, looking sad.

"Who is that?" ${childName} asked Faith.

"That's Samuel," Faith replied softly. "The other children don't always include him because he's new to the village and a bit different from them."

${childName}'s heart felt heavy seeing Samuel sitting alone. Without hesitation, ${childName} walked over and introduced themselves. Samuel's face lit up with surprise and joy at being noticed.

"Would you like to play with me?" ${childName} asked.

Soon, ${childName} and Samuel were laughing together, and gradually the other children joined in. Before long, everyone was playing together, and Samuel was no longer an outsider but a new friend.

Faith watched with approval. "You've just learned the first lesson of ${theme}," the ${animal} said when ${childName} returned. "True ${theme} means seeing others as God sees them—precious and worthy of love, especially when they feel alone or different."

As they left the village, the scene around them shifted. Now ${childName} and Faith stood at the edge of a raging river. On the other side, a family was stranded as waters continued to rise around them.

"They need help crossing," Faith said urgently. "But the bridge is broken."

${childName} looked around desperately, spotting pieces of wood, rope, and stones nearby. "We need to build a new bridge," ${childName} declared. "But I don't know how!"

"Sometimes ${theme} means doing difficult things even when we're not sure we can," Faith encouraged. "Just like Noah built an ark when he'd never seen rain, or David faced Goliath when everyone thought he would fail."

With determination, ${childName} began gathering materials. The work was hard, and several times ${childName} wanted to give up. But with Faith's gentle encouragement and practical help—the ${animal} proved surprisingly good at carrying building materials—they persevered.

After what seemed like hours of work, a simple but sturdy bridge stretched across the river. The family crossed to safety, thanking ${childName} and Faith with tears of gratitude.

"You've learned the second lesson of ${theme}," Faith said as they continued their journey. "${theme} often requires perseverance and hard work. When we stay committed to doing what's right, even when it's difficult, we honor God with our efforts."

The scene changed once more, and ${childName} found themselves in a beautiful garden. An elderly gardener was tending to the plants with obvious love and care. Some plants were flowering with spectacular blooms, while others were just tiny sprouts pushing through the soil.

"This is Elder Thomas," Faith introduced. "He's been tending this garden for fifty years."

"Fifty years!" ${childName} exclaimed. "That's such a long time!"

The old gardener smiled, the wrinkles around his eyes deepening. "Indeed it is, young one. When I first planted seeds in this garden, I was hardly older than you are now."

"Why have you kept gardening for so long?" ${childName} asked.

"Come, let me show you something," Elder Thomas said, leading them to a massive oak tree at the center of the garden. "I planted this tree from a tiny acorn. For the first ten years, it barely grew taller than you are now. But I watered it faithfully, protected it during storms, and believed in what it could become. Now look at it—providing shade, homes for birds, and beauty for all who visit."

Elder Thomas handed ${childName} a small packet of seeds. "True ${theme} is like planting these seeds. You may not see results right away, but with patience and consistent care, beautiful things grow. That's how God works in our lives too—planting seeds of faith, love, and goodness that grow over time."

${childName} carefully planted the seeds in a patch of soil that Elder Thomas prepared. As soon as the last seed was covered with earth, a miracle happened—the seeds began to sprout and grow before their very eyes, blossoming into stunning flowers in a matter of minutes.

"In your waking life, growth takes much longer," Faith explained. "But the principle remains the same. ${theme} requires patience and trust in God's timing."

As the sun began to set in this dream world, Faith led ${childName} back to the meadow where their journey had begun. The sky painted itself in brilliant oranges and pinks as ${childName} reflected on everything they had learned.

"I understand so much more about ${theme} now," ${childName} said thoughtfully. "It means seeing others as God sees them, persevering through challenges, and being patient while good things grow."

Faith nodded, pleased. "You've learned well. But there's one more thing—perhaps the most important lesson of all."

"What is it?" ${childName} asked.

"${theme} isn't just something we do—it's something we become, with God's help," Faith explained. "Each act of ${theme} shapes who you are, making your heart more like Jesus. And that's the greatest adventure of all."

As the stars began to appear in the twilight sky, Faith touched their nose to ${childName}'s hand. "It's time for you to return now. But remember what you've learned, and look for ways to practice ${theme} every day."

"Will I see you again?" ${childName} asked, suddenly sad to leave their new friend.

"Whenever you practice ${theme}, I'll be there in spirit," Faith promised. "And when you read God's Word, you'll find me there too, for God's Word is full of stories about ${theme}."

With those words, the dream began to fade, the beautiful meadow dissolving into the soft morning light filtering through ${childName}'s bedroom curtains.

When ${childName} awoke, the dream remained vivid in their mind. At breakfast, they told their parents all about their adventure with Faith the ${animal} and the three lessons of ${theme}.

"That sounds like a wonderful dream," ${childName}'s mother said with a smile. "And you know what? Today is the perfect day to practice what you learned. Mrs. Johnson next door hasn't been feeling well. Perhaps we could bake her some cookies and pay her a visit?"

${childName} nodded eagerly. "And maybe I could read to her or help with some chores. That would be showing ${theme}, wouldn't it?"

"It certainly would," ${childName}'s father agreed. "And remember, just like in your dream, sometimes the most important things we do don't seem big or impressive to others, but they matter greatly to God."

As ${childName} helped mix the cookie dough, they spotted a ${animal} outside the kitchen window. For just a moment, ${childName} could have sworn the ${animal} winked at them before scampering away.

${childName} smiled. With God's help, they would practice ${theme} today and every day, turning the dream lessons into real-life habits of the heart.`;
  }


  return {
    title,
    content,
    bibleVerse,
    imagePrompt: `A child named ${childName} with a ${animal} in a dreamy biblical scene related to ${biblicalEvent || theme}`
  };
}