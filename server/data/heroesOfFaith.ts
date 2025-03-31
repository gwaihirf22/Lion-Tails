import { HeroOfFaith } from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';

// Helper function to ensure all heroes have the required fields
const createHero = (hero: Partial<HeroOfFaith>): HeroOfFaith => {
  // Ensure sources has the correct type
  const defaultSources = [{
    title: "Default Source",
    type: "book" as "book" | "article" | "website" | "documentary" | "other",
    author: "Unknown"
  }];
  
  // Ensure we have valid sources with the correct type property
  const validSources = hero.sources ? hero.sources.map(source => ({
    ...source,
    type: (source.type as "book" | "article" | "website" | "documentary" | "other") || "other"
  })) : defaultSources;
  
  return {
    id: hero.id || uuidv4(),
    name: hero.name || "",
    description: hero.description || "",
    timePeriod: hero.timePeriod || "",
    contribution: hero.contribution || "",
    sources: validSources,
    keyEvents: hero.keyEvents || [],
    birthYear: hero.birthYear,
    deathYear: hero.deathYear,
    famousQuote: hero.famousQuote,
    bibleVerse: hero.bibleVerse,
    imageUrl: hero.imageUrl,
    createdAt: hero.createdAt || new Date()
  };
};

// Initial set of Heroes of Faith
const rawHeroesOfFaithData = [
  {
    id: uuidv4(),
    name: "William Wilberforce",
    description: "A British politician who led the movement to abolish the slave trade and slavery itself in the British Empire.",
    timePeriod: "1759-1833",
    contribution: "Fought tirelessly for over 20 years against slavery, inspired by his Christian faith. His persistence led to the Slavery Abolition Act of 1833.",
    birthYear: "1759",
    deathYear: "1833",
    famousQuote: "God Almighty has set before me two great objects: the suppression of the slave trade and the reformation of manners.",
    bibleVerse: {
      text: "Learn to do right; seek justice. Defend the oppressed. Take up the cause of the fatherless; plead the case of the widow.",
      reference: "Isaiah 1:17"
    },
    sources: [
      {
        title: "Amazing Grace: William Wilberforce and the Heroic Campaign to End Slavery",
        author: "Eric Metaxas",
        type: "book"
      }
    ],
    keyEvents: [
      {
        year: "1807",
        description: "Abolition of the Slave Trade Act passed in British Parliament"
      },
      {
        year: "1833",
        description: "Slavery Abolition Act passed, just three days before his death"
      }
    ],
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Jim Elliot",
    description: "An American missionary who was killed while attempting to evangelize the Huaorani people of Ecuador.",
    timePeriod: "1927-1956",
    contribution: "His journal entries and famous quote about sacrifice inspired countless missionaries. After his death, his wife Elisabeth continued his work among the very people who killed him.",
    birthYear: "1927",
    deathYear: "1956",
    famousQuote: "He is no fool who gives what he cannot keep to gain what he cannot lose.",
    bibleVerse: {
      text: "For whoever wants to save their life will lose it, but whoever loses their life for me will find it.",
      reference: "Matthew 16:25"
    },
    sources: [
      {
        title: "Through Gates of Splendor",
        author: "Elisabeth Elliot",
        type: "book"
      }
    ],
    keyEvents: [
      {
        year: "1956",
        description: "Killed by Huaorani tribe members while attempting to make missionary contact"
      }
    ],
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Amy Carmichael",
    description: "An Irish missionary who served in India for 55 years without furlough and founded the Dohnavur Fellowship.",
    timePeriod: "1867-1951",
    contribution: "Rescued hundreds of girls from temple slavery in India and established a safe haven for them at Dohnavur Fellowship.",
    birthYear: "1867",
    deathYear: "1951",
    famousQuote: "You can give without loving, but you cannot love without giving.",
    bibleVerse: {
      text: "Religion that God our Father accepts as pure and faultless is this: to look after orphans and widows in their distress and to keep oneself from being polluted by the world.",
      reference: "James 1:27"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Dietrich Bonhoeffer",
    description: "A German pastor and theologian known for his resistance against Nazi Germany and Hitler's regime.",
    timePeriod: "1906-1945",
    contribution: "Helped establish the Confessing Church, wrote influential works like 'The Cost of Discipleship,' and participated in a plot to overthrow Hitler, leading to his execution.",
    birthYear: "1906",
    deathYear: "1945",
    famousQuote: "Silence in the face of evil is itself evil. God will not hold us guiltless. Not to speak is to speak. Not to act is to act.",
    bibleVerse: {
      text: "Then they came to Jesus and saw the one who had been demon-possessed and had the legion, sitting and clothed and in his right mind. And they were afraid.",
      reference: "Mark 5:15"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "George Müller",
    description: "A Christian evangelist who built and operated orphanages for thousands of children in Bristol, England.",
    timePeriod: "1805-1898",
    contribution: "Cared for over 10,000 orphans during his lifetime, establishing orphanages that were run entirely by faith and prayer without asking anyone for money.",
    birthYear: "1805",
    deathYear: "1898",
    famousQuote: "The beginning of anxiety is the end of faith, and the beginning of true faith is the end of anxiety.",
    bibleVerse: {
      text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.",
      reference: "Philippians 4:19"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Corrie ten Boom",
    description: "A Dutch watchmaker who helped many Jews escape the Holocaust during World War II.",
    timePeriod: "1892-1983",
    contribution: "Her family created a hiding place in their home for Jews and resistance fighters, saving many lives until they were betrayed and sent to concentration camps.",
    birthYear: "1892",
    deathYear: "1983",
    famousQuote: "Forgiveness is an act of the will, and the will can function regardless of the temperature of the heart.",
    bibleVerse: {
      text: "For if you forgive other people when they sin against you, your heavenly Father will also forgive you.",
      reference: "Matthew 6:14"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Hudson Taylor",
    description: "A British missionary to China and founder of the China Inland Mission.",
    timePeriod: "1832-1905",
    contribution: "Spent 51 years in China, pioneered cultural adaptation for missionaries by wearing Chinese clothing and hairstyles, and led hundreds of missionaries to reach inland China.",
    birthYear: "1832",
    deathYear: "1905",
    famousQuote: "God's work done in God's way will never lack God's supplies.",
    bibleVerse: {
      text: "And this gospel of the kingdom will be preached in the whole world as a testimony to all nations, and then the end will come.",
      reference: "Matthew 24:14"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Eric Liddell",
    description: "A Scottish Olympic gold medalist and missionary to China, whose story was portrayed in the film 'Chariots of Fire'.",
    timePeriod: "1902-1945",
    contribution: "Known for refusing to run on Sunday in the 1924 Olympics out of religious conviction, later served as a missionary in China until his death in a Japanese internment camp.",
    birthYear: "1902",
    deathYear: "1945",
    famousQuote: "God made me fast. And when I run, I feel His pleasure.",
    bibleVerse: {
      text: "Do you not know that in a race all the runners run, but only one gets the prize? Run in such a way as to get the prize.",
      reference: "1 Corinthians 9:24"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Mother Teresa",
    description: "An Albanian-Indian Roman Catholic nun who founded the Missionaries of Charity, serving the poorest of the poor.",
    timePeriod: "1910-1997",
    contribution: "Devoted her life to caring for the sick, dying, orphaned, and destitute in the slums of Calcutta and around the world.",
    birthYear: "1910",
    deathYear: "1997",
    famousQuote: "Not all of us can do great things. But we can do small things with great love.",
    bibleVerse: {
      text: "And now these three remain: faith, hope and love. But the greatest of these is love.",
      reference: "1 Corinthians 13:13"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Billy Graham",
    description: "An American evangelist who preached to live audiences of nearly 215 million people in more than 185 countries.",
    timePeriod: "1918-2018",
    contribution: "Brought the Gospel to more individuals than anyone in history through crusades, radio, television, and digital media.",
    birthYear: "1918",
    deathYear: "2018",
    famousQuote: "My home is in Heaven. I'm just traveling through this world.",
    bibleVerse: {
      text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
      reference: "John 3:16"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "C.S. Lewis",
    description: "A British writer and lay theologian known for his works of fiction and Christian apologetics.",
    timePeriod: "1898-1963",
    contribution: "Wrote influential books like 'Mere Christianity', 'The Screwtape Letters', and 'The Chronicles of Narnia', making complex theological concepts accessible.",
    birthYear: "1898",
    deathYear: "1963",
    famousQuote: "You can never get a cup of tea large enough or a book long enough to suit me.",
    bibleVerse: {
      text: "For now we see only a reflection as in a mirror; then we shall see face to face. Now I know in part; then I shall know fully, even as I am fully known.",
      reference: "1 Corinthians 13:12"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "John Wesley",
    description: "An English cleric, theologian, and evangelist who founded the Methodist movement.",
    timePeriod: "1703-1791",
    contribution: "Traveled over 250,000 miles on horseback, preached over 40,000 sermons, and helped spark a revival in England that emphasized personal holiness and social justice.",
    birthYear: "1703",
    deathYear: "1791",
    famousQuote: "Do all the good you can, by all the means you can, in all the ways you can, in all the places you can, at all the times you can, to all the people you can, as long as ever you can.",
    bibleVerse: {
      text: "And what does the Lord require of you? To act justly and to love mercy and to walk humbly with your God.",
      reference: "Micah 6:8"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Martin Luther",
    description: "A German professor of theology, priest, and seminal figure in the Protestant Reformation.",
    timePeriod: "1483-1546",
    contribution: "Posted his Ninety-five Theses in 1517, challenging the Catholic Church's practices and doctrines, which sparked the Protestant Reformation and emphasized salvation by faith alone.",
    birthYear: "1483",
    deathYear: "1546",
    famousQuote: "Here I stand. I can do no other. God help me.",
    bibleVerse: {
      text: "For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast.",
      reference: "Ephesians 2:8-9"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Elisabeth Elliot",
    description: "Christian author and speaker who, after her husband Jim Elliot was killed, worked as a missionary to the very tribe that murdered him.",
    timePeriod: "1926-2015",
    contribution: "Returned to Ecuador to minister to the Huaorani tribe that killed her husband, wrote numerous influential books on Christian living, and hosted the radio program 'Gateway to Joy'.",
    birthYear: "1926",
    deathYear: "2015",
    famousQuote: "The secret is Christ in me, not me in a different set of circumstances.",
    bibleVerse: {
      text: "But we have this treasure in jars of clay to show that this all-surpassing power is from God and not from us.",
      reference: "2 Corinthians 4:7"
    },
    createdAt: new Date()
  },
  {
    id: uuidv4(),
    name: "Charles Spurgeon",
    description: "English Baptist preacher known as the 'Prince of Preachers' who was a powerful orator and prolific author.",
    timePeriod: "1834-1892",
    contribution: "Built the Metropolitan Tabernacle which seated 5,000 people, founded a pastors' college, an orphanage, and published numerous sermons and books that continue to influence Christians today.",
    birthYear: "1834",
    deathYear: "1892",
    famousQuote: "God loves with a great love the man whose heart is bursting with a passion for the impossible.",
    bibleVerse: {
      text: "But he said to me, 'My grace is sufficient for you, for my power is made perfect in weakness.' Therefore I will boast all the more gladly about my weaknesses, so that Christ's power may rest on me.",
      reference: "2 Corinthians 12:9"
    },
    createdAt: new Date()
  }
];

// Apply the createHero function to ensure all heroes have the required fields
export const heroesOfFaithData: HeroOfFaith[] = rawHeroesOfFaithData.map(hero => createHero(hero));