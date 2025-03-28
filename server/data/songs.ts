import { Song } from "@shared/schema";
import { childrenSongs, classicHymns } from "./additionalSongs";
import { olderSongsFixed } from "./olderSongsFormat";

// Original songs with proper format, combined with additional songs
export const songs: Song[] = [
  {
    id: "jesus-loves-me",
    title: "Jesus Loves Me",
    artist: "Anna B. Warner",
    verses: [
      {
        lyrics: ["Jesus loves me! This I know,", "For the Bible tells me so;", "Little ones to Him belong;", "They are weak, but He is strong."],
        chords: ["G", "C", "G", "D7 G"]
      }
    ],
    chorus: {
      lyrics: ["Yes, Jesus loves me!", "Yes, Jesus loves me!", "Yes, Jesus loves me!", "The Bible tells me so."],
      chords: ["G", "C", "G", "D7 G"]
    },
    bridge: null,
    chords: [
      {
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
      {
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
      {
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
      }
    ],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "this-little-light",
    title: "This Little Light of Mine",
    artist: "Harry Dixon Loes",
    verses: [
      {
        lyrics: [
          "This little light of mine,",
          "I'm gonna let it shine.",
          "This little light of mine,",
          "I'm gonna let it shine.",
          "This little light of mine,",
          "I'm gonna let it shine."
        ],
        chords: ["C", "G7", "C", "G7", "C", "F"]
      }
    ],
    chorus: {
      lyrics: ["Let it shine, let it shine, let it shine."],
      chords: ["C G7 C"]
    },
    bridge: null,
    chords: [
      {
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
      {
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
      {
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
      }
    ],
    backgroundColor: "bg-secondary/10"
  }
].concat(olderSongsFixed).concat(childrenSongs).concat(classicHymns);
