import { Song, Verse, ChordDiagram } from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';

// Helper function to ensure all required fields are present
function createSong(song: Partial<Song>): Song {
  return {
    id: song.id || uuidv4(),
    title: song.title || '',
    artist: song.artist || '',
    verses: song.verses || [],
    chorus: song.chorus || null,
    bridge: song.bridge || null,
    chords: song.chords || [],
    audioUrl: song.audioUrl || undefined,
    hasGeneratedAudio: song.hasGeneratedAudio !== undefined ? song.hasGeneratedAudio : false,
    musicNotes: song.musicNotes || undefined,
    difficulty: song.difficulty || 'beginner',
    key: song.key || 'C',
    timeSignature: song.timeSignature || '4/4',
    tempo: song.tempo || 120,
    tags: song.tags || [],
    backgroundColor: song.backgroundColor || undefined,
    createdAt: song.createdAt || new Date(),
    updatedAt: song.updatedAt || new Date()
  };
}

// Sample chord diagrams
const commonChords: Record<string, ChordDiagram> = {
  'G': {
    name: 'G',
    fingering: {
      string1: 3,
      string2: 2,
      string3: 0,
      string4: 0,
      string5: 0,
      string6: 3
    },
    position: 1
  },
  'C': {
    name: 'C',
    fingering: {
      string1: 0,
      string2: 1,
      string3: 0,
      string4: 2,
      string5: 3,
      string6: -1
    },
    position: 1
  },
  'D': {
    name: 'D',
    fingering: {
      string1: 2,
      string2: 3,
      string3: 2,
      string4: 0,
      string5: -1,
      string6: -1
    },
    position: 1
  },
  'Em': {
    name: 'Em',
    fingering: {
      string1: 0,
      string2: 0,
      string3: 0,
      string4: 2,
      string5: 2,
      string6: 0
    },
    position: 1
  },
  'Am': {
    name: 'Am',
    fingering: {
      string1: 0,
      string2: 1,
      string3: 2,
      string4: 2,
      string5: 0,
      string6: -1
    },
    position: 1
  },
  'F': {
    name: 'F',
    fingering: {
      string1: 1,
      string2: 1,
      string3: 2,
      string4: 3,
      string5: 3,
      string6: 1
    },
    barres: [{ fromString: 1, toString: 6, fret: 1 }],
    position: 1
  },
  'E': {
    name: 'E',
    fingering: {
      string1: 0,
      string2: 0,
      string3: 1,
      string4: 2,
      string5: 2,
      string6: 0
    },
    position: 1
  },
  'A': {
    name: 'A',
    fingering: {
      string1: 0,
      string2: 2,
      string3: 2,
      string4: 2,
      string5: 0,
      string6: -1
    },
    position: 1
  }
};

// Pre-generated songs
export const songs: Song[] = [
  createSong({
    id: 'amazing-grace',
    title: 'Amazing Grace',
    artist: 'John Newton',
    verses: [
      {
        lyrics: [
          "Amazing grace! How sweet the sound",
          "That saved a wretch like me!",
          "I once was lost, but now am found;",
          "Was blind, but now I see."
        ],
        chords: ["G", "C", "G", "D", "G", "C", "G", "D"]
      },
      {
        lyrics: [
          "'Twas grace that taught my heart to fear,",
          "And grace my fears relieved;",
          "How precious did that grace appear",
          "The hour I first believed."
        ],
        chords: ["G", "C", "G", "D", "G", "C", "G", "D"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [
      commonChords.G,
      commonChords.C,
      commonChords.D
    ],
    audioUrl: "https://example.com/amazing-grace.mp3",
    hasGeneratedAudio: true,
    difficulty: "beginner",
    key: "G",
    timeSignature: "4/4",
    tempo: 80,
    tags: ["hymn", "classic", "worship"],
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  }),
  
  createSong({
    id: 'how-great-thou-art',
    title: 'How Great Thou Art',
    artist: 'Stuart K. Hine',
    verses: [
      {
        lyrics: [
          "O Lord my God, when I in awesome wonder,",
          "Consider all the worlds Thy hands have made;",
          "I see the stars, I hear the rolling thunder,",
          "Thy power throughout the universe displayed."
        ],
        chords: ["G", "D", "G", "C", "G", "D", "G", "C"]
      }
    ],
    chorus: {
      lyrics: [
        "Then sings my soul, my Savior God, to Thee,",
        "How great Thou art, how great Thou art.",
        "Then sings my soul, my Savior God, to Thee,",
        "How great Thou art, how great Thou art!"
      ],
      chords: ["G", "D", "G", "C", "G", "D", "G", "C"]
    },
    bridge: null,
    chords: [
      commonChords.G,
      commonChords.D,
      commonChords.C
    ],
    audioUrl: "https://example.com/how-great-thou-art.mp3",
    hasGeneratedAudio: true,
    difficulty: "beginner",
    key: "G",
    timeSignature: "4/4",
    tempo: 75,
    tags: ["hymn", "worship", "classic"],
    createdAt: new Date('2023-01-02'),
    updatedAt: new Date('2023-01-02')
  }),
  
  createSong({
    id: 'this-is-amazing-grace',
    title: 'This Is Amazing Grace',
    artist: 'Phil Wickham',
    verses: [
      {
        lyrics: [
          "Who breaks the power of sin and darkness?",
          "Whose love is mighty and so much stronger?",
          "The King of Glory, the King above all kings"
        ],
        chords: ["G", "Em", "C", "G", "Em", "C", "G", "D"]
      }
    ],
    chorus: {
      lyrics: [
        "This is amazing grace",
        "This is unfailing love",
        "That You would take my place",
        "That You would bear my cross",
        "You laid down Your life",
        "That I would be set free",
        "Oh, Jesus, I sing for",
        "All that You've done for me"
      ],
      chords: ["G", "C", "Em", "D", "G", "C", "Em", "D"]
    },
    bridge: {
      lyrics: [
        "Worthy is the Lamb who was slain",
        "Worthy is the King who conquered the grave",
        "Worthy is the Lamb who was slain",
        "Worthy is the King who conquered the grave"
      ],
      chords: ["Em", "C", "G", "D", "Em", "C", "G", "D"]
    },
    chords: [
      commonChords.G,
      commonChords.Em,
      commonChords.C,
      commonChords.D
    ],
    audioUrl: "https://example.com/this-is-amazing-grace.mp3",
    hasGeneratedAudio: true,
    difficulty: "intermediate",
    key: "G",
    timeSignature: "4/4",
    tempo: 100,
    tags: ["contemporary", "worship"],
    createdAt: new Date('2023-01-03'),
    updatedAt: new Date('2023-01-03')
  }),
  
  createSong({
    id: '10000-reasons',
    title: '10,000 Reasons (Bless the Lord)',
    artist: 'Matt Redman',
    verses: [
      {
        lyrics: [
          "The sun comes up, it's a new day dawning",
          "It's time to sing Your song again",
          "Whatever may pass and whatever lies before me",
          "Let me be singing when the evening comes"
        ],
        chords: ["G", "D", "Em", "C", "G", "D", "Em", "C"]
      }
    ],
    chorus: {
      lyrics: [
        "Bless the Lord, O my soul, O my soul",
        "Worship His holy name",
        "Sing like never before, O my soul",
        "I'll worship Your holy name"
      ],
      chords: ["G", "D", "Em", "C", "G", "D", "C", "G"]
    },
    bridge: null,
    chords: [
      commonChords.G,
      commonChords.D,
      commonChords.Em,
      commonChords.C
    ],
    audioUrl: "https://example.com/10000-reasons.mp3",
    hasGeneratedAudio: true,
    difficulty: "beginner",
    key: "G",
    timeSignature: "4/4",
    tempo: 68,
    tags: ["contemporary", "worship"],
    createdAt: new Date('2023-01-04'),
    updatedAt: new Date('2023-01-04')
  }),
  
  createSong({
    id: 'what-a-beautiful-name',
    title: 'What A Beautiful Name',
    artist: 'Hillsong Worship',
    verses: [
      {
        lyrics: [
          "You were the Word at the beginning",
          "One with God the Lord Most High",
          "Your hidden glory in creation",
          "Now revealed in You our Christ"
        ],
        chords: ["D", "A", "G", "D", "A", "G"]
      }
    ],
    chorus: {
      lyrics: [
        "What a beautiful Name it is",
        "What a beautiful Name it is",
        "The Name of Jesus Christ my King",
        "What a beautiful Name it is",
        "Nothing compares to this",
        "What a beautiful Name it is",
        "The Name of Jesus"
      ],
      chords: ["D", "A", "G", "D", "A", "G", "D", "A", "G", "D", "A", "G"]
    },
    bridge: {
      lyrics: [
        "Death could not hold You",
        "The veil tore before You",
        "You silence the boast of sin and grave",
        "The heavens are roaring",
        "The praise of Your glory",
        "For You are raised to life again"
      ],
      chords: ["Em", "D", "A", "G", "Em", "D", "A", "G"]
    },
    chords: [
      commonChords.D,
      commonChords.A,
      commonChords.G,
      commonChords.Em
    ],
    audioUrl: "https://example.com/what-a-beautiful-name.mp3",
    hasGeneratedAudio: true,
    difficulty: "intermediate",
    key: "D",
    timeSignature: "4/4",
    tempo: 68,
    tags: ["contemporary", "worship"],
    createdAt: new Date('2023-01-05'),
    updatedAt: new Date('2023-01-05')
  }),
  
  createSong({
    id: 'this-little-light-of-mine',
    title: 'This Little Light of Mine',
    artist: 'Traditional',
    verses: [
      {
        lyrics: [
          "This little light of mine, I'm gonna let it shine",
          "This little light of mine, I'm gonna let it shine",
          "This little light of mine, I'm gonna let it shine",
          "Let it shine, let it shine, let it shine"
        ],
        chords: ["G", "D", "G", "G", "D", "G", "G", "D", "G", "C", "G", "D", "G"]
      },
      {
        lyrics: [
          "Hide it under a bushel? No! I'm gonna let it shine",
          "Hide it under a bushel? No! I'm gonna let it shine",
          "Hide it under a bushel? No! I'm gonna let it shine",
          "Let it shine, let it shine, let it shine"
        ],
        chords: ["G", "D", "G", "G", "D", "G", "G", "D", "G", "C", "G", "D", "G"]
      }
    ],
    chorus: null,
    bridge: null,
    chords: [
      commonChords.G,
      commonChords.D,
      commonChords.C
    ],
    audioUrl: "https://example.com/this-little-light.mp3",
    hasGeneratedAudio: true,
    difficulty: "beginner",
    key: "G",
    timeSignature: "4/4",
    tempo: 115,
    tags: ["children", "traditional"],
    createdAt: new Date('2023-01-06'),
    updatedAt: new Date('2023-01-06')
  }),
  
  createSong({
    id: 'jesus-loves-me',
    title: 'Jesus Loves Me',
    artist: 'Anna B. Warner',
    verses: [
      {
        lyrics: [
          "Jesus loves me, this I know",
          "For the Bible tells me so",
          "Little ones to Him belong",
          "They are weak, but He is strong"
        ],
        chords: ["G", "D", "G", "C", "G", "D", "G", "C"]
      }
    ],
    chorus: {
      lyrics: [
        "Yes, Jesus loves me",
        "Yes, Jesus loves me",
        "Yes, Jesus loves me",
        "The Bible tells me so"
      ],
      chords: ["G", "D", "G", "C", "G", "D", "G", "C"]
    },
    bridge: null,
    chords: [
      commonChords.G,
      commonChords.D,
      commonChords.C
    ],
    audioUrl: "https://example.com/jesus-loves-me.mp3",
    hasGeneratedAudio: true,
    difficulty: "beginner",
    key: "G",
    timeSignature: "3/4",
    tempo: 80,
    tags: ["children", "classic"],
    createdAt: new Date('2023-01-07'),
    updatedAt: new Date('2023-01-07')
  }),
  
  createSong({
    id: 'praise-ye-the-lord-hallelujah',
    title: 'Praise Ye the Lord, Hallelujah',
    artist: 'Traditional',
    verses: [
      {
        lyrics: [
          "Praise ye the Lord, Hallelujah!",
          "Everybody praise the Lord.",
          "Praise ye the Lord, Hallelujah!",
          "Everybody praise the Lord."
        ],
        chords: ["G", "D", "G", "C", "G", "D", "G", "C"]
      }
    ],
    chorus: {
      lyrics: [
        "Praise Him in the morning, praise Him in the noontime.",
        "Praise Him, praise Him, praise Him when the sun goes down.",
      ],
      chords: ["G", "D", "G", "C", "G", "D", "G", "C"]
    },
    bridge: null,
    chords: [
      commonChords.G,
      commonChords.D,
      commonChords.C
    ],
    audioUrl: "",
    hasGeneratedAudio: false,
    difficulty: "beginner",
    key: "G",
    timeSignature: "4/4",
    tempo: 120,
    tags: ["children", "worship", "traditional"],
    createdAt: new Date('2023-01-08'),
    updatedAt: new Date('2023-01-08')
  })
];

// Function to get a song by ID
export function getSongById(id: string): Song | undefined {
  return songs.find(song => song.id === id);
}

// Function to get all songs
export function getAllSongs(): Song[] {
  return [...songs];
}

// Function to search songs
export function searchSongs(query: string): Song[] {
  const lowercaseQuery = query.toLowerCase();
  return songs.filter(song => 
    song.title.toLowerCase().includes(lowercaseQuery) || 
    (song.artist && song.artist.toLowerCase().includes(lowercaseQuery)) ||
    song.verses.some(verse => 
      verse.lyrics.some(line => line.toLowerCase().includes(lowercaseQuery))
    ) ||
    (song.chorus && song.chorus.lyrics.some(line => 
      line.toLowerCase().includes(lowercaseQuery)
    )) ||
    (song.bridge && song.bridge.lyrics.some(line => 
      line.toLowerCase().includes(lowercaseQuery)
    )) ||
    song.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
}

// Function to get popular songs (could be most viewed, etc.)
export function getPopularSongs(limit: number = 5): Song[] {
  // For now, just return a random selection of songs
  const shuffled = [...songs].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}

// Function to add a new song
export function addSong(song: Omit<Song, 'id' | 'createdAt' | 'updatedAt'>): Song {
  const newSong: Song = {
    ...song,
    id: uuidv4(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  songs.push(newSong);
  return newSong;
}

// Function to update an existing song
export function updateSong(id: string, updates: Partial<Song>): Song | undefined {
  const songIndex = songs.findIndex(song => song.id === id);
  if (songIndex === -1) return undefined;
  
  const updatedSong = {
    ...songs[songIndex],
    ...updates,
    updatedAt: new Date()
  };
  
  songs[songIndex] = updatedSong;
  return updatedSong;
}

// Function to delete a song
export function deleteSong(id: string): boolean {
  const songIndex = songs.findIndex(song => song.id === id);
  if (songIndex === -1) return false;
  
  songs.splice(songIndex, 1);
  return true;
}