// Biblical event story templates to guide the AI

const storyTemplates: Record<string, string> = {
  "noahs-ark": "The story of Noah's Ark where Noah built a large boat to save his family and animals from a worldwide flood. The child in the story could help Noah care for the animals on the ark, showing kindness to God's creatures and learning about obedience to God even when others doubt.",
  
  "david-goliath": "The story of David and Goliath where young David defeated the giant Philistine warrior Goliath with just a sling and a stone, showing that with faith in God, even the smallest person can overcome huge challenges. The child could meet David and learn about courage and trusting God.",
  
  "good-samaritan": "The parable of the Good Samaritan where a man helped a stranger who was hurt on the roadside when others passed by. The child could witness or participate in helping someone in need, learning about compassion and loving your neighbor regardless of differences.",
  
  "prodigal-son": "The parable of the Prodigal Son where a father welcomes home his wayward son who had squandered his inheritance. The child could learn about forgiveness, grace, and God's unconditional love for us even when we make mistakes.",
  
  "jonah": "The story of Jonah and the whale, where Jonah tried to run from God's command to go to Nineveh but was swallowed by a large fish and eventually completed his mission. The child could learn about obedience to God's calling and second chances.",
  
  "creation": "The Creation story where God created the world in six days and rested on the seventh. The child could witness the wonder of creation unfolding and learn about God's creativity, power, and love for all He created.",
  
  "daniel-lions": "The story of Daniel in the lions' den, where Daniel was thrown into a den of lions for praying to God but was protected because of his faithfulness. The child could learn about standing firm in faith even when faced with danger or peer pressure.",
  
  "moses": "The story of Moses parting the Red Sea to lead the Israelites out of slavery in Egypt. The child could witness this miracle and learn about God's power to deliver His people from seemingly impossible situations."
};

export function getBiblicalEventStoryTemplate(event: string): string | null {
  const normalizedEvent = event.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return storyTemplates[normalizedEvent] || null;
}
