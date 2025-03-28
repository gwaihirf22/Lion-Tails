import { Song } from "@shared/schema";

// Common chord definitions for reuse
const commonChords = {
  G: {
    name: "G",
    fingering: {
      string1: 3,
      string2: 0,
      string3: 0,
      string4: 0,
      string5: 2,
      string6: 3
    },
    barres: [],
    position: 1
  },
  C: {
    name: "C",
    fingering: {
      string1: 0,
      string2: 1,
      string3: 0,
      string4: 2,
      string5: 3,
      string6: -1
    },
    barres: [],
    position: 1
  },
  D: {
    name: "D",
    fingering: {
      string1: 2,
      string2: 3,
      string3: 2,
      string4: 0,
      string5: -1,
      string6: -1
    },
    barres: [],
    position: 1
  },
  Em: {
    name: "Em",
    fingering: {
      string1: 0,
      string2: 0,
      string3: 0,
      string4: 2,
      string5: 2,
      string6: 0
    },
    barres: [],
    position: 1
  },
  A: {
    name: "A",
    fingering: {
      string1: 0,
      string2: 2,
      string3: 2,
      string4: 2,
      string5: 0,
      string6: -1
    },
    barres: [],
    position: 1
  },
  D7: {
    name: "D7",
    fingering: {
      string1: 2,
      string2: 1,
      string3: 2,
      string4: 0,
      string5: -1,
      string6: -1
    },
    barres: [],
    position: 1
  },
  G7: {
    name: "G7",
    fingering: {
      string1: 1,
      string2: 0,
      string3: 0,
      string4: 0,
      string5: 2,
      string6: 3
    },
    barres: [],
    position: 1
  },
  F: {
    name: "F",
    fingering: {
      string1: 1,
      string2: 1,
      string3: 2,
      string4: 3,
      string5: 3,
      string6: 1
    },
    barres: [
      {
        fromString: 1,
        toString: 6,
        fret: 1
      }
    ],
    position: 1
  },
  Am: {
    name: "Am",
    fingering: {
      string1: 0,
      string2: 1,
      string3: 2,
      string4: 2,
      string5: 0,
      string6: -1
    },
    barres: [],
    position: 1
  }
};

// Helper function to convert older song format to proper format
export function convertOlderSongFormat(
  id: string,
  title: string,
  lyrics: { text: string, chord: string }[],
  chordNames: string[],
  backgroundColor: string
): Song {
  // Create verses array from lyrics
  const lines: string[] = [];
  const chordLines: string[] = [];
  
  lyrics.forEach(line => {
    if (line.text !== "") {
      lines.push(line.text);
      chordLines.push(line.chord);
    } else if (lines.length > 0) {
      // Empty line indicates a new verse
      // For simplicity, we'll consider each block separated by empty lines as one verse
    }
  });
  
  const verses = [{
    lyrics: lines,
    chords: chordLines
  }];
  
  // Map chord names to chord objects
  const chordObjects = chordNames.map(name => {
    const baseName = name.replace(/7|m/, ''); // Extract base chord (G, C, D, etc.)
    
    if (name === "G") return commonChords.G;
    if (name === "C") return commonChords.C;
    if (name === "D") return commonChords.D;
    if (name === "Em") return commonChords.Em;
    if (name === "A") return commonChords.A;
    if (name === "D7") return commonChords.D7;
    if (name === "G7") return commonChords.G7;
    if (name === "F") return commonChords.F;
    if (name === "Am") return commonChords.Am;
    
    // Default chord if not found
    return {
      name,
      fingering: {
        string1: 0,
        string2: 0,
        string3: 0,
        string4: 0,
        string5: 0,
        string6: 0
      },
      barres: [],
      position: 1
    };
  });
  
  return {
    id,
    title,
    artist: "Traditional",
    verses,
    chorus: null,
    bridge: null,
    chords: chordObjects,
    backgroundColor
  };
}

// Export the older songs in the proper format
export const olderSongsFixed: Song[] = [
  // He's Got the Whole World in His Hands
  convertOlderSongFormat(
    "he-has-the-whole-world",
    "He's Got the Whole World in His Hands",
    [
      { text: "He's got the whole world in His hands", chord: "G" },
      { text: "He's got the whole world in His hands", chord: "C G" },
      { text: "He's got the whole world in His hands", chord: "D7" },
      { text: "He's got the whole world in His hands", chord: "G" },
      { text: "" },
      { text: "He's got the little bitty baby in His hands", chord: "G" },
      { text: "He's got the little bitty baby in His hands", chord: "C G" },
      { text: "He's got the little bitty baby in His hands", chord: "D7" },
      { text: "He's got the whole world in His hands", chord: "G" }
    ],
    ["G", "C", "D7"],
    "bg-accent/10"
  ),
  
  // Amazing Grace
  convertOlderSongFormat(
    "amazing-grace",
    "Amazing Grace",
    [
      { text: "Amazing grace! How sweet the sound", chord: "G" },
      { text: "That saved a wretch like me!", chord: "C G" },
      { text: "I once was lost, but now am found;", chord: "G D" },
      { text: "Was blind, but now I see.", chord: "G" },
      { text: "" },
      { text: "'Twas grace that taught my heart to fear,", chord: "G" },
      { text: "And grace my fears relieved;", chord: "C G" },
      { text: "How precious did that grace appear", chord: "G D" },
      { text: "The hour I first believed.", chord: "G" }
    ],
    ["G", "C", "D"],
    "bg-primary/10"
  ),
  
  // Deep and Wide
  convertOlderSongFormat(
    "deep-and-wide",
    "Deep and Wide",
    [
      { text: "Deep and wide, deep and wide,", chord: "G" },
      { text: "There's a fountain flowing deep and wide.", chord: "D7 G" },
      { text: "Deep and wide, deep and wide,", chord: "G" },
      { text: "There's a fountain flowing deep and wide.", chord: "D7 G" }
    ],
    ["G", "D7"],
    "bg-secondary/10"
  ),
  
  // Zacchaeus
  convertOlderSongFormat(
    "zacchaeus",
    "Zacchaeus",
    [
      { text: "Zacchaeus was a wee little man,", chord: "C" },
      { text: "And a wee little man was he.", chord: "G7" },
      { text: "He climbed up in a sycamore tree", chord: "F" },
      { text: "For the Lord he wanted to see.", chord: "G7 C" },
      { text: "And as the Savior passed that way,", chord: "C" },
      { text: "He looked up in the tree,", chord: "G7" },
      { text: "And he said, \"Zacchaeus, you come down!\"", chord: "F" },
      { text: "For I'm going to your house today,", chord: "C" },
      { text: "For I'm going to your house today.", chord: "G7 C" }
    ],
    ["C", "G7", "F"],
    "bg-accent/10"
  ),
  
  // Be Still and Know
  convertOlderSongFormat(
    "be-still-and-know",
    "Be Still and Know",
    [
      { text: "Be still and know that I am God", chord: "G" },
      { text: "Be still and know that I am God", chord: "C G" },
      { text: "Be still and know that I am God", chord: "D G" },
      { text: "" },
      { text: "I am the Lord that healeth thee", chord: "G" },
      { text: "I am the Lord that healeth thee", chord: "C G" },
      { text: "I am the Lord that healeth thee", chord: "D G" }
    ],
    ["G", "C", "D"],
    "bg-primary/10"
  ),
  
  // Praise Ye the Lord
  convertOlderSongFormat(
    "praise-ye-the-lord",
    "Praise Ye the Lord, Hallelujah",
    [
      { text: "Praise ye the Lord, Hallelujah!", chord: "G" },
      { text: "Everybody praise the Lord.", chord: "D7 G" },
      { text: "Praise ye the Lord, Hallelujah!", chord: "G" },
      { text: "Everybody praise the Lord.", chord: "D7 G" },
      { text: "" },
      { text: "Praise Him in the morning,", chord: "C" },
      { text: "Praise Him in the noontime.", chord: "G" },
      { text: "Praise ye the Lord, Hallelujah!", chord: "D7" },
      { text: "Everybody praise the Lord.", chord: "G" }
    ],
    ["G", "D7", "C"],
    "bg-secondary/10"
  ),
  
  // I Am a C-H-R-I-S-T-I-A-N
  convertOlderSongFormat(
    "i-am-a-c",
    "I Am a C-H-R-I-S-T-I-A-N",
    [
      { text: "I am a C", chord: "G" },
      { text: "I am a C-H", chord: "C" },
      { text: "I am a C-H-R-I-S-T-I-A-N", chord: "G" },
      { text: "And I have C-H-R-I-S-T in my H-E-A-R-T", chord: "D7" },
      { text: "And I will L-I-V-E E-T-E-R-N-A-L-L-Y", chord: "G" }
    ],
    ["G", "C", "D7"],
    "bg-accent/10"
  ),
  
  // The B-I-B-L-E
  convertOlderSongFormat(
    "the-b-i-b-l-e",
    "The B-I-B-L-E",
    [
      { text: "The B-I-B-L-E,", chord: "G" },
      { text: "Yes, that's the book for me.", chord: "D7" },
      { text: "I stand alone on the Word of God,", chord: "G" },
      { text: "The B-I-B-L-E.", chord: "D7 G" },
      { text: "" },
      { text: "The B-I-B-L-E,", chord: "G" },
      { text: "I'll take it along with me.", chord: "D7" },
      { text: "I'll read and pray, and then obey,", chord: "G" },
      { text: "The B-I-B-L-E.", chord: "D7 G" }
    ],
    ["G", "D7"],
    "bg-primary/10"
  )
];