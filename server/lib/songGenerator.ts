import OpenAI from "openai";
import { Song } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
// Instantiated lazily so the module can load without an API key configured.
// Previously this defaulted to a literal "demo-key", which turned a missing
// credential into a confusing upstream 401 instead of a clear error.
let openaiClient: OpenAI | undefined;
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// Common Christian chord progressions (for demo mode)
const commonChordProgressions: string[][] = [
  ['G', 'D', 'Em', 'C'],
  ['C', 'G', 'Am', 'F'],
  ['D', 'A', 'Bm', 'G'],
  ['E', 'B', 'C#m', 'A'],
  ['F', 'C', 'Dm', 'Bb'],
];

// Common guitar chords with fingering information
const commonChords: Record<string, {
  name: string;
  fingering: {
    string1: number;
    string2: number;
    string3: number;
    string4: number;
    string5: number;
    string6: number;
  };
  barres?: {
    fromString: number;
    toString: number;
    fret: number;
  }[];
  position?: number;
}> = {
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

/**
 * Generate chord recommendations for a Christian song
 * @param title The title of the song
 * @param lyrics The lyrics of the song (as a string or array of lines)
 * @param artist Optional artist name
 * @returns A Song object with chord suggestions
 */
export async function generateSongChords(
  title: string, 
  lyrics: string | string[], 
  artist: string = "User Created"
): Promise<Song> {
  // Convert lyrics array to string if necessary
  const lyricsText = Array.isArray(lyrics) ? lyrics.join('\n') : lyrics;
  
  try {
    // If no API key is set, return demo chords
    if (process.env.OPENAI_API_KEY === undefined || process.env.OPENAI_API_KEY === "demo-key") {
      return getDemoSong(title, lyricsText, artist);
    }
    
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `You are a music expert specializing in Christian worship songs and simple guitar arrangements. 
          Analyze the song lyrics and provide appropriate chord suggestions for a simple guitar arrangement.
          Select chords that would be suitable for beginners to intermediate players, focusing on common chord progressions in Christian music.
          For each line or section of lyrics, suggest appropriate chords that match the emotional tone and theological content.
          Also determine the best key signature and tempo for this song.
          
          Format your response as valid JSON with the following structure:
          {
            "title": "Song title",
            "key": "C",
            "tempo": 90,
            "timeSignature": "4/4",
            "difficulty": "beginner",
            "verses": [
              {
                "lyrics": ["Line 1", "Line 2", ...],
                "chords": ["Chord 1", "Chord 2", ...]
              }
            ],
            "chorus": {
              "lyrics": ["Line 1", "Line 2", ...],
              "chords": ["Chord 1", "Chord 2", ...]
            },
            "bridge": {
              "lyrics": ["Line 1", "Line 2", ...],
              "chords": ["Chord 1", "Chord 2", ...]
            },
            "tags": ["worship", "hymn", "contemporary", etc.]
          }
          
          Note that the bridge is optional if the song doesn't have one. Each chord in the chords array corresponds to the matching line in the lyrics array.
          Stick to common, easy-to-play chords like G, D, Em, C, Am, F, etc.
          For difficulty, choose between "beginner", "intermediate", or "advanced".
          For tags, include relevant descriptors like "worship", "hymn", "contemporary", "traditional", "children", etc.`
        },
        { 
          role: "user", 
          content: `Please analyze this Christian song and suggest appropriate guitar chords:
          
          Title: ${title}
          
          Lyrics:
          ${lyricsText}
          
          Please respond in JSON format with the chord suggestions.`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Ensure we have valid content before parsing
    const messageContent = response.choices[0].message.content || '{}';
    const jsonContent = JSON.parse(messageContent);
    
    // Add chord diagrams for each unique chord
    const allChords = new Set<string>();
    
    // Extract unique chords from verses
    if (jsonContent.verses) {
      jsonContent.verses.forEach(verse => {
        if (verse.chords) {
          verse.chords.forEach(chord => {
            allChords.add(chord);
          });
        }
      });
    }
    
    // Extract unique chords from chorus
    if (jsonContent.chorus && jsonContent.chorus.chords) {
      jsonContent.chorus.chords.forEach(chord => {
        allChords.add(chord);
      });
    }
    
    // Extract unique chords from bridge
    if (jsonContent.bridge && jsonContent.bridge.chords) {
      jsonContent.bridge.chords.forEach(chord => {
        allChords.add(chord);
      });
    }
    
    // Map chords to chord diagrams
    const chordDiagrams = Array.from(allChords).map(chordName => {
      // Try to find the chord in our predefined list, or create a basic one if not found
      return commonChords[chordName] || {
        name: chordName,
        fingering: {
          string1: 0,
          string2: 0,
          string3: 0,
          string4: 0,
          string5: 0,
          string6: 0
        }
      };
    });
    
    // Create a full song object using all the AI-generated data
    return {
      id: uuidv4(),
      title: jsonContent.title || title,
      artist: artist,
      verses: jsonContent.verses || [],
      chorus: jsonContent.chorus || null,
      bridge: jsonContent.bridge || null,
      chords: chordDiagrams,
      difficulty: jsonContent.difficulty || "beginner",
      key: jsonContent.key || "C",
      timeSignature: jsonContent.timeSignature || "4/4",
      tempo: jsonContent.tempo || 120,
      tags: jsonContent.tags || ["worship"],
      hasGeneratedAudio: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
  } catch (error) {
    console.error("Error generating song chords with OpenAI:", error);
    
    // Fallback to demo song if there's an error
    return getDemoSong(title, lyricsText, artist);
  }
}

/**
 * Generate a demo song with simple chord progressions
 * @param title The title of the song
 * @param lyrics The lyrics of the song
 * @param artist The artist name for the song
 * @returns A Song object with chord suggestions
 */
function getDemoSong(title: string, lyrics: string, artist: string = "User Created"): Song {
  // Split lyrics into lines
  const lyricsLines = lyrics.split('\n').filter(line => line.trim().length > 0);
  
  // Determine if the song has a chorus (very simple heuristic)
  const hasChorus = lyricsLines.some(line => line.trim().toLowerCase().includes('chorus'));
  
  // Decide whether it has a bridge
  const hasBridge = lyricsLines.some(line => line.trim().toLowerCase().includes('bridge'));
  
  // Choose a random key
  const keys = ["C", "G", "D", "A", "E", "F"];
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  
  // Generate a random tempo between 60 and 140 BPM
  const randomTempo = Math.floor(Math.random() * 80) + 60;
  
  // Get a random chord progression
  const chordProgression = commonChordProgressions[Math.floor(Math.random() * commonChordProgressions.length)];
  const chorusProgression = commonChordProgressions[Math.floor(Math.random() * commonChordProgressions.length)];
  const bridgeProgression = commonChordProgressions[Math.floor(Math.random() * commonChordProgressions.length)];
  
  // Create a simple structure for the song
  let currentSection = 'verse';
  const verses: { lyrics: string[], chords: string[] }[] = [];
  let currentVerse: { lyrics: string[], chords: string[] } = { lyrics: [], chords: [] };
  let chorus: { lyrics: string[], chords: string[] } | null = null;
  let bridge: { lyrics: string[], chords: string[] } | null = null;
  
  // Process lyrics line by line
  for (const line of lyricsLines) {
    const trimmedLine = line.trim().toLowerCase();
    
    if (trimmedLine === 'chorus:' || trimmedLine === '[chorus]' || trimmedLine === 'chorus') {
      currentSection = 'chorus';
      chorus = { lyrics: [], chords: [] };
      continue;
    } else if (trimmedLine === 'bridge:' || trimmedLine === '[bridge]' || trimmedLine === 'bridge') {
      currentSection = 'bridge';
      bridge = { lyrics: [], chords: [] };
      continue;
    } else if (trimmedLine === 'verse:' || trimmedLine === '[verse]' || trimmedLine.match(/verse \d+:/) || trimmedLine.match(/\[verse \d+\]/)) {
      if (currentVerse.lyrics.length > 0) {
        verses.push(currentVerse);
      }
      currentSection = 'verse';
      currentVerse = { lyrics: [], chords: [] };
      continue;
    }
    
    // Skip empty lines
    if (trimmedLine.length === 0) continue;
    
    // Add the line to the appropriate section with chord
    if (currentSection === 'verse') {
      currentVerse.lyrics.push(line);
      currentVerse.chords.push(chordProgression[currentVerse.chords.length % chordProgression.length]);
    } else if (currentSection === 'chorus' && chorus) {
      chorus.lyrics.push(line);
      chorus.chords.push(chorusProgression[chorus.chords.length % chorusProgression.length]);
    } else if (currentSection === 'bridge' && bridge) {
      bridge.lyrics.push(line);
      bridge.chords.push(bridgeProgression[bridge.chords.length % bridgeProgression.length]);
    }
  }
  
  // Add the last verse if it has content
  if (currentVerse.lyrics.length > 0) {
    verses.push(currentVerse);
  }
  
  // If no explicit chorus was found but we want one, create a simple one
  if (!chorus && hasChorus) {
    chorus = {
      lyrics: ["This is a simple chorus", "Praising God's eternal love"],
      chords: [chorusProgression[0], chorusProgression[1]]
    };
  }
  
  // If no explicit bridge was found but we want one, create a simple one
  if (!bridge && hasBridge) {
    bridge = {
      lyrics: ["Bridge of faith", "Connecting our hearts to God"],
      chords: [bridgeProgression[0], bridgeProgression[1]]
    };
  }
  
  // Create a list of all unique chords
  const allChords = new Set<string>();
  
  // Add chords from verses
  verses.forEach(verse => {
    verse.chords.forEach(chord => {
      allChords.add(chord);
    });
  });
  
  // Add chords from chorus
  if (chorus) {
    chorus.chords.forEach(chord => {
      allChords.add(chord);
    });
  }
  
  // Add chords from bridge
  if (bridge) {
    bridge.chords.forEach(chord => {
      allChords.add(chord);
    });
  }
  
  // Create chord diagrams for each unique chord
  const chordDiagrams = Array.from(allChords).map(chordName => {
    return commonChords[chordName] || {
      name: chordName,
      fingering: {
        string1: 0,
        string2: 0,
        string3: 0,
        string4: 0,
        string5: 0,
        string6: 0
      }
    };
  });
  
  // Determine best tags based on content
  const tags: string[] = ["worship"];
  if (lyrics.toLowerCase().includes("jesus") || lyrics.toLowerCase().includes("christ")) {
    tags.push("christian");
  }
  if (lyrics.toLowerCase().includes("lord") || lyrics.toLowerCase().includes("god")) {
    tags.push("praise");
  }
  if (lyrics.toLowerCase().includes("child") || lyrics.toLowerCase().includes("children")) {
    tags.push("children");
  }
  if (hasChorus) {
    tags.push("contemporary");
  } else {
    tags.push("hymn");
  }
  
  return {
    id: uuidv4(),
    title,
    artist,
    verses,
    chorus,
    bridge,
    chords: chordDiagrams,
    difficulty: "beginner",
    key: randomKey,
    timeSignature: "4/4",
    tempo: randomTempo,
    tags,
    hasGeneratedAudio: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}