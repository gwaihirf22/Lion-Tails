import { Song } from "@shared/schema";

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
    lyrics: [
      { text: "This little light of mine,", chord: "C" },
      { text: "I'm gonna let it shine.", chord: "G7" },
      { text: "This little light of mine,", chord: "C" },
      { text: "I'm gonna let it shine.", chord: "G7" },
      { text: "This little light of mine,", chord: "C" },
      { text: "I'm gonna let it shine.", chord: "F" },
      { text: "Let it shine, let it shine, let it shine.", chord: "C G7 C" }
    ],
    chords: ["C", "G7", "F"],
    backgroundColor: "bg-secondary/10"
  },
  {
    id: "he-has-the-whole-world",
    title: "He's Got the Whole World in His Hands",
    lyrics: [
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
    chords: ["G", "C", "D7"],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    lyrics: [
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
    chords: ["G", "C", "D"],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "deep-and-wide",
    title: "Deep and Wide",
    lyrics: [
      { text: "Deep and wide, deep and wide,", chord: "G" },
      { text: "There's a fountain flowing deep and wide.", chord: "D7 G" },
      { text: "Deep and wide, deep and wide,", chord: "G" },
      { text: "There's a fountain flowing deep and wide.", chord: "D7 G" }
    ],
    chords: ["G", "D7"],
    backgroundColor: "bg-secondary/10"
  },
  {
    id: "zacchaeus",
    title: "Zacchaeus",
    lyrics: [
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
    chords: ["C", "G7", "F"],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "be-still-and-know",
    title: "Be Still and Know",
    lyrics: [
      { text: "Be still and know that I am God", chord: "G" },
      { text: "Be still and know that I am God", chord: "C G" },
      { text: "Be still and know that I am God", chord: "D G" },
      { text: "", chord: "" },
      { text: "I am the Lord that healeth thee", chord: "G" },
      { text: "I am the Lord that healeth thee", chord: "C G" },
      { text: "I am the Lord that healeth thee", chord: "D G" }
    ],
    chords: ["G", "C", "D"],
    backgroundColor: "bg-primary/10"
  },
  {
    id: "praise-ye-the-lord",
    title: "Praise Ye the Lord, Hallelujah",
    lyrics: [
      { text: "Praise ye the Lord, Hallelujah!", chord: "G" },
      { text: "Everybody praise the Lord.", chord: "D7 G" },
      { text: "Praise ye the Lord, Hallelujah!", chord: "G" },
      { text: "Everybody praise the Lord.", chord: "D7 G" },
      { text: "", chord: "" },
      { text: "Praise Him in the morning,", chord: "C" },
      { text: "Praise Him in the noontime.", chord: "G" },
      { text: "Praise ye the Lord, Hallelujah!", chord: "D7" },
      { text: "Everybody praise the Lord.", chord: "G" }
    ],
    chords: ["G", "D7", "C"],
    backgroundColor: "bg-secondary/10"
  },
  {
    id: "i-am-a-c",
    title: "I Am a C-H-R-I-S-T-I-A-N",
    lyrics: [
      { text: "I am a C", chord: "G" },
      { text: "I am a C-H", chord: "C" },
      { text: "I am a C-H-R-I-S-T-I-A-N", chord: "G" },
      { text: "And I have C-H-R-I-S-T in my H-E-A-R-T", chord: "D7" },
      { text: "And I will L-I-V-E E-T-E-R-N-A-L-L-Y", chord: "G" }
    ],
    chords: ["G", "C", "D7"],
    backgroundColor: "bg-accent/10"
  },
  {
    id: "the-b-i-b-l-e",
    title: "The B-I-B-L-E",
    lyrics: [
      { text: "The B-I-B-L-E,", chord: "G" },
      { text: "Yes, that's the book for me.", chord: "D7" },
      { text: "I stand alone on the Word of God,", chord: "G" },
      { text: "The B-I-B-L-E.", chord: "D7 G" },
      { text: "", chord: "" },
      { text: "The B-I-B-L-E,", chord: "G" },
      { text: "I'll take it along with me.", chord: "D7" },
      { text: "I'll read and pray, and then obey,", chord: "G" },
      { text: "The B-I-B-L-E.", chord: "D7 G" }
    ],
    chords: ["G", "D7"],
    backgroundColor: "bg-primary/10"
  }
];
