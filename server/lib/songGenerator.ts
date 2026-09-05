import OpenAI from "openai";
import { Song } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { resolveModel, createClient } from "./modelPolicy";
import { StoryGenerationError } from "./storyErrors";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
// Instantiated lazily so the module can load without an API key configured.
// Previously this defaulted to a literal "demo-key", which turned a missing
// credential into a confusing upstream 401 instead of a clear error.
// Model, provider and credentials come from the shared policy so chord
// generation cannot quietly run an expensive model on the server owner's key.

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
  artist: string = "User Created",
  userId: number = 1
): Promise<Song> {
  // Convert lyrics array to string if necessary
  const lyricsText = Array.isArray(lyrics) ? lyrics.join('\n') : lyrics;
  
  try {
    // Ask the policy whether ANY model is available rather than checking the
    // env key directly: with the self-hosted local tier a user with no OpenAI
    // key at all still has a working model, and should not be dropped to demo
    // output.
    const resolved = await resolveModel(userId, "chat");
    if (!resolved) {
      throw new StoryGenerationError(
        "no_model_available",
        "No model is available for chord generation on your account. Add your own OpenAI API key in Settings.",
      );
    }
    const response = await createClient(resolved).chat.completions.create({
      model: resolved.model,
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
    
    // The model's JSON, described only as far as this function reads it.
    // Everything is optional because the response is model output, not a
    // contract -- the guards below already assume any of it may be absent.
    type Section = { lyrics: string[]; chords: string[] };
    type GeneratedSong = {
      title?: string;
      verses?: Section[];
      chorus?: Section | null;
      bridge?: Section | null;
      difficulty?: string;
      key?: string;
      timeSignature?: string;
      tempo?: number;
      tags?: string[];
    };

    // Ensure we have valid content before parsing
    const messageContent = response.choices[0].message.content || '{}';
    const jsonContent: GeneratedSong = JSON.parse(messageContent);
    
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
      // The model can return any string here, so validate rather than cast:
      // an unrecognised value falls back instead of being trusted into a union
      // it does not belong to.
      difficulty: (["beginner", "intermediate", "advanced"] as const).find(
        (d) => d === jsonContent.difficulty,
      ) ?? "beginner",
      key: jsonContent.key || "C",
      timeSignature: jsonContent.timeSignature || "4/4",
      tempo: jsonContent.tempo || 120,
      tags: jsonContent.tags || ["worship"],
      hasGeneratedAudio: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
  } catch (error) {
    // Never return invented music as though it were generated. This used to
    // fall back to a demo song with a random key, random tempo and a random
    // chord progression -- returned as HTTP 201 and PERSISTED to the library,
    // so confidently wrong chords were saved against the user's title.
    if (error instanceof StoryGenerationError) {
      throw error;
    }
    console.error("Error generating song chords with OpenAI:", error);
    throw new StoryGenerationError(
      "generation_failed",
      error instanceof Error && error.message
        ? error.message
        : "Could not generate chords for this song. Please try again.",
      { cause: error },
    );
  }
}
