// Database of popular Christian songs for searching
import { Song, ChordDiagram, Verse } from "@shared/schema";

export interface SongSearchEntry {
  id: string;
  title: string;
  artist?: string;
  lyrics: string;
  tags?: string[];
}

// Common guitar chords with fingering information
export const commonChords: Record<string, ChordDiagram> = {
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
};

// Popular Christian songs
export const songDatabase: SongSearchEntry[] = [
  // Traditional
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    artist: "John Newton",
    lyrics: "Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.",
    tags: ["traditional", "classic", "hymn", "grace"]
  },
  {
    id: "jesus-loves-me",
    title: "Jesus Loves Me",
    artist: "Anna B. Warner",
    lyrics: "Jesus loves me! This I know,\nFor the Bible tells me so;\nLittle ones to Him belong;\nThey are weak, but He is strong.\n\nYes, Jesus loves me!\nYes, Jesus loves me!\nYes, Jesus loves me!\nThe Bible tells me so.",
    tags: ["children", "classic", "hymn", "love"]
  },
  {
    id: "this-little-light",
    title: "This Little Light of Mine",
    artist: "Harry Dixon Loes",
    lyrics: "This little light of mine,\nI'm gonna let it shine.\nThis little light of mine,\nI'm gonna let it shine.\nThis little light of mine,\nI'm gonna let it shine.\nLet it shine, let it shine, let it shine.",
    tags: ["children", "classic", "light", "traditional"]
  },
  {
    id: "he-has-the-whole-world",
    title: "He's Got the Whole World in His Hands",
    artist: "Traditional",
    lyrics: "He's got the whole world in His hands\nHe's got the whole world in His hands\nHe's got the whole world in His hands\nHe's got the whole world in His hands\n\nHe's got the little bitty baby in His hands\nHe's got the little bitty baby in His hands\nHe's got the little bitty baby in His hands\nHe's got the whole world in His hands",
    tags: ["children", "classic", "traditional", "creation"]
  },
  {
    id: "blessed-assurance",
    title: "Blessed Assurance",
    artist: "Fanny Crosby",
    lyrics: "Blessed assurance, Jesus is mine!\nOh, what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.\n\nThis is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.",
    tags: ["hymn", "classic", "assurance", "traditional"]
  },
  {
    id: "what-a-friend",
    title: "What a Friend We Have in Jesus",
    artist: "Joseph M. Scriven",
    lyrics: "What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!\nOh, what peace we often forfeit,\nOh, what needless pain we bear,\nAll because we do not carry\nEverything to God in prayer!",
    tags: ["hymn", "classic", "prayer", "friendship"]
  },
  {
    id: "how-great-thou-art",
    title: "How Great Thou Art",
    artist: "Stuart K. Hine",
    lyrics: "O Lord my God! When I in awesome wonder\nConsider all the works Thy hand hath made.\nI see the stars, I hear the rolling thunder,\nThy power throughout the universe displayed.\n\nThen sings my soul, my Savior God to Thee;\nHow great Thou art, how great Thou art!\nThen sings my soul, my Savior God to Thee;\nHow great Thou art, how great Thou art!",
    tags: ["hymn", "classic", "worship", "creation"]
  },
  {
    id: "great-is-thy-faithfulness",
    title: "Great Is Thy Faithfulness",
    artist: "Thomas O. Chisholm",
    lyrics: "Great is Thy faithfulness, O God my Father,\nThere is no shadow of turning with Thee;\nThou changest not, Thy compassions, they fail not;\nAs Thou hast been Thou forever wilt be.\n\nGreat is Thy faithfulness! Great is Thy faithfulness!\nMorning by morning new mercies I see;\nAll I have needed Thy hand hath provided—\nGreat is Thy faithfulness, Lord, unto me!",
    tags: ["hymn", "classic", "faithfulness", "traditional"]
  },
  
  // Contemporary
  {
    id: "10000-reasons",
    title: "10,000 Reasons (Bless the Lord)",
    artist: "Matt Redman",
    lyrics: "Bless the Lord, O my soul, O my soul\nWorship His holy name\nSing like never before, O my soul\nI'll worship Your holy name\n\nThe sun comes up, it's a new day dawning\nIt's time to sing Your song again\nWhatever may pass and whatever lies before me\nLet me be singing when the evening comes",
    tags: ["contemporary", "worship", "praise"]
  },
  {
    id: "oceans",
    title: "Oceans (Where Feet May Fail)",
    artist: "Hillsong UNITED",
    lyrics: "You call me out upon the waters\nThe great unknown where feet may fail\nAnd there I find You in the mystery\nIn oceans deep, my faith will stand\n\nAnd I will call upon Your name\nAnd keep my eyes above the waves\nWhen oceans rise, my soul will rest in Your embrace\nFor I am Yours and You are mine",
    tags: ["contemporary", "trust", "faith", "surrender"]
  },
  {
    id: "good-good-father",
    title: "Good Good Father",
    artist: "Chris Tomlin",
    lyrics: "I've heard a thousand stories\nOf what they think You're like\nBut I've heard the tender whisper\nOf love in the dead of night\nYou tell me that You're pleased\nAnd that I'm never alone\n\nYou're a Good, Good Father\nIt's who You are, It's who You are, It's who You are\nAnd I'm loved by You\nIt's who I am, It's who I am, It's who I am",
    tags: ["contemporary", "father", "love", "identity"]
  },
  {
    id: "what-a-beautiful-name",
    title: "What A Beautiful Name",
    artist: "Hillsong Worship",
    lyrics: "You were the Word at the beginning\nOne with God the Lord Most High\nYour hidden glory in creation\nNow revealed in You our Christ\n\nWhat a beautiful Name it is\nWhat a beautiful Name it is\nThe Name of Jesus Christ my King\nWhat a beautiful Name it is\nNothing compares to this\nWhat a beautiful Name it is\nThe Name of Jesus",
    tags: ["contemporary", "name of Jesus", "worship"]
  },
  {
    id: "way-maker",
    title: "Way Maker",
    artist: "Sinach",
    lyrics: "You are here, moving in our midst\nI worship You, I worship You\nYou are here, working in this place\nI worship You, I worship You\n\nWay maker, miracle worker, promise keeper\nLight in the darkness, my God\nThat is who You are",
    tags: ["contemporary", "worship", "miracles", "promise"]
  },
  {
    id: "raise-a-hallelujah",
    title: "Raise A Hallelujah",
    artist: "Bethel Music",
    lyrics: "I raise a hallelujah, in the presence of my enemies\nI raise a hallelujah, louder than the unbelief\nI raise a hallelujah, my weapon is a melody\nI raise a hallelujah, Heaven comes to fight for me\n\nI'm gonna sing, in the middle of the storm\nLouder and louder, you're gonna hear my praises roar\nUp from the ashes, hope will arise\nDeath is defeated, the King is alive!",
    tags: ["contemporary", "praise", "worship", "battle"]
  },
  
  // For Children
  {
    id: "the-b-i-b-l-e",
    title: "The B-I-B-L-E",
    artist: "Traditional",
    lyrics: "The B-I-B-L-E,\nYes, that's the book for me.\nI stand alone on the Word of God,\nThe B-I-B-L-E.\n\nThe B-I-B-L-E,\nI'll take it along with me.\nI'll read and pray, and then obey,\nThe B-I-B-L-E.",
    tags: ["children", "Bible", "traditional", "education"]
  },
  {
    id: "deep-and-wide",
    title: "Deep and Wide",
    artist: "Sidney E. Cox",
    lyrics: "Deep and wide, deep and wide,\nThere's a fountain flowing deep and wide.\nDeep and wide, deep and wide,\nThere's a fountain flowing deep and wide.",
    tags: ["children", "traditional", "simple"]
  },
  {
    id: "zacchaeus",
    title: "Zacchaeus",
    artist: "Traditional",
    lyrics: "Zacchaeus was a wee little man,\nAnd a wee little man was he.\nHe climbed up in a sycamore tree\nFor the Lord he wanted to see.\nAnd as the Savior passed that way,\nHe looked up in the tree,\nAnd he said, \"Zacchaeus, you come down!\"\nFor I'm going to your house today,\nFor I'm going to your house today.",
    tags: ["children", "Bible story", "traditional"]
  },
  {
    id: "fathers-abraham",
    title: "Father Abraham",
    artist: "Traditional",
    lyrics: "Father Abraham had many sons,\nMany sons had Father Abraham.\nI am one of them, and so are you,\nSo let's just praise the Lord!\n\nRight arm! (swing right arm)\nFather Abraham had many sons...",
    tags: ["children", "action", "traditional", "fun"]
  },
  {
    id: "praise-ye-the-lord",
    title: "Praise Ye the Lord, Hallelujah",
    artist: "Traditional",
    lyrics: "Praise ye the Lord, Hallelujah!\nEverybody praise the Lord.\nPraise ye the Lord, Hallelujah!\nEverybody praise the Lord.\n\nPraise Him in the morning,\nPraise Him in the noontime.\nPraise ye the Lord, Hallelujah!\nEverybody praise the Lord.",
    tags: ["children", "praise", "traditional", "simple"]
  },
  {
    id: "i-am-a-c",
    title: "I Am a C-H-R-I-S-T-I-A-N",
    artist: "Traditional",
    lyrics: "I am a C\nI am a C-H\nI am a C-H-R-I-S-T-I-A-N\nAnd I have C-H-R-I-S-T in my H-E-A-R-T\nAnd I will L-I-V-E E-T-E-R-N-A-L-L-Y",
    tags: ["children", "identity", "spelling", "fun"]
  },
  
  // Lullabies
  {
    id: "be-still-and-know",
    title: "Be Still and Know",
    artist: "Traditional",
    lyrics: "Be still and know that I am God\nBe still and know that I am God\nBe still and know that I am God\n\nI am the Lord that healeth thee\nI am the Lord that healeth thee\nI am the Lord that healeth thee",
    tags: ["quiet", "bedtime", "peace", "psalm"]
  },
  {
    id: "all-night-all-day",
    title: "All Night, All Day",
    artist: "Traditional",
    lyrics: "All night, all day,\nAngels watching over me, my Lord.\nAll night, all day,\nAngels watching over me.\n\nNow I lay me down to sleep,\nAngels watching over me, my Lord.\nPray the Lord my soul to keep,\nAngels watching over me.",
    tags: ["bedtime", "angels", "protection", "children"]
  },
  {
    id: "sleep-sound-in-jesus",
    title: "Sleep Sound in Jesus",
    artist: "Michael Card",
    lyrics: "Sleep sound in Jesus,\nSleeping sound in Him.\nRest in His gentleness,\nReaching for His tenderness.\nChild of His redeeming love,\nSleep sound in Jesus.",
    tags: ["lullaby", "bedtime", "peace", "sleep"]
  },
  
  // Additional Contemporary Songs
  {
    id: "our-god",
    title: "Our God",
    artist: "Chris Tomlin",
    lyrics: "Water You turned into wine\nOpened the eyes of the blind\nThere's no one like You\nNone like You\n\nInto the darkness You shine\nOut of the ashes we rise\nThere's no one like You\nNone like You\n\nOur God is greater, our God is stronger\nGod You are higher than any other\nOur God is Healer, awesome in power\nOur God, Our God",
    tags: ["contemporary", "power", "greatness", "worship"]
  },
  {
    id: "holy-spirit",
    title: "Holy Spirit",
    artist: "Francesca Battistelli",
    lyrics: "There's nothing worth more, that will ever come close\nNo thing can compare, You're our living hope\nYour Presence\n\nI've tasted and seen, of the sweetest of loves\nWhere my heart becomes free, and my shame is undone\nIn Your Presence\n\nHoly Spirit You are welcome here\nCome flood this place and fill the atmosphere\nYour Glory God is what our hearts long for\nTo be overcome by Your Presence Lord",
    tags: ["contemporary", "holy spirit", "presence", "worship"]
  },
  {
    id: "who-you-say-i-am",
    title: "Who You Say I Am",
    artist: "Hillsong Worship",
    lyrics: "Who am I that the highest King\nWould welcome me?\nI was lost but He brought me in\nOh His love for me\nOh His love for me\n\nWho the Son sets free\nOh is free indeed\nI'm a child of God\nYes I am",
    tags: ["contemporary", "identity", "freedom", "child of God"]
  },
  {
    id: "build-my-life",
    title: "Build My Life",
    artist: "Pat Barrett",
    lyrics: "Worthy of every song we could ever sing\nWorthy of all the praise we could ever bring\nWorthy of every breath we could ever breathe\nWe live for You\n\nJesus, the name above every other name\nJesus, the only one who could ever save\nWorthy of every breath we could ever breathe\nWe live for You\nWe live for You",
    tags: ["contemporary", "worship", "foundation", "worthy"]
  }
];

// Function to convert lyrics from string format to structured verse format
export function convertLyricsToStucturedSong(id: string, title: string, artist: string, lyricsText: string, tags: string[]): Song {
  // Split lyrics into sections (verses/chorus)
  const lines = lyricsText.split('\n');
  
  // We'll identify chorus as repeated sections or sections after blank lines
  let verses: Verse[] = [];
  let chorus: Verse | null = null;
  let bridge: Verse | null = null;
  
  let currentVerse: string[] = [];
  let inChorus = false;
  
  // Basic parsing - not perfect but works for simple songs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Empty line indicates section break
    if (line.trim() === '') {
      if (currentVerse.length > 0) {
        // If this looks like a chorus (repeated lines or after first verse)
        if (!chorus && (verses.length > 0 || currentVerse.some(l => l.includes('chorus') || l.toLowerCase().includes('hallelujah')))) {
          chorus = {
            lyrics: currentVerse,
            chords: currentVerse.map(() => '') // Empty chords for now
          };
        } else {
          verses.push({
            lyrics: currentVerse,
            chords: currentVerse.map(() => '') // Empty chords for now
          });
        }
        currentVerse = [];
      }
      continue;
    }
    
    currentVerse.push(line);
  }
  
  // Add the final section
  if (currentVerse.length > 0) {
    verses.push({
      lyrics: currentVerse,
      chords: currentVerse.map(() => '') // Empty chords for now
    });
  }
  
  // Generate some basic chords based on common patterns
  const songChords = generateChordsForSong(id, tags);
  
  // Create complete song object
  return {
    id,
    title,
    artist,
    verses,
    chorus,
    bridge,
    chords: songChords,
    backgroundColor: getBackgroundColorForSong(tags)
  };
}

// Generate chord progressions based on song type
function generateChordsForSong(songId: string, tags: string[]): ChordDiagram[] {
  // Common chord progressions by type
  const progressions = {
    contemporary: ['G', 'Em', 'C', 'D'],
    worship: ['C', 'G', 'Am', 'F'],
    hymn: ['D', 'A', 'Bm', 'G'],
    lullaby: ['G', 'C', 'D', 'Em'],
    praise: ['E', 'B', 'C#m', 'A'],
    children: ['C', 'F', 'G', 'C']
  };
  
  // Pick a chord progression based on tags
  let progression: string[] = [];
  
  for (const tag of tags) {
    const key = Object.keys(progressions).find(k => tag.toLowerCase().includes(k));
    if (key) {
      progression = progressions[key as keyof typeof progressions];
      break;
    }
  }
  
  // Default to contemporary if no match
  if (progression.length === 0) {
    progression = progressions.contemporary;
  }
  
  // Return chord diagrams for the progression
  return progression
    .map(chordName => commonChords[chordName])
    .filter(chord => chord !== undefined);
}

// Choose a background color based on the song theme
function getBackgroundColorForSong(tags: string[]): string {
  const colorMap: Record<string, string> = {
    worship: '#f8f0ff', // light purple
    hymn: '#f0f4ff',    // light blue
    classic: '#f0fff4',  // light green
    lullaby: '#fff0f7',  // light pink
    children: '#fffbeb',  // light yellow
    praise: '#fff0f0',   // light red
    contemporary: '#f0ffff' // light cyan
  };
  
  for (const tag of tags) {
    const key = Object.keys(colorMap).find(k => tag.toLowerCase().includes(k));
    if (key) {
      return colorMap[key];
    }
  }
  
  return '#f8f9fa'; // default light gray
}

// Additional songs: Up to 50 total songs
export const additionalSongs: SongSearchEntry[] = [
  {
    id: "it-is-well",
    title: "It Is Well With My Soul",
    artist: "Horatio G. Spafford",
    lyrics: "When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\n\"It is well, it is well with my soul.\"\n\nIt is well with my soul,\nIt is well, it is well with my soul.",
    tags: ["hymn", "peace", "trial", "classic"]
  },
  {
    id: "the-lords-prayer",
    title: "The Lord's Prayer",
    artist: "Albert Hay Malotte",
    lyrics: "Our Father, who art in heaven,\nHallowed be Thy name.\nThy kingdom come, Thy will be done,\nOn earth as it is in heaven.\nGive us this day our daily bread,\nAnd forgive us our debts,\nAs we forgive our debtors.\nAnd lead us not into temptation,\nBut deliver us from evil.\nFor Thine is the kingdom, and the power,\nAnd the glory forever. Amen.",
    tags: ["prayer", "classic", "scripture", "worship"]
  },
  {
    id: "grace-like-rain",
    title: "Grace Like Rain",
    artist: "Todd Agnew",
    lyrics: "Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost but now I'm found\nWas blind but now I see so clearly\n\nHallelujah, grace like rain falls down on me\nHallelujah, all my stains are washed away, washed away",
    tags: ["contemporary", "grace", "redemption", "forgiveness"]
  },
  {
    id: "shout-to-the-lord",
    title: "Shout to the Lord",
    artist: "Darlene Zschech",
    lyrics: "My Jesus, my Savior\nLord, there is none like You\nAll of my days, I want to praise\nThe wonders of Your mighty love\n\nMy comfort, my shelter\nTower of refuge and strength\nLet every breath, all that I am\nNever cease to worship You",
    tags: ["contemporary", "worship", "praise", "love"]
  },
  {
    id: "days-of-elijah",
    title: "Days of Elijah",
    artist: "Robin Mark",
    lyrics: "These are the days of Elijah\nDeclaring the Word of the Lord\nAnd these are the days of Your servant, Moses\nRighteousness being restored\nAnd though these are days of great trials\nOf famine and darkness and sword\nStill we are the voice in the desert crying\nPrepare ye the way of the Lord!",
    tags: ["contemporary", "prophetic", "restoration", "worship"]
  }
];

// Combine all songs for the search database
export const allSongsForSearch = [...songDatabase, ...additionalSongs];

// Export a function to create full song objects from search entries
export function getStructuredSongById(id: string): Song | undefined {
  const songEntry = allSongsForSearch.find(song => song.id === id);
  if (!songEntry) return undefined;
  
  return convertLyricsToStucturedSong(
    songEntry.id,
    songEntry.title,
    songEntry.artist || "Traditional",
    songEntry.lyrics,
    songEntry.tags || []
  );
}